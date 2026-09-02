"use client";

import React, { useState, useMemo } from "react";
import { X, FileText, FileCode, Printer, Download, Sparkles } from "lucide-react";
import {
  ExportScope,
  buildExportReport,
  generateJSONReport,
  generateMarkdownReport,
  sanitizeFilename,
  downloadFile,
  printPDFReport,
} from "@/app/lib/exportEngine";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  threadId: string;
  threadTitle: string;
  turns: Array<{
    id: string;
    prompt: string;
    winnerModel?: string | null;
    activeCount: number;
    models: Array<{ id: string; name: string }>;
    responses: {
      modelA: { text: string; error: string | null; metrics: any; messageId: string | null; config?: any };
      modelB: { text: string; error: string | null; metrics: any; messageId: string | null; config?: any };
      modelC: { text: string; error: string | null; metrics: any; messageId: string | null; config?: any };
    };
    promptId?: string;
  }>;
  initialTurnId?: string | null;
}

export function ExportModal({
  isOpen,
  onClose,
  threadId,
  threadTitle,
  turns,
  initialTurnId,
}: ExportModalProps) {
  const [scope, setScope] = useState<ExportScope>(initialTurnId ? "turn" : "thread");
  const [targetTurnId, setTargetTurnId] = useState<string | null>(initialTurnId || turns[turns.length - 1]?.id || null);

  // Single normalized ExportReport instance used as the single source of truth for both preview and export
  const exportReport = useMemo(() => {
    return buildExportReport({
      threadId,
      threadTitle,
      turns,
      scope,
      targetTurnId: scope === "turn" ? targetTurnId : null,
    });
  }, [threadId, threadTitle, turns, scope, targetTurnId]);

  const markdownPreview = useMemo(() => {
    return generateMarkdownReport(exportReport);
  }, [exportReport]);

  if (!isOpen) return null;

  const baseFilename = sanitizeFilename(exportReport.thread.title);

  const handleDownloadMarkdown = () => {
    const markdown = generateMarkdownReport(exportReport);
    downloadFile({
      filename: `${baseFilename}.md`,
      content: markdown,
      mimeType: "text/markdown",
    });
  };

  const handleDownloadJSON = () => {
    const json = generateJSONReport(exportReport);
    downloadFile({
      filename: `${baseFilename}.json`,
      content: json,
      mimeType: "application/json",
    });
  };

  const handlePrintPDF = () => {
    printPDFReport(exportReport);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-card-bg border border-border-custom rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border-custom flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center font-bold">
              <Download size={18} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-foreground tracking-tight">Export Comparison Report</h3>
              <p className="text-xs text-muted-foreground font-medium">Export normalized thread or turn data into MD, JSON, or PDF</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 scrollbar-thin">
          {/* Scope Controls */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Export Scope</label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setScope("thread")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  scope === "thread"
                    ? "bg-accent text-white border-accent shadow-sm"
                    : "bg-background hover:bg-muted/40 border-border-custom text-muted-foreground hover:text-foreground"
                }`}
              >
                Full Thread ({turns.length} {turns.length === 1 ? "turn" : "turns"})
              </button>
              {turns.length > 0 && (
                <button
                  onClick={() => setScope("turn")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    scope === "turn"
                      ? "bg-accent text-white border-accent shadow-sm"
                      : "bg-background hover:bg-muted/40 border-border-custom text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Single Turn Only
                </button>
              )}
            </div>

            {scope === "turn" && turns.length > 1 && (
              <div className="pt-2">
                <select
                  value={targetTurnId || ""}
                  onChange={(e) => setTargetTurnId(e.target.value)}
                  className="w-full bg-background border border-border-custom text-foreground text-xs font-medium rounded-xl p-2.5 focus:outline-none focus:border-accent"
                >
                  {turns.map((t, i) => (
                    <option key={t.id} value={t.id}>
                      Turn {i + 1}: {t.prompt.substring(0, 45)}...
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Quick Action Format Export Buttons */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select Export Format</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={handleDownloadMarkdown}
                className="p-3.5 rounded-xl border border-border-custom bg-background hover:bg-accent/10 hover:border-accent text-foreground flex items-center justify-between transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-2.5 text-left">
                  <FileText size={18} className="text-accent group-hover:scale-110 transition-transform" />
                  <div>
                    <div className="text-xs font-bold">Markdown</div>
                    <div className="text-[10px] text-muted-foreground">.md file</div>
                  </div>
                </div>
                <Download size={14} className="text-muted-foreground group-hover:text-accent" />
              </button>

              <button
                onClick={handleDownloadJSON}
                className="p-3.5 rounded-xl border border-border-custom bg-background hover:bg-accent/10 hover:border-accent text-foreground flex items-center justify-between transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-2.5 text-left">
                  <FileCode size={18} className="text-accent group-hover:scale-110 transition-transform" />
                  <div>
                    <div className="text-xs font-bold">JSON Payload</div>
                    <div className="text-[10px] text-muted-foreground">.json file</div>
                  </div>
                </div>
                <Download size={14} className="text-muted-foreground group-hover:text-accent" />
              </button>

              <button
                onClick={handlePrintPDF}
                className="p-3.5 rounded-xl border border-border-custom bg-background hover:bg-accent/10 hover:border-accent text-foreground flex items-center justify-between transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-2.5 text-left">
                  <Printer size={18} className="text-accent group-hover:scale-110 transition-transform" />
                  <div>
                    <div className="text-xs font-bold">Print / Save PDF</div>
                    <div className="text-[10px] text-muted-foreground">Browser print dialog</div>
                  </div>
                </div>
                <Printer size={14} className="text-muted-foreground group-hover:text-accent" />
              </button>
            </div>
          </div>

          {/* Live Markdown Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={12} className="text-accent" />
                <span>Live Report Preview</span>
              </label>
              <span className="text-[10px] text-muted-foreground font-mono">
                {exportReport.turns.length} turn(s) included
              </span>
            </div>
            <div className="bg-background border border-border-custom rounded-xl p-4 max-h-60 overflow-y-auto font-mono text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap scrollbar-thin">
              {markdownPreview}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-border-custom bg-muted/20 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-muted/40 hover:bg-muted text-foreground text-xs font-bold transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
