"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  Menu,
  X,
  Trophy,
  Cpu,
  Layers,
  Plus,
  Moon,
  Sun,
  ChevronRight,
  MessageSquare,
} from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
  breadcrumb?: string;
}

export default function AppShell({ children, breadcrumb = "Arena" }: AppShellProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Initialize theme from document class
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    requestAnimationFrame(() => {
      setIsDarkMode(isDark);
    });
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  };

  const navItems = [
    { name: "Arena", path: "/", icon: Layers },
    { name: "Leaderboard", path: "/leaderboard", icon: Trophy },
    { name: "Models", path: "/models", icon: Cpu },
  ];

  const mockThreads = [
    { id: "1", title: "Sorting Algorithms Comparison" },
    { id: "2", title: "React vs Vue Frameworks" },
    { id: "3", title: "Creative Story writing" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground transition-colors duration-300">
      {/* Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-20 flex flex-col w-64 border-r border-border-custom bg-card-bg transition-transform duration-300 md:relative md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Title Logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border-custom bg-background/30">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center font-bold text-lg text-white shadow-md">
              A
            </div>
            <span className="font-semibold text-lg tracking-tight font-sans">LLM Arena</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg hover:bg-muted/50 text-foreground/80 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex flex-col gap-1 px-4 py-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.name}
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? "bg-accent text-white shadow-md shadow-accent/20"
                    : "hover:bg-muted/50 text-foreground/85 hover:text-foreground"
                }`}
              >
                <Icon size={18} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <hr className="border-border-custom mx-4" />

        {/* Your Threads List */}
        <div className="flex-1 flex flex-col min-h-0 px-4 py-6">
          <div className="flex items-center justify-between px-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Your Threads
            </span>
            <Link
              href="/"
              className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              title="New Thread"
            >
              <Plus size={16} />
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
            {mockThreads.map((thread) => (
              <Link
                key={thread.id}
                href={`/?thread=${thread.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-foreground/80 hover:bg-muted/40 hover:text-foreground transition-all duration-150 group border border-transparent hover:border-border-custom/40"
              >
                <MessageSquare size={16} className="text-muted-foreground shrink-0" />
                <span className="truncate flex-1 font-medium">{thread.title}</span>
                <ChevronRight
                  size={14}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity"
                />
              </Link>
            ))}
          </div>
        </div>

        {/* Bottom User Area */}
        <div className="p-4 border-t border-border-custom bg-background/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserButton />
            {user && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate leading-none mb-1">
                  {user.firstName || user.username || "User"}
                </span>
                <span className="text-xs text-muted-foreground truncate leading-none">
                  {user.primaryEmailAddress?.emailAddress}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-border-custom hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Toggle theme"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </aside>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Header Bar */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-border-custom bg-card-bg/40 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg hover:bg-muted/50 text-foreground/80 transition-colors"
              >
                <Menu size={20} />
              </button>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-semibold">
              <span>Arena</span>
              <span>/</span>
              <span className="text-foreground font-bold">{breadcrumb}</span>
            </div>
          </div>

          {/* Model win rates indicators */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-background/60 border border-border-custom px-3 py-1.5 rounded-full text-xs font-bold">
              <span className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center font-extrabold text-[10px]">
                G
              </span>
              <span className="text-muted-foreground font-semibold">0/2</span>
            </div>
            <div className="flex items-center gap-1.5 bg-background/60 border border-border-custom px-3 py-1.5 rounded-full text-xs font-bold">
              <span className="w-5 h-5 rounded-full bg-secondary text-white flex items-center justify-center font-extrabold text-[10px] border border-border-custom">
                N
              </span>
              <span className="text-muted-foreground font-semibold">0/2</span>
            </div>
            <div className="flex items-center gap-1.5 bg-background/60 border border-border-custom px-3 py-1.5 rounded-full text-xs font-bold">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-extrabold text-[10px]">
                L
              </span>
              <span className="text-muted-foreground font-semibold">1/2</span>
            </div>
          </div>
        </header>

        {/* Active Page Content Scroll Area */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
