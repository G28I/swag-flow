import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/app/lib/prisma";
import { logStatsigEvent } from "@/app/lib/statsig";

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
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

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body inputs
    const body = await req.json();
    const { threadId, promptId, votedMessageId, votedModel, models } = body;

    if (!threadId || !promptId || !Array.isArray(models)) {
      return NextResponse.json(
        { error: "threadId, promptId, and models array are required fields." },
        { status: 400 }
      );
    }

    // 3. Persist vote in database
    const vote = await prisma.vote.create({
      data: {
        userId,
        threadId,
        promptId,
        votedMessageId: votedMessageId || null,
        votedModel: votedModel || null,
        models,
      },
    });

    // 4. Log custom event to Statsig
    await logStatsigEvent(userId, "arena_vote_cast", {
      voteId: vote.id,
      threadId,
      promptId,
      votedModel: votedModel || "tie",
      isTie: String(votedModel === null || votedModel === undefined),
      modelsCount: models.length,
      participatingModels: models.join(","),
    });

    return NextResponse.json({
      success: true,
      voteId: vote.id,
    });
  } catch (error: unknown) {
    console.error("Error casting vote:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while casting vote." },
      { status: 500 }
    );
  }
}
