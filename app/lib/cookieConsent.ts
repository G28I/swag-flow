/**
 * Cookie and Storage Consent Manager
 * Manages user preferences for strictly necessary, functional, and analytics storage.
 */

export interface ConsentPreferences {
  necessary: boolean; // Always true (Clerk auth, anonymous ownership token, consent state)
  functional: boolean; // Local draft and turn caching (arena_cache_*)
  analytics: boolean; // Statsig telemetry and performance tracking (/api/arena/telemetry)
  timestamp: string;
}

const CONSENT_STORAGE_KEY = "swag_flow_cookie_consent";
const CONSENT_EVENT_NAME = "swag_flow_consent_updated";
export const OPEN_COOKIE_MODAL_EVENT = "swag_flow_open_cookie_modal";

export const DEFAULT_PREFERENCES: ConsentPreferences = {
  necessary: true,
  functional: false,
  analytics: false,
  timestamp: new Date().toISOString(),
};

/**
 * Purges optional cached data (drafts, turn cache, anonymous thread lists)
 * while strictly preserving necessary tokens (swag_flow_anon_token, swag_flow_cookie_consent).
 */
export function purgeOptionalStorage(): void {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("arena_cache_") || key === "swag_flow_anon_threads")) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.error("Failed to purge optional storage:", err);
  }
}

/**
 * Retrieve saved consent preferences from localStorage or cookie.
 * Returns null if the user has not yet made an explicit choice.
 */
export function getConsentPreferences(): ConsentPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentPreferences>;
    if (typeof parsed.necessary !== "boolean") return null;

    return {
      necessary: true, // Invariant
      functional: Boolean(parsed.functional),
      analytics: Boolean(parsed.analytics),
      timestamp: parsed.timestamp || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Save user consent preferences to localStorage and sync cookie.
 * Automatically purges optional cached storage if functional consent is denied or withdrawn.
 */
export function setConsentPreferences(
  prefs: Omit<ConsentPreferences, "necessary" | "timestamp"> & { necessary?: boolean }
): void {
  if (typeof window === "undefined") return;

  const resolved: ConsentPreferences = {
    necessary: true,
    functional: Boolean(prefs.functional),
    analytics: Boolean(prefs.analytics),
    timestamp: new Date().toISOString(),
  };

  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(resolved));

    // If functional consent was denied or withdrawn, immediately purge optional data
    if (!resolved.functional) {
      purgeOptionalStorage();
    }

    // Also write a 1-year first-party cookie for SSR and security headers compatibility
    document.cookie = `${CONSENT_STORAGE_KEY}=${encodeURIComponent(
      JSON.stringify(resolved)
    )}; path=/; max-age=31536000; SameSite=Lax`;

    window.dispatchEvent(new CustomEvent(CONSENT_EVENT_NAME, { detail: resolved }));
  } catch (err) {
    console.error("Failed to persist cookie consent preferences:", err);
  }
}

/**
 * Quick check: has the user consented to analytics tracking?
 */
export function hasAnalyticsConsent(): boolean {
  const prefs = getConsentPreferences();
  return Boolean(prefs?.analytics);
}

/**
 * Quick check: has the user consented to functional storage caching?
 * Defaults to false (denied) until explicit consent is recorded.
 */
export function hasFunctionalConsent(): boolean {
  const prefs = getConsentPreferences();
  return Boolean(prefs?.functional);
}

/**
 * Trigger the consent customization modal from anywhere (e.g. footer, privacy page).
 */
export function openCookiePreferencesModal(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_COOKIE_MODAL_EVENT));
}
