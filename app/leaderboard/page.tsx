"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Trophy, Award, Loader2, Sparkles, Zap, Timer } from "lucide-react";

interface ModelRanking {
  rank: number;
  name: string;
  winRate: number;
  winRateRatio: number;
  wins: number;
  total: number;
  ttft: number; // in ms
  tps: number; // tokens/sec
}

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<"global" | "personal">("global");
  const [rankings, setRankings] = useState<ModelRanking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function fetchLeaderboard() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/arena/leaderboard?scope=${activeTab}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to fetch rankings (${res.status})`);
        }

        const data = await res.json();
        if (cancelled) return;

        startTransition(() => {
          setRankings(Array.isArray(data.rankings) ? data.rankings : []);
          setLoading(false);
        });
      } catch (err: unknown) {
        if (cancelled) return;
        console.error("Leaderboard fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to load leaderboard data.");
        setLoading(false);
      }
    }

    fetchLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  return (
    <AppShell breadcrumb="Leaderboard">
      <div className="flex-1 overflow-y-auto w-full">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-8">
          {/* Page Title Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Trophy className="text-accent w-8 h-8" />
              <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Leaderboard</h1>
            </div>
            <p className="text-sm text-muted-foreground font-medium">
              Every model&apos;s real record, from actual head to head votes.
            </p>
          </div>

          {/* Global/Personal Toggle */}
          <div className="flex justify-start">
            <div className="flex bg-muted/60 p-1 rounded-xl border border-border-custom shadow-inner">
              <button
                onClick={() => setActiveTab("global")}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === "global"
                    ? "bg-accent text-white shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Global
              </button>
              <button
                onClick={() => setActiveTab("personal")}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === "personal"
                    ? "bg-accent text-white shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Personal
              </button>
            </div>
          </div>

          {/* Rankings Section */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold tracking-tight">
                {activeTab === "global" ? "Global Ranking" : "Personal Ranking"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {activeTab === "global"
                  ? "Every vote, every user, ranked by real wins"
                  : "Your votes and preferences aggregated across threads"}
              </p>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground border border-border-custom bg-card-bg rounded-2xl">
                <Loader2 className="animate-spin text-accent w-8 h-8" />
                <span className="text-sm font-bold">Computing rankings from database votes...</span>
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div className="p-5 text-sm text-red-200 bg-red-950/40 border border-red-800 rounded-2xl flex flex-col gap-2">
                <span className="font-bold">Error loading leaderboard:</span>
                <span className="text-xs text-red-300/80">{error}</span>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && rankings.length === 0 && (
              <div className="border border-border-custom bg-card-bg rounded-2xl p-12 text-center flex flex-col items-center gap-4 shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/20 flex items-center justify-center text-accent">
                  <Sparkles size={28} />
                </div>
                <div className="flex flex-col gap-1.5 max-w-md">
                  <h3 className="font-bold text-lg text-foreground">
                    {activeTab === "global" ? "No Votes Recorded Yet" : "No Personal Votes Yet"}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {activeTab === "global"
                      ? "Be the first to benchmark models concurrently and cast a vote in the Arena."
                      : "You haven't voted on any model comparisons yet. Run a prompt in the Arena to start ranking."}
                  </p>
                </div>
                <Link
                  href="/"
                  className="mt-2 px-5 py-2.5 rounded-xl bg-accent text-white font-bold text-xs shadow-md hover:bg-accent-hover transition-colors"
                >
                  Start Comparing in Arena
                </Link>
              </div>
            )}

            {/* Rankings Table Card */}
            {!loading && !error && rankings.length > 0 && (
              <div className="border border-border-custom bg-card-bg rounded-2xl overflow-hidden shadow-lg animate-fade-in">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border-custom bg-background/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="py-4 px-6 w-16">#</th>
                        <th className="py-4 px-6">Model</th>
                        <th className="py-4 px-6 w-72">Win Rate</th>
                        <th className="py-4 px-6 text-right">Avg. to first token</th>
                        <th className="py-4 px-6 text-right">Avg. Speed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-custom/50 text-sm font-semibold">
                      {rankings.map((model) => {
                        const isFirstPlace = model.rank === 1;
                        const provider = model.name.split("/")[0] || "OpenRouter";
                        const shortName = model.name.split("/")[1] || model.name;

                        return (
                          <tr
                            key={model.name}
                            className={`transition-colors duration-150 ${
                              isFirstPlace
                                ? "bg-accent/8 hover:bg-accent/12 border-l-4 border-l-accent"
                                : "hover:bg-background/30"
                            }`}
                          >
                            {/* Rank Column */}
                            <td className="py-5 px-6">
                              <div className="flex items-center gap-2">
                                {isFirstPlace ? (
                                  <div className="flex items-center gap-1.5 font-extrabold text-accent">
                                    <Award className="w-5 h-5 text-accent shrink-0" />
                                    <span className="text-sm font-black">1</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground font-bold pl-1.5">
                                    {model.rank}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Model Name & Provider */}
                            <td className="py-5 px-6">
                              <div className="flex flex-col gap-0.5">
                                <span
                                  className="font-bold text-sm text-foreground/95 truncate max-w-sm"
                                  title={model.name}
                                >
                                  {shortName}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                                  {provider}
                                </span>
                              </div>
                            </td>

                            {/* Win Rate Column (Big, Bold Accent with Bar) */}
                            <td className="py-5 px-6">
                              <div className="flex flex-col gap-2 w-full">
                                <div className="flex items-baseline justify-between gap-2">
                                  {/* Big, bold number in accent color written as 'won X of Y' */}
                                  <span className="text-accent font-extrabold text-sm sm:text-base tracking-tight">
                                    won {model.wins} of {model.total}
                                  </span>
                                  <span className="text-[11px] font-bold text-muted-foreground font-mono">
                                    {model.winRate}%
                                  </span>
                                </div>
                                <div className="h-2 w-full bg-background/80 rounded-full overflow-hidden border border-border-custom/80">
                                  <div
                                    className="h-full bg-accent rounded-full transition-all duration-500"
                                    style={{ width: `${Math.max(model.winRate, 2)}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Avg TTFT */}
                            <td className="py-5 px-6 text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="font-mono text-xs font-bold text-foreground/85">
                                  {model.ttft > 0 ? `${(model.ttft / 1000).toFixed(2)}s` : "—"}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                                  <Timer size={10} className="text-accent" />
                                  {model.ttft > 0 ? `${model.ttft}ms` : "no data"}
                                </span>
                              </div>
                            </td>

                            {/* Avg Speed (tokens/sec) */}
                            <td className="py-5 px-6 text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="font-mono text-xs font-bold text-foreground/85">
                                  {model.tps > 0 ? `${model.tps} tok/s` : "—"}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                                  <Zap size={10} className="text-accent" />
                                  throughput
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
