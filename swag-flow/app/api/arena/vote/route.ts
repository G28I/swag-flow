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

    // 3. Verify thread ownership
    const thread = await prisma.thread.findFirst({
      where: {
        id: threadId,
        userId,
      },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found or unauthorized" }, { status: 404 });
    }

    // 4. Verify prompt message belongs to this thread and is a user prompt
    const promptMessage = await prisma.message.findFirst({
      where: {
        id: promptId,
        threadId,
        role: "user",
      },
    });

    if (!promptMessage) {
      return NextResponse.json(
        { error: "Prompt message not found in this thread" },
        { status: 400 }
      );
    }

    // 5. If a specific winner is voted, verify the message belongs to this prompt turn and thread
    if (votedMessageId) {
      const votedMessage = await prisma.message.findFirst({
        where: {
          id: votedMessageId,
          threadId,
          parentId: promptId,
          role: "assistant",
        },
      });

      if (!votedMessage) {
        return NextResponse.json(
          { error: "Voted message not found or does not belong to this prompt turn" },
          { status: 400 }
        );
      }

      if (votedModel && votedMessage.model !== votedModel) {
        return NextResponse.json(
          { error: "Voted model does not match the assistant message model" },
          { status: 400 }
        );
      }
    }

    // 6. Persist vote in database
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
