# Coding Standards & Codebase Conventions

This guide documents the development standards, patterns, and conventions applied in the LLM Arena codebase.

---

## 1. TypeScript Conventions

- **Strict Mode**: Ensure TypeScript strict mode options remain active in `tsconfig.json`.
- **Explicit Types**: Avoid implicit `any`. Use strict types, interfaces, or type aliases for domain entities (such as model stream state).
- **Function Returns**: Explicitly define return types on helper utilities and API endpoints (e.g., `NextResponse<Type>` or `Response`).

---

## 2. Next.js & React 19

- **Component Boundaries**:
  - Restrict `"use client"` statements to leaf components requiring interactive state or browser hook context (such as the prompt textarea or comparison panels).
  - Use Server Components by default for pages, layouts, and API handlers.
- **Route Structure**: Keep route logic clean. Isolate business logic or third-party client initialization into reusable singleton libraries inside `app/lib/`.

---

## 3. Database (Prisma 7 & Postgres)

- **Connection Singleton**: To prevent exhausting connection limits in Next.js development mode, always initialize `PrismaClient` as a global singleton via [`app/lib/prisma.ts`](file:///c:/Users/ramak/OneDrive/Desktop/Swag-flow/swag-flow/app/lib/prisma.ts).
- **Driver Adapter**: Direct PostgreSQL connections require the `@prisma/adapter-pg` driver. Pass the adapter instance into the `PrismaClient` constructor:
  ```typescript
  import { PrismaClient } from "@prisma/client";
  import { PrismaPg } from "@prisma/adapter-pg";
  import { Pool } from "pg";

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  ```
- **Configuration**: Prisma 7 uses [`prisma.config.ts`](file:///c:/Users/ramak/OneDrive/Desktop/Swag-flow/swag-flow/prisma.config.ts) for environment database mapping. Never define the connection `url` property inside the schema datasource block.

---

## 4. Security (Arcjet Protection)

- **Client Segregation (Twin Client Pattern)**: If an Arcjet guard rule requires a dynamic parameter at runtime (like `detectPromptInjectionMessage`), TypeScript typings make it mandatory. In routes where this parameter is absent, use a segregated client instance without the rule to prevent compilation issues:
  - `promptAj` (Baseline + Prompt Injection): Used for prompt parsing in `/api/arena/prompt`.
  - `aj` (Baseline Shield/Rate Limiting/Bot Detection): Used for streaming in `/api/arena/stream`.
- **Denial Handling**: Gracefully handle security denials. Return a `400 Bad Request` containing a clear error message (e.g., `"Security warning: Prompt injection pattern detected. Please rephrase."`) so the frontend can alert the user.

---

## 5. Analytics (Statsig Integration)

- **Lazy Initialization**: Initialize the Statsig SDK using a lazy singleton pattern. This avoids runtime exceptions in development environments when API keys are empty or mock values.
- **Serverless Event Flushing**: Since serverless route handlers terminate execution rapidly, custom logged events can get lost before being sent. Always await `statsig.flush()` to force transmission before returning HTTP responses:
  ```typescript
  statsig.logEvent({ user: { userID: userId }, eventName: "prompt_created" });
  await statsig.flush();
  ```

---

## 6. Code Formatting & Linting

- **Prettier**: Keep formatting standardized. Run `pnpm run format` to auto-format files.
- **Pre-commit Hook**: Git commits will trigger ESLint and Prettier checks automatically via `husky` and `lint-staged`. Verify code compiles and formatting holds before pushing.
