# Project: Swag-flow

## Overview
Swag-flow allows users to send one prompt, watch up to three AI models answer it simultaneously, and vote for the best one. Votes and real per-call metrics (speed, tokens, cost) power a public, honest leaderboard.

## Stack
- **Framework:** Next.js (App Router, React 19)
- **Language:** Strict TypeScript (no `any`)
- **Styling:** Tailwind CSS v4, custom coffee/dark brown palette with rust interactive accents
- **Database:** Prisma ORM with PostgreSQL
- **Authentication:** Clerk
- **Security & Protection:** Arcjet (rate limiting, bot detection, prompt injection shielding)
- **Analytics:** Statsig (server and client telemetry)
- **Testing:** Playwright E2E

## Design Constraints
- Primary background: Coffee / dark brown warm tones (`#1a1412` / `#231a16`).
- Interactive accent: Rust (`#c85a32` / `#d96b43`), reserved strictly for buttons, links, active states, and win bars.
- Semantic indicators: Green only for winner, red only for errors.
- WCAG AA contrast compliance across light and dark modes.

## Current Objective
Integrate all 20 production readiness and launch checklist features requested from the checklist image, organizing them into systematic GSD execution phases.
