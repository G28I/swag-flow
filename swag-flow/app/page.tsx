"use client";

import { useState } from "react";
import { useModelStream } from "./arena/useModelStream";
import AppShell from "@/components/AppShell";
import { ArrowUp, Plus, ChevronDown, ChevronUp, Sparkles, Check, Trash2 } from "lucide-react";

interface StreamMetrics {
  ttft: number;
  latency: number;
  tokensPerSec: number;
  tokenCount: number;
}

interface Turn {
  id: string;
  prompt: string;
  winnerModel: string | null;
  responses: {
    modelA: {
      text: string;
      error: string | null;
      metrics: StreamMetrics | null;
      isStreaming: boolean;
    };
    modelB: {
      text: string;
      error: string | null;
      metrics: StreamMetrics | null;
      isStreaming: boolean;
    };
    modelC: {
      text: string;
      error: string | null;
      metrics: StreamMetrics | null;
      isStreaming: boolean;
    };
  };
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [threadId, setThreadId] = useState<string | null>("active-thread");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active models selection popover state
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [selectedModels, setSelectedModels] = useState({
    gemini: true,
    nemotron: true,
    laguna: true,
  });

  // Track chat feed history turns locally for the UI-only phase
  const [turns, setTurns] = useState<Turn[]>([]);

  // Initialize streams for the three models
  const modelA = useModelStream();
  const modelB = useModelStream();
  const modelC = useModelStream();

  const handleReset = () => {
    setPrompt("");
    setError(null);
    setTurns([]);
    modelA.reset();
    modelB.reset();
    modelC.reset();
  };

  const handleVote = (turnId: string, modelName: string) => {
    setTurns((prev) =>
      prev.map((turn) => (turn.id === turnId ? { ...turn, winnerModel: modelName } : turn))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const userPrompt = prompt;
    setPrompt(""); // Clear input box as per modern chat UX

    // Reset current active streaming hooks
    modelA.reset();
    modelB.reset();
    modelC.reset();

    // Create a new Turn placeholder in turns feed list
    const newTurnId = Math.random().toString(36).substring(7);
    const initialTurn: Turn = {
      id: newTurnId,
      prompt: userPrompt,
      winnerModel: null,
      responses: {
        modelA: { text: "", error: null, metrics: null, isStreaming: selectedModels.gemini },
        modelB: { text: "", error: null, metrics: null, isStreaming: selectedModels.nemotron },
        modelC: { text: "", error: null, metrics: null, isStreaming: selectedModels.laguna },
      },
    };

    setTurns((prev) => [...prev, initialTurn]);

    try {
      // 1. Establish thread and user message in database
      const response = await fetch("/api/arena/prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: userPrompt, threadId }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to create prompt: ${response.status}`);
      }

      const data = await response.json();
      const currentThreadId = data.threadId;
      const parentId = data.messageId;

      setThreadId(currentThreadId);

      // 2. Fire OpenRouter streaming connections concurrently
      const activeHooks = [
        {
          key: "modelA",
          hook: modelA,
          name: "google/gemma-4-31b-it:free",
          active: selectedModels.gemini,
        },
        {
          key: "modelB",
          hook: modelB,
          name: "nvidia/nemotron-3.5-lightning:free",
          active: selectedModels.nemotron,
        },
        {
          key: "modelC",
          hook: modelC,
          name: "poolside/laguna-s-2.1:free",
          active: selectedModels.laguna,
        },
      ];

      activeHooks.forEach(({ hook, name, active }) => {
        if (active) {
          hook.startStream(currentThreadId, parentId, name);
        }
      });
    } catch (err: unknown) {
      console.error("Submission error:", err);
      const errMsg =
        err instanceof Error ? err.message : "Failed to submit prompt. Please try again.";
      setError(errMsg);
      // Update turn with error status
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === newTurnId
            ? {
                ...turn,
                responses: {
                  modelA: {
                    text: "",
                    error: selectedModels.gemini ? errMsg : null,
                    metrics: null,
                    isStreaming: false,
                  },
                  modelB: {
                    text: "",
                    error: selectedModels.nemotron ? errMsg : null,
                    metrics: null,
                    isStreaming: false,
                  },
                  modelC: {
                    text: "",
                    error: selectedModels.laguna ? errMsg : null,
                    metrics: null,
                    isStreaming: false,
                  },
                },
              }
            : turn
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStreamingAny = modelA.isStreaming || modelB.isStreaming || modelC.isStreaming;

  // We sync active stream hooks into the latest turn card in the feed
  const activeTurns = turns.map((turn, index) => {
    // If it's the last turn and models are currently streaming, map live hook state
    if (
      index === turns.length - 1 &&
      (isStreamingAny || modelA.text || modelB.text || modelC.text)
    ) {
      return {
        ...turn,
        responses: {
          modelA: {
            text: modelA.text,
            error: modelA.error,
            metrics: modelA.metrics,
            isStreaming: modelA.isStreaming,
          },
          modelB: {
            text: modelB.text,
            error: modelB.error,
            metrics: modelB.metrics,
            isStreaming: modelB.isStreaming,
          },
          modelC: {
            text: modelC.text,
            error: modelC.error,
            metrics: modelC.metrics,
            isStreaming: modelC.isStreaming,
          },
        },
      };
    }
    return turn;
  });

  return (
    <AppShell breadcrumb="Thread 1">
      <div className="flex flex-col h-[calc(100vh-4rem)] relative bg-background">
        {/* Scrollable Chat Area */}
        <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 pb-32">
          {activeTurns.length === 0 ? (
            /* Empty State */
            <div className="max-w-2xl mx-auto text-center py-20 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-card-bg border border-border-custom flex items-center justify-center text-accent">
                <Sparkles size={32} />
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight">
                Concurrently Compare Models
              </h2>
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed font-medium">
                Choose up to three models from the picker, ask anything below, and watch responses
                stream in parallel columns. Select the best output to record a vote.
              </p>
            </div>
          ) : (
            /* Chat Turns */
            activeTurns.map((turn) => (
              <div key={turn.id} className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
                {/* User Message Bubble */}
                <div className="flex justify-end">
                  <div className="max-w-xl bg-card-bg border border-border-custom px-5 py-3.5 rounded-2xl text-sm font-semibold shadow-md leading-relaxed">
                    {turn.prompt}
                  </div>
                </div>

                {/* Models Output Columns Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {selectedModels.gemini && (
                    <ModelResponseCard
                      modelName="google/gemma-4-31b-it:free"
                      modelShort="G"
                      state={turn.responses.modelA}
                      winnerModel={turn.winnerModel}
                      onVote={() => handleVote(turn.id, "gemma")}
                      isVoted={turn.winnerModel === "gemma"}
                    />
                  )}
                  {selectedModels.nemotron && (
                    <ModelResponseCard
                      modelName="nvidia/nemotron-3.5-lightning:free"
                      modelShort="N"
                      state={turn.responses.modelB}
                      winnerModel={turn.winnerModel}
                      onVote={() => handleVote(turn.id, "nemotron")}
                      isVoted={turn.winnerModel === "nemotron"}
                    />
                  )}
                  {selectedModels.laguna && (
                    <ModelResponseCard
                      modelName="poolside/laguna-s-2.1:free"
                      modelShort="L"
                      state={turn.responses.modelC}
                      winnerModel={turn.winnerModel}
                      onVote={() => handleVote(turn.id, "laguna")}
                      isVoted={turn.winnerModel === "laguna"}
                    />
                  )}
                </div>
              </div>
            ))
          )}
          {error && (
            <div className="max-w-2xl mx-auto p-4 text-xs text-red-200 bg-red-950/40 border border-red-800 rounded-xl">
              {error}
            </div>
          )}
        </div>

        {/* Bottom Prompts Dock */}
        <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-background via-background to-transparent pointer-events-none flex justify-center">
          <div className="w-full max-w-4xl pointer-events-auto">
            <form
              onSubmit={handleSubmit}
              className="bg-card-bg border border-border-custom rounded-2xl p-4 shadow-xl flex flex-col gap-3"
            >
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                disabled={isSubmitting || isStreamingAny}
                placeholder="Ask anything. Enter to send, shift + enter for a new line"
                className="w-full bg-transparent text-foreground text-sm font-medium focus:outline-none resize-none h-14 placeholder-muted-foreground/75 leading-relaxed pr-10"
              />

              <div className="flex items-center justify-between border-t border-border-custom/40 pt-3 relative">
                {/* Model selection dropdown popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowModelPicker(!showModelPicker)}
                    disabled={isSubmitting || isStreamingAny}
                    className="px-3.5 py-1.5 rounded-lg border border-border-custom bg-background hover:bg-muted/40 text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Plus size={14} className="text-accent" />
                    <span>Add Model</span>
                  </button>

                  {showModelPicker && (
                    <div className="absolute bottom-10 left-0 bg-card-bg border border-border-custom p-4 rounded-xl shadow-2xl w-60 z-30 flex flex-col gap-3.5">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Select Models (1-3)
                      </h4>
                      <div className="flex flex-col gap-2.5 text-xs font-bold">
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={selectedModels.gemini}
                            onChange={(e) =>
                              setSelectedModels((p) => ({ ...p, gemini: e.target.checked }))
                            }
                            className="rounded accent-accent"
                          />
                          <span>Gemini 2.5 Flash</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={selectedModels.nemotron}
                            onChange={(e) =>
                              setSelectedModels((p) => ({ ...p, nemotron: e.target.checked }))
                            }
                            className="rounded accent-accent"
                          />
                          <span>Nemotron 3.5 Lightning</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={selectedModels.laguna}
                            onChange={(e) =>
                              setSelectedModels((p) => ({ ...p, laguna: e.target.checked }))
                            }
                            className="rounded accent-accent"
                          />
                          <span>Laguna S 2.1</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Form Buttons */}
                <div className="flex items-center gap-3">
                  {turns.length > 0 && (
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={isSubmitting || isStreamingAny}
                      className="p-1.5 rounded-lg border border-border-custom bg-background hover:bg-red-950/20 text-muted-foreground hover:text-red-400 transition-all cursor-pointer disabled:opacity-50"
                      title="Clear Chat"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting || isStreamingAny || !prompt.trim()}
                    className="p-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-all shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ArrowUp size={16} />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

interface ModelResponseCardProps {
  modelName: string;
  modelShort: string;
  state: {
    text: string;
    error: string | null;
    metrics: StreamMetrics | null;
    isStreaming: boolean;
  };
  winnerModel: string | null;
  onVote: () => void;
  isVoted: boolean;
}

function ModelResponseCard({
  modelName,
  modelShort,
  state,
  winnerModel,
  onVote,
  isVoted,
}: ModelResponseCardProps) {
  const { text, isStreaming, error, metrics } = state;
  const [showMetrics, setShowMetrics] = useState(false);

  const hasVoteCast = winnerModel !== null;

  return (
    <div className="flex flex-col min-h-[350px] rounded-2xl border border-border-custom bg-card-bg shadow-md overflow-hidden relative group">
      {/* Dynamic top highlight on selection */}
      <div
        className={`absolute top-0 inset-x-0 h-1 transition-all duration-300 ${
          isVoted ? "bg-accent" : "bg-transparent group-hover:bg-border-custom"
        }`}
      />

      {/* Card Header */}
      <div className="px-5 py-4 border-b border-border-custom bg-card-bg/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center font-black text-[10px] text-accent">
            {modelShort}
          </div>
          <span className="font-bold text-xs text-foreground/90 truncate max-w-[150px]">
            {modelName.split("/")[1] || modelName}
          </span>
        </div>

        {/* Voting picker buttons */}
        <div className="flex items-center">
          {isVoted ? (
            <span className="px-2.5 py-1 rounded-lg bg-accent text-white text-[10px] font-bold flex items-center gap-1">
              <Check size={12} strokeWidth={3} />
              Winner
            </span>
          ) : (
            <button
              onClick={onVote}
              disabled={hasVoteCast || isStreaming || !text}
              className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                hasVoteCast
                  ? "border-border-custom text-muted-foreground"
                  : "border-accent bg-accent/10 text-accent hover:bg-accent hover:text-white"
              }`}
            >
              Vote
            </button>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div className="flex-1 p-5 text-sm overflow-y-auto leading-relaxed max-h-[350px] font-medium">
        {error ? (
          <div className="text-red-400 bg-red-950/20 border border-red-900/30 p-4 rounded-xl text-xs font-semibold">
            {error}
          </div>
        ) : text ? (
          <div className="whitespace-pre-wrap font-sans text-foreground/90 leading-relaxed">
            {text}
          </div>
        ) : isStreaming ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-border-custom rounded w-3/4"></div>
            <div className="h-4 bg-border-custom rounded w-5/6"></div>
            <div className="h-4 bg-border-custom rounded w-2/3"></div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-foreground/45 italic select-none">
            Awaiting prompt submission...
          </div>
        )}
      </div>

      {/* Card Footer (Metrics Toggle) */}
      <div className="border-t border-border-custom bg-background/50 flex flex-col">
        <button
          onClick={() => setShowMetrics(!showMetrics)}
          disabled={!metrics && !isStreaming}
          className="w-full px-5 py-2.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed select-none"
        >
          <span>Model Metrics</span>
          {showMetrics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showMetrics && metrics && (
          <div className="px-5 pb-4 pt-1 flex flex-col gap-1.5 text-[10.5px] text-foreground/70 font-mono border-t border-border-custom/40">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time-to-first-token:</span>
              <span className="text-accent font-extrabold">{metrics.ttft.toFixed(3)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Latency:</span>
              <span className="text-foreground/90 font-bold">{metrics.latency.toFixed(3)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Speed:</span>
              <span className="text-foreground/90 font-bold">
                {metrics.tokensPerSec.toFixed(1)} tok/s
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Tokens:</span>
              <span className="text-foreground/90 font-bold">{metrics.tokenCount}</span>
            </div>
            <div className="flex justify-between border-t border-border-custom/50 mt-1 pt-1">
              <span className="text-muted-foreground">Cost:</span>
              <span className="text-foreground/45 font-bold">$0.0000</span>
            </div>
          </div>
        )}

        {showMetrics && isStreaming && (
          <div className="px-5 pb-4 pt-2.5 text-center italic text-[10px] text-accent animate-pulse font-mono border-t border-border-custom/40">
            Measuring call...
          </div>
        )}
      </div>
    </div>
  );
}
