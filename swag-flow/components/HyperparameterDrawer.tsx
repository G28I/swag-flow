"use client";

import { useEffect } from "react";
import { SlidersHorizontal, RotateCcw, X, Sparkles } from "lucide-react";

export interface Hyperparameters {
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
}

export const DEFAULT_HYPERPARAMETERS: Hyperparameters = {
  systemPrompt: "",
  temperature: 0.7,
  topP: 1.0,
  maxTokens: 2048,
};

const SYSTEM_PRESETS = [
  {
    name: "Senior Software Engineer",
    prompt: "You are an expert Senior Software Engineer. Provide idiomatic, clean, highly efficient code with precise technical explanations and best practices.",
  },
  {
    name: "Concise Summarizer",
    prompt: "You are a concise analytical assistant. Answer questions directly using bullet points and brief summaries without fluff or filler.",
  },
  {
    name: "Socratic Tutor",
    prompt: "You are a patient Socratic tutor. Guide the user by explaining core concepts clearly, asking thoughtful questions, and encouraging step-by-step problem solving.",
  },
  {
    name: "Creative Writer",
    prompt: "You are an imaginative creative writer. Express ideas with vivid descriptions, rich vocabulary, and engaging tone.",
  },
];

interface HyperparameterDrawerProps {
  config: Hyperparameters;
  onChange: (config: Hyperparameters) => void;
  onClose: () => void;
}

export default function HyperparameterDrawer({
  config,
  onChange,
  onClose,
}: HyperparameterDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleReset = () => {
    onChange(DEFAULT_HYPERPARAMETERS);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="p-5 rounded-2xl bg-card-bg border border-border-custom shadow-2xl animate-in zoom-in-95 duration-200 w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-border-custom/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center font-bold">
            <SlidersHorizontal size={16} />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              Generation Hyperparameters
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Configure system prompt and sampling parameters for model responses
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-accent px-2 py-1 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
            title="Reset to defaults"
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* System Prompt Section */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Sparkles size={13} className="text-accent" />
              <span>System Prompt</span>
            </label>
            <span className="text-[10px] text-muted-foreground">
              {config.systemPrompt.length} / 2000 chars
            </span>
          </div>

          <textarea
            value={config.systemPrompt}
            onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
            placeholder="e.g. You are an expert Senior Software Engineer..."
            rows={3}
            maxLength={2000}
            className="w-full px-3 py-2 text-xs rounded-xl border border-border-custom bg-card-bg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none font-sans"
          />

          {/* System Prompt Presets */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-[10px] text-muted-foreground self-center mr-1 font-semibold">
              Presets:
            </span>
            {SYSTEM_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => onChange({ ...config, systemPrompt: preset.prompt })}
                className="px-2 py-1 text-[10px] font-bold rounded-lg border border-border-custom/60 bg-muted/30 hover:bg-accent/15 hover:text-accent hover:border-accent/40 transition-all cursor-pointer text-muted-foreground"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Temperature & Top P Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Temperature Slider */}
          <div className="p-3 rounded-xl border border-border-custom/50 bg-muted/20">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-foreground">Temperature</label>
              <span className="text-xs font-extrabold text-accent font-mono">
                {config.temperature.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.temperature}
              onChange={(e) => onChange({ ...config, temperature: parseFloat(e.target.value) })}
              className="w-full accent-accent cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
              <span>Precise (0.0)</span>
              <span>Balanced (0.7)</span>
              <span>Creative (1.0)</span>
            </div>
          </div>

          {/* Top P Slider */}
          <div className="p-3 rounded-xl border border-border-custom/50 bg-muted/20">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-foreground">Top P (Nucleus)</label>
              <span className="text-xs font-extrabold text-accent font-mono">
                {config.topP.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.topP}
              onChange={(e) => onChange({ ...config, topP: parseFloat(e.target.value) })}
              className="w-full accent-accent cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
              <span>Focused (0.1)</span>
              <span>Full Spectrum (1.0)</span>
            </div>
          </div>
        </div>

        {/* Max Tokens Input */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-border-custom/50 bg-muted/20">
          <div>
            <label className="text-xs font-bold text-foreground block">Max Response Tokens</label>
            <span className="text-[10px] text-muted-foreground">
              Maximum generation output token limit (128 - 4096)
            </span>
          </div>
          <input
            type="number"
            min="128"
            max="4096"
            step="128"
            value={config.maxTokens}
            onChange={(e) =>
              onChange({
                ...config,
                maxTokens: Math.max(128, Math.min(4096, parseInt(e.target.value) || 2048)),
              })
            }
            className="w-24 px-2.5 py-1.5 text-xs font-bold font-mono rounded-lg border border-border-custom bg-card-bg text-foreground text-right focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
      </div>
    </div>
  </div>
);
}
