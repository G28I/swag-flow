import arcjet, {
  detectBot,
  shield,
  tokenBucket,
  slidingWindow,
  detectPromptInjection,
} from "@arcjet/next";
import { env } from "./env";

// Base rules shared across all endpoints
const sharedRules = [
  // Shield detects common attacks like SQL injection, XSS, etc.
  shield({
    mode: "LIVE",
  }),
  // Detect and block malicious/unauthorized bots
  detectBot({
    mode: "LIVE",
    // Allow search engines but block general scrapers/automated tools
    allow: ["CATEGORY:SEARCH_ENGINE"],
  }),
  // Rate limit configuration
  tokenBucket({
    mode: "LIVE",
    refillRate: 10, // refill 10 tokens per minute
    interval: "1m", // interval of 1 minute
    capacity: 15, // allow up to 15 tokens (each prompt uses 3 tokens for 3 models)
  }),
];

// Shared client without prompt injection (for stream route)
export const aj = arcjet({
  key: env.ARCJET_KEY,
  characteristics: ["userId"],
  rules: sharedRules,
});

// Prompt-specific client with prompt injection (for prompt route)
export const promptAj = arcjet({
  key: env.ARCJET_KEY,
  characteristics: ["userId"],
  rules: [
    ...sharedRules,
    detectPromptInjection({
      mode: "LIVE",
    }),
  ],
});

// Public read client for unauthenticated endpoints (shared thread retrieval, public lookups)
// Protects against database exhaustion, content scrapers, and malicious query injection
export const publicReadAj = arcjet({
  key: env.ARCJET_KEY,
  rules: [
    shield({
      mode: "LIVE",
    }),
    detectBot({
      mode: "LIVE",
      allow: ["CATEGORY:SEARCH_ENGINE"],
    }),
    slidingWindow({
      mode: "LIVE",
      interval: "1m",
      max: 60, // allow up to 60 reads per minute per client IP
    }),
  ],
});
