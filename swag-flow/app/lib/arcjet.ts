import arcjet, { detectBot, shield, tokenBucket, detectPromptInjection } from "@arcjet/next";
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
    refillRate: 10,  // refill 10 tokens per minute
    interval: "1m",  // interval of 1 minute
    capacity: 15,    // allow up to 15 tokens (each prompt uses 3 tokens for 3 models)
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
