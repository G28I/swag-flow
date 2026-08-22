"use client";

import { useState, useEffect } from "react";
import { useModelStream } from "./arena/useModelStream";
import AppShell from "@/components/AppShell";
import {
  ArrowUp,
  Plus,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Check,
  Trash2,
  X,
  Lock,
} from "lucide-react";

interface StreamMetrics {
  ttft: number;
  latency: number;
  tokensPerSec: number;
  tokenCount: number;
}

interface TurnResponse {
  text: string;
  error: string | null;
  metrics: StreamMetrics | null;
  isStreaming: boolean;
}

interface Turn {
  id: string;
  prompt: string;
  winnerModel: string | null; // e.g. "modelA" | "modelB" | "modelC"
  responses: {
    modelA: TurnResponse;
    modelB: TurnResponse;
    modelC: TurnResponse;
  };
  activeCount: number; // number of models active in this turn
  models: ModelItem[];
}

interface ModelItem {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

const FALLBACK_MODELS: ModelItem[] = [
  {
    id: "google/gemma-4-31b-it:free",
    name: "Google Gemma 4 31B (Free)",
    context_length: 32768,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    name: "NVIDIA Nemotron 3.5 Lightning (Free)",
    context_length: 8192,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    id: "poolside/laguna-s-2.1:free",
    name: "Poolside Laguna S 2.1 (Free)",
    context_length: 16384,
    pricing: { prompt: "0", completion: "0" },
  },
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [threadId, setThreadId] = useState<string | null>("active-thread");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic models catalog from server
  const [availableModels, setAvailableModels] = useState<ModelItem[]>([]);
  const [activeModels, setActiveModels] = useState<ModelItem[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Track chat feed history turns locally
  const [turns, setTurns] = useState<Turn[]>([]);

  // Initialize streams for up to 3 concurrent models
  const modelA = useModelStream();
  const modelB = useModelStream();
  const modelC = useModelStream();

  // Read thread from query parameters on mount or when URL changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const threadParam = params.get("thread");
      if (threadParam) {
        requestAnimationFrame(() => {
          setThreadId(threadParam);
        });
      }
    }
  }, []);

  // Fetch live free-tier models on mount
  useEffect(() => {
    async function loadModels() {
      try {
        const res = await fetch("/api/arena/models");
        if (!res.ok) throw new Error("Failed to load models list");
        const data: ModelItem[] = await res.json();
        setAvailableModels(data);
        // Default select top 3 models
        setActiveModels(data.slice(0, 3));
      } catch (err) {
        console.error("Failed to load active models catalog:", err);
        setAvailableModels(FALLBACK_MODELS);
        setActiveModels(FALLBACK_MODELS.slice(0, 3));
        setError("Unable to load live models list. Using fallback models.");
      }
    }
    loadModels();
  }, []);

  const handleReset = () => {
    setPrompt("");
    setError(null);
    setTurns([]);
    modelA.reset();
    modelB.reset();
    modelC.reset();
  };

  const handleVote = (turnId: string, modelSlot: "modelA" | "modelB" | "modelC") => {
    setTurns((prev) =>
      prev.map((turn) => (turn.id === turnId ? { ...turn, winnerModel: modelSlot } : turn))
    );
  };

  const removeModel = (modelId: string) => {
    setActiveModels((prev) => prev.filter((m) => m.id !== modelId));
  };

  const addModel = (model: ModelItem) => {
    if (activeModels.length >= 3) return;
    if (activeModels.some((m) => m.id === model.id)) return;
    setActiveModels((prev) => [...prev, model]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting || activeModels.length === 0) return;

    setIsSubmitting(true);
    setError(null);

    const userPrompt = prompt;
    setPrompt(""); // Clear input box

    // Reset streaming hooks for selected active slots
    modelA.reset();
    modelB.reset();
    modelC.reset();

    const turnId = Math.random().toString(36).substring(7);
    const initialTurn: Turn = {
      id: turnId,
      prompt: userPrompt,
      winnerModel: null,
      activeCount: activeModels.length,
      models: [...activeModels],
      responses: {
        modelA: { text: "", error: null, metrics: null, isStreaming: activeModels.length > 0 },
        modelB: { text: "", error: null, metrics: null, isStreaming: activeModels.length > 1 },
        modelC: { text: "", error: null, metrics: null, isStreaming: activeModels.length > 2 },
      },
    };

    setTurns((prev) => [...prev, initialTurn]);

    try {
      // 1. Establish thread and user message in database
      let response = await fetch("/api/arena/prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: userPrompt, threadId }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        // Retry if thread was not found (e.g. sidebar mock thread clicked)
        if (response.status === 404 && errJson.error === "Thread not found") {
          console.warn("Thread not found. Retrying with new thread creation...");
          response = await fetch("/api/arena/prompt", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ prompt: userPrompt, threadId: null }),
          });

          if (!response.ok) {
            const retryErrJson = await response.json().catch(() => ({}));
            throw new Error(retryErrJson.error || `Failed to create prompt: ${response.status}`);
          }
        } else {
          throw new Error(errJson.error || `Failed to create prompt: ${response.status}`);
        }
      }

      const data = await response.json();
      const currentThreadId = data.threadId;
      const parentId = data.messageId;

      setThreadId(currentThreadId);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/?thread=${currentThreadId}`);
      }

      // 2. Fire OpenRouter streaming connections concurrently
      activeModels.forEach((model, idx) => {
        const hook = idx === 0 ? modelA : idx === 1 ? modelB : modelC;
        hook.startStream(currentThreadId, parentId, model.id);
      });
    } catch (err: unknown) {
      console.error("Submission error:", err);
      const errMsg =
        err instanceof Error ? err.message : "Failed to submit prompt. Please try again.";
      setError(errMsg);
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                responses: {
                  modelA: {
                    text: "",
                    error: activeModels.length > 0 ? errMsg : null,
                    metrics: null,
                    isStreaming: false,
                  },
                  modelB: {
                    text: "",
                    error: activeModels.length > 1 ? errMsg : null,
                    metrics: null,
                    isStreaming: false,
                  },
                  modelC: {
                    text: "",
                    error: activeModels.length > 2 ? errMsg : null,
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

  // Sync current active streaming hooks into the latest turn card in the feed
  const activeTurns = turns.map((turn, index) => {
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
        <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 pb-36">
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
            activeTurns.map((turn) => {
              // Align grid size to active count of models in this turn
              const gridCols =
                turn.activeCount === 1
                  ? "grid-cols-1 max-w-2xl"
                  : turn.activeCount === 2
                    ? "grid-cols-1 md:grid-cols-2 max-w-5xl"
                    : "grid-cols-1 md:grid-cols-3 max-w-7xl";

              return (
                <div key={turn.id} className="flex flex-col gap-6 w-full mx-auto">
                  {/* User Message Bubble */}
                  <div className="flex justify-end max-w-7xl mx-auto w-full">
                    <div className="max-w-xl bg-card-bg border border-border-custom px-5 py-3.5 rounded-2xl text-sm font-semibold shadow-md leading-relaxed">
                      {turn.prompt}
                    </div>
                  </div>

                  {/* Models Output Columns Grid */}
                  <div className={`grid gap-6 w-full mx-auto ${gridCols}`}>
                    {turn.activeCount > 0 && (
                      <ModelResponseCard
                        modelName={turn.models[0]?.id || "Model A"}
                        modelShort={(turn.models[0]?.name || "A").charAt(0).toUpperCase()}
                        state={turn.responses.modelA}
                        winnerModel={turn.winnerModel}
                        onVote={() => handleVote(turn.id, "modelA")}
                        isVoted={turn.winnerModel === "modelA"}
                      />
                    )}
                    {turn.activeCount > 1 && (
                      <ModelResponseCard
                        modelName={turn.models[1]?.id || "Model B"}
                        modelShort={(turn.models[1]?.name || "B").charAt(0).toUpperCase()}
                        state={turn.responses.modelB}
                        winnerModel={turn.winnerModel}
                        onVote={() => handleVote(turn.id, "modelB")}
                        isVoted={turn.winnerModel === "modelB"}
                      />
                    )}
                    {turn.activeCount > 2 && (
                      <ModelResponseCard
                        modelName={turn.models[2]?.id || "Model C"}
                        modelShort={(turn.models[2]?.name || "C").charAt(0).toUpperCase()}
                        state={turn.responses.modelC}
                        winnerModel={turn.winnerModel}
                        onVote={() => handleVote(turn.id, "modelC")}
                        isVoted={turn.winnerModel === "modelC"}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
          {error && (
            <div className="max-w-2xl mx-auto p-4 text-xs text-red-200 bg-red-950/40 border border-red-800 rounded-xl">
              {error}
            </div>
          )}
        </div>

        {/* Bottom Prompts Dock */}
        <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-background via-background to-transparent pointer-events-none flex flex-col items-center">
          <div className="w-full max-w-4xl pointer-events-auto flex flex-col gap-3">
            {/* Active Model Selection Chips */}
            <div className="flex flex-wrap gap-2 px-1 max-h-12 overflow-y-auto">
              {activeModels.map((model) => (
                <div
                  key={model.id}
                  className="px-2.5 py-1 rounded-full border border-border-custom bg-card-bg text-[10px] font-bold flex items-center gap-1.5 shadow-sm text-foreground/90"
                >
                  <span className="w-4 h-4 rounded-full bg-accent/20 border border-accent/30 text-accent flex items-center justify-center font-black text-[9px]">
                    {model.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate max-w-[120px]">
                    {model.name.split("/")[1] || model.name}
                  </span>
                  <button
                    onClick={() => removeModel(model.id)}
                    disabled={isSubmitting || isStreamingAny}
                    className="hover:text-red-400 p-0.5 rounded-full hover:bg-muted/50 cursor-pointer disabled:opacity-50"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              {activeModels.length === 0 && (
                <span className="text-[10px] text-red-400 font-bold bg-red-950/30 border border-red-800/30 px-3 py-1 rounded-full select-none animate-pulse">
                  No active models selected! Add a model to compare.
                </span>
              )}
            </div>

            {/* Prompt Box */}
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
                disabled={isSubmitting || isStreamingAny || activeModels.length === 0}
                placeholder="Ask anything. Enter to send, shift + enter for a new line"
                className="w-full bg-transparent text-foreground text-sm font-medium focus:outline-none resize-none h-14 placeholder-muted-foreground/75 leading-relaxed pr-10"
              />

              <div className="flex items-center justify-between border-t border-border-custom/40 pt-3 relative">
                {/* Model selection popover */}
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
                    <div className="absolute bottom-10 left-0 bg-card-bg border border-border-custom p-4 rounded-xl shadow-2xl w-64 z-30 flex flex-col gap-3.5 max-h-72 overflow-y-auto">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Available Free Models
                      </h4>
                      <div className="flex flex-col gap-2">
                        {availableModels.map((model) => {
                          const isActive = activeModels.some((m) => m.id === model.id);
                          const isLimit = activeModels.length >= 3;
                          return (
                            <button
                              key={model.id}
                              type="button"
                              disabled={isActive || (isLimit && !isActive)}
                              onClick={() => {
                                addModel(model);
                                setShowModelPicker(false);
                              }}
                              className={`w-full px-3 py-2 rounded-lg border text-left text-xs font-bold flex items-center justify-between transition-all duration-150 ${
                                isActive
                                  ? "bg-accent/10 border-accent/20 text-accent cursor-default"
                                  : isLimit
                                    ? "border-border-custom text-muted-foreground cursor-not-allowed opacity-50"
                                    : "border-border-custom hover:bg-muted/40 text-foreground/90 cursor-pointer"
                              }`}
                            >
                              <div className="flex flex-col min-w-0 pr-2">
                                <span className="truncate">{model.name}</span>
                                <span className="text-[9px] text-muted-foreground truncate leading-normal">
                                  {model.context_length.toLocaleString()} ctx
                                </span>
                              </div>
                              {isActive ? (
                                <Check size={12} className="shrink-0" />
                              ) : isLimit ? (
                                <Lock size={12} className="shrink-0" />
                              ) : null}
                            </button>
                          );
                        })}
                        {availableModels.length === 0 && (
                          <div className="text-center italic text-xs text-muted-foreground py-2 select-none">
                            Loading models catalog...
                          </div>
                        )}
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
                    disabled={
                      isSubmitting || isStreamingAny || !prompt.trim() || activeModels.length === 0
                    }
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
  state: TurnResponse;
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
          <span
            className="font-bold text-xs text-foreground/90 truncate max-w-[150px]"
            title={modelName}
          >
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
