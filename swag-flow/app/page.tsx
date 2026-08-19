"use client";

import { useState } from "react";
import { useModelStream } from "./arena/useModelStream";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize streams for the three models
  const modelA = useModelStream();
  const modelB = useModelStream();
  const modelC = useModelStream();

  const handleReset = () => {
    setPrompt("");
    setThreadId(null);
    setError(null);
    modelA.reset();
    modelB.reset();
    modelC.reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    modelA.reset();
    modelB.reset();
    modelC.reset();

    try {
      // 1. Send prompt to server to establish thread and parent user message
      const response = await fetch("/api/arena/prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, threadId }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to create prompt: ${response.status}`);
      }

      const data = await response.json();
      const currentThreadId = data.threadId;
      const parentId = data.messageId;

      setThreadId(currentThreadId);

      // 2. Stream responses from all three models concurrently and independently
      // We do not wait for one to finish before starting the others!
      const models = [
        { hook: modelA, name: "google/gemma-4-31b-it:free" },
        { hook: modelB, name: "nvidia/nemotron-3.5-lightning:free" },
        { hook: modelC, name: "poolside/laguna-s-2.1:free" },
      ];

      // Firing all streams in parallel (non-blocking)
      models.forEach(({ hook, name }) => {
        hook.startStream(currentThreadId, parentId, name);
      });
    } catch (err: unknown) {
      console.error("Submission error:", err);
      setError(err instanceof Error ? err.message : "Failed to submit prompt. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStreamingAny = modelA.isStreaming || modelB.isStreaming || modelC.isStreaming;

  return (
    <div className="flex flex-col min-h-screen font-sans bg-background text-foreground transition-colors duration-300">
      {/* Header bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-custom bg-card-bg/40 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center font-bold text-lg text-white">
            A
          </div>
          <span className="font-semibold text-lg tracking-tight">LLM Arena</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Clerk Auth display */}
          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="px-4 py-1.5 rounded-full text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors cursor-pointer">
                Sign In
              </button>
            </SignInButton>
          </Show>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Intro */}
        <div className="flex flex-col gap-2 max-w-2xl">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl text-foreground">
            Compare Models Concurrently
          </h1>
          <p className="text-sm text-foreground/75">
            Submit a prompt to watch three AI models answer in real-time. Metrics are measured per
            call.
          </p>
        </div>

        {/* Prompt Input Section */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 p-5 rounded-2xl border border-border-custom bg-card-bg shadow-lg"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="prompt-box" className="text-sm font-semibold text-foreground/80">
              Your Prompt
            </label>
            <textarea
              id="prompt-box"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isSubmitting || isStreamingAny}
              placeholder="Ask anything... e.g. Write a quick sort function in TypeScript."
              className="w-full min-h-[100px] p-4 rounded-xl border border-border-custom bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent text-sm resize-y"
              required
            />
          </div>

          {error && (
            <div className="p-3 text-sm text-red-200 bg-red-950/40 border border-red-800 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            {(threadId || prompt) && (
              <button
                type="button"
                onClick={handleReset}
                disabled={isSubmitting || isStreamingAny}
                className="px-5 py-2.5 rounded-xl border border-border-custom bg-background hover:bg-card-bg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting || isStreamingAny || !prompt.trim()}
              className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-md transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Initializing...
                </>
              ) : isStreamingAny ? (
                "Streaming Responses..."
              ) : (
                "Compare Models"
              )}
            </button>
          </div>
        </form>

        {/* Results Panels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Model Card A */}
          <ModelResponseCard modelName="Gemini 2.5 Flash (Free)" hook={modelA} />

          {/* Model Card B */}
          <ModelResponseCard modelName="Llama 3 8B Instruct (Free)" hook={modelB} />

          {/* Model Card C */}
          <ModelResponseCard modelName="Mistral 7B Instruct (Free)" hook={modelC} />
        </div>
      </main>
    </div>
  );
}

interface ModelResponseCardProps {
  modelName: string;
  hook: ReturnType<typeof useModelStream>;
}

function ModelResponseCard({ modelName, hook }: ModelResponseCardProps) {
  const { text, isStreaming, error, metrics } = hook;

  return (
    <div className="flex flex-col min-h-[350px] rounded-2xl border border-border-custom bg-card-bg shadow-md overflow-hidden">
      {/* Card Header */}
      <div className="px-5 py-4 border-b border-border-custom bg-card-bg/60 flex items-center justify-between">
        <span className="font-semibold text-sm tracking-tight text-foreground/90">{modelName}</span>
        {isStreaming && (
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>
        )}
      </div>

      {/* Card Content */}
      <div className="flex-1 p-5 text-sm overflow-y-auto leading-relaxed max-h-[400px]">
        {error ? (
          <div className="text-red-400 bg-red-950/20 border border-red-900/30 p-4 rounded-xl">
            {error}
          </div>
        ) : text ? (
          <div className="whitespace-pre-wrap font-sans text-foreground/90">{text}</div>
        ) : isStreaming ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-border-custom rounded w-3/4"></div>
            <div className="h-4 bg-border-custom rounded w-5/6"></div>
            <div className="h-4 bg-border-custom rounded w-2/3"></div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-foreground/40 italic">
            Awaiting prompt submission...
          </div>
        )}
      </div>

      {/* Card Footer (Metrics) */}
      <div className="px-5 py-3.5 border-t border-border-custom bg-background/50 flex flex-col gap-1 text-[11px] text-foreground/60 font-mono">
        {metrics ? (
          <>
            <div className="flex justify-between">
              <span>Time-to-first-token:</span>
              <span className="text-accent font-semibold">{metrics.ttft.toFixed(3)}s</span>
            </div>
            <div className="flex justify-between">
              <span>Total Latency:</span>
              <span className="text-foreground/80">{metrics.latency.toFixed(3)}s</span>
            </div>
            <div className="flex justify-between">
              <span>Speed:</span>
              <span className="text-foreground/80">{metrics.tokensPerSec.toFixed(1)} tok/s</span>
            </div>
            <div className="flex justify-between">
              <span>Total Tokens:</span>
              <span className="text-foreground/80">{metrics.tokenCount}</span>
            </div>
            <div className="flex justify-between border-t border-border-custom/50 mt-1 pt-1">
              <span>Cost:</span>
              <span className="text-foreground/45">$0.0000</span>
            </div>
          </>
        ) : isStreaming ? (
          <div className="text-center italic animate-pulse">Measuring call...</div>
        ) : (
          <div className="text-center italic text-foreground/35">No metrics captured yet</div>
        )}
      </div>
    </div>
  );
}
