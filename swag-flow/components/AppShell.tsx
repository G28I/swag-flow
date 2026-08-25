"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserButton, useUser, SignInButton, SignOutButton } from "@clerk/nextjs";
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
  Trash2,
  LogIn,
  LogOut,
  Search,
} from "lucide-react";

interface ThreadItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface AppShellProps {
  children: React.ReactNode;
  breadcrumb?: string;
}

export default function AppShell({ children, breadcrumb = "Arena" }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredThreads = threads.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Initialize theme from localStorage or document class
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const shouldBeDark = stored
      ? stored === "dark"
      : document.documentElement.classList.contains("dark");
    requestAnimationFrame(() => {
      setIsDarkMode(shouldBeDark);
      if (shouldBeDark) {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      } else {
        document.documentElement.classList.add("light");
        document.documentElement.classList.remove("dark");
      }
    });
  }, []);

  // Fetch threads from API when user is authenticated
  useEffect(() => {
    if (!isLoaded || !user) return;
    let cancelled = false;
    async function fetchThreads() {
      setIsLoadingThreads(true);
      try {
        const res = await fetch("/api/arena/threads");
        if (res.ok && !cancelled) {
          const data: ThreadItem[] = await res.json();
          setThreads(data);
        }
      } catch (err) {
        console.error("Failed to load threads:", err);
      } finally {
        if (!cancelled) setIsLoadingThreads(false);
      }
    }
    fetchThreads();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, user]);

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    localStorage.setItem("theme", nextDark ? "dark" : "light");
    if (nextDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  };

  const handleNewThread = async () => {
    if (!user) {
      router.push("/sign-in");
      return;
    }
    try {
      const res = await fetch("/api/arena/threads", { method: "POST" });
      if (res.ok) {
        const thread = await res.json();
        setThreads((prev) => [thread, ...prev]);
        router.push(`/?thread=${thread.id}`);
      }
    } catch (err) {
      console.error("Failed to create thread:", err);
    }
  };

  const handleDeleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(`/api/arena/threads?id=${threadId}`, { method: "DELETE" });
      if (res.ok) {
        setThreads((prev) => prev.filter((t) => t.id !== threadId));
        // If we're on the deleted thread, navigate home
        const params = new URLSearchParams(window.location.search);
        if (params.get("thread") === threadId) {
          router.push("/");
        }
      }
    } catch (err) {
      console.error("Failed to delete thread:", err);
    }
  };

  const navItems = [
    { name: "Arena", path: "/", icon: Layers },
    { name: "Leaderboard", path: "/leaderboard", icon: Trophy },
    { name: "Models", path: "/models", icon: Cpu },
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
              S
            </div>
            <span className="font-semibold text-lg tracking-tight font-sans">Swag-flow</span>
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
            <button
              onClick={handleNewThread}
              className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="New Thread"
            >
              <Plus size={16} />
            </button>
          </div>

          {user && threads.length > 0 && (
            <div className="relative mb-3 px-1">
              <Search
                size={13}
                className="absolute left-3.5 top-2.5 text-muted-foreground/60 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Seek prompts & threads..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-background/60 border border-border-custom/60 text-xs font-medium focus:outline-none focus:border-accent/40 placeholder-muted-foreground/60 transition-colors"
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
            {!isLoaded ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading…</div>
            ) : !user ? (
              <div className="px-3 py-6 text-center flex flex-col items-center gap-3 bg-muted/20 border border-border-custom/40 rounded-xl my-2">
                <MessageSquare size={22} className="text-muted-foreground/60" />
                <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                  Sign in to create, save, and access thread history.
                </p>
                <SignInButton mode="modal">
                  <button className="text-xs font-bold text-accent hover:underline cursor-pointer">
                    Sign In &rarr;
                  </button>
                </SignInButton>
              </div>
            ) : isLoadingThreads ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading…</div>
            ) : threads.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                No threads yet. Click + to start one.
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center italic">
                No matching prompts found.
              </div>
            ) : (
              filteredThreads.map((thread) => (
                <Link
                  key={thread.id}
                  href={`/?thread=${thread.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-foreground/80 hover:bg-muted/40 hover:text-foreground transition-all duration-150 group border border-transparent hover:border-border-custom/40"
                >
                  <MessageSquare size={16} className="text-muted-foreground shrink-0" />
                  <span className="truncate flex-1 font-medium">{thread.title}</span>
                  <button
                    onClick={(e) => handleDeleteThread(e, thread.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-all cursor-pointer"
                    title="Delete thread"
                  >
                    <Trash2 size={14} />
                  </button>
                  <ChevronRight
                    size={14}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity"
                  />
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Bottom User Area */}
        <div className="p-4 border-t border-border-custom bg-background/20 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {isLoaded && user ? (
              <>
                <UserButton />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold truncate leading-none mb-1">
                    {user.firstName || user.username || "User"}
                  </span>
                  <span className="text-xs text-muted-foreground truncate leading-none">
                    {user.primaryEmailAddress?.emailAddress}
                  </span>
                </div>
              </>
            ) : isLoaded ? (
              <SignInButton mode="modal">
                <button className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer shadow-sm">
                  <LogIn size={16} />
                  <span>Sign In</span>
                </button>
              </SignInButton>
            ) : (
              <div className="text-xs text-muted-foreground">Loading…</div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isLoaded && user && (
              <SignOutButton>
                <button
                  className="p-2 rounded-xl border border-border-custom hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors cursor-pointer"
                  title="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </SignOutButton>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-border-custom hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Toggle theme"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
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
              <span>Swag-flow</span>
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

        {/* Active Page Content Area */}
        <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
