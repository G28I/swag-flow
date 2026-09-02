import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/app/lib/prisma";
import { publicReadAj } from "@/app/lib/arcjet";
import { normalizeAnonToken, isThreadOwner } from "@/app/lib/authHelper";

// GET: List all threads or get a specific thread's history
export async function GET(req: NextRequest) {
  try {
    // Arcjet protection (IP-based rate limiting, bot detection, shield) for public reads
    const decision = await publicReadAj.protect(req);
    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please wait a moment before trying again." },
          { status: 429 }
        );
      }
      if (decision.reason.isBot()) {
        return NextResponse.json({ error: "Automated access is not allowed." }, { status: 403 });
      }
      if (decision.reason.isShield()) {
        return NextResponse.json({ error: "Suspicious request blocked." }, { status: 403 });
      }
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

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

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("id");
    // Extract anonymous token ONLY from x-anon-token request header (never from URL searchParams)
    const anonToken = req.headers.get("x-anon-token");

    // Single thread lookup: Require matching authenticated owner or anonymous ownership token before returning payload
    if (threadId) {
      const thread = await prisma.thread.findUnique({
        where: { id: threadId },
        include: {
          parentThread: {
            select: { id: true, title: true },
          },
          messages: {
            orderBy: { createdAt: "asc" },
          },
          votes: {
            select: {
              id: true,
              threadId: true,
              promptId: true,
              votedMessageId: true,
              votedModel: true,
              models: true,
              createdAt: true,
            },
          },
        },
      });

      if (!thread) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }

      if (!isThreadOwner(thread.userId, userId, anonToken)) {
        return NextResponse.json({ error: "Unauthorized access to thread history" }, { status: 403 });
      }

      // Omit internal user identifier from payload for privacy
      const { userId: _, ...safeThread } = thread;

      return NextResponse.json({
        ...safeThread,
        isOwner: true,
      });
    }

    // List all threads: filter by Clerk userId or anonymous token
    const normalizedAnon = normalizeAnonToken(anonToken);

    if (!userId && !normalizedAnon) {
      // If neither is present, return empty list
      return NextResponse.json([]);
    }

    const whereCondition = userId
      ? { userId }
      : { userId: normalizedAnon };

    const threads = await prisma.thread.findMany({
      where: whereCondition,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        parentThreadId: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    });

    return NextResponse.json(threads);
  } catch (error: unknown) {
    console.error("Error fetching threads:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

// DELETE: Delete a thread owned by the authenticated user or anonymous token
export async function DELETE(req: NextRequest) {
  try {
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

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("id");
    const anonToken = req.headers.get("x-anon-token");

    if (!threadId) {
      return NextResponse.json({ error: "Thread ID is required" }, { status: 400 });
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true, userId: true },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    if (!isThreadOwner(thread.userId, userId, anonToken)) {
      return NextResponse.json({ error: "Unauthorized to delete thread" }, { status: 403 });
    }

    await prisma.thread.delete({
      where: { id: threadId },
    });

    return NextResponse.json({ success: true, deletedId: threadId });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error("Error deleting thread:", errMessage, error);
    return NextResponse.json(
      { error: `Thread deletion failed: ${errMessage}` },
      { status: 500 }
    );
  }
}
