"use client";

import React from "react";
import AppShell from "@/components/AppShell";
import { Cpu, Award, Zap, Code } from "lucide-react";

export default function ModelsPage() {
  const activeModels = [
    {
      short: "G",
      slug: "google/gemma-4-31b-it:free",
      name: "Google Gemma 4 31B It",
      context: "32,768 tokens",
      pricing: "Free ($0.00)",
      description:
        "Google's advanced instruction-tuned open-weights model, designed for high reasoning efficiency and multilingual chat capabilities.",
      features: ["Reasoning", "Multilingual", "Fast Inference"],
    },
    {
      short: "N",
      slug: "nvidia/nemotron-3.5-lightning:free",
      name: "NVIDIA Nemotron 3.5 Lightning",
      context: "8,192 tokens",
      pricing: "Free ($0.00)",
      description:
        "Lightning-fast conversational and instruction model trained by NVIDIA, optimized for low latency and high throughput applications.",
      features: ["Low Latency", "High Throughput", "Chat Optimized"],
    },
    {
      short: "L",
      slug: "poolside/laguna-s-2.1:free",
      name: "Poolside Laguna S 2.1",
      context: "16,384 tokens",
      pricing: "Free ($0.00)",
      description:
        "A highly tuned code generation and reasoning model developed by Poolside, delivering top-tier performance for programming assist tasks.",
      features: ["Code Generation", "Reasoning", "Free Slugs"],
    },
  ];

  return (
    <AppShell breadcrumb="Models">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Page Title Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Cpu className="text-accent w-8 h-8" />
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Models Catalog</h1>
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            Browse the catalog of active free-tier models available for concurrent evaluation in the
            Arena.
          </p>
        </div>

        {/* Models Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {activeModels.map((model) => (
            <div
              key={model.slug}
              className="border border-border-custom bg-card-bg rounded-2xl p-6 flex flex-col gap-5 shadow-lg relative group overflow-hidden"
            >
              {/* Top Accent line */}
              <div className="absolute top-0 inset-x-0 h-1 bg-accent/40 group-hover:bg-accent transition-colors duration-200" />

              {/* Header Info */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center font-black text-accent text-sm shrink-0">
                  {model.short}
                </div>
                <div className="flex flex-col min-w-0">
                  <h3 className="font-bold text-base truncate leading-snug">{model.name}</h3>
                  <span className="text-[10px] font-bold text-muted-foreground truncate leading-normal">
                    {model.slug}
                  </span>
                </div>
              </div>

              <hr className="border-border-custom/50" />

              {/* Specs List */}
              <div className="flex flex-col gap-3 text-xs font-semibold">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Zap size={14} className="text-accent" /> Context Window:
                  </span>
                  <span className="text-foreground">{model.context}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Award size={14} className="text-accent" /> Pricing:
                  </span>
                  <span className="text-emerald-600 font-extrabold">{model.pricing}</span>
                </div>
              </div>

              <hr className="border-border-custom/50" />

              {/* Description */}
              <p className="text-xs text-foreground/80 leading-relaxed font-medium">
                {model.description}
              </p>

              {/* Features Tags */}
              <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
                {model.features.map((feat) => (
                  <span
                    key={feat}
                    className="px-2.5 py-1 rounded-lg border border-border-custom bg-background/50 text-[10px] font-bold text-muted-foreground flex items-center gap-1"
                  >
                    <Code size={10} className="text-accent" />
                    {feat}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
