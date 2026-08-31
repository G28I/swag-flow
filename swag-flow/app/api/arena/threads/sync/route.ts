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
    const { threadIds, anonToken } = body;

    if (!Array.isArray(threadIds) || threadIds.length === 0) {
      return NextResponse.json({ syncedCount: 0 });
    }

    if (!anonToken || typeof anonToken !== "string" || anonToken.trim().length === 0) {
      return NextResponse.json(
        { error: "Anonymous ownership token is required to sync threads." },
        { status: 400 }
      );
    }

    const cleanAnonToken = anonToken.trim();
    const expectedAnonOwner = cleanAnonToken.startsWith("anon_")
      ? cleanAnonToken
      : `anon_${cleanAnonToken}`;

    // Strict ownership transfer predicate:
    // Threads can ONLY be claimed if their stored userId matches the specific client session token `anon_<token>`
    const validUserIdFilter: ({ userId: string })[] = [
      { userId: expectedAnonOwner },
    ];

    if (process.env.NODE_ENV === "development") {
      validUserIdFilter.push({ userId: "mock_user_123" });
    }

    // Update matching anonymous threads to assign ownership to the authenticated Clerk user
    const result = await prisma.thread.updateMany({
      where: {
        id: { in: threadIds },
        OR: validUserIdFilter,
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
