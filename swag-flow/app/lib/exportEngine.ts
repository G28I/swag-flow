export type ExportScope = "thread" | "turn";

export interface ExportModelMetrics {
  ttft: number | null;
  latency: number | null;
  tokensPerSec: number | null;
  tokenCount?: number | null;
  costUsd?: number | null;
  costSource?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  reasoningTokens?: number | null;
  cachedTokens?: number | null;
  actualModel?: string | null;
}

export interface ExportModelConfig {
  systemPrompt?: string | null;
  temperature?: number | null;
  topP?: number | null;
  maxTokens?: number | null;
}

export interface ExportModelResponse {
  slot: "modelA" | "modelB" | "modelC";
  modelId: string;
  modelName: string;
  text: string;
  error?: string | null;
  metrics?: ExportModelMetrics | null;
  config?: ExportModelConfig | null;
}

export interface ExportTurn {
  turnIndex: number;
  promptId?: string;
  prompt: string;
  winnerModel?: string | null;
  responses: ExportModelResponse[];
}

export interface ExportReport {
  version: "1.0";
  exportedAt: string;
  scope: ExportScope;
  thread: {
    id: string;
    title: string;
  };
  turns: ExportTurn[];
}

/**
 * Builds a single normalized export report payload from UI/Thread state.
 * Never includes API keys, tokens, auth details, or credentials.
 */
export function buildExportReport(params: {
  threadId: string;
  threadTitle: string;
  turns: Array<{
    id: string;
    prompt: string;
    winnerModel?: string | null;
    activeCount: number;
    models: Array<{ id: string; name: string }>;
    responses: {
      modelA: { text: string; error: string | null; metrics: unknown; messageId: string | null; config?: unknown };
      modelB: { text: string; error: string | null; metrics: unknown; messageId: string | null; config?: unknown };
      modelC: { text: string; error: string | null; metrics: unknown; messageId: string | null; config?: unknown };
    };
    promptId?: string;
  }>;
  scope?: ExportScope;
  targetTurnId?: string | null;
}): ExportReport {
  const { threadId, threadTitle, turns, scope = "thread", targetTurnId } = params;

  const turnsToInclude =
    scope === "turn" && targetTurnId
      ? turns.filter((t) => t.id === targetTurnId || t.promptId === targetTurnId)
      : turns;

  const exportTurns: ExportTurn[] = turnsToInclude.map((turnItem, idx) => {
    const responses: ExportModelResponse[] = turnItem.models.map((modelObj, mIdx) => {
      const slot = mIdx === 0 ? "modelA" : mIdx === 1 ? "modelB" : "modelC";
      const resp = turnItem.responses[slot];
      const mObj = resp?.metrics as Record<string, unknown> | null | undefined;
      const cObj = resp?.config as Record<string, unknown> | null | undefined;
      return {
        slot,
        modelId: modelObj.id,
        modelName: modelObj.name || modelObj.id,
        text: resp?.text || "",
        error: resp?.error ? "Response generation encountered an error" : null,
        metrics: mObj
          ? {
              ttft: typeof mObj.ttft === "number" ? mObj.ttft : null,
              latency: typeof mObj.latency === "number" ? mObj.latency : null,
              tokensPerSec: typeof mObj.tokensPerSec === "number" ? mObj.tokensPerSec : null,
              tokenCount: typeof mObj.tokenCount === "number" ? mObj.tokenCount : null,
              costUsd: typeof mObj.costUsd === "number" ? mObj.costUsd : null,
              costSource: typeof mObj.costSource === "string" ? mObj.costSource : null,
              promptTokens: typeof mObj.promptTokens === "number" ? mObj.promptTokens : null,
              completionTokens: typeof mObj.completionTokens === "number" ? mObj.completionTokens : null,
              reasoningTokens: typeof mObj.reasoningTokens === "number" ? mObj.reasoningTokens : null,
              cachedTokens: typeof mObj.cachedTokens === "number" ? mObj.cachedTokens : null,
              actualModel: typeof mObj.actualModel === "string" ? mObj.actualModel : null,
            }
          : null,
        config: cObj
          ? {
              systemPrompt: typeof cObj.systemPrompt === "string" ? cObj.systemPrompt : null,
              temperature: typeof cObj.temperature === "number" ? cObj.temperature : null,
              topP: typeof cObj.topP === "number" ? cObj.topP : null,
              maxTokens: typeof cObj.maxTokens === "number" ? cObj.maxTokens : null,
            }
          : null,
      };
    });

    let winnerLabel: string | null = null;
    if (turnItem.winnerModel === "tie") {
      winnerLabel = "Tie Declared";
    } else if (turnItem.winnerModel) {
      const slotIdx = turnItem.winnerModel === "modelA" ? 0 : turnItem.winnerModel === "modelB" ? 1 : 2;
      winnerLabel = turnItem.models[slotIdx]?.name || turnItem.winnerModel;
    }

    return {
      turnIndex: idx + 1,
      promptId: turnItem.promptId || turnItem.id,
      prompt: turnItem.prompt || "",
      winnerModel: winnerLabel,
      responses,
    };
  });

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    scope: scope === "turn" && targetTurnId ? "turn" : "thread",
    thread: {
      id: threadId || "current",
      title: threadTitle || "Swag-flow Comparison",
    },
    turns: exportTurns,
  };
}

/**
 * Generates pretty-printed JSON report from normalized ExportReport payload.
 */
export function generateJSONReport(report: ExportReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Escapes markdown code block backticks to prevent corruption of report structure
 */
function escapeCodeFences(text: string): string {
  if (!text) return "";
  return text.replace(/```/g, "`\u200B`\u200B`");
}

/**
 * Generates GitHub-flavored Markdown report from normalized ExportReport payload.
 */
export function generateMarkdownReport(report: ExportReport): string {
  const lines: string[] = [];

  lines.push(`# ${report.thread.title}`);
  lines.push(`> **Exported At:** ${new Date(report.exportedAt).toLocaleString()}`);
  lines.push(`> **Export Scope:** ${report.scope === "turn" ? "Single Turn" : "Full Conversation Thread"}`);
  lines.push(`> **Thread ID:** \`${report.thread.id}\``);
  lines.push("");

  if (report.turns.length === 0) {
    lines.push("_No conversation turns recorded in this report._");
    return lines.join("\n");
  }

  report.turns.forEach((turn) => {
    lines.push(`## Turn ${turn.turnIndex}`);
    lines.push(`### 💬 User Prompt`);
    lines.push(escapeCodeFences(turn.prompt));
    lines.push("");

    if (turn.winnerModel) {
      lines.push(`**🏆 Winner Outcome:** \`${turn.winnerModel}\``);
      lines.push("");
    }

    turn.responses.forEach((resp) => {
      lines.push(`### 🤖 Model Output: ${resp.modelName}`);

      if (resp.config) {
        const configParts: string[] = [];
        if (resp.config.temperature !== null && resp.config.temperature !== undefined) {
          configParts.push(`Temp: \`${resp.config.temperature}\``);
        }
        if (resp.config.topP !== null && resp.config.topP !== undefined) {
          configParts.push(`Top_P: \`${resp.config.topP}\``);
        }
        if (resp.config.maxTokens !== null && resp.config.maxTokens !== undefined) {
          configParts.push(`Max Tokens: \`${resp.config.maxTokens}\``);
        }
        if (configParts.length > 0) {
          lines.push(`*Config:* ${configParts.join(" | ")}`);
        }
        if (resp.config.systemPrompt) {
          lines.push(`*System Prompt:* "${escapeCodeFences(resp.config.systemPrompt)}"`);
        }
        lines.push("");
      }

      if (resp.metrics) {
        lines.push("| Metric | Value |");
        lines.push("| :--- | :--- |");
        if (resp.metrics.costUsd !== undefined && resp.metrics.costUsd !== null) {
          lines.push(`| Generation Cost | $${resp.metrics.costUsd.toFixed(6)} (${resp.metrics.costSource || "openrouter"}) |`);
        }
        if (resp.metrics.ttft) lines.push(`| TTFT | ${resp.metrics.ttft.toFixed(3)}s |`);
        if (resp.metrics.latency) lines.push(`| Latency | ${resp.metrics.latency.toFixed(2)}s |`);
        if (resp.metrics.tokensPerSec) lines.push(`| Throughput | ${resp.metrics.tokensPerSec.toFixed(1)} tokens/sec |`);
        if (resp.metrics.promptTokens) lines.push(`| Input Tokens | ${resp.metrics.promptTokens} |`);
        if (resp.metrics.completionTokens) lines.push(`| Output Tokens | ${resp.metrics.completionTokens} |`);
        if (resp.metrics.reasoningTokens) lines.push(`| Reasoning Tokens | ${resp.metrics.reasoningTokens} |`);
        if (resp.metrics.tokenCount) lines.push(`| Total Tokens | ${resp.metrics.tokenCount} |`);
        if (resp.metrics.actualModel) lines.push(`| Actual Model Used | \`${resp.metrics.actualModel}\` |`);
        lines.push("");
      }

      if (resp.error) {
        lines.push(`> ⚠️ **Error:** ${resp.error}`);
      } else if (resp.text) {
        lines.push(escapeCodeFences(resp.text));
      } else {
        lines.push("_No response text generated._");
      }

      lines.push("");
      lines.push("---");
      lines.push("");
    });
  });

  return lines.join("\n");
}

/**
 * HTML escaping helper to prevent XSS / HTML corruption in print output
 */
export function escapeHTML(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generates print-ready HTML document with CSS page breaks and typography
 */
export function generatePrintableHTML(report: ExportReport): string {
  const title = escapeHTML(report.thread.title);

  const turnsHTML = report.turns
    .map((turn) => {
      const promptText = escapeHTML(turn.prompt);
      const winnerHTML = turn.winnerModel
        ? `<div class="winner-badge">🏆 Outcome: <strong>${escapeHTML(turn.winnerModel)}</strong></div>`
        : "";

      const responsesHTML = turn.responses
        .map((resp) => {
          const modelName = escapeHTML(resp.modelName);
          const responseText = escapeHTML(resp.text || (resp.error ? `Error: ${resp.error}` : "No response generated"));

          const metricsHTML = resp.metrics
            ? `<div class="metrics">
                ${resp.metrics.ttft ? `<span>TTFT: ${resp.metrics.ttft.toFixed(3)}s</span>` : ""}
                ${resp.metrics.latency ? `<span>Latency: ${resp.metrics.latency.toFixed(2)}s</span>` : ""}
                ${resp.metrics.tokensPerSec ? `<span>Throughput: ${resp.metrics.tokensPerSec.toFixed(1)} t/s</span>` : ""}
               </div>`
            : "";

          return `
            <div class="model-box">
              <h4>🤖 ${modelName}</h4>
              ${metricsHTML}
              <pre class="content">${responseText}</pre>
            </div>
          `;
        })
        .join("");

      return `
        <div class="turn-section">
          <h3>Turn ${turn.turnIndex}</h3>
          <div class="user-prompt">
            <strong>💬 User Prompt:</strong>
            <p>${promptText}</p>
          </div>
          ${winnerHTML}
          <div class="models-grid">
            ${responsesHTML}
          </div>
        </div>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title} - Swag-flow Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 900px;
      margin: 0 auto;
      padding: 30px 20px;
      background: #fff;
    }
    header {
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 15px;
      margin-bottom: 30px;
    }
    h1 { margin: 0 0 8px 0; font-size: 24px; color: #111827; }
    .meta { font-size: 12px; color: #6b7280; }
    .turn-section {
      margin-bottom: 40px;
      page-break-inside: avoid;
    }
    h3 { font-size: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; color: #374151; }
    .user-prompt {
      background: #f3f4f6;
      border-left: 4px solid #6366f1;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 15px;
    }
    .user-prompt p { margin: 5px 0 0 0; white-space: pre-wrap; font-size: 14px; }
    .winner-badge {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #047857;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 15px;
      display: inline-block;
    }
    .models-grid {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    .model-box {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 15px;
      background: #fafafa;
    }
    .model-box h4 { margin: 0 0 8px 0; font-size: 14px; color: #1f2937; }
    .metrics { font-size: 11px; color: #6b7280; margin-bottom: 10px; display: flex; gap: 15px; }
    pre.content {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      padding: 12px;
      border-radius: 6px;
      margin: 0;
    }
    @media print {
      body { padding: 0; }
      .turn-section { page-break-after: always; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <div class="meta">
      <span>Exported At: ${new Date(report.exportedAt).toLocaleString()}</span> | 
      <span>Scope: ${report.scope === "turn" ? "Single Turn" : "Full Thread"}</span> | 
      <span>ID: ${report.thread.id}</span>
    </div>
  </header>
  <main>
    ${turnsHTML}
  </main>
</body>
</html>`;
}

/**
 * Sanitizes thread title into safe filesystem filename
 */
export function sanitizeFilename(title: string): string {
  const safe = (title || "export")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const dateStr = new Date().toISOString().split("T")[0];
  return `swagflow-${safe || "report"}-${dateStr}`;
}

/**
 * Utility to download text/Blob content as a file
 */
export function downloadFile(params: { filename: string; content: string; mimeType: string }) {
  const { filename, content, mimeType } = params;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Opens printable HTML report in a popup window and triggers window.print() (Print / Save as PDF)
 */
export function printPDFReport(report: ExportReport) {
  const html = generatePrintableHTML(report);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}
