import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/app/lib/prisma";
import {
  getEffectiveOwnerId,
  isThreadOwner,
} from "@/app/lib/authHelper";

const isClerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY &&
    process.env.CLERK_SECRET_KEY !== "sk_test_placeholder" &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "pk_test_placeholder"
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourceThreadId, upToTurnPromptId, anonToken: bodyAnonToken } = body;
    const anonTokenHeader = req.headers.get("x-anon-token");
    const anonToken = bodyAnonToken || anonTokenHeader;

    if (!sourceThreadId || typeof sourceThreadId !== "string") {
      return NextResponse.json({ error: "sourceThreadId is required" }, { status: 400 });
    }

    // 1. Authenticate user
    let userId: string | null = null;
    if (isClerkConfigured) {
      const authObj = await auth();
      userId = authObj.userId;
    }

    if (!userId && process.env.NODE_ENV === "development") {
      userId = "mock_user_123";
    }

    // 2. Fetch source thread and verify authorization
    const sourceThread = await prisma.thread.findUnique({
      where: { id: sourceThreadId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!sourceThread) {
      return NextResponse.json({ error: "Source thread not found" }, { status: 404 });
    }

    if (!isThreadOwner(sourceThread.userId, userId, anonToken)) {
      return NextResponse.json({ error: "Unauthorized to fork thread" }, { status: 403 });
    }

    // 3. Determine message range to copy
    let messagesToCopy = sourceThread.messages;
    if (upToTurnPromptId && typeof upToTurnPromptId === "string") {
      const promptIndex = sourceThread.messages.findIndex((m) => m.id === upToTurnPromptId);
      if (promptIndex !== -1) {
        // Include the target user prompt and any assistant replies associated with it
        const nextUserPromptIndex = sourceThread.messages.findIndex(
          (m, idx) => idx > promptIndex && m.role === "user"
        );
        const endIndex =
          nextUserPromptIndex !== -1 ? nextUserPromptIndex : sourceThread.messages.length;
        messagesToCopy = sourceThread.messages.slice(0, endIndex);
      }
    }

    const cleanTitle = sourceThread.title.startsWith("Fork of ")
      ? sourceThread.title
      : `Fork of ${sourceThread.title}`;

    const ownerId = getEffectiveOwnerId(userId, anonToken) || "anonymous";

    // 4. Wrap new thread creation and message cloning loop in a single Prisma interactive transaction
    const newThread = await prisma.$transaction(
      async (tx) => {
        const createdThread = await tx.thread.create({
          data: {
            title: cleanTitle,
            userId: ownerId,
            parentThreadId: sourceThreadId,
          },
        });

        const messageIdMap = new Map<string, string>();

        for (const oldMsg of messagesToCopy) {
          const newParentId = oldMsg.parentId ? messageIdMap.get(oldMsg.parentId) || null : null;

          const newMsg = await tx.message.create({
            data: {
              role: oldMsg.role,
              content: oldMsg.content,
              model: oldMsg.model,
              actualModel: oldMsg.actualModel || null,
              threadId: createdThread.id,
              parentId: newParentId,
              latency: oldMsg.latency,
              ttft: oldMsg.ttft,
              tokensPerSec: oldMsg.tokensPerSec,
              tokenCount: oldMsg.tokenCount,
              promptTokens: oldMsg.promptTokens || null,
              completionTokens: oldMsg.completionTokens || null,
              reasoningTokens: oldMsg.reasoningTokens || null,
              cachedTokens: oldMsg.cachedTokens || null,
              cost: oldMsg.cost,
              costUsd: oldMsg.costUsd || null,
              costSource: oldMsg.costSource || null,
              systemPrompt: oldMsg.systemPrompt,
              temperature: oldMsg.temperature,
              topP: oldMsg.topP,
              maxTokens: oldMsg.maxTokens,
            },
          });

          messageIdMap.set(oldMsg.id, newMsg.id);
        }

        return createdThread;
      },
      { timeout: 30000 }
    );

    return NextResponse.json({
      threadId: newThread.id,
      title: newThread.title,
      parentThreadId: sourceThread.id,
      parentTitle: sourceThread.title,
      copiedMessagesCount: messagesToCopy.length,
    });
  } catch (error: unknown) {
    console.error("Error forking thread:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
