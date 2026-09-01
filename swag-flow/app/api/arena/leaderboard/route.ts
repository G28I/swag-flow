import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/app/lib/prisma";
import { publicReadAj } from "@/app/lib/arcjet";

export async function GET(req: NextRequest) {
  try {
    // 1. Run Arcjet rate limiting & bot protection
    const decision = await publicReadAj.protect(req);
    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please wait a moment before refreshing." },
          { status: 429 }
        );
      }
      if (decision.reason.isBot()) {
        return NextResponse.json({ error: "Automated access is not permitted." }, { status: 403 });
      }
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    // 2. Authenticate user
    const isClerkConfigured =
      process.env.CLERK_SECRET_KEY &&
      process.env.CLERK_SECRET_KEY !== "sk_test_placeholder" &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "pk_test_placeholder";

    let userId: string | null = null;
    if (isClerkConfigured) {
      const authObj = await auth();
      userId = authObj.userId;
    }

    if (!userId && process.env.NODE_ENV === "development") {
      userId = "mock_user_123";
    }

    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") || "global"; // "global" | "personal"

    if (scope === "personal" && !userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to view your personal leaderboard." },
        { status: 401 }
      );
    }

    // 3. Fetch votes based on scope
    const voteWhere = scope === "personal" && userId ? { userId } : {};
    const votes = await prisma.vote.findMany({
      where: voteWhere,
      select: {
        id: true,
        votedModel: true,
        models: true,
        createdAt: true,
      },
    });

    // 4. Fetch performance metrics from completed assistant messages
    const messageWhere =
      scope === "personal" && userId
        ? {
            role: "assistant",
            model: { not: null },
            thread: { userId },
            latency: { not: null, gt: 0 },
          }
        : {
            role: "assistant",
            model: { not: null },
            latency: { not: null, gt: 0 },
          };

    const messages = await prisma.message.findMany({
      where: messageWhere,
      select: {
        model: true,
        latency: true,
        ttft: true,
        tokensPerSec: true,
        tokenCount: true,
      },
    });

    // 5. Aggregate metrics per model
    const modelStatsMap: Record<
      string,
      {
        name: string;
        wins: number;
        matches: number;
        totalTtft: number;
        ttftCount: number;
        totalTokensPerSec: number;
        tpsCount: number;
      }
    > = {};

    const getStats = (modelId: string) => {
      if (!modelStatsMap[modelId]) {
        modelStatsMap[modelId] = {
          name: modelId,
          wins: 0,
          matches: 0,
          totalTtft: 0,
          ttftCount: 0,
          totalTokensPerSec: 0,
          tpsCount: 0,
        };
      }
      return modelStatsMap[modelId];
    };

    votes.forEach((vote) => {
      if (Array.isArray(vote.models)) {
        vote.models.forEach((modelId) => {
          if (!modelId) return;
          const stats = getStats(modelId);
          stats.matches += 1;
          if (vote.votedModel === modelId) {
            stats.wins += 1;
          }
        });
      }
    });

    messages.forEach((msg) => {
      if (!msg.model) return;
      const stats = getStats(msg.model);
      if (typeof msg.ttft === "number" && msg.ttft > 0) {
        stats.totalTtft += msg.ttft;
        stats.ttftCount += 1;
      }
      if (typeof msg.tokensPerSec === "number" && msg.tokensPerSec > 0) {
        stats.totalTokensPerSec += msg.tokensPerSec;
        stats.tpsCount += 1;
      }
    });

    // 6. Build and sort rankings with Laplace smoothing score to account for sample size
    const rankings = Object.values(modelStatsMap)
      .map((stat) => {
        const winRate = stat.matches > 0 ? (stat.wins / stat.matches) * 100 : 0;
        const avgTtftSeconds = stat.ttftCount > 0 ? stat.totalTtft / stat.ttftCount : 0;
        const avgTokensPerSec = stat.tpsCount > 0 ? stat.totalTokensPerSec / stat.tpsCount : 0;

        return {
          name: stat.name,
          wins: stat.wins,
          total: stat.matches,
          winRate: Math.round(winRate),
          winRateRatio: stat.matches > 0 ? stat.wins / stat.matches : 0,
          laplaceScore: (stat.wins + 1) / (stat.matches + 2),
          ttft: Math.round(avgTtftSeconds * 1000), // in milliseconds
          tps: Math.round(avgTokensPerSec * 10) / 10, // 1 decimal place
        };
      })
      .filter((stat) => stat.total > 0 || stat.wins > 0)
      .sort((a, b) => {
        // Laplace smoothed score descending to prevent low-sample anomaly, then wins desc, then total matches desc
        if (b.laplaceScore !== a.laplaceScore) {
          return b.laplaceScore - a.laplaceScore;
        }
        if (b.wins !== a.wins) {
          return b.wins - a.wins;
        }
        return b.total - a.total;
      })
      .map((stat, idx) => ({
        rank: idx + 1,
        ...stat,
      }));

    return NextResponse.json({
      scope,
      totalVotes: votes.length,
      rankings,
    });
  } catch (error: unknown) {
    console.error("Error generating leaderboard:", error);
    return NextResponse.json(
      { error: "Failed to load leaderboard data." },
      { status: 500 }
    );
  }
}
