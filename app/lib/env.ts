const requiredEnvVars = [
  "DATABASE_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "OPENROUTER_API_KEY",
  "ARCJET_KEY",
  "STATSIG_SECRET_KEY",
] as const;

export function validateEnv() {
  const missing: string[] = [];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[FATAL] Missing required environment variables on startup: ${missing.join(", ")}. Please configure them in your .env file.`
    );
  }
}

// Run validation immediately on import to fail fast
validateEnv();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY!,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY!,
  ARCJET_KEY: process.env.ARCJET_KEY!,
  STATSIG_SECRET_KEY: process.env.STATSIG_SECRET_KEY!,
} as const;
