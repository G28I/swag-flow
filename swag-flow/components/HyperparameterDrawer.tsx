"use client";

import React, { useState, useEffect } from "react";
import { X, Sliders, RotateCcw } from "lucide-react";

export interface HyperparameterConfig {
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
}

export type Hyperparameters = HyperparameterConfig;

export const DEFAULT_HYPERPARAMETERS: HyperparameterConfig = {
  systemPrompt: "",
  temperature: 0.7,
  topP: 1.0,
  maxTokens: 2048,
};

export interface HyperparameterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  config: HyperparameterConfig;
  onChange: (newConfig: HyperparameterConfig) => void;
  onReset: () => void;
}

export function HyperparameterDrawer({
  isOpen,
  onClose,
  config,
  onChange,
  onReset,
}: HyperparameterDrawerProps) {
  const [prevMaxTokens, setPrevMaxTokens] = useState(config.maxTokens);
  const [maxTokensInput, setMaxTokensInput] = useState(String(config.maxTokens));

  if (config.maxTokens !== prevMaxTokens) {
    setPrevMaxTokens(config.maxTokens);
    setMaxTokensInput(String(config.maxTokens));
  }

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleMaxTokensBlur = () => {
    const val = parseInt(maxTokensInput, 10);
    const clamped = isNaN(val) ? 2048 : Math.max(128, Math.min(4096, val));
    setMaxTokensInput(String(clamped));
    onChange({ ...config, maxTokens: clamped });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hyperparameter-drawer-title"
    >
      <div
        className="relative w-full max-w-md h-full bg-card-bg border-l border-border-custom shadow-2xl overflow-y-auto p-6 text-foreground flex flex-col justify-between transition-transform animate-slideLeft"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-border-custom">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-accent/10 text-accent border border-accent/20">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h2 id="hyperparameter-drawer-title" className="text-base font-bold text-foreground">
                  Inference Hyperparameters
                </h2>
                <p className="text-xs text-muted-foreground">Configure global sampling parameters</p>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={onReset}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex items-center space-x-1 text-xs cursor-pointer"
                title="Reset to defaults"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
                aria-label="Close hyperparameter settings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form Controls */}
          <div className="py-6 space-y-6">
            {/* System Prompt Input */}
            <div className="space-y-2">
              <label htmlFor="system-prompt-input" className="text-xs font-bold text-foreground block">
                System Prompt
              </label>
              <textarea
                id="system-prompt-input"
                value={config.systemPrompt}
                onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
                placeholder="Optional system instructions (e.g., 'You are an expert Python developer...')"
                className="w-full h-24 p-3 text-xs bg-muted/30 border border-border-custom rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none font-sans"
              />
            </div>

            {/* Temperature Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="temperature-slider" className="text-xs font-bold text-foreground">
                  Temperature ({config.temperature.toFixed(2)})
                </label>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {config.temperature < 0.3
                    ? "Precise / Deterministic"
                    : config.temperature > 0.8
                      ? "Creative / Diverse"
                      : "Balanced"}
                </span>
              </div>
              <input
                id="temperature-slider"
                type="range"
                min="0.0"
                max="1.5"
                step="0.05"
                value={config.temperature}
                onChange={(e) =>
                  onChange({ ...config, temperature: parseFloat(e.target.value) })
                }
                className="w-full accent-accent cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>Exact (0.0)</span>
                <span>Balanced (0.7)</span>
                <span>Creative (1.5)</span>
              </div>
            </div>

            {/* Top-P Nucleus Sampling Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="top-p-slider" className="text-xs font-bold text-foreground">
                  Top-P ({config.topP.toFixed(2)})
                </label>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Nucleus Sampling Cutoff
                </span>
              </div>
              <input
                id="top-p-slider"
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={config.topP}
                onChange={(e) => onChange({ ...config, topP: parseFloat(e.target.value) })}
                className="w-full accent-accent cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>Focused (0.1)</span>
                <span>Full Spectrum (1.0)</span>
              </div>
            </div>

            {/* Max Tokens Input */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border-custom/50 bg-muted/20">
              <div>
                <label htmlFor="max-tokens-input" className="text-xs font-bold text-foreground block">
                  Max Response Tokens
                </label>
                <span className="text-[10px] text-muted-foreground">
                  Maximum generation output token limit (128 - 4096)
                </span>
              </div>
              <input
                id="max-tokens-input"
                type="number"
                min="128"
                max="4096"
                step="128"
                value={maxTokensInput}
                onChange={(e) => setMaxTokensInput(e.target.value)}
                onBlur={handleMaxTokensBlur}
                className="w-24 px-2.5 py-1.5 text-xs font-bold font-mono rounded-lg border border-border-custom bg-card-bg text-foreground text-right focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HyperparameterDrawer;
