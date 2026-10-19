# Requirements: Production Launch Checklist (20 Features)

The following 20 features from the production launch checklist must be systematically implemented and verified in Swag-flow:

### 1. Legal & Compliance
- **REQ-01: Privacy Policy (`/privacy`)**
  - Dedicated accessible page explaining data collection (Clerk user data, prompt contents, model evaluation votes).
  - Linked in footer and cookie banner.
- **REQ-02: Terms & Conditions (`/terms`)**
  - Rules for platform usage, acceptable use policy for AI prompting, intellectual property, disclaimer on AI outputs.
- **REQ-05: Cookie Consent Banner**
  - GDPR/ePrivacy compliant banner with accept/reject/customize controls.
  - Persisted consent in localStorage/cookies, gating non-essential analytics until accepted.

### 2. Security & Headers
- **REQ-03: Remove Frontend Secrets**
  - Strict audit of client bundle and `.env` references (`NEXT_PUBLIC_*`). Ensure API keys (OpenRouter, Clerk secret, Arcjet key, Postgres credentials, Statsig server secret) never leak to client JS.
- **REQ-04: Enforce HTTPS & Security Headers**
  - HTTP Strict Transport Security (HSTS), Content-Security-Policy (CSP), X-Frame-Options, X-Content-Type-Options, Referrer-Policy configured in `next.config.ts` / middleware.
- **REQ-18: Spam Protection**
  - Arcjet bot detection, IP rate limiting, and honeypot field protection on prompt submission and bug-report forms.

### 3. SEO, Metadata & Discoverability
- **REQ-06: Meta Titles & Descriptions**
  - Comprehensive OpenGraph and Twitter card metadata configured in `app/layout.tsx` and across all sub-routes (`/arena`, `/leaderboard`, `/models`, `/privacy`, `/terms`).
- **REQ-07: Social Preview Image**
  - Dynamic/static OpenGraph social share card (`public/og-image.png` or `app/opengraph-image.tsx`) with Swag-flow branding (coffee & rust theme).
- **REQ-08: Favicon & App Icons**
  - Brand-consistent favicon set: `favicon.ico`, `icon.svg`, `apple-icon.png`, and `manifest.webmanifest`.
- **REQ-09: Sitemap & Robots.txt**
  - Next.js dynamic metadata routes: `app/sitemap.ts` and `app/robots.ts` indexing public pages (`/`, `/arena`, `/leaderboard`, `/models`, `/privacy`, `/terms`).

### 4. Accessibility & UI Quality
- **REQ-10: Image Alt Text**
  - Audit all images, SVG icons, and user avatars to provide meaningful, accessible `alt` and `aria-label` tags.
- **REQ-13: Color Contrast Fixes**
  - Verify and enforce WCAG AA standard contrast ratio (minimum 4.5:1 for normal text, 3:1 for large text) across rust buttons, coffee surfaces, and leaderboard badges.
- **REQ-14: Mobile Responsiveness**
  - Flawless responsiveness across viewports (mobile 375px, tablet 768px, desktop 1280px+): collapsible sidebar, adaptive arena response columns, and scrollable leaderboard tables.
- **REQ-15: Custom 404 Page**
  - Styled `app/not-found.tsx` matching the rust/coffee design with direct navigation back to Arena, Leaderboard, and Models.
- **REQ-16: Broken Link Fixes**
  - Full audit of all internal and external anchors and router navigations across the application.
- **REQ-20: Single Clear Call-To-Action (CTA)**
  - Every page establishes a primary rust-accented CTA with visual hierarchy (e.g., "Start Comparing", "Cast Vote", "View Full Rankings").

### 5. Performance & Data Integrity
- **REQ-11: Image Compression & Optimization**
  - Next/Image optimization configuration with modern formats (AVIF/WebP), responsive `sizes`, and compression.
- **REQ-12: Page Load Speed Check & Optimization**
  - Bundle size optimization, dynamic imports for heavy components, font preloading, and caching headers.
- **REQ-17: Form Validation (Frontend & Backend)**
  - Zod schema validation for prompt submission, bug reports, and vote requests on both client and API route handlers.
- **REQ-19: Analytics Setup**
  - Privacy-first event telemetry (Statsig/PostHog), funnel tracking (prompt -> response -> vote), and Web Vitals tracking.
