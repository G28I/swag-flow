import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/app/lib/prisma";

export async function POST(req: NextRequest) {
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

    if (!userId && process.env.NODE_ENV === "development") {
      userId = "mock_user_123";
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { threadIds } = body;

    if (!Array.isArray(threadIds) || threadIds.length === 0) {
      return NextResponse.json({ syncedCount: 0 });
    }

    // Update any anonymous threads in PostgreSQL to assign ownership to the authenticated Clerk user
    const result = await prisma.thread.updateMany({
      where: {
        id: { in: threadIds },
        OR: [
          { userId: "anonymous" },
          { userId: "mock_user_123" },
        ],
      },
      data: {
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      syncedCount: result.count,
    });
  } catch (error: unknown) {
    console.error("Error syncing anonymous threads:", error);
    return NextResponse.json({ error: "Failed to sync threads." }, { status: 500 });
  }
}
