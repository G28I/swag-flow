import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { publicReadAj } from "@/app/lib/arcjet";
import { logStatsigEvent } from "@/app/lib/statsig";

const ALLOWED_EVENTS = new Set([
  "prompt_submitted",
  "model_voted",
  "thread_shared",
  "turn_version_switched",
  "regenerate_clicked",
  "model_removed",
  "model_added",
  "hyperparameter_changed",
  "report_exported",
]);

export async function POST(req: NextRequest) {
  try {
    // 1. Arcjet rate-limiting check before processing request body
    const decision = await publicReadAj.protect(req);
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    }

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

    // 2. Validate eventName against explicit allowlist
    if (!eventName || typeof eventName !== "string" || !ALLOWED_EVENTS.has(eventName)) {
      return NextResponse.json({ error: "Invalid telemetry eventName." }, { status: 400 });
    }

    // 3. Enforce bounded metadata schema size limit (<= 10 keys, <= 2048 bytes stringified)
    if (metadata !== undefined && metadata !== null) {
      if (typeof metadata !== "object" || Array.isArray(metadata)) {
        return NextResponse.json({ error: "Metadata must be an object." }, { status: 400 });
      }
      const keys = Object.keys(metadata);
      if (keys.length > 10) {
        return NextResponse.json({ error: "Metadata key limit exceeded (max 10)." }, { status: 400 });
      }
      const serialized = JSON.stringify(metadata);
      if (serialized.length > 2048) {
        return NextResponse.json({ error: "Metadata size limit exceeded (max 2KB)." }, { status: 400 });
      }
    }

    // 4. Log telemetry event to Statsig
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
