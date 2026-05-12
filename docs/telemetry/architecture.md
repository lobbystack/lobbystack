# Telemetry Architecture

## Overview

This repository now uses a PostHog-first telemetry architecture:

- `PostHog` for operator product analytics, runtime health events, PostHog Logs, AI trace analytics, and error tracking

The split of responsibilities stays the same:

- `apps/web` owns operator intent and product workflow events
- `convex` owns authoritative business outcome events and telemetry delivery health
- `apps/voice-gateway` owns runtime observability, PostHog Logs emission, and redacted AI trace analytics

## Privacy rules

These values must not leave the system through external telemetry by default:

- raw transcripts
- SMS bodies
- prompt text
- customer names
- phone numbers
- recording URLs

Redaction is enforced in shared telemetry helpers for:

- PostHog event properties
- AI trace properties
- PostHog log attributes

Server-side LLM analytics also run with `POSTHOG_PRIVACY_MODE=true` by default. In this repo that means we intentionally keep:

- model and provider
- trace and session correlation IDs
- latency and time-to-first-token
- token counts and cost metadata when available
- tool names and safe workflow outcome flags

But we do not send:

- `$ai_input`
- `$ai_output_choices`
- transcript text
- prompt text
- assistant text
- tool inputs or tool outputs

Audit data remains first-party only in `convex.audit_logs`.

## PostHog

### Identity model

- operator/browser analytics use `distinct_id = user:{userId}`
- server-side business analytics use `distinct_id = system:business:{businessId}`
- system-wide Convex telemetry uses `distinct_id = system:convex:telemetry`
- system-wide voice gateway telemetry uses `distinct_id = system:voice-gateway`
- PostHog group key uses `business:{businessId}`
- customers are never modeled as PostHog persons

### `apps/web`

The web app initializes PostHog in `apps/web/src/main.tsx` with:

- `autocapture: false`
- `capture_pageview: "history_change"` for SPA Web Analytics support
- `capture_pageleave: "if_capture_pageview"` for Web Analytics lifecycle coverage
- browser exception autocapture for unhandled errors and unhandled rejections
- session replay enabled with masked inputs and block selectors
- `api_host = https://ts.lobbystack.com` when using the managed reverse proxy
- `ui_host = https://us.posthog.com` so replay and insight links still resolve to PostHog Cloud

Page views are tracked manually from route changes in `apps/web/src/App.tsx`.
Operator actions are captured from feature entry points such as auth, onboarding, calendar setup, knowledge uploads, and follow-up completion.

This means the app emits both:

- PostHog-native `$pageview` and `$pageleave` events for the built-in Web Analytics product
- custom `web.page.*` events for product analytics dashboards

The browser also exposes a `captureAnalyticsException(...)` helper for explicit technical failures in high-signal flows such as calendar connection and knowledge document upload. This remains reserved for unexpected implementation or provider errors, not expected validation or business-rule failures.

The React root is also wrapped with `AppErrorBoundary` and React 19 root error hooks. Render crashes, uncaught root errors, and recoverable root errors call `captureAnalyticsException(...)` with the shared alertable exception contract:

- `runtime`
- `service`
- `operation`
- `deploymentMode`
- `alertable`
- `expected`
- `$exception_level`
- `$exception_type`
- `$exception_message`

Client calls to Convex mutations and actions go through `useObservedMutation(...)` and `useObservedAction(...)`. Rejected calls are captured as alertable web exceptions and then rethrown so existing UI error handling still works.

Production browser deploys continue to follow PostHog's source map flow:

- `vite build` emits source maps
- `apps/web/scripts/upload-posthog-sourcemaps.mjs` runs `posthog-cli sourcemap inject`
- the same script uploads the injected assets to PostHog with a stable release name and commit-based release version
- the static host serves the already-injected assets from `dist/`
- production sourcemap uploads fail closed when `POSTHOG_CLI_API_KEY` or `POSTHOG_CLI_PROJECT_ID` is missing

### Managed reverse proxy browser ingestion

Browser analytics should use PostHog's managed reverse proxy directly:

- browser `api_host = https://ts.lobbystack.com`
- browser `ui_host = https://us.posthog.com`
- the old worker proxy path `/ingest/posthog` is treated as a legacy value and mapped to `https://ts.lobbystack.com` in the web client for a safe rollout

### `convex`

Convex writes PostHog-bound events to `telemetry_outbox` and flushes them through `convex/telemetry/posthog.ts`.

Key properties of the outbox:

- non-blocking delivery from business logic
- retry with backoff
- no direct vendor calls from mutations
- disabled automatically outside cloud mode unless PostHog env vars are set

Convex also emits operational telemetry through the same outbox for:

- `ops.convex.heartbeat`
- `ops.convex.outbox_backlog_sample`
- `ops.convex.outbox_flush_failed`
- `ops.service.health_check`
- `ops.service.health_check_failed`

The heartbeat cron samples outbox backlog and retry state so PostHog dashboards and alerts can track delivery health without a second observability backend.

The service health cron checks `APP_BASE_URL` and `${VOICE_GATEWAY_BASE_URL}/health` every minute with a short timeout. Healthy checks emit `ops.service.health_check`. Missing config, non-2xx responses, network failures, and timeouts emit both `ops.service.health_check_failed` and an alertable `$exception` with the target service and host.

Production Convex write/action/http registrations use observed wrappers from `convex/telemetry/observedFunctions.ts`. These wrappers capture unexpected handler failures to PostHog Error Tracking and rethrow the original error. Queries stay unwrapped because Convex queries are side-effect-free.

### `apps/voice-gateway`

The voice gateway uses PostHog for three telemetry paths:

- AI traces in `apps/voice-gateway/src/observability/posthog.ts`
- runtime exceptions through PostHog Error Tracking
- operational logs through PostHog Logs OTLP ingestion

The gateway emits operational PostHog events for:

- `ops.voice.heartbeat`
- `ops.voice.invalid_signature`
- `ops.voice.media_disconnect`
- `ops.voice.snapshot_cache_hit`
- `ops.voice.snapshot_cache_miss`
- `ops.voice.openai_realtime_error`
- `ops.voice.turn_completed`
- `ops.voice.turn_slow`
- `ops.voice.tool_completed`
- `ops.voice.tool_failed`
- `ops.voice.recording_upload_failed`

These events intentionally replace the previous runtime metrics path. Alerting is now based on event trends, thresholded slow-event volume, and heartbeat absence instead of external percentiles.

Node exception autocapture remains enabled. The gateway also installs explicit `uncaughtException` and `unhandledRejection` handlers that capture a fatal PostHog exception, flush PostHog, and exit.

Structured gateway logs sent to PostHog Logs should continue to include operational identifiers like:

- `businessId`
- `callId`
- `conversationId`
- `provider`
- `toolName`
- `traceId`

## AI traces in PostHog

The repo now emits redacted PostHog AI analytics across both runtime surfaces:

- `apps/voice-gateway/src/observability/posthog.ts` for OpenAI Realtime voice
- wrapped Gemini non-realtime model calls in `convex/lib/providers/nonRealtimeText.ts`

Current event model:

- `$ai_trace` when a live OpenAI session or non-realtime Gemini generation starts
- `$ai_generation` when a response turn or non-realtime generation completes
- `$ai_span` for live voice tool call execution
- `ai.embedding.completed` / `ai.embedding.failed` as metadata-only embedding telemetry for knowledge indexing and retrieval

Only redacted metadata is sent, such as:

- model
- provider
- latency
- time to first token
- input, output, cached, reasoning, and total token counts when available
- total cost in USD when available
- error status
- tool names
- transfer invocation state

The non-realtime Gemini wrapper uses the shared provider layer in `convex/lib/providers/nonRealtimeText.ts`. It never forwards prompt content or model output to PostHog, and only captures metadata when callers attach safe telemetry context.

## Error tracking

PostHog Error Tracking is enabled in both runtimes:

- `apps/web` captures unhandled browser errors and unhandled promise rejections automatically, render/root failures through the React boundary/hooks, rejected observed Convex writes, and explicit technical exceptions through `captureAnalyticsException(...)`
- `convex` captures observed action, mutation, internal action, internal mutation, HTTP action, provider, and service-health failures through the PostHog outbox
- `apps/voice-gateway` enables Node exception autocapture and uses `capturePostHogException(...)` for startup, request, provider/runtime recovery, and fatal process failures

Explicit exception capture should remain limited to technical failures where stack traces and runtime context materially help debugging. Business outcome failures such as `appointment.booking_failed` or `workflow.failed` should continue to be tracked as product/domain events instead of exceptions.

Alertable exceptions use `alertable = true` and `expected = false`. Expected validation or business-rule outcomes should either stay as product/domain events or explicitly set `expected = true` when they must be captured for diagnostics.

PostHog Error Tracking notifications are configured from Error Tracking -> Configuration -> Alerting. They are separate from the limited Product Analytics Alerts surface. Use Error Tracking notifications or internal destinations for new, reopened, and spiking exception issues; use Product Analytics Alerts only for signals that require trend or absence logic, such as a missing `ops.convex.heartbeat` window.

The primary production notification destination is Discord. Creating the Discord Error Tracking notification requires a Discord webhook URL for the target incident channel, and PostHog then sends notifications automatically for the selected issue trigger.

## Environment variables

### Browser

- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`
- `VITE_POSTHOG_UI_HOST`
- `POSTHOG_CLI_API_KEY`
- `POSTHOG_CLI_PROJECT_ID`
- `POSTHOG_CLI_HOST`
- `POSTHOG_RELEASE_NAME`
- `POSTHOG_RELEASE_VERSION`

### Server and voice gateway

- `POSTHOG_KEY`
- `POSTHOG_HOST`
- `POSTHOG_PRIVACY_MODE`
- `APP_BASE_URL`
- `VOICE_GATEWAY_BASE_URL`

Telemetry export is only enabled automatically in `cloud` deployment mode.

Readable browser stack traces in hosted PostHog still depend on the deploy path continuing to run `pnpm posthog:sourcemaps` before Cloudflare publish. If that step is skipped, browser errors regress back to minified stack traces even though exception capture itself still works.

## Product and operations assets

PostHog includes these KPI-era assets:

- action: `Meaningful First Usage`
- dashboards:
  - `LobbyStack - Product KPIs`
  - `LobbyStack - Operator Workflow`
  - `LobbyStack - Messaging`
  - `LobbyStack - Voice & Booking Outcomes`
  - `LobbyStack - Analytics Health`

This phase adds PostHog-first runtime assets:

- `LobbyStack - Runtime Health`
- `LobbyStack - Voice Gateway Operations`
- `LobbyStack - AI Runtime`
- `LobbyStack - Telemetry Delivery Health`

Runtime dashboards are for triage and correlation. Production paging should come from Error Tracking notifications for alertable `$exception` issues, plus the smallest possible number of Product Analytics Alerts for missing heartbeat windows.
