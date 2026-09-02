/**
 * Helper utilities for production-grade canonical URL generation,
 * social media share deep-links, and fallback clipboard functionality.
 */

export interface SharePlatformUrls {
  whatsapp: string;
  twitter: string;
  facebook: string;
  linkedin: string;
  reddit: string;
}

/**
 * Returns a canonical public thread URL free of sensitive query params or anonymous tokens.
 */
export function getCanonicalShareUrl(threadId?: string | null): string {
  if (typeof window === "undefined") {
    return "https://swag-flow.com";
  }

  const origin = window.location.origin;
  if (threadId && typeof threadId === "string" && threadId.trim().length > 0) {
    return `${origin}/?thread=${encodeURIComponent(threadId.trim())}`;
  }

  // Fallback to current URL without query params if no explicit threadId
  const urlParams = new URLSearchParams(window.location.search);
  const currentThread = urlParams.get("thread");
  if (currentThread) {
    return `${origin}/?thread=${encodeURIComponent(currentThread)}`;
  }

  return origin;
}

/**
 * Generates properly URL-encoded social sharing deep-links.
 */
export function generateShareUrls(shareUrl: string, title?: string): SharePlatformUrls {
  const shareTitle = title || "Swag-flow AI Model Comparison";
  const shareText = `Check out this AI model arena comparison on Swag-flow: "${shareTitle}"`;

  return {
    whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
    reddit: `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareTitle)}`,
  };
}

/**
 * Reliable clipboard copy helper with fallback for non-HTTPS or legacy browser environments.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // Try modern Clipboard API first
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  // Fallback execCommand method
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}
