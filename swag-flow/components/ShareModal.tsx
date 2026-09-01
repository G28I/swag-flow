"use client";

import React, { useEffect, useState, useRef } from "react";
import { X, Copy, Check, Share2 } from "lucide-react";
import {
  copyToClipboard,
  generateShareUrls,
  getCanonicalShareUrl,
} from "@/app/lib/shareUtils";

export interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  url?: string;
  threadId?: string | null;
}

export function ShareModal({
  isOpen,
  onClose,
  title = "Swag-flow Arena",
  url,
  threadId,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [instagramFeedback, setInstagramFeedback] = useState(false);
  const copyButtonRef = useRef<HTMLButtonElement>(null);

  const canonicalUrl = url || getCanonicalShareUrl(threadId);
  const socialUrls = generateShareUrls(canonicalUrl, title);

  // Close on Escape key press & manage focus
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    setTimeout(() => {
      copyButtonRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    const success = await copyToClipboard(canonicalUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleInstagramShare = async () => {
    const success = await copyToClipboard(canonicalUrl);
    if (success) {
      setInstagramFeedback(true);
      setTimeout(() => setInstagramFeedback(false), 3500);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `Check out this AI model arena comparison on Swag-flow: "${title}"`,
          url: canonicalUrl,
        });
      } catch {
        // User cancelled or native share failed
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div
        className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden p-6 text-zinc-100 transition-all transform scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 id="share-modal-title" className="text-lg font-semibold text-zinc-100">
                Share Comparison
              </h2>
              <p className="text-xs text-zinc-400 truncate max-w-[260px]">{title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            aria-label="Close share dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Social Platforms Grid */}
        <div className="py-5">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Share via Social Media
          </p>
          <div className="grid grid-cols-3 gap-3">
            {/* WhatsApp */}
            <a
              href={socialUrls.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-800/60 hover:bg-emerald-500/10 border border-zinc-700/50 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-400 transition-all group"
              aria-label="Share on WhatsApp"
            >
              <div className="p-2 rounded-full bg-emerald-500/10 group-hover:bg-emerald-500/20 mb-1.5 transition-colors">
                <svg className="w-5 h-5 fill-[#25D366]" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.572-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.461c-1.926 0-3.71-.515-5.263-1.411l-.377-.218-3.916 1.027 1.045-3.816-.239-.382C2.33 15.5 1.636 13.526 1.638 11.455c.004-5.69 4.63-10.315 10.32-10.315 2.756 0 5.347 1.074 7.296 3.026 1.949 1.952 3.02 4.544 3.018 7.301-.004 5.692-4.63 10.317-10.221 10.317m0-19.387c-5.003 0-9.07 4.067-9.073 9.07-.002 1.599.416 3.161 1.211 4.537l.187.322-.72 2.63 2.693-.706.31.184c1.328.789 2.846 1.204 4.391 1.205h.004c5.002 0 9.07-4.067 9.073-9.07.001-2.426-.942-4.706-2.658-6.423-1.716-1.716-3.996-2.66-6.424-2.659" />
                </svg>
              </div>
              <span className="text-xs font-medium">WhatsApp</span>
            </a>

            {/* X / Twitter */}
            <a
              href={socialUrls.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-800/60 hover:bg-sky-500/10 border border-zinc-700/50 hover:border-sky-500/40 text-zinc-300 hover:text-sky-400 transition-all group"
              aria-label="Share on X"
            >
              <div className="p-2 rounded-full bg-sky-500/10 group-hover:bg-sky-500/20 mb-1.5 transition-colors">
                <svg className="w-5 h-5 fill-sky-400" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
              <span className="text-xs font-medium">X (Twitter)</span>
            </a>

            {/* Facebook */}
            <a
              href={socialUrls.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-800/60 hover:bg-blue-600/10 border border-zinc-700/50 hover:border-blue-600/40 text-zinc-300 hover:text-blue-500 transition-all group"
              aria-label="Share on Facebook"
            >
              <div className="p-2 rounded-full bg-blue-600/10 group-hover:bg-blue-600/20 mb-1.5 transition-colors">
                <svg className="w-5 h-5 fill-blue-500" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </div>
              <span className="text-xs font-medium">Facebook</span>
            </a>

            {/* LinkedIn */}
            <a
              href={socialUrls.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-800/60 hover:bg-blue-500/10 border border-zinc-700/50 hover:border-blue-500/40 text-zinc-300 hover:text-blue-400 transition-all group"
              aria-label="Share on LinkedIn"
            >
              <div className="p-2 rounded-full bg-blue-500/10 group-hover:bg-blue-500/20 mb-1.5 transition-colors">
                <svg className="w-5 h-5 fill-blue-400" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
              </div>
              <span className="text-xs font-medium">LinkedIn</span>
            </a>

            {/* Reddit */}
            <a
              href={socialUrls.reddit}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-800/60 hover:bg-orange-500/10 border border-zinc-700/50 hover:border-orange-500/40 text-zinc-300 hover:text-orange-400 transition-all group"
              aria-label="Share on Reddit"
            >
              <div className="p-2 rounded-full bg-orange-500/10 group-hover:bg-orange-500/20 mb-1.5 transition-colors">
                <svg className="w-5 h-5 fill-[#FF4500]" viewBox="0 0 24 24">
                  <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.196-.491.957 0 1.733.776 1.733 1.734 0 .684-.393 1.278-.96 1.569.015.176.024.354.024.533 0 2.707-3.218 4.901-7.186 4.901-3.968 0-7.186-2.194-7.186-4.901 0-.175.008-.35.022-.523a1.73 1.73 0 0 1-.98-1.578c0-.958.776-1.734 1.733-1.734.477 0 .907.193 1.22.506 1.2-.843 2.846-1.402 4.658-1.486l.951-4.462 3.251.687a1.246 1.246 0 0 1 1.249-.738zM9.544 14.18c-.688 0-1.25.561-1.25 1.25s.562 1.25 1.25 1.25 1.25-.561 1.25-1.25-.562-1.25-1.25-1.25zm4.912 0c-.688 0-1.25.561-1.25 1.25s.562 1.25 1.25 1.25 1.25-.561 1.25-1.25-.562-1.25-1.25-1.25zm-4.78 3.51a.346.346 0 0 0-.256.586c.866.867 2.278 1.157 3.58 1.157 1.302 0 2.714-.29 3.58-1.157a.347.347 0 0 0-.49-.49c-.7.7-1.896.953-3.09.953-1.194 0-2.39-.253-3.09-.953a.343.343 0 0 0-.234-.096z" />
                </svg>
              </div>
              <span className="text-xs font-medium">Reddit</span>
            </a>

            {/* Instagram */}
            <button
              onClick={handleInstagramShare}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-800/60 hover:bg-pink-500/10 border border-zinc-700/50 hover:border-pink-500/40 text-zinc-300 hover:text-pink-400 transition-all group"
              aria-label="Copy link for Instagram"
            >
              <div className="p-2 rounded-full bg-pink-500/10 group-hover:bg-pink-500/20 mb-1.5 transition-colors">
                <svg className="w-5 h-5 fill-pink-400" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </div>
              <span className="text-xs font-medium">Instagram</span>
            </button>
          </div>

          {/* Instagram Guide Feedback */}
          {instagramFeedback && (
            <div className="mt-3 p-2.5 rounded-lg bg-pink-500/10 border border-pink-500/30 text-pink-300 text-xs text-center animate-fadeIn">
              Link copied to clipboard! Paste directly into your Instagram Story or DM.
            </div>
          )}

          {/* Native OS Share Button if supported */}
          {typeof navigator !== "undefined" && Boolean(navigator.share) && (
            <button
              onClick={handleNativeShare}
              className="w-full mt-3 py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 text-xs font-medium text-zinc-300 hover:text-zinc-100 flex items-center justify-center space-x-2 transition-colors"
              aria-label="Open native device share menu"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>More Device Options</span>
            </button>
          )}
        </div>

        {/* Copy Direct Link Input Box */}
        <div className="pt-3 border-t border-zinc-800/80">
          <label htmlFor="share-link-input" className="block text-xs font-medium text-zinc-400 mb-1.5">
            Or Copy Link
          </label>
          <div className="flex items-center space-x-2">
            <input
              id="share-link-input"
              type="text"
              readOnly
              value={canonicalUrl}
              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 focus:outline-none focus:border-zinc-700 select-all"
            />
            <button
              ref={copyButtonRef}
              onClick={handleCopy}
              className={`px-4 py-2 text-xs font-medium rounded-xl flex items-center space-x-1.5 transition-all ${
                copied
                  ? "bg-emerald-600 text-white border border-emerald-500"
                  : "bg-blue-600 hover:bg-blue-500 text-white border border-blue-500"
              }`}
              aria-label={copied ? "Link copied" : "Copy link to clipboard"}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
