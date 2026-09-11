# Next.js MCP audit — September 11, 2026

**Status: fixes integrated into the active checkout and verified.** See the final validation section below. The original observations are retained as historical evidence.

Audited `apps/admin` on Next.js 16.3.1 using the Next DevTools MCP, a real browser, direct local HTTP requests, TypeScript, and a production build. The Next.js development server was started at `http://localhost:3000`. The Astro marketing site is a separate application.

The workspace changed concurrently throughout this audit, especially analytics and CSP code. Results below distinguish observed failures that subsequently disappeared from remaining findings. This is not certification of authenticated workflows or production performance. A "Fixes implemented" section at the end records the changes made in response to these findings and the verification that ran against them.

## MCP coverage

| Capability | Result |
| --- | --- |
| Server discovery and project metadata | Connected to the admin app on port 3000; verified its project directory. |
| Route inventory | 131 App Router routes, including API and dynamic routes. |
| Project-wide compilation issues | Repeated full module-graph scans returned `issues: []`. |
| On-demand route compilation | `/login` and `/analytics` compiled with no issues. This compiles code without executing business operations. |
| Browser error diagnostics | Initially caught a telemetry module-resolution error; after concurrent fixes and reload, config and session error lists were empty. |
| Page metadata | Verified root layout, login page, application/global error boundaries, and the built-in not-found boundary. |
| Development logs | Read `.next/dev/logs/next-development.log`; observed an auth connection error. |
| Request insights | Temporarily enabled `experimental.requestInsights` for development and collected request/render/proxy spans and HTTP statuses. A concurrent config edit subsequently removed the flag. |
| Server Action lookup | Not applicable: final build manifest contained zero Node and zero Edge Server Actions. No fabricated action ID was passed. |
| Versioned documentation | Read the bundled MCP and production-checklist guides for installed Next.js 16.3.1. |
| Browser tooling | MCP's browser helper reported that agent-browser was absent. Used the already-available Codex browser instead of installing another browser tool. |

MCP does not provide a blanket accessibility, security, bundle-size, or Core Web Vitals certification. Compilation success also does not establish that database-backed operations work.

## Original findings (resolved below)

### 1. High: the root translation gate suppresses server-rendered page content

Evidence: `apps/admin/src/app/providers.tsx:21` initializes `readyKey` to null; lines 40–55 substitute a full-screen skeleton until an effect loads translation namespaces. The final production `/login` HTML was 10,381 bytes, contained the busy skeleton, and contained no email input. The browser eventually rendered the form after hydration and translation loading.

Impact: public pages depend on JavaScript and a translation request before their meaningful content appears. Moving between different namespace sets also removes the shared page subtree while translations load, even when the next namespace may already be cached.

Recommendation: supply the initial locale and required namespaces during server rendering, initialize the provider as ready when those resources exist, and keep the shared shell mounted during route translation loading. Use scoped loading boundaries for remaining work. Validate first content and navigation behavior in a production build.

### 2. Medium: legal links target the admin origin instead of the Astro site

Evidence: both `/terms` and `/privacy` rendered the Next.js 404 page. `apps/admin/src/components/replacement-onboarding-shell.tsx:79` and `:81`, and `auth-card.tsx:91` and `:93`, use relative links. The actual pages exist in `apps/landing/src/pages/terms.astro` and `privacy.astro`, with French equivalents.

Recommendation: resolve these links against the configured marketing origin and active locale. The legal documents already exist; creating duplicate Next.js pages is unnecessary.

### 3. Medium: French pages retain an English document language

Evidence: `/login?lng=fr` visibly rendered French labels, while browser inspection returned `document.documentElement.lang === "en"`. `apps/admin/app/layout.tsx:13` hardcodes English, and no document-language synchronization was found.

Impact: assistive technologies receive the wrong pronunciation/language metadata.

Recommendation: render the correct initial document language and update it when the active locale changes. Verify both initial navigation and in-app locale changes.

### 4. Medium: dashboard summaries retrieve raw history to compute aggregates

Static evidence: `apps/admin/app/api/dashboard/route.ts:42–55` performs 13 sequential selects before an additional follow-up query. Lines 48–49 retrieve call rows for two periods to calculate averages in JavaScript. Line 52 retrieves roughly a year of call timestamps; lines 64–72 scan them once per month.

Impact: transferred rows and application work grow with call volume, although the response needs a small set of aggregate values.

Recommendation: consolidate period counts with conditional SQL aggregates and compute duration averages and monthly buckets in PostgreSQL. Preserve operator transaction/RLS context and existing duration semantics. Do not assume `Promise.all` makes queries on a single transaction connection parallel. Measure with representative data; authenticated runtime timings were unavailable here.

### 5. Low: public pages request an authenticated locale preference

Evidence: `apps/admin/src/components/replacement-locale-provider.tsx:43` unconditionally fetches `/api/preferences/locale`. MCP request insights recorded 401 responses on public pages. Multiple requests occurred during development, where Strict Mode can repeat effect execution.

Recommendation: load account preferences only when an authenticated session exists; use browser/default locale for visitors. Share/deduplicate the preference query instead of creating a raw fetch at the global root. The 401 itself is expected authorization behavior, not an auth bypass.

### 6. Low: lint is only a typecheck

Evidence: `apps/admin/package.json:11` maps `lint` to `tsc --noEmit`.

Impact: running this command does not evaluate React Hooks rules, Next.js lint rules, or JSX accessibility rules.

Recommendation: add an actual ESLint configuration and keep typechecking separate. Scope new rules deliberately rather than creating a large unrelated formatting change.

### 7. Low: proxy work applies to ordinary static public assets

Evidence: request insights recorded proxy spans for `/locales/en/auth.json`, `/locales/en/onboarding.json`, and `/brand/logo-icon.svg`. The matcher in `apps/admin/proxy.ts` excludes Next static/image paths and favicon, but includes these assets.

Recommendation: consider explicit exclusions for ordinary public assets while preserving required headers in Next config. Keep API, widget and application-route handling intact. Observed proxy time was small locally, so this is a lower priority than the translation gate and database aggregation.

### 8. Compatibility concern: embed responses carry conflicting framing signals

Evidence: both `/embed/audit-invalid-key` and `/embed.js` returned `X-Frame-Options: DENY` alongside CSP `frame-ancestors *`. Proxy deletes its X-Frame-Options value for embed paths, but `next.config.ts` independently adds DENY globally.

Recommendation: consolidate header ownership or exclude iframe document routes from the global DENY header. This was a header-level observation; no successful widget session was available to test full cross-origin embedding. Do not interpret it as proof that modern CSP-capable browsers block the iframe, since CSP frame-ancestors takes precedence in those browsers.

## Environment and transient failures

- `/api/health/live` returned 200; `/api/health/ready` returned 503.
- A request to the auth catch-all route returned 500, and the development log recorded `Error: Connection is closed.`
- Loaded database URLs point to local port 15433; Redis points to local port 16380. Docker could not connect to its daemon. Plain `docker compose ps` also reported missing required password variables. No production service was modified and no database was reset or seeded.
- Anonymous browser navigation to `/analytics` ended at `/login`, as expected. Raw HTML requests to protected pages returned streamed 200 responses; these statuses alone are not evidence of exposed dashboard data.
- During concurrent analytics edits, MCP caught `packages/telemetry/src/browser.ts` failing to resolve `./index.js`. A browser alias was subsequently added by the concurrent work; later scans and builds passed.
- The first production build and typecheck failed because `product-analytics.test.tsx` imported a removed `sanitizeAnalyticsUrl` export. The concurrent test update resolved this; final typecheck and production build passed.

## Validation and limits

- Final admin TypeScript check: passed.
- Final admin production build: passed compilation, typechecking and generation of all 32 static-generation tasks.
- Final MCP project compilation scan: no issues. Final browser error check: no config or session errors in connected pages.
- Browser checks: English login, French login, signup, forgot-password, invalid demo entry, Terms/Privacy 404s, and anonymous dashboard redirect. No forms that send emails, create accounts, or initiate calls were submitted by this audit.
- HTTP checks also covered reset-password, accept-invite, verify-email, confirm-email-change, claim-demo, several protected pages, onboarding/business, invalid widget key, loader, and health endpoints.
- Representative warm development HTTP times: login 46 ms, signup 21 ms, forgot-password 25 ms. MCP recorded a cold login request around 1.54 seconds and a later warm handler around 19 ms. These are development observations with compilation/cache effects, not production Core Web Vitals or user-facing latency guarantees.
- Production HTML inspection independently confirmed the translation-gate finding.
- Existing chart components already use `next/dynamic`; layouts use awaited Next.js request APIs; application and global error boundaries are present. These were positive findings.
- Authenticated dashboard functionality, real widget conversations, production browser performance, and data-dependent timings remain unverified because local backing services and an authenticated session were unavailable.
- A broad test-suite run was not performed. No PR was opened. The audit deliverable is this report; concurrent source changes are not attributed to this audit.

Next practical steps: restore the local database/Redis environment and sign in for authenticated MCP request traces; address the root translation gate, marketing links, and document language; then measure a production browser run and optimize dashboard aggregates with realistic data.

## Final fixes and validation

The saved fix commit was reviewed and applied to the active `feature/nextjs-platform-port` checkout, preserving its existing analytics/CSP edits. This supersedes the temporary-copy verification and blockers recorded earlier.

### Implemented changes

1. **Server rendering:** the root layout resolves locale headers and provides route translation resources to an isolated i18next instance. The page content renders immediately; client navigation uses a small progress/error indicator without unmounting the page. Resource additions notify translated components. Authentication routes include the onboarding namespace used by their shared footer.
2. **Legal links:** authentication and onboarding links use the existing marketing URL helper, including `/fr/terms/` and `/fr/privacy/`.
3. **Locale consistency:** the server sets the document language, the client updates it on changes, and a cookie persists the selection. Explicit query selections override old browser storage. Malformed locale cookies fall back safely instead of throwing.
4. **Dashboard aggregation:** `packages/db/src/dashboard-aggregates.ts` calculates counts, duration averages and monthly buckets in PostgreSQL in one statement, rather than returning raw call history. The existing operator transaction/RLS context remains intact. Recent-call and other bounded lists remain separate.
5. **Public preferences:** public routes do not query sessions or account locale preferences. Protected routes use a deduplicated React Query preference read after checking the session.
6. **Lint:** admin now runs ESLint with TypeScript, core Hooks, Next.js and JSX accessibility rules. Current result: zero errors and 20 warnings. Existing autofocus patterns and compiler migration rules are not broadly refactored; narrow exceptions cover the forwarding label primitive and live WebRTC audio. Accessible labels were added where composed links needed them.
7. **Proxy scope:** exclusions are limited to known public asset paths. Application/API URLs ending in `.svg` or `.txt` still receive proxy checks; regression tests verify matching and CSRF rejection.
8. **Framing headers:** shared header helpers define regular and embeddable responses, removing global DENY from widget documents. Production iframe rendering was verified on a different localhost origin.

The production check found and fixed an additional regression in the saved patch: `/embed/[key]` retained `generateStaticParams()` while the root layout now reads headers. It is explicitly dynamic, preventing a production-only `DYNAMIC_SERVER_USAGE` 500.

### Checks completed

- Full workspace `pnpm test`: passed (all 13 tested workspaces plus script tests). After the last locale adjustments, admin passed 449 tests in 93 files; the additional proxy suite separately passed all three tests.
- Full workspace `pnpm typecheck`: passed; admin and script checks were also repeated after subsequent regression-test changes.
- Full workspace `pnpm build`: passed. The final admin production build was repeated after the widget correction and passed.
- Admin ESLint: zero errors, 20 advisories. `git diff --check`: clean.
- Next.js MCP project-wide compilation: no issues. Connected browser sessions: no config or runtime errors at the final development checks.
- Development readiness: 200, database and storage healthy. Docker/PostgreSQL/Redis were available during this completion pass.
- PostgreSQL regression script: exact period boundaries, duration rounding, open-call duration, UTC buckets, empty aggregates and cross-tenant isolation passed using the application role. Temporary fixture data was removed afterward.
- Authenticated HTTP regression: temporary account sign-in, `/api/dashboard`, `/api/preferences/locale`, `/analytics`, `/contacts`, and `/settings/appearance` passed. The fixture signed out and was deleted.
- Production HTML: English and French login responses contain the email form with matching document language; regular pages retain DENY. `/embed/audit-invalid-key` and `/embed.js` return 200 with no DENY header.
- Production browser: French login rendered correctly without console warnings/errors; development client navigation to signup preserved French copy and legal links. The production widget document rendered inside an iframe served from port 3212 while the app ran on 3211.

### Reproduction notes and limits

The development app was tested on port 3210, separately from the existing Docker app on port 3000. Request insights are enabled only in development. The local standalone production check used the same SWC-helper and static/public asset copies already present in `Dockerfile.admin`, loaded the local environment, and supplied an ephemeral internal token because the development placeholder is intentionally rejected in production. No production deployment or existing account credentials were modified.

Run the new database check with the local role-specific environment loaded and TypeScript mappings enabled: `tsx --tsconfig tsconfig.base.json scripts/replacement-dashboard-aggregates-check.ts`. Set `DASHBOARD_CHECK_BASE_URL` to a local running admin server to also exercise the temporary authenticated HTTP fixture. It creates uniquely named test records and cleans them up.

The root layout now reads request headers, so formerly static public admin pages render dynamically to supply localized HTML. This is a deliberate trade-off; production field performance and bundle-size budgets were not measured. Twenty lint advisories remain visible. A real paid voice/chat conversation was not initiated; the iframe check used an invalid key to verify document rendering and framing without external provider activity. No PR or deployment was created.
