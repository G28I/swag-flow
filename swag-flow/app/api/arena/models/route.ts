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

    // Filter for free models (pricing.prompt is "0")
    // Map to normalized properties and sort by context window descending
    const freeModels = rawModels
      .filter((m) => m.pricing && m.pricing.prompt === "0")
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
        id: "google/gemma-4-31b-it:free",
        name: "Google Gemma 4 31B (Free)",
        context_length: 32768,
        pricing: { prompt: "0", completion: "0" },
      },
      {
        id: "nvidia/nemotron-3.5-lightning:free",
        name: "NVIDIA Nemotron 3.5 Lightning (Free)",
        context_length: 8192,
        pricing: { prompt: "0", completion: "0" },
      },
      {
        id: "poolside/laguna-s-2.1:free",
        name: "Poolside Laguna S 2.1 (Free)",
        context_length: 16384,
        pricing: { prompt: "0", completion: "0" },
      },
    ].sort((a, b) => b.context_length - a.context_length);

    return NextResponse.json(fallbacks);
  }
}
