import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { promptAj } from "@/app/lib/arcjet";
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

    // In local development, if no active session exists, fallback to mock user
    if (!userId && process.env.NODE_ENV === "development") {
      userId = "mock_user_123";
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse input
    const body = await req.json();
    const { prompt, threadId } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // 3. Arcjet Security Check (Shield, Bot Protection, and Prompt Injection)
    const decision = await promptAj.protect(req, {
      userId,
      requested: 1,
      detectPromptInjectionMessage: prompt,
    });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      }
      if (decision.reason.isBot()) {
        return NextResponse.json({ error: "Bot activity detected" }, { status: 403 });
      }
      if (decision.reason.isPromptInjection()) {
        return NextResponse.json(
          { error: "Security warning: Prompt injection pattern detected. Please rephrase." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let targetThreadId = threadId;

    // 4. Create thread if not provided
    if (!targetThreadId) {
      const title = prompt.length > 40 ? prompt.substring(0, 40) + "..." : prompt;
      const thread = await prisma.thread.create({
        data: {
          title,
          userId,
        },
      });
      targetThreadId = thread.id;
    } else {
      // Verify thread exists and belongs to the user
      const existingThread = await prisma.thread.findFirst({
        where: {
          id: targetThreadId,
          userId,
        },
      });
      if (!existingThread) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }
    }

    // 5. Create user message
    const userMessage = await prisma.message.create({
      data: {
        role: "user",
        content: prompt.trim(),
        threadId: targetThreadId,
      },
    });

    // 6. Track event in Statsig (fire-and-forget for speed)
    logStatsigEvent(userId, "prompt_created", {
      threadId: targetThreadId,
      messageId: userMessage.id,
    }).catch(() => {});

    return NextResponse.json({
      threadId: targetThreadId,
      messageId: userMessage.id,
    });
  } catch (error: unknown) {
    console.error("Error creating prompt:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
