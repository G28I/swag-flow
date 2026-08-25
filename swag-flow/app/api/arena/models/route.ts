import { NextResponse } from "next/server";

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

let cachedModels: OpenRouterModel[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export async function GET() {
  try {
    const now = Date.now();
    if (cachedModels && now - cacheTime < CACHE_DURATION) {
      return NextResponse.json(cachedModels);
    }

    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "HTTP-Referer": "https://github.com/G28I/swag-flow",
        "X-Title": "Swag-flow",
      },
    });

    if (!res.ok) {
      throw new Error(`OpenRouter API responded with code ${res.status}`);
    }

    const json = await res.json();
    if (!json || !Array.isArray(json.data)) {
      throw new Error("Invalid response format from OpenRouter API");
    }

    const rawModels: OpenRouterModel[] = json.data;

    // Filter for free models, excluding restricted agentic-harness-only models (e.g. thinkingmachines/*)
    const freeModels = rawModels
      .filter(
        (m) =>
          m.pricing &&
          (m.pricing.prompt === "0" || parseFloat(m.pricing.prompt) === 0) &&
          !m.id.startsWith("thinkingmachines/") &&
          !m.id.includes("inkling") &&
          !m.id.includes("ox-alpha") &&
          !m.id.includes("harness")
      )
      .map((m) => ({
        id: m.id,
        name: m.name || m.id.split("/")[1] || m.id,
        context_length: m.context_length || 0,
        pricing: m.pricing,
      }))
      .sort((a, b) => b.context_length - a.context_length);

    // If OpenRouter returns an empty list, throw error to trigger fallback
    if (freeModels.length === 0) {
      throw new Error("No free models returned from OpenRouter");
    }

    cachedModels = freeModels;
    cacheTime = now;

    return NextResponse.json(freeModels);
  } catch (error: unknown) {
    console.error("Error fetching OpenRouter models list:", error);

    // Resilient fallback list in case OpenRouter is offline or rate-limiting
    const fallbacks = [
      {
        id: "google/gemini-2.0-flash-exp:free",
        name: "Google Gemini 2.0 Flash (Free)",
        context_length: 1048576,
        pricing: { prompt: "0", completion: "0" },
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct:free",
        name: "Meta Llama 3.3 70B (Free)",
        context_length: 131072,
        pricing: { prompt: "0", completion: "0" },
      },
      {
        id: "qwen/qwen-2.5-coder-32b-instruct:free",
        name: "Qwen 2.5 Coder 32B (Free)",
        context_length: 32768,
        pricing: { prompt: "0", completion: "0" },
      },
    ].sort((a, b) => b.context_length - a.context_length);

    return NextResponse.json(fallbacks);
  }
}
