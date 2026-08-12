# Replacement Certification

Run certification against an isolated Compose or Railway staging environment and attach results to the release record.

## Automated Gates

Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm replacement:drift`, `pnpm replacement:security`, `pnpm replacement:recovery`, `pnpm replacement:performance`, `pnpm replacement:auth`, `pnpm replacement:email-send`, `pnpm replacement:notifications`, `pnpm replacement:phone-onboarding`, `pnpm replacement:smoke`, `pnpm replacement:internal`, `pnpm replacement:storage`, `pnpm replacement:realtime`, `pnpm replacement:webhooks`, `pnpm replacement:telemetry`, `pnpm replacement:privacy`, and `VERIFY_RLS_BEHAVIOR=true pnpm db:verify-rls`. Run the authenticated Playwright suite and Prometheus rule tests from CI.

## Recovery and Operations

Verify Redis, worker, collector, admin, and voice-gateway restarts. Perform PostgreSQL and object restore drills. Confirm SSE reconnects, outbox work resumes, telemetry outages do not block requests, and each alert in `docs/operations/alerts.md` fires and resolves.

## Provider Scenarios

Using staging credentials, verify signup and SMTP, Google OAuth and reconciliation, Twilio voice booking and cancellation, recordings, inbound and outbound SMS status, Polar billing, knowledge extraction and embeddings, and PostHog traces, logs, metrics, product opt-out, and replay exclusions.

## Exit Gate

Certification passes only when RLS and pool-context isolation pass, telemetry contains no customer content, realtime p95 is below 500 ms, ordinary API p95 is below 500 ms excluding providers, voice context p95 is below 300 ms, webhook durable response p95 is below one second, outbox dispatch p95 is below two seconds, restore succeeds, critical alerts are tested, and no critical defects remain.
