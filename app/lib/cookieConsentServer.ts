import { NextRequest } from "next/server";

/**
 * Server-side helper to check if incoming request contains explicit analytics consent.
 * Evaluates the first-party `swag_flow_cookie_consent` cookie.
 */
export function hasServerAnalyticsConsent(req: NextRequest): boolean {
  try {
    const cookie = req.cookies.get("swag_flow_cookie_consent")?.value;
    if (!cookie) return false;
    const parsed = JSON.parse(decodeURIComponent(cookie));
    return Boolean(parsed.analytics);
  } catch {
    return false;
  }
}
