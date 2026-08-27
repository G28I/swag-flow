import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { logStatsigEvent } from "@/app/lib/statsig";

export async function POST(req: NextRequest) {
  try {
    const isClerkConfigured =
      process.env.CLERK_SECRET_KEY &&
      process.env.CLERK_SECRET_KEY !== "sk_test_placeholder" &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "pk_test_placeholder";

    let userId = "anonymous_user";
    if (isClerkConfigured) {
      const authObj = await auth();
      if (authObj.userId) {
        userId = authObj.userId;
      }
    }

    const body = await req.json();
    const { eventName, metadata } = body;

    if (!eventName || typeof eventName !== "string") {
      return NextResponse.json({ error: "eventName string is required." }, { status: 400 });
    }

    // Log telemetry event to Statsig
    await logStatsigEvent(userId, eventName, metadata);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error logging client telemetry event:", error);
    return NextResponse.json(
      { error: "Failed to record telemetry event." },
      { status: 500 }
    );
  }
}
