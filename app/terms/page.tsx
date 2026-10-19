"use client";

import React from "react";
import Link from "next/link";
import {
  FileText,
  AlertTriangle,
  Scale,
  ShieldAlert,
  Flame,
  ArrowLeft,
  Trophy,
  Cpu,
} from "lucide-react";
import { Footer } from "@/components/Footer";

export default function TermsOfServicePage() {
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
            <span className="text-[#f5efe6] font-bold">Terms of Service</span>
          </div>
        </div>

        <Link
          href="/leaderboard"
          className="px-3.5 py-1.5 text-xs font-semibold text-[#d4c3b3] hover:text-[#f5efe6] bg-[#1a1412] hover:bg-[#2b201a] border border-[#3d2c24] rounded-xl transition-colors flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#c85a32]"
        >
          <Trophy size={13} className="text-[#c85a32]" />
          <span>View Leaderboard</span>
        </Link>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12 space-y-12">
        {/* Title & Introduction */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#c85a32]/10 border border-[#c85a32]/30 text-[#c85a32] text-xs font-bold uppercase tracking-wider">
            <Scale size={13} />
            <span>Rules & Fair Play</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#f5efe6]">
            Terms of Service
          </h1>
          <p className="text-sm text-[#d4c3b3] leading-relaxed">
            Effective Date: October 19, 2026. Welcome to Swag-flow. By accessing or using our
            benchmarking arena, evaluation leaderboard, or API endpoints, you agree to comply with
            these Terms of Service.
          </p>
        </div>

        {/* 1. Purpose of the Platform */}
        <section className="space-y-4 border-t border-[#3d2c24] pt-8">
          <h2 className="text-xl font-bold text-[#f5efe6] flex items-center gap-2.5">
            <Cpu size={20} className="text-[#c85a32]" />
            <span>1. Purpose of the Platform</span>
          </h2>
          <p className="text-sm text-[#d4c3b3] leading-relaxed">
            Swag-flow provides an open, honest arena where users can issue one prompt, observe up to
            three AI models respond concurrently, and vote for the best response. Every model in this
            application is on a free tier. Real speed, token throughput, time-to-first-token, and
            community votes build our public leaderboard.
          </p>
        </section>

        {/* 2. AI Content Limitations & Disclaimers */}
        <section className="space-y-4 border-t border-[#3d2c24] pt-8">
          <h2 className="text-xl font-bold text-[#f5efe6] flex items-center gap-2.5">
            <AlertTriangle size={20} className="text-[#c85a32]" />
            <span>2. AI-Generated Content Disclaimer</span>
          </h2>
          <div className="p-4 rounded-xl bg-[#231a16] border border-[#3d2c24] space-y-3 text-xs text-[#d4c3b3] leading-relaxed">
            <p>
              <strong className="text-[#f5efe6]">Third-Party Generation:</strong> All model responses
              are generated dynamically by third-party artificial intelligence systems accessed via
              OpenRouter. Swag-flow does not author, edit, or curate model outputs.
            </p>
            <p>
              <strong className="text-[#f5efe6]">No Warranty of Accuracy:</strong> LLM outputs can
              hallucinate, produce errors, or present outdated information. You must not rely on AI
              outputs for medical, legal, financial, or critical engineering decisions without
              independent verification.
            </p>
            <p>
              <strong className="text-[#f5efe6]">No Endorsement:</strong> Swag-flow does not endorse the
              opinions, stances, or suggestions expressed by any evaluated model.
            </p>
          </div>
        </section>

        {/* 3. Acceptable Use Policy & Prohibited Prompts */}
        <section className="space-y-4 border-t border-[#3d2c24] pt-8">
          <h2 className="text-xl font-bold text-[#f5efe6] flex items-center gap-2.5">
            <ShieldAlert size={20} className="text-[#c85a32]" />
            <span>3. Acceptable Use & Prohibited Prompts</span>
          </h2>
          <p className="text-sm text-[#d4c3b3] leading-relaxed">
            You agree to use Swag-flow responsibly. You must not use the platform or submit prompts to:
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#d4c3b3]">
            <li className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              <strong className="text-[#f5efe6]">Malicious Exploits:</strong> Develop, test, or distribute
              malware, viruses, denial-of-service tools, or cyberattack payloads.
            </li>
            <li className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              <strong className="text-[#f5efe6]">Abuse & Harassment:</strong> Harass, stalk, defame, or
              threaten individuals or generate hate speech.
            </li>
            <li className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              <strong className="text-[#f5efe6]">System Attacks:</strong> Attempt prompt injection, jailbreaks,
              server denial-of-service, or bypassing Arcjet security rate limits.
            </li>
            <li className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              <strong className="text-[#f5efe6]">Unlawful Actions:</strong> Violate any applicable local,
              national, or international law or intellectual property rights.
            </li>
          </ul>
        </section>

        {/* 4. Voting Integrity & Fair Play */}
        <section className="space-y-4 border-t border-[#3d2c24] pt-8">
          <h2 className="text-xl font-bold text-[#f5efe6] flex items-center gap-2.5">
            <Trophy size={20} className="text-[#c85a32]" />
            <span>4. Benchmark Voting Integrity</span>
          </h2>
          <p className="text-sm text-[#d4c3b3] leading-relaxed">
            The Swag-flow leaderboard exists to provide the community with honest benchmarks. To preserve
            this integrity:
          </p>
          <div className="space-y-2 text-xs text-[#d4c3b3]">
            <div className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              You agree not to deploy automated scripts, bots, or coordinated voting rings to inflate or
              deflate any model’s win rate.
            </div>
            <div className="p-3.5 rounded-xl bg-[#231a16] border border-[#3d2c24]">
              Each user may cast exactly one vote per multi-model turn. Attempts to circumvent voting
              deduplication will result in vote disqualification and IP rate-limiting.
            </div>
          </div>
        </section>

        {/* 5. Intellectual Property */}
        <section className="space-y-4 border-t border-[#3d2c24] pt-8">
          <h2 className="text-xl font-bold text-[#f5efe6] flex items-center gap-2.5">
            <FileText size={20} className="text-[#c85a32]" />
            <span>5. Intellectual Property</span>
          </h2>
          <p className="text-sm text-[#d4c3b3] leading-relaxed">
            You retain all rights to the prompts you create and submit. Model-generated completions are
            subject to the open weights and API licensing terms of their respective creators (e.g. Meta
            Llama Community License, Apache 2.0). Swag-flow claims no proprietary ownership over model
            responses.
          </p>
        </section>

        {/* 6. Limitation of Liability */}
        <section className="space-y-4 border-t border-[#3d2c24] pt-8">
          <h2 className="text-xl font-bold text-[#f5efe6] flex items-center gap-2.5">
            <Scale size={20} className="text-[#c85a32]" />
            <span>6. Disclaimer of Warranties & Limitation of Liability</span>
          </h2>
          <p className="text-xs text-[#d4c3b3] leading-relaxed">
            SWAG-FLOW IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES
            OF ANY KIND, WHETHER EXPRESS OR IMPLIED. TO THE MAXIMUM EXTENT PERMITTED BY LAW, SWAG-FLOW
            SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING
            OUT OF YOUR USE OR INABILITY TO USE THE SERVICE.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
