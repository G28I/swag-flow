import { useState, useCallback, useRef } from "react";

export interface StreamMetrics {
  latency: number;
  ttft: number;
  tokensPerSec: number;
  tokenCount: number;
}

export function useModelStream() {
  const [text, setText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<StreamMetrics | null>(null);
  const [messageId, setMessageId] = useState<string | null>(null);

  // RAF-batched text buffer — accumulates tokens between animation frames
  // so React only re-renders at ~60fps instead of 80–240+ times/sec
  const textBufferRef = useRef("");
  const rafIdRef = useRef<number | null>(null);

  // AbortController for cancelling in-flight streams
  const abortRef = useRef<AbortController | null>(null);

  const flushBuffer = useCallback(() => {
    const buffered = textBufferRef.current;
    if (buffered) {
      setText((prev) => prev + buffered);
      textBufferRef.current = "";
    }
    rafIdRef.current = null;
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushBuffer);
    }
  }, [flushBuffer]);

  const reset = useCallback(() => {
    // Cancel any pending RAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    textBufferRef.current = "";
    // Abort any in-flight stream
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setText("");
    setIsStreaming(false);
    setError(null);
    setMetrics(null);
    setMessageId(null);
  }, []);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Flush any remaining buffered text immediately
    if (textBufferRef.current) {
      const remaining = textBufferRef.current;
      textBufferRef.current = "";
      setText((prev) => prev + remaining);
    }
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const startStream = useCallback(
    async (threadId: string, parentId: string, model: string) => {
      // Abort previous stream if still running
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      const watchdogRef = { id: null as NodeJS.Timeout | null };
      const resetWatchdog = () => {
        if (watchdogRef.id) clearTimeout(watchdogRef.id);
        watchdogRef.id = setTimeout(() => {
          if (!controller.signal.aborted) {
            controller.abort();
            setError("Model response timed out. Click 🔄 to retry.");
            setIsStreaming(false);
          }
        }, 40000);
      };

      resetWatchdog();

      try {
        const response = await fetch("/api/arena/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ threadId, parentId, model }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP error status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Streaming is not supported by the response server.");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          resetWatchdog(); // Reset timer on each data chunk received

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const cleanedLine = line.trim();
            if (!cleanedLine) continue;

            if (cleanedLine.startsWith("data: ")) {
              const dataStr = cleanedLine.slice(6).trim();
              try {
                const event = JSON.parse(dataStr);
                if (event.type === "meta") {
                  setMessageId(event.messageId);
                } else if (event.type === "token") {
                  // Accumulate in buffer, schedule RAF flush
                  textBufferRef.current += event.text;
                  scheduleFlush();
                } else if (event.type === "done") {
                  if (watchdogRef.id) clearTimeout(watchdogRef.id);
                  // Flush any remaining text immediately before setting metrics
                  if (textBufferRef.current) {
                    const remaining = textBufferRef.current;
                    textBufferRef.current = "";
                    setText((prev) => prev + remaining);
                  }
                  if (rafIdRef.current !== null) {
                    cancelAnimationFrame(rafIdRef.current);
                    rafIdRef.current = null;
                  }
                  setMetrics({
                    latency: event.latency,
                    ttft: event.ttft,
                    tokensPerSec: event.tokensPerSec,
                    tokenCount: event.tokenCount,
                  });
                } else if (event.type === "error") {
                  setError(event.message);
                }
              } catch {
                // Ignore partial JSON lines
              }
            }
          }
        }
      } catch (err: unknown) {
        // Don't treat abort as an error
        if (err instanceof DOMException && err.name === "AbortError") {
          // Stream was intentionally cancelled — not an error
          return;
        }
        console.error(`Stream error for model ${model}:`, err);
        setError(
          err instanceof Error ? err.message : "A streaming error occurred. Please try again."
        );
      } finally {
        // Final flush of any remaining buffered text
        if (textBufferRef.current) {
          const remaining = textBufferRef.current;
          textBufferRef.current = "";
          setText((prev) => prev + remaining);
        }
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        setIsStreaming(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [scheduleFlush]
  );

  return {
    text,
    isStreaming,
    error,
    metrics,
    messageId,
    startStream,
    reset,
    abort,
  };
}
