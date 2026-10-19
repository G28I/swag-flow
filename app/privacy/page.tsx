"use client";

import React from "react";
import Link from "next/link";
import {
  Shield,
  Lock,
  Database,
  Cpu,
  UserCheck,
  EyeOff,
  Cookie,
  ArrowLeft,
  Settings2,
  Trash2,
  Download,
  Flame,
} from "lucide-react";
import { openCookiePreferencesModal } from "@/app/lib/cookieConsent";
import { Footer } from "@/components/Footer";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#1a1412] text-[#f5efe6] flex flex-col selection:bg-[#c85a32] selection:text-white">
      {/* Top Header Bar */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-[#3d2c24] bg-[#231a16]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-xl border border-[#3d2c24] hover:bg-[#2b201a] text-[#d4c3b3] hover:text-[#f5efe6] transition-colors flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft size={14} />
            <span>Back to Arena</span>
          </Link>
          <div className="h-4 w-px bg-[#3d2c24]" />
          <div className="flex items-center gap-2 text-xs text-[#d4c3b3]">
            <Link href="/" className="hover:text-[#f5efe6] font-semibold flex items-center gap-1.5">
              <Flame size={14} className="text-[#c85a32]" />
              <span>Swag-flow</span>
            </Link>
            <span>/</span>
            <span className="text-[#f5efe6] font-bold">Privacy Policy</span>
          </div>
        </div>

        <button
          type="button"
          onClick={openCookiePreferencesModal}
          className="px-3.5 py-1.5 text-xs font-semibold text-[#d4c3b3] hover:text-[#f5efe6] bg-[#1a1412] hover:bg-[#2b201a] border border-[#3d2c24] rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#c85a32]"
        >
          <Settings2 size={13} className="text-[#c85a32]" />
          <span>Cookie Settings</span>
        </button>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12 space-y-12">
        {/* Title & Introduction */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#c85a32]/10 border border-[#c85a32]/30 text-[#c85a32] text-xs font-bold uppercase tracking-wider">
            <Shield size={13} />
            <span>Privacy & Data Transparency</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#f5efe6]">
            Privacy Policy
          </h1>
          <p className="text-sm text-[#d4c3b3] leading-relaxed">
            Last Updated: October 19, 2026. This policy explains exactly what data Swag-flow collects,
            how it is processed, where it is sent, and how you retain full control over your prompts,
            benchmarks, and identity.
          </p>
        </div>

        {/* 1. What Data We Collect */}
        <section className="space-y-4 border-t border-[#3d2c24] pt-8">
          <h2 className="text-xl font-bold text-[#f5efe6] flex items-center gap-2.5">
            <Database size={20} className="text-[#c85a32]" />
            <span>1. Information We Collect and Store</span>
          </h2>
          <p className="text-sm text-[#d4c3b3] leading-relaxed">
            We collect only the technical and user data required to facilitate side-by-side AI model
            comparisons, compute benchmark statistics, and prevent malicious spam:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-[#231a16] border border-[#3d2c24] space-y-2">
              <h3 className="text-xs font-bold text-[#f5efe6] uppercase tracking-wider flex items-center gap-1.5">
                <UserCheck size={14} className="text-[#c85a32]" />
                <span>Authentication & Identity</span>
              </h3>
              <p className="text-xs text-[#d4c3b3] leading-relaxed">
                When you sign in via Clerk, we store your Clerk user ID to link your threads and votes.
                If you use Swag-flow anonymously, an unguessable random UUID (
                <code className="text-[#f5efe6] bg-[#1a1412] px-1 py-0.5 rounded">
                  swag_flow_anon_token
                </code>
                ) is stored in your browser’s local storage to preserve ownership of your threads.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#231a16] border border-[#3d2c24] space-y-2">
              <h3 className="text-xs font-bold text-[#f5efe6] uppercase tracking-wider flex items-center gap-1.5">
                <Cpu size={14} className="text-[#c85a32]" />
                <span>Prompts & Model Responses</span>
              </h3>
              <p className="text-xs text-[#d4c3b3] leading-relaxed">
                Your submitted prompts, selected hyperparameters (temperature, top-P, system instructions),
                and the concurrent streamed responses from AI models are stored in our PostgreSQL database
                to maintain your conversation history.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#231a16] border border-[#3d2c24] space-y-2">
              <h3 className="text-xs font-bold text-[#f5efe6] uppercase tracking-wider flex items-center gap-1.5">
                <Lock size={14} className="text-[#c85a32]" />
                <span>Benchmark Votes & Telemetry</span>
              </h3>
              <p className="text-xs text-[#d4c3b3] leading-relaxed">
                When you vote for the best model response on a multi-model turn, we record a vote linking
                your user ID or anonymous token, the prompt, and the winning model. Votes are uniquely
                constrained per user per prompt to prevent ballot stuffing.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#231a16] border border-[#3d2c24] space-y-2">
              <h3 className="text-xs font-bold text-[#f5efe6] uppercase tracking-wider flex items-center gap-1.5">
                <EyeOff size={14} className="text-[#c85a32]" />
                <span>Bug Reports & Diagnostics</span>
              </h3>
              <p className="text-xs text-[#d4c3b3] leading-relaxed">
                If you voluntarily submit a bug report, we store the error category, your description,
                the current URL, and any screenshot image data you explicitly attach.
              </p>
            </div>
          </div>
        </section>

        {/* 2. Third-Party Service Providers */}
        <section className="space-y-4 border-t border-[#3d2c24] pt-8">
          <h2 className="text-xl font-bold text-[#f5efe6] flex items-center gap-2.5">
            <Cpu size={20} className="text-[#c85a32]" />
            <span>2. Third-Party Sub-Processors</span>
          </h2>
          <p className="text-sm text-[#d4c3b3] leading-relaxed">
            To provide concurrent streaming inference and security, we integrate with trusted third-party
            services:
          </p>
          <ul className="space-y-3 text-xs text-[#d4c3b3]">
            <li className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              <strong className="text-[#f5efe6]">OpenRouter:</strong> Forwards your prompt to the free-tier
              LLM providers you choose (e.g. Google Gemini, Meta Llama, DeepSeek, Mistral). Prompts are
              subject to OpenRouter’s privacy terms and the respective model creators’ policies.
            </li>
            <li className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              <strong className="text-[#f5efe6]">Clerk:</strong> Manages authentication, OAuth accounts,
              and secure session tokens.
            </li>
            <li className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              <strong className="text-[#f5efe6]">Arcjet:</strong> Inspects incoming IP addresses and request
              headers to protect the platform against automated DDoS attacks, bot scrapers, and prompt
              injection attacks.
            </li>
            <li className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              <strong className="text-[#f5efe6]">Statsig:</strong> Anonymized event telemetry (if enabled)
              measuring response completion, token counts, and latency metrics without personal tracking.
            </li>
          </ul>
        </section>

        {/* 3. Cookies and Local Storage */}
        <section className="space-y-4 border-t border-[#3d2c24] pt-8">
          <h2 className="text-xl font-bold text-[#f5efe6] flex items-center gap-2.5">
            <Cookie size={20} className="text-[#c85a32]" />
            <span>3. Cookies & Local Storage</span>
          </h2>
          <p className="text-sm text-[#d4c3b3] leading-relaxed">
            We use both cookies and browser local storage with clear boundaries:
          </p>
          <div className="space-y-3 text-xs text-[#d4c3b3]">
            <div className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              <strong className="text-[#f5efe6]">Strictly Necessary:</strong> Clerk authentication cookies
              and the anonymous benchmark ownership token (
              <code className="text-[#f5efe6] bg-[#1a1412] px-1 py-0.5 rounded">
                swag_flow_anon_token
              </code>
              ). These are required for the application to function.
            </div>
            <div className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              <strong className="text-[#f5efe6]">Functional Storage:</strong> Cached active turns (
              <code className="text-[#f5efe6] bg-[#1a1412] px-1 py-0.5 rounded">
                arena_cache_*
              </code>
              ) and recent thread lists (
              <code className="text-[#f5efe6] bg-[#1a1412] px-1 py-0.5 rounded">
                swag_flow_anon_threads
              </code>
              ) saved locally so you do not lose work during page refreshes.
            </div>
            <div className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              <strong className="text-[#f5efe6]">Analytics Telemetry:</strong> Anonymized stream performance
              events sent to <code className="text-[#f5efe6] bg-[#1a1412] px-1 py-0.5 rounded">/api/arena/telemetry</code>.
              These are blocked entirely unless you provide explicit consent.
            </div>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={openCookiePreferencesModal}
              className="px-4 py-2 text-xs font-bold text-white bg-[#c85a32] hover:bg-[#d96b43] rounded-xl transition-colors cursor-pointer inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#c85a32]"
            >
              <Settings2 size={14} />
              <span>Modify Cookie Preferences</span>
            </button>
          </div>
        </section>

        {/* 4. Data Retention, Portability & Deletion */}
        <section className="space-y-4 border-t border-[#3d2c24] pt-8">
          <h2 className="text-xl font-bold text-[#f5efe6] flex items-center gap-2.5">
            <Trash2 size={20} className="text-[#c85a32]" />
            <span>4. Data Retention, Export & Deletion</span>
          </h2>
          <p className="text-sm text-[#d4c3b3] leading-relaxed">
            You retain absolute sovereignty over your content:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#d4c3b3]">
            <div className="p-4 rounded-xl bg-[#231a16] border border-[#3d2c24] space-y-2">
              <h3 className="font-bold text-[#f5efe6] flex items-center gap-1.5">
                <Trash2 size={14} className="text-[#c85a32]" />
                <span>Thread Deletion</span>
              </h3>
              <p className="leading-relaxed">
                Deleting any thread in the sidebar permanently removes the thread, all associated
                prompt messages, model output tokens, and turns from our database.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#231a16] border border-[#3d2c24] space-y-2">
              <h3 className="font-bold text-[#f5efe6] flex items-center gap-1.5">
                <Download size={14} className="text-[#c85a32]" />
                <span>Data Export Portability</span>
              </h3>
              <p className="leading-relaxed">
                You can export complete conversation histories and benchmark turns at any time as JSON,
                Markdown, or PDF using the built-in Export feature.
              </p>
            </div>
          </div>
        </section>

        {/* 5. Contact & Privacy Requests */}
        <section className="space-y-4 border-t border-[#3d2c24] pt-8">
          <h2 className="text-xl font-bold text-[#f5efe6]">5. Contact & Data Subject Rights</h2>
          <p className="text-sm text-[#d4c3b3] leading-relaxed">
            Under GDPR, CCPA, and applicable data privacy frameworks, you have the right to request access
            to, correction of, or permanent deletion of any personal data associated with your account.
            To exercise your rights or ask questions, please file a ticket via our in-app Bug Report tool
            or contact us through our official GitHub repository.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
