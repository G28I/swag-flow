import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/app/lib/prisma";
import { publicReadAj } from "@/app/lib/arcjet";

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

    // Single thread lookup: Public read allowed, isOwner flag computed
    if (threadId) {
      const thread = await prisma.thread.findUnique({
        where: { id: threadId },
        include: {
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

      const isOwner = Boolean(userId && thread.userId === userId);

      // Omit internal user identifier from payload for privacy
      const { userId: _internalUserId, ...safeThread } = thread;

      return NextResponse.json({
        ...safeThread,
        isOwner,
      });
    }

    // Listing user's thread history: Strictly requires authentication
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const threads = await prisma.thread.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 50,
    });

    return NextResponse.json(threads);
  } catch (error: unknown) {
    console.error("Error listing threads:", error);
    return NextResponse.json({ error: "Failed to list threads" }, { status: 500 });
  }
}

// POST: Create a new empty thread
export async function POST() {
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

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const thread = await prisma.thread.create({
      data: {
        userId,
        title: "New Thread",
      },
    });

    return NextResponse.json(thread);
  } catch (error: unknown) {
    console.error("Error creating thread:", error);
    return NextResponse.json({ error: "Failed to create thread" }, { status: 500 });
  }
}

// DELETE: Delete a thread by ID (passed as query param ?id=xxx)
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

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("id");

    if (!threadId) {
      return NextResponse.json({ error: "Thread ID is required" }, { status: 400 });
    }

    // Verify ownership before deleting
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, userId },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    await prisma.thread.delete({
      where: { id: threadId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting thread:", error);
    return NextResponse.json({ error: "Failed to delete thread" }, { status: 500 });
  }
}
