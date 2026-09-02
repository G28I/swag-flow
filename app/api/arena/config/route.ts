import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { checkFeatureGate, getDynamicConfig } from "@/app/lib/statsig";

export async function GET(req: NextRequest) {
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

    // Evaluate Statsig Feature Gates
    const [arena3ModelMode, leaderboardPersonalTab, showPerformanceMetrics] =
      await Promise.all([
        checkFeatureGate(userId, "arena_3_model_mode", true),
        checkFeatureGate(userId, "leaderboard_personal_tab", true),
        checkFeatureGate(userId, "show_performance_metrics", true),
      ]);

    // Evaluate Statsig Dynamic Config
    const defaultModelConfig = await getDynamicConfig(userId, "default_model_selection", {
      models: [
        "google/gemini-2.0-flash-exp:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "qwen/qwen-2.5-coder-32b-instruct:free",
      ],
    });

    return NextResponse.json({
      gates: {
        arena_3_model_mode: arena3ModelMode,
        leaderboard_personal_tab: leaderboardPersonalTab,
        show_performance_metrics: showPerformanceMetrics,
      },
      config: {
        default_model_selection: defaultModelConfig,
      },
    });
  } catch (error: unknown) {
    console.error("Error evaluating Statsig config:", error);
    return NextResponse.json(
      {
        gates: {
          arena_3_model_mode: true,
          leaderboard_personal_tab: true,
          show_performance_metrics: true,
        },
        config: {
          default_model_selection: {
            models: [
              "google/gemini-2.0-flash-exp:free",
              "meta-llama/llama-3.3-70b-instruct:free",
              "qwen/qwen-2.5-coder-32b-instruct:free",
            ],
          },
        },
      },
      { status: 200 }
    );
  }
}
