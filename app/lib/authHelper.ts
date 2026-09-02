/**
 * Server-safe authorization helpers for anonymous token normalization and thread ownership checks.
 */

export function normalizeAnonToken(rawToken?: string | null): string {
  if (!rawToken || typeof rawToken !== "string") return "";
  const trimmed = rawToken.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("anon_") ? trimmed : `anon_${trimmed}`;
}

export function getEffectiveOwnerId(
  userId?: string | null,
  anonToken?: string | null
): string {
  if (userId) return userId;
  const normalized = normalizeAnonToken(anonToken);
  if (normalized) return normalized;
  return "";
}

export function isThreadOwner(
  threadUserId: string,
  userId?: string | null,
  anonToken?: string | null
): boolean {
  if (!threadUserId) return false;

  // 1. Authenticated user match
  if (userId && threadUserId === userId) {
    return true;
  }

  // 2. Anonymous token match
  const normalizedAnon = normalizeAnonToken(anonToken);
  if (
    normalizedAnon &&
    threadUserId.startsWith("anon_") &&
    threadUserId === normalizedAnon
  ) {
    return true;
  }

  // 3. Development environment fallback exception
  if (process.env.NODE_ENV === "development" && threadUserId === "mock_user_123") {
    return true;
  }

  return false;
}
