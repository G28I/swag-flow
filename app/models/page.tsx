"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/AppShell";
import { Cpu, Award, Zap, Code, Loader2 } from "lucide-react";

interface ModelItem {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadModels() {
      try {
        const res = await fetch("/api/arena/models");
        if (!res.ok) throw new Error("Failed to load models list");
        const data = await res.json();
        setModels(data);
      } catch (err) {
        console.error("Error loading models catalog:", err);
        setError("Failed to load live model catalog. Please try again later.");
      } finally {
        setLoading(false);
      }
    }
    loadModels();
  }, []);

  return (
    <AppShell breadcrumb="Models">
      <div className="flex-1 overflow-y-auto w-full">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-8">
          {/* Page Title Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Cpu className="text-accent w-8 h-8" />
              <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Models Catalog</h1>
            </div>
            <p className="text-sm text-muted-foreground font-medium">
              Browse the catalog of active free-tier models available for concurrent evaluation in
              the Arena.
            </p>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="animate-spin text-accent w-8 h-8" />
              <span className="text-sm font-bold">Fetching live catalog from OpenRouter...</span>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="p-4 text-sm text-red-200 bg-red-950/40 border border-red-800 rounded-xl max-w-2xl">
              {error}
            </div>
          )}

          {/* Models Grid */}
          {!loading && !error && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
              {models.map((model) => {
                const short = model.name.charAt(0).toUpperCase();
                const provider = model.id.split("/")[0] || "OpenRouter";
                return (
                  <div
                    key={model.id}
                    className="border border-border-custom bg-card-bg rounded-2xl p-6 flex flex-col gap-5 shadow-lg relative group overflow-hidden"
                  >
                    {/* Top Accent line */}
                    <div className="absolute top-0 inset-x-0 h-1 bg-accent/40 group-hover:bg-accent transition-colors duration-200" />

                    {/* Header Info */}
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center font-black text-accent text-sm shrink-0">
                        {short}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <h3 className="font-bold text-base truncate leading-snug">{model.name}</h3>
                        <span className="text-[10px] font-bold text-muted-foreground truncate leading-normal uppercase">
                          {provider}
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
                        <span className="text-foreground">
                          {model.context_length.toLocaleString()} tokens
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Award size={14} className="text-accent" /> Pricing:
                        </span>
                        <span className="text-emerald-600 font-extrabold">Free ($0.00)</span>
                      </div>
                    </div>

                    <hr className="border-border-custom/50" />

                    {/* Details Slug */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Model Identifier
                      </span>
                      <span className="font-mono text-[10px] text-foreground/80 leading-relaxed font-bold bg-background/50 border border-border-custom/40 px-2.5 py-1.5 rounded-lg break-all select-all">
                        {model.id}
                      </span>
                    </div>

                    {/* Features Tags */}
                    <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
                      <span className="px-2.5 py-1 rounded-lg border border-border-custom bg-background/50 text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                        <Code size={10} className="text-accent" />
                        Free Tier
                      </span>
                      <span className="px-2.5 py-1 rounded-lg border border-border-custom bg-background/50 text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                        <Code size={10} className="text-accent" />
                        Active Slug
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
