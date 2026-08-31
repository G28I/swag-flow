import { useState, useCallback, useRef } from "react";
import { getAnonToken } from "@/app/lib/anonToken";

export interface StreamMetrics {
  latency: number;
  ttft: number;
  tokensPerSec: number;
  tokenCount: number;
  costUsd?: number | null;
  costSource?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  reasoningTokens?: number | null;
  cachedTokens?: number | null;
  actualModel?: string | null;
}

export interface StreamSnapshot {
  text: string;
  error: string | null;
  metrics: StreamMetrics | null;
  messageId: string | null;
  fallbackModel: string | null;
}

export function useModelStream() {
  const [text, setText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<StreamMetrics | null>(null);
  const [messageId, setMessageId] = useState<string | null>(null);
  const [fallbackModel, setFallbackModel] = useState<string | null>(null);

  // RAF-batched text buffer — accumulates tokens between animation frames
  // so React only re-renders at ~60fps instead of 80–240+ times/sec
  const textBufferRef = useRef("");
  const accumulatedTextRef = useRef("");
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
    accumulatedTextRef.current = "";
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
    setFallbackModel(null);
  }, []);

  const abort = useCallback((): string => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Flush any remaining buffered text immediately into state
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
    return accumulatedTextRef.current;
  }, []);

  const startStream = useCallback(
    async (
      threadId: string,
      parentId: string,
      model: string,
      hyperparameters?: {
        systemPrompt?: string;
        temperature?: number;
        topP?: number;
        maxTokens?: number;
      }
    ): Promise<StreamSnapshot> => {
      // Clean up previous stream and state
      reset();

      const controller = new AbortController();
      abortRef.current = controller;

      setIsStreaming(true);
      setError(null);
      setMetrics(null);
      setMessageId(null);
      setFallbackModel(null);

      let snapshotText = "";
      let snapshotError: string | null = null;
      let snapshotMetrics: StreamMetrics | null = null;
      let snapshotMessageId: string | null = null;
      let snapshotFallbackModel: string | null = null;

      // Sliding watchdog timer: aborts stream if no chunks arrive for 15s
      const watchdogRef: { id: NodeJS.Timeout | null } = { id: null };
      let isWatchdogAborted = false;
      const resetWatchdog = () => {
        if (watchdogRef.id) clearTimeout(watchdogRef.id);
        watchdogRef.id = setTimeout(() => {
          if (abortRef.current === controller) {
            isWatchdogAborted = true;
            controller.abort();
            setError("Stream connection timed out due to inactivity.");
            setIsStreaming(false);
          }
        }, 15000);
      };

      try {
        resetWatchdog();

        const anonToken = getAnonToken();
        const response = await fetch("/api/arena/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-anon-token": anonToken,
          },
          body: JSON.stringify({
            threadId,
            parentId,
            model,
            anonToken,
            systemPrompt: hyperparameters?.systemPrompt,
            temperature: hyperparameters?.temperature,
            topP: hyperparameters?.topP,
            maxTokens: hyperparameters?.maxTokens,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP error status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No readable stream body returned");
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
                  if (abortRef.current === controller) {
                    setMessageId(event.messageId);
                  }
                  snapshotMessageId = event.messageId;
                } else if (event.type === "fallback") {
                  if (abortRef.current === controller) {
                    setFallbackModel(event.fallbackModel);
                  }
                  snapshotFallbackModel = event.fallbackModel;
                } else if (event.type === "token") {
                  // Accumulate in buffer and snapshot, schedule RAF flush if active controller
                  accumulatedTextRef.current += event.text;
                  if (abortRef.current === controller) {
                    textBufferRef.current += event.text;
                    scheduleFlush();
                  }
                  snapshotText += event.text;
                } else if (event.type === "done") {
                  if (watchdogRef.id) clearTimeout(watchdogRef.id);
                  const finalM: StreamMetrics = {
                    latency: event.latency,
                    ttft: event.ttft,
                    tokensPerSec: event.tokensPerSec,
                    tokenCount: event.tokenCount,
                    costUsd: event.usage?.costUsd ?? null,
                    costSource: event.usage?.costSource ?? null,
                    promptTokens: event.usage?.promptTokens ?? null,
                    completionTokens: event.usage?.completionTokens ?? null,
                    reasoningTokens: event.usage?.reasoningTokens ?? null,
                    cachedTokens: event.usage?.cachedTokens ?? null,
                    actualModel: event.usage?.actualModel ?? null,
                  };
                  snapshotMetrics = finalM;
                  if (abortRef.current === controller) {
                    if (textBufferRef.current) {
                      const remaining = textBufferRef.current;
                      textBufferRef.current = "";
                      setText((prev) => prev + remaining);
                    }
                    if (rafIdRef.current !== null) {
                      cancelAnimationFrame(rafIdRef.current);
                      rafIdRef.current = null;
                    }
                    setMetrics(finalM);
                    setIsStreaming(false);
                  }
                } else if (event.type === "error") {
                  if (watchdogRef.id) clearTimeout(watchdogRef.id);
                  snapshotError = event.message || "Model provider error";
                  if (abortRef.current === controller) {
                    setError(snapshotError);
                    setIsStreaming(false);
                  }
                }
              } catch {
                // Ignore JSON parsing errors for incomplete SSE chunks
              }
            }
          }
        }
      } catch (err: unknown) {
        if (isWatchdogAborted) {
          const timeoutMsg = "Stream connection timed out due to inactivity.";
          if (abortRef.current === controller) {
            setError(timeoutMsg);
          }
          snapshotError = timeoutMsg;
        } else {
          const errMsg =
            err instanceof Error ? err.message : "A streaming error occurred. Please try again.";
          if (abortRef.current === controller) {
            setError(errMsg);
          }
          snapshotError = errMsg;
        }
      } finally {
        if (watchdogRef.id) clearTimeout(watchdogRef.id);
        // Only flush buffer, cancel RAF, and set isStreaming=false if THIS controller is still the active stream
        const isCurrent = abortRef.current === controller;
        if (isCurrent) {
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
          abortRef.current = null;
        }
      }

      return {
        text: snapshotText,
        error: snapshotError,
        metrics: snapshotMetrics,
        messageId: snapshotMessageId,
        fallbackModel: snapshotFallbackModel,
      };
    },
    [scheduleFlush]
  );

  return {
    text,
    isStreaming,
    error,
    metrics,
    messageId,
    fallbackModel,
    startStream,
    reset,
    abort,
  };
}
