import arcjet, {
  detectBot,
  shield,
  tokenBucket,
  slidingWindow,
  detectPromptInjection,
} from "@arcjet/next";
import { env } from "./env";

// Base rules shared across streaming endpoints
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
  // Rate limit configuration for multi-model stream evaluations (1 prompt = 3 model streams)
  tokenBucket({
    mode: "LIVE",
    refillRate: 30, // refill 30 tokens per minute (allows 10 multi-model evaluations/min)
    interval: "1m",
    capacity: 30, // allow burst of up to 30 tokens (10 3-model evaluations)
  }),
];

// Shared client without prompt injection (for stream route)
export const aj = arcjet({
  key: env.ARCJET_KEY,
  characteristics: ["userId"],
  rules: sharedRules,
});

// Dedicated client for user evaluation votes (independent bucket from prompt streaming)
export const voteAj = arcjet({
  key: env.ARCJET_KEY,
  characteristics: ["userId"],
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({ mode: "LIVE", allow: ["CATEGORY:SEARCH_ENGINE"] }),
    slidingWindow({
      mode: "LIVE",
      interval: "1m",
      max: 30, // allow up to 30 votes per minute per user/anon token
    }),
  ],
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
