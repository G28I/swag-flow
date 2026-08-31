import { test, expect } from "@playwright/test";
import {
  normalizeUsage,
  calculateEfficiencyMetrics,
  getTurnComparisonInsights,
} from "../app/lib/costEngine";
import {
  buildExportReport,
  generateMarkdownReport,
  generateJSONReport,
} from "../app/lib/exportEngine";

test.describe("Real-Time Cost & Efficiency Analytics Specifications", () => {
  test("Phase 3 & 5: normalizeUsage handles provider usage payloads and free model precedence", () => {
    // 1. OpenRouter actual cost payload
    const rawPayload = {
      prompt_tokens: 2104,
      completion_tokens: 1824,
      total_tokens: 3928,
      cost: 0.01425,
      completion_tokens_details: { reasoning_tokens: 256 },
    };

    const usage = normalizeUsage(rawPayload, {
      modelRequested: "openai/gpt-4o",
      actualModelUsed: "openai/gpt-4o",
    });

    expect(usage.promptTokens).toBe(2104);
    expect(usage.completionTokens).toBe(1824);
    expect(usage.totalTokens).toBe(3928);
    expect(usage.reasoningTokens).toBe(256);
    expect(usage.costUsd).toBe(0.01425);
    expect(usage.costSource).toBe("openrouter");

    // 2. Free tier model precedence ($0.0000)
    const freeUsage = normalizeUsage(null, {
      modelRequested: "google/gemini-2.0-flash-exp:free",
    });
    expect(freeUsage.costUsd).toBe(0.0);
    expect(freeUsage.costSource).toBe("openrouter");
  });

  test("Phase 8 & 9: calculateEfficiencyMetrics derives cost/1k tokens and throughput", () => {
    const usage = {
      promptTokens: 1000,
      completionTokens: 2000,
      totalTokens: 3000,
      costUsd: 0.02,
      costSource: "openrouter" as const,
    };

    const metrics = calculateEfficiencyMetrics(usage, 0.412, 4.8, 82.5);

    expect(metrics.ttftMs).toBe(412);
    expect(metrics.latencyMs).toBe(4800);
    expect(metrics.throughputTokensPerSecond).toBe(82.5);
    expect(metrics.costPer1kCompletionTokens).toBeCloseTo(0.01, 4);
    expect(metrics.costPer1kTotalTokens).toBeCloseTo(0.00667, 4);
  });

  test("Phase 10: getTurnComparisonInsights ranks Cheapest, Fastest, and Most Efficient models", () => {
    const modelEntries = [
      {
        modelId: "modelA",
        modelName: "Model A",
        text: "Response A",
        metrics: { ttft: 0.412, latency: 4.8, tokensPerSec: 82, tokenCount: 2000, costUsd: 0.014 },
      },
      {
        modelId: "modelB",
        modelName: "Model B",
        text: "Response B",
        metrics: { ttft: 0.210, latency: 2.5, tokensPerSec: 118, tokenCount: 1200, costUsd: 0.004 },
      },
      {
        modelId: "modelC",
        modelName: "Model C",
        text: "Response C",
        metrics: { ttft: 0.350, latency: 3.2, tokensPerSec: 95, tokenCount: 1600, costUsd: 0.009 },
      },
    ];

    const insights = getTurnComparisonInsights(modelEntries);

    expect(insights.cheapestModelId).toBe("modelB");
    expect(insights.fastestTtftModelId).toBe("modelB");
    expect(insights.highestThroughputModelId).toBe("modelB");
    expect(insights.mostTokenEfficientModelId).toBe("modelB");
  });

  test("Phase 17: Export Engine embeds cost, reasoning tokens, and actual model in Markdown & JSON", () => {
    const mockTurn = {
      id: "turn1",
      prompt: "Explain quantum computing",
      winnerModel: "modelA",
      activeCount: 1,
      models: [{ id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" }],
      responses: {
        modelA: {
          text: "Quantum computing is...",
          error: null,
          messageId: "msg1",
          metrics: {
            ttft: 0.35,
            latency: 2.4,
            tokensPerSec: 95,
            tokenCount: 228,
            costUsd: 0.0084,
            costSource: "openrouter",
            promptTokens: 100,
            completionTokens: 128,
            reasoningTokens: 32,
            actualModel: "anthropic/claude-3.5-sonnet",
          },
        },
        modelB: { text: "", error: null, metrics: null, messageId: null },
        modelC: { text: "", error: null, metrics: null, messageId: null },
      },
    };

    const report = buildExportReport({
      threadId: "test-thread-123",
      threadTitle: "Cost Analytics Test Thread",
      turns: [mockTurn],
    });

    const markdown = generateMarkdownReport(report);
    expect(markdown).toContain("| Generation Cost | $0.008400 (openrouter) |");
    expect(markdown).toContain("| Input Tokens | 100 |");
    expect(markdown).toContain("| Output Tokens | 128 |");
    expect(markdown).toContain("| Reasoning Tokens | 32 |");
    expect(markdown).toContain("| Actual Model Used | `anthropic/claude-3.5-sonnet` |");

    const json = generateJSONReport(report);
    expect(json).toContain('"costUsd": 0.0084');
    expect(json).toContain('"reasoningTokens": 32');
  });
});
