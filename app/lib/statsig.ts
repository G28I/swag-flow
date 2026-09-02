import statsig from "statsig-node";
import { env } from "./env";

let isInitialized = false;

// Initialize Statsig once per server instance lifecycle
export async function initStatsig() {
  if (isInitialized) return statsig;

  const secretKey = env.STATSIG_SECRET_KEY;
  if (secretKey === "secret-placeholder") {
    console.warn("[Statsig] Using placeholder secret key. Real initialization skipped.");
    isInitialized = true;
    return statsig;
  }

  await statsig.initialize(secretKey);
  isInitialized = true;
  return statsig;
}

// Log a custom event and flush it immediately for serverless compatibility
export async function logStatsigEvent(
  userId: string,
  eventName: string,
  metadata?: Record<string, string | number | boolean | null | undefined>
) {
  try {
    if (env.STATSIG_SECRET_KEY === "secret-placeholder") {
      console.log(`[Statsig Mock] Event Logged: "${eventName}" for User ID: "${userId}"`, metadata);
      return;
    }

    const client = await initStatsig();
    client.logEvent({ userID: userId }, eventName, null, metadata as Record<string, string>);
    await client.flush();
  } catch (err) {
    console.error("Failed to log event to Statsig:", err);
  }
}

// Evaluate a Statsig Feature Gate for a user
export async function checkFeatureGate(
  userId: string,
  gateName: string,
  defaultValue = false
): Promise<boolean> {
  try {
    if (env.STATSIG_SECRET_KEY === "secret-placeholder") {
      // Mock feature gates defaults for local development
      const mockGates: Record<string, boolean> = {
        arena_3_model_mode: true,
        leaderboard_personal_tab: true,
        show_performance_metrics: true,
      };
      return mockGates[gateName] ?? defaultValue;
    }

    const client = await initStatsig();
    return await client.checkGate({ userID: userId }, gateName);
  } catch (err) {
    console.error(`Failed to check Statsig gate "${gateName}":`, err);
    return defaultValue;
  }
}

// Evaluate a Statsig Dynamic Config for a user
export async function getDynamicConfig<T extends Record<string, unknown>>(
  userId: string,
  configName: string,
  fallbackValue: T
): Promise<T> {
  try {
    if (env.STATSIG_SECRET_KEY === "secret-placeholder") {
      return fallbackValue;
    }

    const client = await initStatsig();
    const config = await client.getConfig({ userID: userId }, configName);
    return (config.value as T) || fallbackValue;
  } catch (err) {
    console.error(`Failed to fetch Statsig config "${configName}":`, err);
    return fallbackValue;
  }
}

export default statsig;
