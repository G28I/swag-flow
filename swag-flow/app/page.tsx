"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useModelStream } from "./arena/useModelStream";
import AppShell from "@/components/AppShell";
import DiffViewer from "@/components/DiffViewer";
import { ExportModal } from "@/components/ExportModal";
import { ShareModal } from "@/components/ShareModal";
import HyperparameterDrawer, {
  DEFAULT_HYPERPARAMETERS,
  Hyperparameters,
} from "@/components/HyperparameterDrawer";
import { getAnonToken } from "@/app/lib/anonToken";
import { getTurnComparisonInsights } from "@/app/lib/costEngine";
import { SignInButton } from "@clerk/nextjs";
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
  Share2,
  AlertCircle,
  Square,
  RotateCw,
  Pencil,
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  Copy,
  GitCompare,
  GitFork,
  SlidersHorizontal,
  Download,
} from "lucide-react";


interface StreamMetrics {
  ttft: number;
  latency: number;
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

interface TurnResponse {
  text: string;
  error: string | null;
  metrics: StreamMetrics | null;
  isStreaming: boolean;
  messageId: string | null;
}

interface Turn {
  id: string;
  prompt: string;
  winnerModel: string | null; // e.g. "modelA" | "modelB" | "modelC" | "tie"
  responses: {
    modelA: TurnResponse;
    modelB: TurnResponse;
    modelC: TurnResponse;
  };
  activeCount: number; // number of models active in this turn
  models: ModelItem[];
  promptId: string;
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
    id: "google/gemini-2.0-flash-exp:free",
    name: "Google Gemini 2.0 Flash (Free)",
    context_length: 1048576,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Meta Llama 3.3 70B (Free)",
    context_length: 131072,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    id: "qwen/qwen-2.5-coder-32b-instruct:free",
    name: "Qwen 2.5 Coder 32B (Free)",
    context_length: 32768,
    pricing: { prompt: "0", completion: "0" },
  },
];

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background text-foreground text-sm font-semibold">
          Loading Arena...
        </div>
      }
    >
      <ArenaContent />
    </Suspense>
  );
}

function ArenaContent() {
  const searchParams = useSearchParams();
  const threadParam = searchParams.get("thread");

  const [prompt, setPrompt] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadTitle, setThreadTitle] = useState<string>("Swag-flow");
  const [isOwner, setIsOwner] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic models catalog from server
  const [availableModels, setAvailableModels] = useState<ModelItem[]>([]);
  const [activeModels, setActiveModels] = useState<ModelItem[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Track chat feed history turns locally
  const [turns, setTurns] = useState<Turn[]>([]);

  // Prompt Editing & Branch Versioning
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  // Turn version history map: turnId -> array of alternative Turn versions
  const [turnVersionsMap, setTurnVersionsMap] = useState<Record<string, Turn[]>>({});
  // Current active version index per turnId: turnId -> versionIndex
  const [activeVersionIndexMap, setActiveVersionIndexMap] = useState<Record<string, number>>({});

  // Active streaming target turn & model slot tracking
  const [streamingTurnId, setStreamingTurnId] = useState<string | null>(null);
  const [streamingSlot, setStreamingSlot] = useState<"all" | "modelA" | "modelB" | "modelC">("all");

  // Side-by-side diff visualizer active turn tracking
  const [diffTurnId, setDiffTurnId] = useState<string | null>(null);

  // Generation Hyperparameters state
  const [hyperparameters, setHyperparameters] = useState<Hyperparameters>(DEFAULT_HYPERPARAMETERS);
  const [showHyperparameterDrawer, setShowHyperparameterDrawer] = useState(false);

  // Parent thread lineage info for branched threads
  const [parentThreadInfo, setParentThreadInfo] = useState<{ id: string; title: string } | null>(null);

  // Multi-format export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTurnId, setExportTurnId] = useState<string | null>(null);

  // Social share modal state
  const [isShareOpen, setIsShareOpen] = useState(false);

  // Initialize streams for up to 3 concurrent models
  const modelA = useModelStream();
  const modelB = useModelStream();
  const modelC = useModelStream();

  // Synchronize turns with localStorage to guard against page refresh data loss (token-bound)
  useEffect(() => {
    if (turns.length > 0 && isOwner) {
      try {
        const anonToken = getAnonToken();
        const payload = {
          anonToken,
          turns,
        };
        localStorage.setItem(`arena_cache_${threadId || "current"}`, JSON.stringify(payload));
      } catch {
        // Ignore storage limit errors
      }
    }
  }, [turns, threadId, isOwner]);

  // Read thread from query parameters and load thread history
  useEffect(() => {
    let cancelled = false;

    async function loadThreadHistory() {
      if (!threadParam) {
        setPrompt("");
        setError(null);
        setTurns([]);
        setThreadId(null);
        setIsOwner(true);
        setIsNotFound(false);
        setThreadTitle("Swag-flow");
        modelA.reset();
        modelB.reset();
        modelC.reset();
        return;
      }

      // Token-bound restoration target key for saved thread
      const targetKey = `arena_cache_${threadParam}`;

      try {
        const anonToken = getAnonToken();
        const res = await fetch(`/api/arena/threads?id=${threadParam}`, {
          headers: {
            "x-anon-token": anonToken,
          },
        });
        if (!res.ok) {
          setTurns([]);
          try {
            localStorage.removeItem(targetKey);
          } catch {}

          if (res.status === 404) {
            setIsOwner(false);
            setIsNotFound(true);
            setThreadTitle("Not Found");
          } else if (res.status === 403) {
            setIsOwner(false);
            setThreadTitle("Access Denied");
          } else {
            // Transient server error: do not mark as Access Denied / revoked ownership
            setIsOwner(true);
            setThreadTitle("Error");
            setError("Unable to load thread history due to a server error. Please try refreshing.");
          }
          return;
        }

        const data = await res.json();
        if (cancelled) return;
        setThreadId(threadParam);
        setIsNotFound(false);
        setThreadTitle(data.title || "Swag-flow");
        setIsOwner(typeof data.isOwner === "boolean" ? data.isOwner : true);
        if (data.parentThread) {
          setParentThreadInfo({ id: data.parentThread.id, title: data.parentThread.title });
        } else {
          setParentThreadInfo(null);
        }

        if (Array.isArray(data.messages)) {
          const userMessages = data.messages.filter((m: { role: string }) => m.role === "user");
          const hydratedTurns: Turn[] = userMessages.map(
            (userMsg: { id: string; content: string }) => {
              const replies = data.messages.filter(
                (m: { parentId: string | null }) => m.parentId === userMsg.id
              );
              const vote = Array.isArray(data.votes)
                ? data.votes.find((v: { promptId: string }) => v.promptId === userMsg.id)
                : null;

              let turnModels: ModelItem[] = [];
              if (vote?.models && vote.models.length > 0) {
                turnModels = vote.models.map((slug: string) => {
                  const match = availableModels.find((m) => m.id === slug);
                  return (
                    match || {
                      id: slug,
                      name: slug.split("/")[1] || slug,
                      context_length: 8192,
                      pricing: { prompt: "0", completion: "0" },
                    }
                  );
                });
              } else if (replies.length > 0) {
                turnModels = replies.map((r: { model: string | null }) => {
                  const slug = r.model || "unknown";
                  const match = availableModels.find((m) => m.id === slug);
                  return (
                    match || {
                      id: slug,
                      name: slug.split("/")[1] || slug,
                      context_length: 8192,
                      pricing: { prompt: "0", completion: "0" },
                    }
                  );
                });
              } else {
                turnModels = [...availableModels.slice(0, 2)];
              }

              const rA = replies[0] || replies.find((m: { model: string; actualModel?: string }) => m.model === turnModels[0]?.id || m.actualModel === turnModels[0]?.id);
              const rB = replies[1] || replies.find((m: { model: string; actualModel?: string }) => m.model === turnModels[1]?.id || m.actualModel === turnModels[1]?.id);
              const rC = replies[2] || replies.find((m: { model: string; actualModel?: string }) => m.model === turnModels[2]?.id || m.actualModel === turnModels[2]?.id);

              return {
                id: `turn_${userMsg.id}`,
                prompt: userMsg.content,
                promptId: userMsg.id,
                winnerModel: vote?.votedModel || null,
                activeCount: turnModels.length,
                models: turnModels,
                responses: {
                  modelA: {
                    text: rA?.content || "",
                    error: null,
                    metrics: rA
                      ? {
                          ttft: rA.ttft || 0,
                          latency: rA.latency || 0,
                          tokensPerSec: rA.tokensPerSec || 0,
                          tokenCount: rA.tokenCount || 0,
                          costUsd: typeof rA.costUsd === "number" ? rA.costUsd : rA.cost ?? null,
                          costSource: rA.costSource || (rA.model?.includes(":free") ? "openrouter" : "unknown"),
                          promptTokens: rA.promptTokens || null,
                          completionTokens: rA.completionTokens || null,
                          reasoningTokens: rA.reasoningTokens || null,
                          cachedTokens: rA.cachedTokens || null,
                          actualModel: rA.actualModel || rA.model || null,
                        }
                      : null,
                    isStreaming: false,
                    messageId: rA?.id || null,
                  },
                  modelB: {
                    text: rB?.content || "",
                    error: null,
                    metrics: rB
                      ? {
                          ttft: rB.ttft || 0,
                          latency: rB.latency || 0,
                          tokensPerSec: rB.tokensPerSec || 0,
                          tokenCount: rB.tokenCount || 0,
                          costUsd: typeof rB.costUsd === "number" ? rB.costUsd : rB.cost ?? null,
                          costSource: rB.costSource || (rB.model?.includes(":free") ? "openrouter" : "unknown"),
                          promptTokens: rB.promptTokens || null,
                          completionTokens: rB.completionTokens || null,
                          reasoningTokens: rB.reasoningTokens || null,
                          cachedTokens: rB.cachedTokens || null,
                          actualModel: rB.actualModel || rB.model || null,
                        }
                      : null,
                    isStreaming: false,
                    messageId: rB?.id || null,
                  },
                  modelC: {
                    text: rC?.content || "",
                    error: null,
                    metrics: rC
                      ? {
                          ttft: rC.ttft || 0,
                          latency: rC.latency || 0,
                          tokensPerSec: rC.tokensPerSec || 0,
                          tokenCount: rC.tokenCount || 0,
                          costUsd: typeof rC.costUsd === "number" ? rC.costUsd : rC.cost ?? null,
                          costSource: rC.costSource || (rC.model?.includes(":free") ? "openrouter" : "unknown"),
                          promptTokens: rC.promptTokens || null,
                          completionTokens: rC.completionTokens || null,
                          reasoningTokens: rC.reasoningTokens || null,
                          cachedTokens: rC.cachedTokens || null,
                          actualModel: rC.actualModel || rC.model || null,
                        }
                      : null,
                    isStreaming: false,
                    messageId: rC?.id || null,
                  },
                },
              };
            }
          );

          setTurns(hydratedTurns);
          try {
            const currentToken = getAnonToken();
            const payload = {
              anonToken: currentToken,
              turns: hydratedTurns,
            };
            localStorage.setItem(targetKey, JSON.stringify(payload));
          } catch {}
        }
      } catch (err) {
        console.error("Failed to load thread history:", err);
        if (!cancelled) {
          setIsOwner(true);
          setTurns([]);
          setError("Failed to load thread history due to a network error. Please check connection and try again.");
          try {
            localStorage.removeItem(targetKey);
          } catch {}
        }
      }
    }

    loadThreadHistory();
    return () => {
      cancelled = true;
    };
  }, [threadParam, availableModels]);

  // Fetch live free-tier models on mount
  useEffect(() => {
    async function loadModels() {
      try {
        const res = await fetch("/api/arena/models");
        if (!res.ok) throw new Error("Failed to load models list");
        const data: ModelItem[] = await res.json();
        const cleanData = data.filter(
          (m) =>
            !m.id.startsWith("thinkingmachines/") &&
            !m.id.includes("inkling") &&
            !m.id.includes("ox-alpha") &&
            !m.id.includes("harness")
        );
        const validList = cleanData.length > 0 ? cleanData : FALLBACK_MODELS;
        setAvailableModels(validList);
        setActiveModels(validList.slice(0, 3));
      } catch (err) {
        console.error("Failed to load active models catalog:", err);
        setAvailableModels(FALLBACK_MODELS);
        setActiveModels(FALLBACK_MODELS.slice(0, 3));
        setError("Unable to load live models list. Using fallback models.");
      }
    }
    loadModels();
  }, []);

  const trackClientEvent = (
    eventName: string,
    metadata?: Record<string, string | number | boolean | null | undefined>
  ) => {
    fetch("/api/arena/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName, metadata }),
    }).catch(() => {});
  };

  const handleShare = () => {
    setIsShareOpen(true);
    trackClientEvent("thread_shared", { threadId, turnCount: turns.length });
  };

  const handleReset = () => {
    setPrompt("");
    setError(null);
    setTurns([]);
    setThreadId(null);
    setIsOwner(true);
    setIsNotFound(false);
    setThreadTitle("Arena");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/");
    }
    modelA.reset();
    modelB.reset();
    modelC.reset();
  };

  const handleVote = async (turnId: string, modelSlot: "modelA" | "modelB" | "modelC" | null) => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn) return;

    const votedModel =
      modelSlot === "modelA"
        ? turn.models[0]?.id
        : modelSlot === "modelB"
          ? turn.models[1]?.id
          : modelSlot === "modelC"
            ? turn.models[2]?.id
            : null;

    const votedMessageId =
      modelSlot === "modelA"
        ? turn.responses.modelA.messageId
        : modelSlot === "modelB"
          ? turn.responses.modelB.messageId
          : modelSlot === "modelC"
            ? turn.responses.modelC.messageId
            : null;

    const modelsSlugs = turn.models.map((m) => m.id);

    try {
      const anonToken = getAnonToken();
      const res = await fetch("/api/arena/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anon-token": anonToken,
        },
        body: JSON.stringify({
          threadId,
          promptId: turn.promptId,
          votedMessageId,
          votedModel,
          models: modelsSlugs,
          anonToken,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to record vote on backend API");
      }

      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, winnerModel: modelSlot || "tie" } : t))
      );
    } catch (err: unknown) {
      console.error("Voting error:", err);
      const msg = err instanceof Error ? err.message : "Failed to record vote. Please try again.";
      setError(msg);
    }
  };

  const handleStartEdit = (turnId: string, currentPrompt: string) => {
    setEditingTurnId(turnId);
    setEditingText(currentPrompt);
  };

  const handleCancelEdit = () => {
    setEditingTurnId(null);
    setEditingText("");
  };

  const handleEditSubmit = async (turnId: string, editedPromptText: string) => {
    if (!editedPromptText.trim() || isSubmitting || activeModels.length === 0) return;

    const targetTurnIndex = turns.findIndex((t) => t.id === turnId);
    if (targetTurnIndex === -1) return;

    setIsSubmitting(true);
    setError(null);
    const currentTurn = turns[targetTurnIndex];

    const newTurn: Turn = {
      id: turnId,
      prompt: editedPromptText.trim(),
      winnerModel: null,
      activeCount: activeModels.length,
      models: [...activeModels],
      responses: {
        modelA: {
          text: "",
          error: null,
          metrics: null,
          isStreaming: activeModels.length > 0,
          messageId: null,
        },
        modelB: {
          text: "",
          error: null,
          metrics: null,
          isStreaming: activeModels.length > 1,
          messageId: null,
        },
        modelC: {
          text: "",
          error: null,
          metrics: null,
          isStreaming: activeModels.length > 2,
          messageId: null,
        },
      },
      promptId: currentTurn.promptId || turnId,
    };

    // Save existing version of this turn in history map
    const existingVersions = turnVersionsMap[turnId] || [currentTurn];
    const newVersionIndex = existingVersions.length;

    setTurnVersionsMap((prev) => ({
      ...prev,
      [turnId]: [...existingVersions, newTurn],
    }));

    setActiveVersionIndexMap((prev) => ({
      ...prev,
      [turnId]: newVersionIndex,
    }));

    // Reset stream hooks
    modelA.reset();
    modelB.reset();
    modelC.reset();

    // Truncate turns feed up to edited turn
    setTurns((prev) => {
      const slice = prev.slice(0, targetTurnIndex);
      return [...slice, newTurn];
    });
    setStreamingTurnId(turnId);
    setStreamingSlot("all");

    try {
      const anonToken = getAnonToken();
      const response = await fetch("/api/arena/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-anon-token": anonToken },
        body: JSON.stringify({ prompt: editedPromptText.trim(), threadId, anonToken }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to create prompt version.");
      }

      const data = await response.json();
      const parentId = data.promptId || data.messageId;
      const currentThreadId = data.threadId;
      setThreadId(currentThreadId);

      setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, promptId: parentId } : t)));

      activeModels.forEach((model, idx) => {
        const hook = idx === 0 ? modelA : idx === 1 ? modelB : modelC;
        hook.startStream(currentThreadId, parentId, model.id).catch((err) => {
          console.error(`Edit stream start error for model ${model.id}:`, err);
        });
      });
    } catch (err: unknown) {
      console.error("Edit submission error:", err);
      setError(err instanceof Error ? err.message : "Failed to re-run prompt version.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchVersion = (turnId: string, targetVersionIndex: number) => {
    const versions = turnVersionsMap[turnId];
    if (!versions || targetVersionIndex < 0 || targetVersionIndex >= versions.length) return;

    setActiveVersionIndexMap((prev) => ({ ...prev, [turnId]: targetVersionIndex }));
    trackClientEvent("turn_version_switched", { turnId, versionIndex: targetVersionIndex });

    const targetTurn = versions[targetVersionIndex];
    setTurns((prev) => prev.map((t) => (t.id === turnId ? targetTurn : t)));
  };

  const handleRegenerateModel = async (turnId: string, slot: "modelA" | "modelB" | "modelC") => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn) return;

    const modelIndex = slot === "modelA" ? 0 : slot === "modelB" ? 1 : 2;
    const modelItem = turn.models[modelIndex];
    if (!modelItem) return;

    // 1. Do not interrupt an active stream running on a different turn
    if (isStreamingAny && streamingTurnId && streamingTurnId !== turnId) {
      setError("Cannot regenerate while another turn is actively streaming. Please wait or stop the active stream.");
      return;
    }

    trackClientEvent("regenerate_clicked", { turnId, slot, modelId: modelItem.id });

    let targetThreadId = threadId;
    let targetPromptId = turn.promptId;

    if (!targetThreadId || !targetPromptId) {
      try {
        const anonToken = getAnonToken();
        const res = await fetch("/api/arena/prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-anon-token": anonToken },
          body: JSON.stringify({ prompt: turn.prompt, threadId: targetThreadId, anonToken }),
        });
        if (!res.ok) throw new Error("Failed to prepare prompt for regeneration.");
        const data = await res.json();
        targetThreadId = data.threadId;
        targetPromptId = data.promptId || data.messageId;
        setThreadId(targetThreadId);
        setTurns((prev) =>
          prev.map((t) => (t.id === turnId ? { ...t, promptId: targetPromptId } : t))
        );
      } catch (err) {
        console.error("Regenerate setup error:", err);
        setError("Failed to start regeneration. Please try again.");
        return;
      }
    }

    setStreamingTurnId(turnId);
    setStreamingSlot(slot);

    setTurns((prev) =>
      prev.map((t) => {
        if (t.id !== turnId) return t;
        return {
          ...t,
          responses: {
            ...t.responses,
            [slot]: {
              text: "",
              error: null,
              metrics: null,
              isStreaming: true,
              messageId: null,
            },
          },
        };
      })
    );

    const hook = slot === "modelA" ? modelA : slot === "modelB" ? modelB : modelC;
    hook.reset();
    const snapshot = await hook.startStream(
      targetThreadId || "",
      targetPromptId || "",
      modelItem.id
    );

    setTurns((prev) =>
      prev.map((t) => {
        if (t.id !== turnId) return t;
        return {
          ...t,
          responses: {
            ...t.responses,
            [slot]: {
              text: snapshot.text || t.responses[slot].text,
              error: snapshot.error,
              metrics: snapshot.metrics,
              isStreaming: false,
              messageId: snapshot.messageId || t.responses[slot].messageId,
            },
          },
        };
      })
    );

    // Only clear streamingTurnId if all model slots are done streaming
    if (!modelA.isStreaming && !modelB.isStreaming && !modelC.isStreaming) {
      setStreamingTurnId(null);
    }
  };

  const removeModel = (modelId: string) => {
    trackClientEvent("model_removed", { modelId });
    setActiveModels((prev) => prev.filter((m) => m.id !== modelId));
  };

  const addModel = (model: ModelItem) => {
    if (activeModels.length >= 3) return;
    if (activeModels.some((m) => m.id === model.id)) return;
    trackClientEvent("model_added", { modelId: model.id });
    setActiveModels((prev) => [...prev, model]);
  };

  const handleForkThread = async (upToPromptId?: string) => {
    if (!threadId) return;
    try {
      const anonToken = getAnonToken();
      const res = await fetch("/api/arena/threads/fork", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anon-token": anonToken,
        },
        body: JSON.stringify({
          sourceThreadId: threadId,
          upToTurnPromptId: upToPromptId,
          anonToken,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to fork conversation thread");
      }

      const data = await res.json();
      setThreadId(data.threadId);
      setParentThreadInfo({ id: data.parentThreadId, title: data.parentTitle });
      if (typeof window !== "undefined") {
        window.history.pushState(null, "", `/?thread=${data.threadId}`);
        window.dispatchEvent(new Event("swag_flow_threads_updated"));
      }
    } catch (err: unknown) {
      console.error("Fork thread error:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting || activeModels.length === 0) return;

    setIsSubmitting(true);
    setError(null);

    const userPrompt = prompt;
    setPrompt(""); // Clear input box

    // Finalize previous turn's responses in state before resetting streaming hooks
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const last = copy[copy.length - 1];
      copy[copy.length - 1] = {
        ...last,
        responses: {
          modelA: {
            ...last.responses.modelA,
            text: modelA.text || last.responses.modelA.text,
            error: modelA.error || last.responses.modelA.error,
            metrics: modelA.metrics || last.responses.modelA.metrics,
            isStreaming: false,
            messageId: modelA.messageId || last.responses.modelA.messageId,
          },
          modelB: {
            ...last.responses.modelB,
            text: modelB.text || last.responses.modelB.text,
            error: modelB.error || last.responses.modelB.error,
            metrics: modelB.metrics || last.responses.modelB.metrics,
            isStreaming: false,
            messageId: modelB.messageId || last.responses.modelB.messageId,
          },
          modelC: {
            ...last.responses.modelC,
            text: modelC.text || last.responses.modelC.text,
            error: modelC.error || last.responses.modelC.error,
            metrics: modelC.metrics || last.responses.modelC.metrics,
            isStreaming: false,
            messageId: modelC.messageId || last.responses.modelC.messageId,
          },
        },
      };
      return copy;
    });

    // Reset streaming hooks ONLY for active selected slots
    activeModels.forEach((_, idx) => {
      const hook = idx === 0 ? modelA : idx === 1 ? modelB : modelC;
      hook.reset();
    });

    const turnId = Math.random().toString(36).substring(7);
    const initialTurn: Turn = {
      id: turnId,
      prompt: userPrompt,
      winnerModel: null,
      activeCount: activeModels.length,
      models: [...activeModels],
      responses: {
        modelA: {
          text: "",
          error: null,
          metrics: null,
          isStreaming: activeModels.length > 0,
          messageId: null,
        },
        modelB: {
          text: "",
          error: null,
          metrics: null,
          isStreaming: activeModels.length > 1,
          messageId: null,
        },
        modelC: {
          text: "",
          error: null,
          metrics: null,
          isStreaming: activeModels.length > 2,
          messageId: null,
        },
      },
      promptId: "",
    };

    setTurns((prev) => [...prev, initialTurn]);
    setStreamingTurnId(turnId);
    setStreamingSlot("all");

    try {
      // 1. Establish thread and user message in database
      const anonToken = getAnonToken();
      let response = await fetch("/api/arena/prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: userPrompt,
          threadId,
          anonToken,
          systemPrompt: hyperparameters.systemPrompt,
          temperature: hyperparameters.temperature,
          topP: hyperparameters.topP,
          maxTokens: hyperparameters.maxTokens,
        }),
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
            body: JSON.stringify({
              prompt: userPrompt,
              threadId: null,
              anonToken,
              systemPrompt: hyperparameters.systemPrompt,
              temperature: hyperparameters.temperature,
              topP: hyperparameters.topP,
              maxTokens: hyperparameters.maxTokens,
            }),
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
      const parentId = data.promptId || data.messageId;

      setThreadId(currentThreadId);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/?thread=${currentThreadId}`);
      }

      // Update promptId in active turn history
      setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, promptId: parentId } : t)));

      // 2. Fire OpenRouter streaming connections concurrently for active slots
      activeModels.forEach((model, idx) => {
        const hook = idx === 0 ? modelA : idx === 1 ? modelB : modelC;
        hook
          .startStream(currentThreadId, parentId, model.id, {
            systemPrompt: hyperparameters.systemPrompt,
            temperature: hyperparameters.temperature,
            topP: hyperparameters.topP,
            maxTokens: hyperparameters.maxTokens,
          })
          .catch((err) => {
            console.error(`Stream start error for model ${model.id}:`, err);
          });
      });

      // Defer non-critical local storage history sync to background microtask
      setTimeout(() => {
        if (typeof window !== "undefined") {
          try {
            const existing = JSON.parse(localStorage.getItem("swag_flow_anon_threads") || "[]");
            const title = userPrompt.length > 35 ? userPrompt.substring(0, 35) + "..." : userPrompt;
            const updated = [
              { id: currentThreadId, title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
              ...existing.filter((t: { id: string }) => t.id !== currentThreadId),
            ].slice(0, 30);
            localStorage.setItem("swag_flow_anon_threads", JSON.stringify(updated));
            window.dispatchEvent(new Event("swag_flow_threads_updated"));
          } catch {}
        }
      }, 0);
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
                    messageId: null,
                  },
                  modelB: {
                    text: "",
                    error: activeModels.length > 1 ? errMsg : null,
                    metrics: null,
                    isStreaming: false,
                    messageId: null,
                  },
                  modelC: {
                    text: "",
                    error: activeModels.length > 2 ? errMsg : null,
                    metrics: null,
                    isStreaming: false,
                    messageId: null,
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

  // Clear stale streamingTurnId when all streams are complete
  useEffect(() => {
    if (!isStreamingAny && streamingTurnId) {
      setStreamingTurnId(null);
    }
  }, [isStreamingAny, streamingTurnId]);

  const handleStopAll = () => {
    modelA.abort();
    modelB.abort();
    modelC.abort();
  };

  // Sync current active streaming hooks into target turn card in the feed
  const activeTurns = turns.map((turn) => {
    if (
      turn.id === streamingTurnId &&
      (isStreamingAny ||
        modelA.text ||
        modelB.text ||
        modelC.text ||
        modelA.error ||
        modelB.error ||
        modelC.error)
    ) {
      return {
        ...turn,
        responses: {
          modelA:
            streamingSlot === "all" || streamingSlot === "modelA" || modelA.isStreaming
              ? {
                  text: modelA.text,
                  error: modelA.error,
                  metrics: modelA.metrics,
                  isStreaming: modelA.isStreaming,
                  messageId: modelA.messageId,
                }
              : turn.responses.modelA,
          modelB:
            streamingSlot === "all" || streamingSlot === "modelB" || modelB.isStreaming
              ? {
                  text: modelB.text,
                  error: modelB.error,
                  metrics: modelB.metrics,
                  isStreaming: modelB.isStreaming,
                  messageId: modelB.messageId,
                }
              : turn.responses.modelB,
          modelC:
            streamingSlot === "all" || streamingSlot === "modelC" || modelC.isStreaming
              ? {
                  text: modelC.text,
                  error: modelC.error,
                  metrics: modelC.metrics,
                  isStreaming: modelC.isStreaming,
                  messageId: modelC.messageId,
                }
              : turn.responses.modelC,
        },
      };
    }
    return turn;
  });

  return (
    <AppShell breadcrumb={threadTitle}>
      <div className="flex-1 flex flex-col min-h-0 relative bg-background w-full overflow-hidden">
        {/* Top Thread Subheader Bar */}
        {(threadId || activeTurns.length > 0) && !isNotFound && (
          <div className="px-6 py-2.5 border-b border-border-custom/50 bg-card-bg/20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground/80 truncate max-w-xs md:max-w-md">
                {threadTitle}
              </span>
              {!isOwner && (
                <span className="px-2 py-0.5 rounded-md bg-muted/50 text-[10px] font-semibold text-muted-foreground">
                  Shared View
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setExportTurnId(null);
                  setShowExportModal(true);
                }}
                disabled={activeTurns.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-custom bg-card-bg/80 hover:bg-accent/15 hover:text-accent disabled:opacity-40 text-xs font-bold transition-all cursor-pointer shadow-sm disabled:cursor-not-allowed"
                title="Export full comparison report into Markdown, JSON, or PDF"
              >
                <Download size={14} />
                <span>Export Report</span>
              </button>

              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-custom bg-card-bg/80 hover:bg-card-bg text-xs font-semibold text-foreground/80 hover:text-foreground transition-all cursor-pointer shadow-sm"
                title="Share this thread"
              >
                {copied ? (
                  <>
                    <Check size={14} className="text-emerald-500" />
                    <span className="text-emerald-500 font-bold">Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 size={14} />
                    <span>Share</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {!isOwner && activeTurns.length === 0 ? (
          /* Access Denied State */
          <div className="max-w-md mx-auto my-20 p-8 rounded-2xl bg-card-bg border border-border-custom text-center flex flex-col items-center gap-4 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-lg">
              <Lock size={24} />
            </div>
            <h2 className="text-xl font-extrabold text-foreground">Access Denied</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This conversation history is private to its owner. Sign in with the owner account to view it.
            </p>
            <button
              onClick={handleReset}
              className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer mt-2"
            >
              Start New Arena
            </button>
          </div>
        ) : isNotFound ? (
          /* Not Found State */
          <div className="max-w-md mx-auto my-20 p-8 rounded-2xl bg-card-bg border border-border-custom text-center flex flex-col items-center gap-4 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center font-bold text-lg">
              <AlertCircle size={24} />
            </div>
            <h2 className="text-xl font-extrabold text-foreground">Thread Not Found</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This arena comparison thread does not exist, was deleted, or the link is invalid.
            </p>
            <button
              onClick={handleReset}
              className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer mt-2"
            >
              Start New Arena
            </button>
          </div>
        ) : (
          <>
            {/* Scrollable Chat Area */}
            <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 pb-80 sm:pb-96 scrollbar-thin">
              {/* Parent Thread Lineage Banner for Branched Threads */}
              {parentThreadInfo && (
                <div className="max-w-7xl mx-auto w-full mb-2 px-4 py-2.5 rounded-2xl bg-card-bg/80 border border-border-custom flex items-center justify-between gap-3 text-xs shadow-sm">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    <span className="w-6 h-6 rounded-lg bg-accent/15 text-accent flex items-center justify-center font-bold">
                      <GitFork size={13} />
                    </span>
                    <span>
                      Branched from:{" "}
                      <button
                        onClick={() => {
                          setThreadId(parentThreadInfo.id);
                          setParentThreadInfo(null);
                          if (typeof window !== "undefined") {
                            window.history.pushState(null, "", `/?thread=${parentThreadInfo.id}`);
                          }
                        }}
                        className="text-accent underline hover:text-accent-hover font-extrabold cursor-pointer"
                      >
                        {parentThreadInfo.title}
                      </button>
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-semibold px-2 py-0.5 rounded-full bg-muted/40">
                    Independent Branch
                  </span>
                </div>
              )}

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
                    Choose up to three models from the picker, ask anything below, and watch
                    responses stream in parallel columns. Select the best output to record a vote.
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
                      {/* User Message Bubble with Editing & Version Controls */}
                      <div className="flex flex-col items-end max-w-7xl mx-auto w-full gap-1.5 group/prompt">
                        {/* Prompt Action Toolbar (Export Turn, Fork Branch & Version Switcher) */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setExportTurnId(turn.id);
                              setShowExportModal(true);
                            }}
                            className="px-2.5 py-1 rounded-xl bg-card-bg/90 hover:bg-accent/15 hover:text-accent border border-border-custom text-[10px] font-bold text-muted-foreground flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                            title="Export this turn into Markdown, JSON, or PDF"
                          >
                            <Download size={12} />
                            <span>Export Turn</span>
                          </button>

                          <button
                            onClick={() => handleForkThread(turn.promptId)}
                            className="px-2.5 py-1 rounded-xl bg-card-bg/90 hover:bg-accent/15 hover:text-accent border border-border-custom text-[10px] font-bold text-muted-foreground flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                            title="Fork conversation into a new thread branch from this turn"
                          >
                            <GitFork size={12} />
                            <span>Fork Branch</span>
                          </button>

                          {turnVersionsMap[turn.id] && turnVersionsMap[turn.id].length > 1 && (
                            <div className="flex items-center gap-1.5 bg-card-bg/90 border border-border-custom px-2.5 py-1 rounded-xl text-[10px] font-bold text-muted-foreground shadow-sm">
                              <button
                                onClick={() =>
                                  handleSwitchVersion(
                                    turn.id,
                                    (activeVersionIndexMap[turn.id] || 0) - 1
                                  )
                                }
                                disabled={(activeVersionIndexMap[turn.id] || 0) <= 0}
                                className="hover:text-accent disabled:opacity-30 cursor-pointer disabled:cursor-default transition-colors"
                                title="Previous prompt version"
                              >
                                <ChevronLeft size={13} />
                              </button>
                              <span>
                                Version {(activeVersionIndexMap[turn.id] || 0) + 1} of{" "}
                                {turnVersionsMap[turn.id].length}
                              </span>
                              <button
                                onClick={() =>
                                  handleSwitchVersion(
                                    turn.id,
                                    (activeVersionIndexMap[turn.id] || 0) + 1
                                  )
                                }
                                disabled={
                                  (activeVersionIndexMap[turn.id] || 0) >=
                                  turnVersionsMap[turn.id].length - 1
                                }
                                className="hover:text-accent disabled:opacity-30 cursor-pointer disabled:cursor-default transition-colors"
                                title="Next prompt version"
                              >
                                <ChevronRight size={13} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Prompt Bubble / Inline Editor */}
                        {editingTurnId === turn.id ? (
                          <div className="max-w-xl w-full bg-card-bg border border-accent/50 rounded-2xl p-3.5 shadow-xl flex flex-col gap-3">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full bg-background text-foreground text-sm font-medium p-3 rounded-xl border border-border-custom focus:outline-none resize-none h-24 leading-relaxed"
                              placeholder="Edit your prompt..."
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={handleCancelEdit}
                                disabled={isSubmitting}
                                className="px-3 py-1.5 rounded-xl bg-muted/60 text-foreground text-xs font-bold hover:bg-muted transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleEditSubmit(turn.id, editingText)}
                                disabled={isSubmitting || !editingText.trim()}
                                className="px-3.5 py-1.5 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-hover transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                              >
                                {isSubmitting ? "Submitting..." : "Submit & Re-run"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative max-w-xl bg-card-bg border border-border-custom px-5 py-3.5 rounded-2xl text-sm font-semibold shadow-md leading-relaxed group/bubble">
                            <span>{turn.prompt}</span>
                            {isOwner && !isStreamingAny && (
                              <button
                                onClick={() => handleStartEdit(turn.id, turn.prompt)}
                                className="absolute -left-9 top-3.5 p-1.5 rounded-lg border border-border-custom/60 bg-card-bg hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover/prompt:opacity-100 transition-all cursor-pointer shadow-sm"
                                title="Edit prompt"
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                          </div>
                        )}
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
                            isOwner={isOwner}
                            onStop={() => modelA.abort()}
                            onRegenerate={() => handleRegenerateModel(turn.id, "modelA")}
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
                            isOwner={isOwner}
                            onStop={() => modelB.abort()}
                            onRegenerate={() => handleRegenerateModel(turn.id, "modelB")}
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
                            isOwner={isOwner}
                            onStop={() => modelC.abort()}
                            onRegenerate={() => handleRegenerateModel(turn.id, "modelC")}
                          />
                        )}
                      </div>

                      {/* Turn Efficiency Insights Highlights Bar */}
                      {(() => {
                        const modelEntries = [
                          { modelId: "modelA", modelName: turn.models[0]?.name || "Model A", text: turn.responses.modelA.text, error: turn.responses.modelA.error, metrics: turn.responses.modelA.metrics },
                          { modelId: "modelB", modelName: turn.models[1]?.name || "Model B", text: turn.responses.modelB.text, error: turn.responses.modelB.error, metrics: turn.responses.modelB.metrics },
                          { modelId: "modelC", modelName: turn.models[2]?.name || "Model C", text: turn.responses.modelC.text, error: turn.responses.modelC.error, metrics: turn.responses.modelC.metrics },
                        ].slice(0, turn.activeCount);

                        const insights = getTurnComparisonInsights(modelEntries);
                        if (!insights.cheapestModelId && !insights.fastestTtftModelId && !insights.highestThroughputModelId && !insights.mostTokenEfficientModelId) {
                          return null;
                        }

                        const getModelLabel = (id: string | null) => {
                          if (!id) return "";
                          const idx = id === "modelA" ? 0 : id === "modelB" ? 1 : 2;
                          return turn.models[idx]?.name || id;
                        };

                        return (
                          <div className="bg-card-bg/60 border border-border-custom/80 rounded-2xl p-3 px-5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
                            <span className="font-bold text-foreground flex items-center gap-1.5">
                              <Sparkles size={14} className="text-accent" />
                              Turn Efficiency Highlights:
                            </span>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                              {insights.cheapestModelId && (
                                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                                  🏷️ Cheapest: <strong>{getModelLabel(insights.cheapestModelId)}</strong>
                                </span>
                              )}
                              {insights.fastestTtftModelId && (
                                <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center gap-1">
                                  ⚡ Fastest TTFT: <strong>{getModelLabel(insights.fastestTtftModelId)}</strong>
                                </span>
                              )}
                              {insights.highestThroughputModelId && (
                                <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center gap-1">
                                  🚀 Highest Throughput: <strong>{getModelLabel(insights.highestThroughputModelId)}</strong>
                                </span>
                              )}
                              {insights.mostTokenEfficientModelId && (
                                <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1">
                                  🎯 Most Token Efficient: <strong>{getModelLabel(insights.mostTokenEfficientModelId)}</strong>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Compare Diff & Declare Tie actions row */}
                      <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                        {turn.activeCount >= 2 &&
                          !turn.responses?.modelA?.isStreaming &&
                          !turn.responses?.modelB?.isStreaming &&
                          !turn.responses?.modelC?.isStreaming && (
                            <button
                              onClick={() => setDiffTurnId(diffTurnId === turn.id ? null : turn.id)}
                              className={`px-4 py-2 rounded-xl border border-border-custom text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
                                diffTurnId === turn.id
                                  ? "bg-accent text-white border-accent"
                                  : "bg-card-bg/60 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                              }`}
                              title="Compare responses with semantic diff visualizer"
                            >
                              <GitCompare size={14} />
                              <span>{diffTurnId === turn.id ? "Hide Diff Visualizer" : "Compare Diff"}</span>
                            </button>
                          )}

                        {isOwner &&
                          !turn.winnerModel &&
                          !turn.responses?.modelA?.isStreaming &&
                          !turn.responses?.modelB?.isStreaming &&
                          !turn.responses?.modelC?.isStreaming && (
                            <button
                              onClick={() => handleVote(turn.id, null)}
                              className="px-4 py-2 rounded-xl border border-border-custom bg-card-bg/60 hover:bg-muted/40 text-xs font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground shadow-sm"
                            >
                              <span>🤝 Declare Tie</span>
                            </button>
                          )}
                      </div>

                      {/* Render Semantic Diff Visualizer Drawer when active */}
                      {diffTurnId === turn.id && (
                        <DiffViewer
                          isOpen={diffTurnId === turn.id}
                          onClose={() => setDiffTurnId(null)}
                          baseModel={
                            turn.models[0]
                              ? {
                                  id: turn.models[0].id,
                                  name: turn.models[0].name || turn.models[0].id,
                                  responseText: turn.responses.modelA?.text || "",
                                }
                              : null
                          }
                          compareModel={
                            turn.models[1]
                              ? {
                                  id: turn.models[1].id,
                                  name: turn.models[1].name || turn.models[1].id,
                                  responseText: turn.responses.modelB?.text || "",
                                }
                              : null
                          }
                        />
                      )}

                      {turn.winnerModel === "tie" && (
                        <div className="flex justify-center mt-2 select-none">
                          <span className="px-4 py-2 rounded-xl bg-muted/30 border border-border-custom/50 text-xs font-bold text-muted-foreground tracking-wide">
                            🤝 Tie Declared
                          </span>
                        </div>
                      )}
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
                {!isOwner ? (
                  /* Read-only viewer callout */
                  <div className="bg-card-bg border border-border-custom rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
                    <div className="flex flex-col gap-1 text-center sm:text-left">
                      <span className="text-sm font-bold text-foreground">
                        You are viewing a shared arena comparison
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Start a new thread or sign in to vote and compare models yourself.
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={handleReset}
                        className="px-4 py-2 rounded-xl bg-muted/60 hover:bg-muted text-foreground text-xs font-bold transition-colors cursor-pointer"
                      >
                        Start New Arena
                      </button>
                      <SignInButton mode="modal">
                        <button className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold transition-colors cursor-pointer shadow-sm">
                          Sign In
                        </button>
                      </SignInButton>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Render Hyperparameter Drawer when active */}
                    {showHyperparameterDrawer && (
                      <HyperparameterDrawer
                        isOpen={showHyperparameterDrawer}
                        config={hyperparameters}
                        onChange={setHyperparameters}
                        onReset={() => setHyperparameters(DEFAULT_HYPERPARAMETERS)}
                        onClose={() => setShowHyperparameterDrawer(false)}
                      />
                    )}

                    {/* Active Model Selection Chips & Generation Controls button */}
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="flex flex-wrap gap-2 max-h-12 overflow-y-auto">
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

                      {/* Hyperparameter Controls Button */}
                      <button
                        type="button"
                        onClick={() => setShowHyperparameterDrawer(!showHyperparameterDrawer)}
                        className={`px-3 py-1.5 rounded-full border text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shrink-0 ${
                          showHyperparameterDrawer || hyperparameters.systemPrompt.trim().length > 0
                            ? "bg-accent/15 border-accent/40 text-accent"
                            : "bg-card-bg border-border-custom text-muted-foreground hover:text-foreground"
                        }`}
                        title="Configure System Prompt, Temperature, Top P & Max Tokens"
                      >
                        <SlidersHorizontal size={13} />
                        <span className="hidden sm:inline">Model Controls</span>
                        {hyperparameters.systemPrompt.trim().length > 0 && (
                          <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                        )}
                      </button>
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
                          {isStreamingAny && (
                            <button
                              type="button"
                              onClick={handleStopAll}
                              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                              title="Stop all streaming models"
                            >
                              <Square size={12} className="fill-current" />
                              <span>Stop All</span>
                            </button>
                          )}
                          {turns.length > 0 && !isStreamingAny && (
                            <button
                              type="button"
                              onClick={handleReset}
                              disabled={isSubmitting}
                              className="p-1.5 rounded-lg border border-border-custom bg-background hover:bg-red-950/20 text-muted-foreground hover:text-red-400 transition-all cursor-pointer disabled:opacity-50"
                              title="Clear Chat"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          <button
                            type="submit"
                            disabled={
                              isSubmitting ||
                              isStreamingAny ||
                              !prompt.trim() ||
                              activeModels.length === 0
                            }
                            className="p-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-all shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <ArrowUp size={16} />
                          </button>
                        </div>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Multi-Format Export Modal */}
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          threadId={threadId || "current"}
          threadTitle={threadTitle}
          turns={activeTurns}
          initialTurnId={exportTurnId}
        />

        {/* Social Media & Copy Link Share Modal */}
        <ShareModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          title={threadTitle}
          threadId={threadId}
        />
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
  isOwner?: boolean;
  onStop?: () => void;
  onRegenerate?: () => void;
}

function formatMarkdownText(rawText: string): string {
  if (!rawText) return "";
  return rawText
    .replace(/\$\\mathcal\{O\}\(([^$]+)\)\$/g, "`O($1)`")
    .replace(/\$O\(([^$]+)\)\$/g, "`O($1)`")
    .replace(/\$([^$\n]+)\$/g, (match, expr) => {
      const cleanExpr = expr
        .replace(/\\mathcal\{O\}/g, "O")
        .replace(/\\log/g, "log")
        .replace(/\\le/g, "≤")
        .replace(/\\ge/g, "≥")
        .replace(/\\ne/g, "≠")
        .replace(/\\times/g, "×")
        .replace(/\\cdot/g, "·");
      return `\`${cleanExpr.trim()}\``;
    });
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative my-3 rounded-xl border border-border-custom/80 overflow-hidden bg-[#0d1117] shadow-md">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-muted/30 border-b border-border-custom/60 text-[11px] font-mono text-muted-foreground">
        <span className="font-semibold text-accent/90 uppercase tracking-wider">{language || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded hover:bg-muted/50 text-foreground/80 hover:text-foreground transition-colors cursor-pointer"
        >
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          <span>{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-3 text-[11px] font-mono text-foreground/90 overflow-x-auto whitespace-pre leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ModelResponseCard({
  modelName,
  modelShort,
  state,
  winnerModel,
  onVote,
  isVoted,
  isOwner = true,
  onStop,
  onRegenerate,
}: ModelResponseCardProps) {
  const { text, isStreaming, error, metrics } = state;
  const [showMetrics, setShowMetrics] = useState(false);
  const cardBodyRef = useRef<HTMLDivElement>(null);

  const hasVoteCast = winnerModel !== null;

  // Auto-scroll response viewport to bottom during active streaming
  useEffect(() => {
    if (isStreaming && cardBodyRef.current) {
      cardBodyRef.current.scrollTop = cardBodyRef.current.scrollHeight;
    }
  }, [text, isStreaming]);

  return (
    <div className="flex flex-col h-[440px] rounded-2xl border border-border-custom bg-card-bg shadow-md overflow-hidden relative group">
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

        {/* Header Action Buttons (Stop, Regenerate, Vote) */}
        <div className="flex items-center gap-2">
          {isStreaming && onStop ? (
            <button
              onClick={onStop}
              className="px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
              title="Stop streaming this response"
            >
              <Square size={10} className="fill-current" />
              <span>Stop</span>
            </button>
          ) : isVoted ? (
            <span className="px-2.5 py-1 rounded-lg bg-accent text-white text-[10px] font-bold flex items-center gap-1">
              <Check size={12} strokeWidth={3} />
              Winner
            </span>
          ) : isOwner ? (
            <div className="flex items-center gap-1.5">
              {!isStreaming && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-1.5 rounded-lg border border-border-custom bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                  title="Regenerate this response"
                >
                  <RotateCw size={12} />
                </button>
              )}
              <button
                onClick={onVote}
                disabled={hasVoteCast || isStreaming || !text}
                className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold flex items-center gap-1.5 transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  hasVoteCast
                    ? "border-border-custom text-muted-foreground"
                    : "border-accent bg-accent/10 text-accent hover:bg-accent hover:text-white shadow-sm"
                }`}
                title="Vote this response as winner"
              >
                <ThumbsUp size={11} />
                <span>Vote Better</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Card Content */}
      <div
        ref={cardBodyRef}
        className="flex-1 p-5 text-xs sm:text-sm overflow-y-auto leading-relaxed font-normal scroll-smooth"
      >
        {error ? (
          <div className="text-red-400 bg-red-950/20 border border-red-900/30 p-4 rounded-xl text-xs font-semibold">
            {error}
          </div>
        ) : text ? (
          <div className="text-foreground/90 space-y-2">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ ...props }) => (
                  <h1
                    className="text-base font-extrabold text-foreground mt-3 mb-1.5 pb-1 border-b border-border-custom/50"
                    {...props}
                  />
                ),
                h2: ({ ...props }) => (
                  <h2 className="text-sm font-bold text-foreground mt-2.5 mb-1" {...props} />
                ),
                h3: ({ ...props }) => (
                  <h3 className="text-xs font-bold text-foreground/90 mt-2 mb-1" {...props} />
                ),
                p: ({ ...props }) => (
                  <p className="mb-2 leading-relaxed text-foreground/90" {...props} />
                ),
                ul: ({ ...props }) => (
                  <ul
                    className="list-disc pl-5 mb-2 space-y-1 text-foreground/90 marker:text-accent"
                    {...props}
                  />
                ),
                ol: ({ ...props }) => (
                  <ol
                    className="list-decimal pl-5 mb-2 space-y-1 text-foreground/90 marker:text-accent font-medium"
                    {...props}
                  />
                ),
                li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
                strong: ({ ...props }) => (
                  <strong className="font-bold text-foreground" {...props} />
                ),
                em: ({ ...props }) => <em className="italic text-foreground/85" {...props} />,
                code: ({
                  className,
                  children,
                  ...props
                }: React.HTMLAttributes<HTMLElement> & { className?: string }) => {
                  const isInline = !className?.includes("language-");
                  const match = /language-(\w+)/.exec(className || "");
                  const language = match ? match[1] : "";
                  const codeString = String(children).replace(/\n$/, "");

                  return isInline ? (
                    <code
                      className="px-1.5 py-0.5 rounded bg-muted/60 text-[11px] font-mono text-accent font-semibold"
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <CodeBlock code={codeString} language={language} />
                  );
                },
                blockquote: ({ ...props }) => (
                  <blockquote
                    className="border-l-2 border-accent/60 pl-3 my-2 text-muted-foreground italic"
                    {...props}
                  />
                ),
                table: ({ ...props }) => (
                  <div className="overflow-x-auto my-2 rounded-lg border border-border-custom">
                    <table className="w-full text-left text-xs" {...props} />
                  </div>
                ),
                th: ({ ...props }) => (
                  <th
                    className="p-2 border-b border-border-custom bg-muted/40 font-bold"
                    {...props}
                  />
                ),
                td: ({ ...props }) => (
                  <td className="p-2 border-b border-border-custom/40" {...props} />
                ),
              }}
            >
              {formatMarkdownText(text)}
            </ReactMarkdown>
          </div>
        ) : isStreaming ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-border-custom rounded w-3/4"></div>
            <div className="h-4 bg-border-custom rounded w-5/6"></div>
            <div className="h-4 bg-border-custom rounded w-2/3"></div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-foreground/45 italic select-none gap-2 text-center p-4">
            <span>No response content generated for this model.</span>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="not-italic px-3 py-1.5 rounded-xl border border-border-custom bg-card-bg hover:bg-muted text-xs font-bold text-foreground transition-all cursor-pointer shadow-sm flex items-center gap-1.5 mt-1"
              >
                <RotateCw size={12} />
                <span>Generate Response</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Card Footer (Metrics Toggle & Compact Badges) */}
      <div className="border-t border-border-custom bg-background/50 flex flex-col">
        <button
          onClick={() => setShowMetrics(!showMetrics)}
          disabled={!metrics && !isStreaming}
          className="w-full px-4 py-2.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed select-none"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="font-bold text-foreground/80">Metrics</span>
            {metrics && !isStreaming && (
              <div className="flex items-center gap-1.5 text-[9.5px] font-mono font-semibold normal-case">
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {typeof metrics.costUsd === "number"
                    ? metrics.costUsd === 0
                      ? "$0.00"
                      : `$${metrics.costUsd.toFixed(4)}`
                    : "Cost N/A"}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-muted/60 text-foreground/80">
                  {metrics.tokenCount || 0} tok
                </span>
                <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                  {(metrics.ttft * 1000).toFixed(0)}ms
                </span>
              </div>
            )}
          </div>
          {showMetrics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showMetrics && metrics && (
          <div className="px-5 pb-4 pt-1 flex flex-col gap-1.5 text-[10.5px] text-foreground/70 font-mono border-t border-border-custom/40">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time-to-first-token:</span>
              <span className="text-accent font-extrabold">{(metrics.ttft * 1000).toFixed(0)} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Latency:</span>
              <span className="text-foreground/90 font-bold">{metrics.latency.toFixed(2)} s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Speed / Throughput:</span>
              <span className="text-foreground/90 font-bold">
                {metrics.tokensPerSec.toFixed(1)} tok/s
              </span>
            </div>
            {metrics.promptTokens !== undefined && metrics.promptTokens !== null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Input Tokens:</span>
                <span className="text-foreground/90 font-bold">{metrics.promptTokens}</span>
              </div>
            )}
            {metrics.completionTokens !== undefined && metrics.completionTokens !== null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Output Tokens:</span>
                <span className="text-foreground/90 font-bold">{metrics.completionTokens}</span>
              </div>
            )}
            {metrics.reasoningTokens !== undefined && metrics.reasoningTokens !== null && (
              <div className="flex justify-between text-purple-400">
                <span>Reasoning Tokens:</span>
                <span className="font-bold">{metrics.reasoningTokens}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Tokens:</span>
              <span className="text-foreground/90 font-bold">{metrics.tokenCount}</span>
            </div>
            {metrics.actualModel && metrics.actualModel !== modelName && (
              <div className="flex justify-between text-amber-400">
                <span>Actual Model Used:</span>
                <span className="font-bold truncate max-w-[140px]" title={metrics.actualModel}>
                  {metrics.actualModel}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-border-custom/50 mt-1 pt-1">
              <span className="text-muted-foreground">Generation Cost:</span>
              <span className="text-emerald-400 font-extrabold">
                {typeof metrics.costUsd === "number"
                  ? metrics.costUsd === 0
                    ? "$0.0000 (Free)"
                    : `$${metrics.costUsd.toFixed(6)} (${metrics.costSource || "openrouter"})`
                  : "Cost unavailable"}
              </span>
            </div>
          </div>
        )}

        {showMetrics && isStreaming && (
          <div className="px-5 pb-4 pt-2.5 text-center italic text-[10px] text-accent animate-pulse font-mono border-t border-border-custom/40">
            Measuring real-time usage & tokens...
          </div>
        )}
      </div>
    </div>
  );
}
