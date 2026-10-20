"use client";

import React, { useState, useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { Cookie, ShieldCheck, Settings2, X, Check, Lock } from "lucide-react";
import {
  setConsentPreferences,
  purgeOptionalStorage,
  OPEN_COOKIE_MODAL_EVENT,
} from "@/app/lib/cookieConsent";

function subscribeConsent(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("swag_flow_consent_updated", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("swag_flow_consent_updated", callback);
    window.removeEventListener("storage", callback);
  };
}

function getConsentSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage?.getItem("swag_flow_cookie_consent") ?? null;
  } catch {
    return null;
  }
}

function getServerConsentSnapshot(): string | null {
  return "ssr";
}

export function CookieConsentBanner() {
  const consentRaw = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getServerConsentSnapshot
  );

  const [dismissed, setDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Preference state inside modal: default denied (false) until explicitly consented
  const [functionalChecked, setFunctionalChecked] = useState(false);
  const [analyticsChecked, setAnalyticsChecked] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleOpenModal = () => {
      previousActiveElement.current = (document.activeElement as HTMLElement) || null;
      if (consentRaw && consentRaw !== "ssr") {
        try {
          const parsed = JSON.parse(consentRaw);
          setFunctionalChecked(Boolean(parsed.functional));
          setAnalyticsChecked(Boolean(parsed.analytics));
        } catch {
          setFunctionalChecked(false);
          setAnalyticsChecked(false);
        }
      } else {
        setFunctionalChecked(false);
        setAnalyticsChecked(false);
      }
      setShowModal(true);
    };

    window.addEventListener(OPEN_COOKIE_MODAL_EVENT, handleOpenModal);
    return () => {
      window.removeEventListener(OPEN_COOKIE_MODAL_EVENT, handleOpenModal);
    };
  }, [consentRaw]);

  // Focus trap and keyboard controls when modal is open
  useEffect(() => {
    if (!showModal) return;

    // Move initial focus into the dialog
    const focusTimer = setTimeout(() => {
      if (modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowModal(false);
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      // Restore focus to trigger asynchronously after modal unmounts
      const triggerEl = previousActiveElement.current;
      setTimeout(() => {
        triggerEl?.focus();
      }, 0);
    };
  }, [showModal]);

  const showBanner = consentRaw === null && !dismissed;

  const handleAcceptAll = () => {
    setConsentPreferences({ functional: true, analytics: true });
    setDismissed(true);
    setShowModal(false);
  };

  const handleRejectNonEssential = () => {
    setConsentPreferences({ functional: false, analytics: false });
    purgeOptionalStorage();
    setDismissed(true);
    setShowModal(false);
  };

  const handleSavePreferences = () => {
    setConsentPreferences({
      functional: functionalChecked,
      analytics: analyticsChecked,
    });
    if (!functionalChecked) {
      purgeOptionalStorage();
    }
    setDismissed(true);
    setShowModal(false);
  };

  if (consentRaw === "ssr") return null;

  return (
    <>
      {/* Floating Bottom Banner */}
      {showBanner && (
        <aside
          role="region"
          aria-label="Cookie and Privacy Consent"
          aria-hidden={showModal}
          className={`fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6 pointer-events-none transition-opacity duration-200 ${
            showModal ? "opacity-0 pointer-events-none" : ""
          }`}
        >
          <div className="max-w-4xl mx-auto bg-[#231a16] border border-[#3d2c24] text-[#f5efe6] rounded-2xl p-5 sm:p-6 shadow-2xl backdrop-blur-xl pointer-events-auto transition-all animate-in fade-in slide-from-bottom-5 duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-[#c85a32]/15 text-[#c85a32] shrink-0 mt-0.5">
                  <Cookie size={22} aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-[#f5efe6] flex items-center gap-2">
                    Cookie & Data Preferences
                    <span className="text-[10px] font-semibold bg-[#3d2c24] text-[#d4c3b3] px-2 py-0.5 rounded-full uppercase tracking-wider">
                      GDPR / Privacy
                    </span>
                  </h2>
                  <p className="text-xs text-[#d4c3b3] leading-relaxed max-w-2xl">
                    We use strictly necessary cookies for authentication and fair vote
                    benchmarking. With your consent, we also store local chat drafts and
                    collect privacy-first telemetry to measure model latency. Read our{" "}
                    <Link
                      href="/privacy"
                      className="text-[#c85a32] underline hover:text-[#d96b43] font-medium transition-colors"
                    >
                      Privacy Policy
                    </Link>{" "}
                    to learn more.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    previousActiveElement.current = e.currentTarget;
                    setShowModal(true);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-[#d4c3b3] bg-[#1a1412] hover:bg-[#2b201a] border border-[#3d2c24] rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#c85a32]"
                >
                  <Settings2 size={14} aria-hidden="true" />
                  <span>Customize</span>
                </button>
                <button
                  type="button"
                  onClick={handleRejectNonEssential}
                  className="px-3.5 py-2 text-xs font-semibold text-[#d4c3b3] bg-[#1a1412] hover:bg-[#2b201a] border border-[#3d2c24] rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#c85a32]"
                >
                  Reject Non-Essential
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#c85a32] hover:bg-[#d96b43] active:bg-[#b04d28] rounded-xl transition-colors shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#c85a32]"
                >
                  Accept All
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Preferences Modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cookie-preferences-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div
            ref={modalRef}
            className="w-full max-w-xl bg-[#231a16] border border-[#3d2c24] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#3d2c24]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#c85a32]/15 text-[#c85a32]">
                  <ShieldCheck size={20} aria-hidden="true" />
                </div>
                <div>
                  <h2
                    id="cookie-preferences-title"
                    className="text-base font-bold text-[#f5efe6]"
                  >
                    Cookie & Storage Settings
                  </h2>
                  <p className="text-xs text-[#d4c3b3]">
                    Manage how Swag-flow stores data in your browser.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-[#d4c3b3] hover:text-[#f5efe6] hover:bg-[#3d2c24]/50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#c85a32]"
                aria-label="Close cookie preferences"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Categories */}
            <div className="p-6 overflow-y-auto space-y-4">
              {/* Category 1: Strictly Necessary */}
              <div className="p-4 rounded-xl bg-[#1a1412] border border-[#3d2c24] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock size={16} className="text-[#c85a32]" aria-hidden="true" />
                    <span className="text-sm font-bold text-[#f5efe6]">
                      Strictly Necessary
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-[#c85a32] bg-[#c85a32]/10 border border-[#c85a32]/30 px-2.5 py-0.5 rounded-full">
                    Always Active
                  </span>
                </div>
                <p className="text-xs text-[#d4c3b3] leading-relaxed">
                  Required for core platform functionality, including Clerk authentication
                  sessions, your anonymous benchmark token (
                  <code className="text-[#f5efe6] bg-[#231a16] px-1 py-0.5 rounded">
                    swag_flow_anon_token
                  </code>
                  ) for fair vote deduplication, and saving your consent choices.
                </p>
              </div>

              {/* Category 2: Functional Storage */}
              <div className="p-4 rounded-xl bg-[#1a1412] border border-[#3d2c24] space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="toggle-functional-storage"
                    className="flex items-center gap-2 cursor-pointer flex-1 mr-4"
                  >
                    <Settings2 size={16} className="text-[#d4c3b3]" aria-hidden="true" />
                    <span id="functional-storage-label" className="text-sm font-bold text-[#f5efe6]">
                      Functional Storage (Local Drafts)
                    </span>
                  </label>
                  <label htmlFor="toggle-functional-storage" className="relative inline-flex items-center cursor-pointer">
                    <input
                      id="toggle-functional-storage"
                      type="checkbox"
                      aria-labelledby="functional-storage-label"
                      aria-label="Toggle Functional Storage (Local Drafts)"
                      checked={functionalChecked}
                      onChange={(e) => setFunctionalChecked(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-[#3d2c24] pointer-events-none peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#c85a32] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#c85a32]"></div>
                  </label>
                </div>
                <p className="text-xs text-[#d4c3b3] leading-relaxed">
                  Stores prompt drafts and multi-model thread histories in your browser’s local
                  storage so you don’t lose ongoing conversations when refreshing the arena.
                </p>
              </div>

              {/* Category 3: Analytics & Performance */}
              <div className="p-4 rounded-xl bg-[#1a1412] border border-[#3d2c24] space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="toggle-analytics-telemetry"
                    className="flex items-center gap-2 cursor-pointer flex-1 mr-4"
                  >
                    <Cookie size={16} className="text-[#d4c3b3]" aria-hidden="true" />
                    <span id="analytics-telemetry-label" className="text-sm font-bold text-[#f5efe6]">
                      Analytics & Performance Telemetry
                    </span>
                  </label>
                  <label htmlFor="toggle-analytics-telemetry" className="relative inline-flex items-center cursor-pointer">
                    <input
                      id="toggle-analytics-telemetry"
                      type="checkbox"
                      aria-labelledby="analytics-telemetry-label"
                      aria-label="Toggle Analytics & Performance Telemetry"
                      checked={analyticsChecked}
                      onChange={(e) => setAnalyticsChecked(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-[#3d2c24] pointer-events-none peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#c85a32] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#c85a32]"></div>
                  </label>
                </div>
                <p className="text-xs text-[#d4c3b3] leading-relaxed">
                  Helps us analyze model latency, stream drops, and voting engagement
                  metrics via Statsig. For signed-in users, events include your Clerk account identifier (userID);
                  for guest visitors, events use an unlinked anonymous session ID.
                  No personal profile details, passwords, or prompt contents are sent to Statsig.
                </p>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-[#3d2c24] bg-[#1a1412] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleRejectNonEssential}
                className="px-4 py-2 text-xs font-semibold text-[#d4c3b3] hover:text-[#f5efe6] bg-[#231a16] hover:bg-[#2b201a] border border-[#3d2c24] rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#c85a32]"
              >
                Reject All Non-Essential
              </button>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSavePreferences}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#c85a32] hover:bg-[#d96b43] rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#c85a32]"
                >
                  <Check size={14} aria-hidden="true" />
                  <span>Save Preferences</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
