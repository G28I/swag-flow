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
  metadata?: Record<string, any>
) {
  try {
    if (env.STATSIG_SECRET_KEY === "secret-placeholder") {
      console.log(`[Statsig Mock] Event Logged: "${eventName}" for User ID: "${userId}"`, metadata);
      return;
    }

    const client = await initStatsig();
    client.logEvent({ userID: userId }, eventName, null, metadata);
    await client.flush();
  } catch (err) {
    console.error("Failed to log event to Statsig:", err);
  }
}

export default statsig;
