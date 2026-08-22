"use client";

import React, { useState } from "react";
import AppShell from "@/components/AppShell";
import { Trophy, Award } from "lucide-react";

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<"global" | "personal">("global");

  const globalRankings = [
    {
      rank: 1,
      name: "google/gemma-4-31b-it:free",
      winRate: 72,
      wins: 507,
      total: 700,
      ttft: 1186,
      tps: 57,
    },
    {
      rank: 2,
      name: "nvidia/nemotron-3.5-lightning:free",
      winRate: 64,
      wins: 448,
      total: 700,
      ttft: 980,
      tps: 85,
    },
    {
      rank: 3,
      name: "poolside/laguna-s-2.1:free",
      winRate: 48,
      wins: 336,
      total: 700,
      ttft: 1250,
      tps: 42,
    },
  ];

  const personalRankings = [
    {
      rank: 1,
      name: "nvidia/nemotron-3.5-lightning:free",
      winRate: 80,
      wins: 8,
      total: 10,
      ttft: 950,
      tps: 88,
    },
    {
      rank: 2,
      name: "google/gemma-4-31b-it:free",
      winRate: 60,
      wins: 6,
      total: 10,
      ttft: 1120,
      tps: 59,
    },
    {
      rank: 3,
      name: "poolside/laguna-s-2.1:free",
      winRate: 30,
      wins: 3,
      total: 10,
      ttft: 1300,
      tps: 39,
    },
  ];

  const rankings = activeTab === "global" ? globalRankings : personalRankings;

  return (
    <AppShell breadcrumb="Leaderboard">
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
          <div className="flex bg-muted/60 p-1 rounded-xl border border-border-custom">
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

          {/* Rankings Table Card */}
          <div className="border border-border-custom bg-card-bg rounded-2xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-custom bg-background/40 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="py-4 px-6 w-16">#</th>
                    <th className="py-4 px-6">Model</th>
                    <th className="py-4 px-6 w-64">Win Rate</th>
                    <th className="py-4 px-6 text-right">Avg. to first token</th>
                    <th className="py-4 px-6 text-right">Avg. tokens/sec</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom/50 text-sm font-semibold">
                  {rankings.map((model) => (
                    <tr
                      key={model.name}
                      className="hover:bg-background/25 transition-colors duration-150"
                    >
                      <td className="py-5 px-6">
                        <div className="flex items-center gap-2">
                          {model.rank === 1 ? (
                            <Award className="text-amber-500 w-5 h-5 shrink-0" />
                          ) : (
                            <span className="text-muted-foreground font-bold pl-1.5">
                              {model.rank}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-5 px-6 font-mono text-xs font-bold text-foreground/90 select-all">
                        {model.name}
                      </td>
                      <td className="py-5 px-6">
                        <div className="flex flex-col gap-1.5 w-full">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-accent font-extrabold">{model.winRate}%</span>
                            <span className="text-muted-foreground text-[10px]">
                              Won {model.wins} of {model.total}
                            </span>
                          </div>
                          <div className="h-2 w-full bg-background rounded-full overflow-hidden border border-border-custom">
                            <div
                              className="h-full bg-accent rounded-full transition-all duration-500"
                              style={{ width: `${model.winRate}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-5 px-6 text-right font-mono text-xs text-muted-foreground">
                        {model.ttft}ms
                      </td>
                      <td className="py-5 px-6 text-right font-mono text-xs text-muted-foreground">
                        {model.tps} tok/s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
