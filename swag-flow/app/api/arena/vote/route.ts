import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/app/lib/prisma";
import { aj } from "@/app/lib/arcjet";
import { logStatsigEvent } from "@/app/lib/statsig";
import { normalizeAnonToken, isThreadOwner } from "@/app/lib/authHelper";

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user or anonymous caller
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

    // 2. Parse body inputs
    const body = await req.json();
    const { threadId, promptId, votedMessageId, votedModel, models, anonToken: bodyAnonToken } = body;
    const anonTokenHeader = req.headers.get("x-anon-token");
    const anonToken = bodyAnonToken || anonTokenHeader;

    const effectiveUserId = userId || normalizeAnonToken(anonToken);

    if (!effectiveUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!threadId || !promptId || !Array.isArray(models)) {
      return NextResponse.json(
        { error: "threadId, promptId, and models array are required fields." },
        { status: 400 }
      );
    }

    // 3. Arcjet protection (rate limiting, bot detection, shield)
    const decision = await aj.protect(req, { userId: effectiveUserId, requested: 1 });
    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please wait a moment before voting again." },
          { status: 429 }
        );
      }
      if (decision.reason.isBot()) {
        return NextResponse.json({ error: "Automated voting is not allowed." }, { status: 403 });
      }
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    // 4. Verify thread ownership
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
    });

    if (!thread || !isThreadOwner(thread.userId, userId, anonToken)) {
      return NextResponse.json({ error: "Thread not found or unauthorized" }, { status: 404 });
    }

    // 5. Verify prompt message belongs to this thread and is a user prompt
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

    // 6. If a specific winner is voted, verify the message belongs to this prompt turn and thread
    if (votedMessageId) {
      const votedMessage = await prisma.message.findFirst({
        where: {
          id: votedMessageId,
          threadId,
          parentId: promptId,
        },
      });

      if (!votedMessage) {
        return NextResponse.json(
          { error: "Voted message not found for this prompt turn" },
          { status: 400 }
        );
      }
    }

    // 7. Check for duplicate vote by caller on this prompt turn
    const existingVote = await prisma.vote.findFirst({
      where: {
        userId: effectiveUserId,
        promptId,
      },
    });

    if (existingVote) {
      return NextResponse.json(
        { error: "You have already voted on this turn." },
        { status: 400 }
      );
    }

    // 8. Record the vote
    const vote = await prisma.vote.create({
      data: {
        userId: effectiveUserId,
        threadId,
        promptId,
        votedMessageId: votedMessageId || null,
        votedModel: votedModel || null,
        models,
      },
    });

    // 9. Log telemetry event for evaluation vote
    logStatsigEvent(effectiveUserId, "model_voted", {
      threadId,
      promptId,
      votedModel: votedModel || "tie",
      participatingModels: models.join(","),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      voteId: vote.id,
      votedModel: vote.votedModel,
    });
  } catch (error: unknown) {
    console.error("Error recording vote:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
