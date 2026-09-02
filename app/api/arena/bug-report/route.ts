import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/app/lib/prisma";
import { normalizeAnonToken, getEffectiveOwnerId } from "@/app/lib/authHelper";

export async function POST(req: NextRequest) {
  try {
    const isClerkConfigured = Boolean(
      process.env.CLERK_SECRET_KEY &&
        process.env.CLERK_SECRET_KEY !== "sk_test_placeholder" &&
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "pk_test_placeholder"
    );

    let userId: string | null = null;
    if (isClerkConfigured) {
      const authObj = await auth();
      userId = authObj.userId;
    }

    const body = await req.json();
    const { category, description, imageData, pageUrl, anonToken: bodyAnonToken } = body;
    const headerAnonToken = req.headers.get("x-anon-token");
    const anonToken = bodyAnonToken || headerAnonToken;

    if (!description || typeof description !== "string" || description.trim().length === 0) {
      return NextResponse.json({ error: "Bug description is required." }, { status: 400 });
    }

    const effectiveUserId = getEffectiveOwnerId(userId, anonToken);

    const report = await prisma.bugReport.create({
      data: {
        userId: effectiveUserId,
        category: typeof category === "string" && category ? category : "other",
        description: description.trim(),
        imageData: typeof imageData === "string" && imageData.startsWith("data:image/") ? imageData : null,
        pageUrl: typeof pageUrl === "string" ? pageUrl : null,
      },
    });

    return NextResponse.json({
      success: true,
      reportId: report.id,
      message: "Bug report submitted successfully! Thank you for your feedback.",
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error("Error saving bug report:", errMessage, error);
    return NextResponse.json(
      { error: `Failed to submit bug report: ${errMessage}` },
      { status: 500 }
    );
  }
}
