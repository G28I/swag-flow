"use client";

import { useState, useMemo } from "react";
import {
  computeLineDiff,
  computeTokenDiff,
  calculateDiffStats,
  DiffLine,
  DiffToken,
} from "@/app/lib/diffEngine";
import { GitCompare, Columns, AlignLeft, X, ArrowRight } from "lucide-react";

interface ModelOption {
  key: string;
  name: string;
  text: string;
}

interface DiffViewerProps {
  models: ModelOption[];
  onClose: () => void;
}

export default function DiffViewer({ models, onClose }: DiffViewerProps) {
  const availableModels = models.filter((m) => m.text.trim().length > 0);

  const [baseKey, setBaseKey] = useState<string>(availableModels[0]?.key || "modelA");
  const [compareKey, setCompareKey] = useState<string>(
    availableModels[1]?.key || availableModels[0]?.key || "modelB"
  );
  const [viewMode, setViewMode] = useState<"split" | "unified">("split");

  const baseModel = availableModels.find((m) => m.key === baseKey) || availableModels[0];
  const compareModel =
    availableModels.find((m) => m.key === compareKey) ||
    availableModels[1] ||
    availableModels[0];

  const lineDiffs = useMemo(() => {
    if (!baseModel || !compareModel) return [];
    return computeLineDiff(baseModel.text, compareModel.text);
  }, [baseModel, compareModel]);

  const tokenDiffs = useMemo(() => {
    if (!baseModel || !compareModel) return [];
    return computeTokenDiff(baseModel.text, compareModel.text);
  }, [baseModel, compareModel]);

  const stats = useMemo(() => {
    if (!baseModel || !compareModel) {
      return { addedWords: 0, deletedWords: 0, unchangedWords: 0, similarityPercentage: 100 };
    }
    return calculateDiffStats(baseModel.text, compareModel.text);
  }, [baseModel, compareModel]);

  if (availableModels.length < 2) {
    return (
      <div className="p-6 rounded-2xl bg-card-bg border border-border-custom text-center text-xs text-muted-foreground">
        At least two models must have completed responses to view diff comparisons.
      </div>
    );
  }

  return (
    <div className="mt-4 border border-border-custom rounded-2xl bg-card-bg/95 backdrop-blur-md shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Top Header Bar */}
      <div className="px-5 py-3.5 border-b border-border-custom bg-card-bg/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center font-bold">
            <GitCompare size={16} />
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              Semantic Diff Visualizer
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-accent/15 text-accent border border-accent/20">
                {stats.similarityPercentage}% Match
              </span>
            </h4>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
              <span className="text-emerald-500 font-semibold">+{stats.addedWords} words</span>
              <span>•</span>
              <span className="text-rose-500 font-semibold">-{stats.deletedWords} words</span>
            </div>
          </div>
        </div>

        {/* Model Selection & View Mode Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Baseline Model Select */}
          <select
            value={baseKey}
            onChange={(e) => setBaseKey(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-border-custom bg-card-bg text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 cursor-pointer shadow-sm"
          >
            {availableModels.map((m) => (
              <option key={m.key} value={m.key}>
                Baseline: {m.name}
              </option>
            ))}
          </select>

          <ArrowRight size={14} className="text-muted-foreground hidden sm:block" />

          {/* Comparison Target Select */}
          <select
            value={compareKey}
            onChange={(e) => setCompareKey(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-border-custom bg-card-bg text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 cursor-pointer shadow-sm"
          >
            {availableModels.map((m) => (
              <option key={m.key} value={m.key}>
                Compare: {m.name}
              </option>
            ))}
          </select>

          {/* Split / Unified View Switch */}
          <div className="flex items-center bg-muted/40 p-1 rounded-xl border border-border-custom/50">
            <button
              onClick={() => setViewMode("split")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "split"
                  ? "bg-card-bg text-accent shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Side-by-Side Split View"
            >
              <Columns size={13} />
              <span className="hidden sm:inline">Split</span>
            </button>
            <button
              onClick={() => setViewMode("unified")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "unified"
                  ? "bg-card-bg text-accent shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Inline Unified View"
            >
              <AlignLeft size={13} />
              <span className="hidden sm:inline">Unified</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            title="Close Diff Visualizer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Diff Content Area */}
      <div className="p-4 overflow-x-auto max-h-[550px] overflow-y-auto scrollbar-thin">
        {viewMode === "split" ? (
          /* Side-by-Side Split View */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            {/* Left Baseline Column */}
            <div className="rounded-xl border border-border-custom bg-card-bg/40 p-3 overflow-x-auto">
              <div className="pb-2 mb-2 border-b border-border-custom/50 flex items-center justify-between text-[11px] font-sans font-bold text-muted-foreground">
                <span className="text-foreground">{baseModel?.name}</span>
                <span className="px-2 py-0.5 rounded bg-muted/60 text-[10px]">Baseline</span>
              </div>
              <div className="space-y-1">
                {lineDiffs.map((line, idx) => {
                  if (line.type === "added") return null; // Don't render added lines in baseline column
                  const isDeleted = line.type === "deleted";
                  return (
                    <div
                      key={idx}
                      className={`flex gap-2 px-1.5 py-0.5 rounded ${
                        isDeleted ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : ""
                      }`}
                    >
                      <span className="select-none text-[10px] text-muted-foreground/60 w-6 text-right shrink-0">
                        {line.lineNumberA}
                      </span>
                      <span className="whitespace-pre-wrap break-all leading-relaxed">
                        {line.textA || " "}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Comparison Target Column */}
            <div className="rounded-xl border border-border-custom bg-card-bg/40 p-3 overflow-x-auto">
              <div className="pb-2 mb-2 border-b border-border-custom/50 flex items-center justify-between text-[11px] font-sans font-bold text-muted-foreground">
                <span className="text-foreground">{compareModel?.name}</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[10px]">
                  Comparison
                </span>
              </div>
              <div className="space-y-1">
                {lineDiffs.map((line, idx) => {
                  if (line.type === "deleted") return null; // Don't render deleted lines in target column
                  const isAdded = line.type === "added";
                  return (
                    <div
                      key={idx}
                      className={`flex gap-2 px-1.5 py-0.5 rounded ${
                        isAdded ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : ""
                      }`}
                    >
                      <span className="select-none text-[10px] text-muted-foreground/60 w-6 text-right shrink-0">
                        {line.lineNumberB}
                      </span>
                      <span className="whitespace-pre-wrap break-all leading-relaxed">
                        {line.textB || " "}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Inline Unified View */
          <div className="p-4 rounded-xl border border-border-custom bg-card-bg/40 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
            {tokenDiffs.map((token: DiffToken, idx: number) => {
              if (token.type === "added") {
                return (
                  <mark
                    key={idx}
                    className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold px-1 rounded mx-0.5"
                  >
                    {token.value}
                  </mark>
                );
              }
              if (token.type === "deleted") {
                return (
                  <del
                    key={idx}
                    className="bg-rose-500/20 text-rose-600 dark:text-rose-400 font-semibold line-through px-1 rounded mx-0.5"
                  >
                    {token.value}
                  </del>
                );
              }
              return <span key={idx}>{token.value}</span>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
