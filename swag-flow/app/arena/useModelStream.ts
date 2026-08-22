import { useState, useCallback } from "react";

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

  const reset = useCallback(() => {
    setText("");
    setIsStreaming(false);
    setError(null);
    setMetrics(null);
    setMessageId(null);
  }, []);

  const startStream = useCallback(async (threadId: string, parentId: string, model: string) => {
    setIsStreaming(true);
    setError(null);
    setText("");
    setMetrics(null);
    setMessageId(null);

    try {
      const response = await fetch("/api/arena/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ threadId, parentId, model }),
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
                setText((prev) => prev + event.text);
              } else if (event.type === "done") {
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
      console.error(`Stream error for model ${model}:`, err);
      setError(
        err instanceof Error ? err.message : "A streaming error occurred. Please try again."
      );
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return {
    text,
    isStreaming,
    error,
    metrics,
    messageId,
    startStream,
    reset,
  };
}
