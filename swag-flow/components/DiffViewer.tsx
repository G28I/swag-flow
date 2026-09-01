"use client";

import React, { useState, useMemo } from "react";
import { X, GitCompare, AlignLeft, BarChart2 } from "lucide-react";
import {
  computeTokenDiff,
  computeLineDiff,
  calculateDiffStats,
} from "@/app/lib/diffEngine";

export interface DiffViewerProps {
  isOpen: boolean;
  onClose: () => void;
  baseModel: { id: string; name: string; responseText: string } | null;
  compareModel: { id: string; name: string; responseText: string } | null;
}

export function DiffViewer({
  isOpen,
  onClose,
  baseModel,
  compareModel,
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<"split" | "unified">("split");

  const baseText = baseModel?.responseText || "";
  const compareText = compareModel?.responseText || "";

  // Compute token diff once as single source of truth for both token rendering and stats calculation
  const tokenDiffs = useMemo(() => {
    if (!isOpen || !baseModel || !compareModel) return [];
    return computeTokenDiff(baseText, compareText);
  }, [isOpen, baseModel, compareModel, baseText, compareText]);

  const lineDiffs = useMemo(() => {
    if (!isOpen || !baseModel || !compareModel) return [];
    return computeLineDiff(baseText, compareText);
  }, [isOpen, baseModel, compareModel, baseText, compareText]);

  const stats = useMemo(() => {
    if (!isOpen || !baseModel || !compareModel) {
      return { addedWords: 0, deletedWords: 0, unchangedWords: 0, similarityPercentage: 100 };
    }
    return calculateDiffStats(baseText, compareText, tokenDiffs);
  }, [isOpen, baseModel, compareModel, baseText, compareText, tokenDiffs]);

  if (!isOpen || !baseModel || !compareModel) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-viewer-title"
    >
      <div
        className="relative w-full max-w-5xl max-h-[85vh] bg-card-bg border border-border-custom rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-custom bg-muted/20 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-accent/10 text-accent border border-accent/20">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h2 id="diff-viewer-title" className="text-base font-bold text-foreground">
                Model Response Diff Visualizer
              </h2>
              <p className="text-xs text-muted-foreground">
                Comparing <span className="font-semibold text-foreground">{baseModel.name}</span> vs{" "}
                <span className="font-semibold text-foreground">{compareModel.name}</span>
              </p>
            </div>
          </div>

          {/* Stats Badges & View Mode Selector */}
          <div className="flex items-center space-x-3">
            <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-muted/40 border border-border-custom/60 text-xs font-mono">
              <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-emerald-500 font-bold">+{stats.addedWords} words</span>
              <span className="text-rose-500 font-bold">-{stats.deletedWords} words</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-accent font-bold">{stats.similarityPercentage}% Match</span>
            </div>

            <div className="flex items-center p-1 rounded-xl bg-muted/50 border border-border-custom text-xs font-medium">
              <button
                onClick={() => setViewMode("split")}
                className={`px-3 py-1 rounded-lg transition-all flex items-center space-x-1 cursor-pointer ${
                  viewMode === "split"
                    ? "bg-card-bg text-foreground shadow-sm border border-border-custom/50 font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <GitCompare size={13} />
                <span className="hidden sm:inline">Split View</span>
              </button>
              <button
                onClick={() => setViewMode("unified")}
                className={`px-3 py-1 rounded-lg transition-all flex items-center space-x-1 cursor-pointer ${
                  viewMode === "unified"
                    ? "bg-card-bg text-foreground shadow-sm border border-border-custom/50 font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <AlignLeft size={13} />
                <span className="hidden sm:inline">Unified</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              title="Close Diff Visualizer"
              aria-label="Close diff visualizer dialog"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Diff Content Area */}
        <div className="p-4 overflow-x-auto max-h-[550px] overflow-y-auto scrollbar-thin">
          {viewMode === "split" ? (
            /* Side-by-Side Split View with height-aligned row placeholders */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              {/* Left Baseline Column */}
              <div className="rounded-xl border border-border-custom bg-card-bg/40 p-3 overflow-x-auto">
                <div className="pb-2 mb-2 border-b border-border-custom/50 flex items-center justify-between text-[11px] font-sans font-bold text-muted-foreground">
                  <span className="text-foreground">{baseModel.name}</span>
                  <span className="px-2 py-0.5 rounded bg-muted/60 text-[10px]">Baseline</span>
                </div>
                <div className="space-y-1">
                  {lineDiffs.map((line, idx) => {
                    if (line.type === "added") {
                      // Height placeholder for inserted line in opposite pane
                      return (
                        <div key={idx} className="min-h-[24px] py-0.5 select-none opacity-0" aria-hidden="true">
                          &nbsp;
                        </div>
                      );
                    }
                    const isDeleted = line.type === "deleted";
                    return (
                      <div
                        key={idx}
                        className={`flex gap-2 px-1.5 py-0.5 rounded min-h-[24px] ${
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
                  <span className="text-foreground">{compareModel.name}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[10px]">
                    Comparison
                  </span>
                </div>
                <div className="space-y-1">
                  {lineDiffs.map((line, idx) => {
                    if (line.type === "deleted") {
                      // Height placeholder for deleted line in opposite pane
                      return (
                        <div key={idx} className="min-h-[24px] py-0.5 select-none opacity-0" aria-hidden="true">
                          &nbsp;
                        </div>
                      );
                    }
                    const isAdded = line.type === "added";
                    return (
                      <div
                        key={idx}
                        className={`flex gap-2 px-1.5 py-0.5 rounded min-h-[24px] ${
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
            /* Unified Inline Token Diff View */
            <div className="rounded-xl border border-border-custom bg-card-bg/40 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
              {tokenDiffs.map((token, idx) => {
                if (token.type === "added") {
                  return (
                    <mark
                      key={idx}
                      className="bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 font-bold px-0.5 rounded border-b-2 border-emerald-500/60 no-underline"
                    >
                      {token.value}
                    </mark>
                  );
                }
                if (token.type === "deleted") {
                  return (
                    <del
                      key={idx}
                      className="bg-rose-500/25 text-rose-600 dark:text-rose-400 line-through px-0.5 rounded border-b-2 border-rose-500/60"
                    >
                      {token.value}
                    </del>
                  );
                }
                return <span key={idx} className="text-foreground/90">{token.value}</span>;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DiffViewer;
