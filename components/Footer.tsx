"use client";

import React from "react";
import Link from "next/link";
import { openCookiePreferencesModal } from "@/app/lib/cookieConsent";
import { Shield, FileText, Cookie, Flame } from "lucide-react";

export function Footer() {
  return (
    <footer className="w-full border-t border-[#3d2c24] bg-[#1a1412] text-[#d4c3b3] py-8 px-6 text-xs transition-colors">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand & Mission */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-[#c85a32] flex items-center justify-center text-white font-bold text-xs">
            <Flame size={14} aria-hidden="true" />
          </div>
          <span className="font-bold text-[#f5efe6] tracking-tight">Swag-flow</span>
          <span className="text-[#8c7a6e]">·</span>
          <span className="text-[#a8988a]">Concurrent LLM Benchmarking & Evaluation</span>
        </div>

        {/* Legal & Navigation Links */}
        <nav aria-label="Legal and Policy Navigation" className="flex flex-wrap items-center gap-6">
          <Link
            href="/privacy"
            className="hover:text-[#f5efe6] transition-colors flex items-center gap-1.5 focus:outline-none focus:text-[#c85a32]"
          >
            <Shield size={13} className="text-[#c85a32]" aria-hidden="true" />
            <span>Privacy Policy</span>
          </Link>
          <Link
            href="/terms"
            className="hover:text-[#f5efe6] transition-colors flex items-center gap-1.5 focus:outline-none focus:text-[#c85a32]"
          >
            <FileText size={13} className="text-[#c85a32]" aria-hidden="true" />
            <span>Terms of Service</span>
          </Link>
          <button
            type="button"
            onClick={openCookiePreferencesModal}
            className="hover:text-[#f5efe6] transition-colors flex items-center gap-1.5 cursor-pointer focus:outline-none focus:text-[#c85a32]"
            aria-label="Manage cookie and storage settings"
          >
            <Cookie size={13} className="text-[#c85a32]" aria-hidden="true" />
            <span>Cookie Settings</span>
          </button>
        </nav>

        {/* Free Tier Disclaimer */}
        <div className="text-[11px] text-[#8c7a6e] text-center md:text-right">
          Every model evaluated is 100% free-tier. Real speed & honest community votes.
        </div>
      </div>
    </footer>
  );
}
