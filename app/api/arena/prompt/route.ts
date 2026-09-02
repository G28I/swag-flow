import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { promptAj } from "@/app/lib/arcjet";
import prisma from "@/app/lib/prisma";
import { logStatsigEvent } from "@/app/lib/statsig";
import {
  normalizeAnonToken,
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
    // 1. Fast payload validation before authorization and network checks
    const body = await req.json();
    const { prompt, threadId, anonToken: bodyAnonToken, systemPrompt, temperature, topP, maxTokens } = body;
    const headerAnonToken = req.headers.get("x-anon-token");
    const anonToken = bodyAnonToken || headerAnonToken;

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

    const normalizedAnon = normalizeAnonToken(anonToken);
    const anonOwnerId = getEffectiveOwnerId(userId, anonToken);
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

    // Arcjet rate-limiting & security characteristic identity
    const arcjetUserId = userId || normalizedAnon || clientIp;

    // 3. Arcjet Security Check (Shield, Bot Protection, and Prompt Injection)
    const decision = await promptAj.protect(req, {
      userId: arcjetUserId,
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
      // Validate no-identity case before creating thread
      if (!userId && !normalizedAnon) {
        return NextResponse.json(
          { error: "Authentication or anonymous token required to create thread" },
          { status: 401 }
        );
      }

      const title = prompt.length > 40 ? prompt.substring(0, 40) + "..." : prompt;
      const thread = await prisma.thread.create({
        data: {
          title,
          userId: anonOwnerId,
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

      if (!isThreadOwner(existingThread.userId, userId, anonToken)) {
        return NextResponse.json({ error: "Unauthorized access to thread" }, { status: 403 });
      }
    }

    // 5. Create user message
    const userMessage = await prisma.message.create({
      data: {
        role: "user",
        content: prompt.trim(),
        threadId: targetThreadId,
        systemPrompt: systemPrompt || null,
        temperature: typeof temperature === "number" ? temperature : null,
        topP: typeof topP === "number" ? topP : null,
        maxTokens: typeof maxTokens === "number" ? maxTokens : null,
      },
    });

    // Log telemetry event for prompt creation
    logStatsigEvent(anonOwnerId || "anonymous", "prompt_submitted", {
      threadId: targetThreadId,
      promptId: userMessage.id,
      promptLength: prompt.length,
    }).catch(() => {});

    return NextResponse.json({
      threadId: targetThreadId,
      promptId: userMessage.id,
      messageId: userMessage.id,
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error("Error creating prompt:", errMessage, error);
    return NextResponse.json(
      { error: `Prompt submission error: ${errMessage || "Database or backend service failed."}` },
      { status: 500 }
    );
  }
}
