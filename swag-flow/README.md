# ⚡ Swag-flow: Enterprise-Grade LLM Arena & Multi-Model Evaluation Platform

[![Next.js](https://img.shields.io/badge/Next.js-16.3.1-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.9-2D3748?logo=prisma)](https://www.prisma.io/)
[![Clerk Auth](https://img.shields.io/badge/Clerk-Authentication-6C47FF?logo=clerk)](https://clerk.com/)
[![Arcjet Security](https://img.shields.io/badge/Arcjet-Security_%26_Rate_Limiting-000000)](https://arcjet.com/)
[![Playwright](https://img.shields.io/badge/Playwright-E2E_Testing-45BA4B?logo=playwright)](https://playwright.dev/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Swag-flow** is a state-of-the-art, high-performance LLM evaluation platform and blind comparison arena built with Next.js 16 (Turbopack), React 19, and Prisma. It empowers developers and researchers to benchmark, stream, compare, and vote on large language model responses side-by-side in real time.

---

## 🌟 Key Features

### ⚔️ Blind Side-by-Side Model Arena

- **Multi-Model Parallel Streaming**: Compare up to 3 LLMs simultaneously with Server-Sent Events (SSE) streaming, real-time Time-To-First-Token (TTFT) metrics, throughput (tokens/sec), and token counts.
- **Model Catalog Integration**: Supports OpenRouter free and paid models including Gemini 2.0 Flash, Llama 3.3 70B Instruct, Qwen 2.5 Coder 32B, Minimax M3, and Nemotron 3.5.

### 🗳️ Blind A/B Voting & Elo Leaderboard

- **Anonymized Evaluation**: Model names and slots are hidden until a vote is cast or revealed.
- **Elo Rating Engine**: Calculates dynamic Elo ratings, win/loss rates, average latencies, and vote distributions across the global leaderboard.

### 🌿 Multi-Turn Threads & Conversation Branching

- **Thread Versioning & Forking**: Edit prompts at any turn and branch conversation histories using thread forking (`/api/arena/threads/fork`).
- **Single-Slot Regeneration**: Regenerate individual model slots without interrupting active sibling streams or corrupting turn history.

### 📦 Multi-Format Export Engine

- **Flexible Exporter**: Export full conversation threads or individual turn cards into styled **Markdown**, structured **JSON Payload**, or printable **PDF Document**.

### 🔗 Production-Grade Social Share Modal

- **Canonical Public Links**: Generates clean, token-scrubbed canonical URLs (`/?thread=<id>`).
- **1-Click Deep Links**: Native sharing links for **WhatsApp**, **X (Twitter)**, **Facebook**, **LinkedIn**, **Reddit**, and **Instagram**.
- **Web Share API**: Native OS device share sheet integration for mobile browsers with modern fallback clipboard management.

### 🛡️ Security & Enterprise Protection

- **Single-Prefix Anonymous Token System**: Enforces `anon_<token>` validation to prevent raw token impersonation or double-prefixing.
- **Arcjet Bot & Rate-Limiting**: Integrated `@arcjet/next` rate limiting, bot protection, and prompt-injection shielding.
- **Post-Authorization Cache Rendering**: Transcript caches are rendered only after server-side ownership confirmation, preventing IDOR data leaks.

---

## 🏗️ Tech Stack & Architecture

| Layer                     | Technologies                                                                                              |
| :------------------------ | :-------------------------------------------------------------------------------------------------------- |
| **Framework**             | [Next.js 16.3 (App Router)](https://nextjs.org/) + [React 19](https://react.dev/)                         |
| **Styling & UI**          | [Tailwind CSS v4](https://tailwindcss.com/) + [Lucide Icons](https://lucide.dev/) + React Markdown        |
| **Database & ORM**        | [PostgreSQL](https://www.postgresql.org/) + [Prisma ORM 7](https://www.prisma.io/) (`@prisma/adapter-pg`) |
| **Authentication**        | [Clerk Auth](https://clerk.com/) (`@clerk/nextjs`) + Anonymous Token Cookies                              |
| **Security & Guardrails** | [Arcjet](https://arcjet.com/) (`@arcjet/next`)                                                            |
| **Feature Flags**         | [Statsig](https://statsig.com/) (`statsig-node`)                                                          |
| **Testing**               | [Playwright E2E](https://playwright.dev/) + ESLint 9 + Prettier                                           |
| **Package Manager**       | `pnpm 10`                                                                                                 |

---

## 📁 Directory Structure

```text
swag-flow/
├── app/                        # Next.js App Router
│   ├── api/arena/              # Arena API Routes
│   │   ├── config/             # Environment & feature configuration
│   │   ├── leaderboard/        # Elo ratings & model leaderboards
│   │   ├── models/             # Live model catalog endpoint
│   │   ├── prompt/             # Prompt versioning & thread creation
│   │   ├── stream/             # SSE streaming proxy & retry engine
│   │   ├── telemetry/          # Telemetry & event tracking
│   │   ├── threads/            # Thread history, sync, and forking
│   │   └── vote/               # Voting & Elo calculation endpoint
│   ├── arena/                  # Arena stream hooks & evaluation logic
│   ├── leaderboard/            # Public Leaderboard Page
│   ├── lib/                    # Core utilities & server engines
│   │   ├── anonToken.ts        # Canonical token helper
│   │   ├── arcjet.ts           # Arcjet security configuration
│   │   ├── costEngine.ts       # Token cost & efficiency insights
│   │   ├── exportEngine.ts     # Multi-format report exporter
│   │   ├── retryEngine.ts      # Stream retry & backoff engine
│   │   └── shareUtils.ts       # Canonical URL & share deep-links
│   ├── models/                 # Models Catalog Page
│   └── page.tsx                # Main Arena Benchmarking Application
├── components/                 # React UI Components
│   ├── AppShell.tsx            # Application Layout & Navigation
│   ├── DiffViewer.tsx          # Model Response Diff Comparison
│   ├── ExportModal.tsx         # Report Exporter Modal
│   ├── HyperparameterDrawer.ts # Temperature & Top-P Controls
│   └── ShareModal.tsx          # Social Media Share Modal
├── e2e/                        # Playwright End-to-End Test Suite
│   ├── export.spec.ts          # Export Engine E2E Tests
│   ├── security-idor.spec.ts   # Security & IDOR Defense Tests
│   ├── shareModal.spec.ts      # Social Share Modal E2E Tests
│   └── voting-leaderboard.spec.ts # Voting & Leaderboard E2E Tests
├── prisma/                     # Database Schema & Migrations
│   └── schema.prisma           # Prisma Data Models
├── playwright.config.ts        # Playwright Test Runner Config
└── package.json                # Project Dependencies & Scripts
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v20.x` or later
- **pnpm**: `v10.x` or later (`npm i -g pnpm`)
- **PostgreSQL**: Local or hosted database instance (e.g. Supabase, Neon, Railway)

### 1. Installation

Clone the repository and install project dependencies:

```bash
git clone https://github.com/G28I/swag-flow.git
cd swag-flow/swag-flow
pnpm install
```

### 2. Environment Configuration

Create a `.env` file in the `swag-flow` directory and populate required environment variables:

```env
# Database Connection
DATABASE_URL="postgresql://user:password@localhost:5432/swagflow?sslmode=disable"

# OpenRouter API Key for LLM Inference
OPENROUTER_API_KEY="your-openrouter-api-key"

# Clerk Authentication Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# Arcjet Security Key (Optional in Dev)
ARCJET_KEY="ajkey_..."

# Statsig Feature Flag Key (Optional in Dev)
STATSIG_SERVER_SECRET="secret-..."
```

### 3. Database Migration

Initialize the PostgreSQL database schema with Prisma:

```bash
npx prisma db push
```

### 4. Running Development Server

Start the Next.js development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Code Quality

### Running End-to-End Tests

Swag-flow includes a comprehensive Playwright E2E test suite covering security defenses, streaming resilience, voting workflows, report export, and social sharing:

```bash
# Run all Playwright E2E tests
pnpm run test:e2e

# Run Playwright test runner in interactive UI mode
pnpm run test:e2e:ui

# Run specific security & IDOR test suite
pnpm exec playwright test e2e/security-idor.spec.ts
```

### Building for Production

To create an optimized production build:

```bash
pnpm run build
pnpm run start
```

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
