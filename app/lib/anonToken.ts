"use client";

/**
 * Returns a persistent, unguessable anonymous ownership token from localStorage.
 * Used to cryptographically bind anonymous threads to the client browser session.
 */
export function getAnonToken(): string {
  if (typeof window === "undefined") return "";
  try {
    let token = localStorage.getItem("swag_flow_anon_token");
    if (!token) {
      token =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "anon_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem("swag_flow_anon_token", token);
    }
    return token;
  } catch {
    return "";
  }
}
