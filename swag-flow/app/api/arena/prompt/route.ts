import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { promptAj } from "@/app/lib/arcjet";
import prisma from "@/app/lib/prisma";
import { logStatsigEvent } from "@/app/lib/statsig";

const isClerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY &&
  process.env.CLERK_SECRET_KEY !== "sk_test_placeholder" &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "pk_test_placeholder"
);

export async function POST(req: NextRequest) {
  try {
    // 1. Fast payload validation before authorization and network checks
    const body = await req.json();
    const { prompt, threadId, anonToken, systemPrompt, temperature, topP, maxTokens } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // 2. Authenticate user
    let userId: string | null = null;
    if (isClerkConfigured) {
      const authObj = await auth();
      userId = authObj.userId;
    }

    if (!userId && process.env.NODE_ENV === "development") {
      userId = "mock_user_123";
    }

    const effectiveUserId = userId || "anonymous";

    // 3. Arcjet Security Check (Shield, Bot Protection, and Prompt Injection)
    const decision = await promptAj.protect(req, {
      userId: effectiveUserId,
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
      // If user is unauthenticated and provides an anonToken, bind thread to anon_<anonToken>
      const ownerId = !userId && anonToken && typeof anonToken === "string" ? `anon_${anonToken}` : effectiveUserId;
      const thread = await prisma.thread.create({
        data: {
          title,
          userId: ownerId,
        },
      });
      targetThreadId = thread.id;
    } else {
      // Verify thread exists and strictly belongs to the caller (by Clerk userId or matching anonToken)
      const existingThread = await prisma.thread.findUnique({
        where: { id: targetThreadId },
      });

      if (!existingThread) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }

      const isOwner =
        Boolean(userId && existingThread.userId === userId) ||
        Boolean(
          anonToken &&
            typeof anonToken === "string" &&
            existingThread.userId === `anon_${anonToken.trim()}`
        ) ||
        (process.env.NODE_ENV === "development" && existingThread.userId === "mock_user_123");

      if (!isOwner) {
        return NextResponse.json({ error: "Unauthorized access to thread" }, { status: 403 });
      }
    }

    // 5. Create user message
    const userMessage = await prisma.message.create({
      data: {
        role: "user",
        content: prompt.trim(),
        threadId: targetThreadId,
        systemPrompt: typeof systemPrompt === "string" ? systemPrompt.trim() : null,
        temperature: typeof temperature === "number" ? temperature : null,
        topP: typeof topP === "number" ? topP : null,
        maxTokens: typeof maxTokens === "number" ? maxTokens : null,
      },
    });

    // 6. Track event in Statsig (fire-and-forget for speed)
    logStatsigEvent(effectiveUserId, "prompt_created", {
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
