# Performance optimization validation

Status: local implementation and validation; staging acceptance and production rollout remain open. No models, prompts, pool sizes, worker concurrency, database schema, RLS policies, or hosting configuration changed.

## Change groups

1. **Measurement:** PostgreSQL client instrumentation measures connection acquisition and actual query completion, including failures. SQL labels contain only allowlisted operation names and runtime roles. Worker metrics cover queue wait, job duration, outbox publish duration and age. OpenTelemetry exposes event-loop delay and process memory. Consent-controlled PostHog loads dynamically and collects sanitized Web Vitals without nested DOM or URL attribution.
2. **Dashboard startup:** bundle the small common French/English namespace, load route namespaces on demand, show an immediate loading shell, and offer a page reload on translation failure. A reload clears i18next's cached terminal failures; available English fallback bundles remain usable when French loading fails. Keep locale, appearance, and analytics providers mounted across navigation. Authentication and onboarding guards remain in place.
3. **Analytics SQL:** consolidate counts, series, outcomes, and channels into grouped queries. Compute response-time aggregates in PostgreSQL using the latest inbound before the first subsequent AI reply. Include the relevant pre-period message, ignore human replies, and preserve date buckets and response contracts.
4. **Resource bounds:** share browser SSE subscriptions by business and QueryClient, coalesce invalidations for 100 ms, and refetch active queries on every server `ready` event. Bound the voice snapshot cache to 1,000 entries with a five-minute TTL and LRU eviction. An active call retains its captured snapshot.

Land and release these groups separately. Runtime metric names are additive except that misleading raw-SQL query labels are replaced with bounded operation names; update any dashboard that relied on those labels.

## Reproduce measurements

Run production builds and record deployment identity separately from the local checkout. The new harnesses emit versioned JSON, commit, lockfile digest, source digest, Node version, package-manager version, and environment. Set `PERFORMANCE_DEPLOYMENT_ID` for remote runs. Keep browser storage-state files and session cookies outside the repository; output omits their contents.

```sh
pnpm build
pnpm performance:http scripts/performance/http.example.json /tmp/performance-http
pnpm performance:browser scripts/performance/browser.example.json /tmp/performance-browser
```

Replace example tenant IDs, paths, and cookie environment-variable names with synthetic staging fixtures. The HTTP runner performs GET requests only, rejects cross-origin scenarios, counts non-success statuses and timeouts, and measures the full response body. Defaults are 1/10/30 clients, 60 seconds of warmup, 300 seconds of measurement, and a 1,800-second soak at the highest error-free step. It stops increasing load on an error. An error-free level is not automatically an accepted capacity level: assess latency, queue age, memory, and resource saturation too.

The browser runner accepts `storageState`, a readiness selector, and optional click selectors per scenario. It runs five cold/warm pairs on desktop and five on a mobile viewport with 4× CPU throttling, 150 ms RTT, and 200 KB/s download throughput. Its longest interaction is a lab proxy, not field INP; its long-task blocking sum is not Lighthouse TBT. Missing paint or interaction observations are `null`, not a passing zero. Resource transfer excludes unavailable cross-origin sizes and document bytes. Validate field p75 LCP ≤2.5 s, INP ≤200 ms, and CLS ≤0.1 separately.

For analytics, use a disposable PostgreSQL 16/pgvector database initialized with repository roles and migrations. Explicit localhost `LOBBYSTACK_APP_DATABASE_URL`, `LOBBYSTACK_AUTH_DATABASE_URL`, `LOBBYSTACK_WORKER_DATABASE_URL`, and `LOBBYSTACK_MIGRATOR_DATABASE_URL` are required. Never point fixture preparation at a shared application database.

```sh
TSX_TSCONFIG_PATH=tsconfig.base.json node --env-file=/tmp/performance-test.env --import tsx scripts/performance/analytics.ts
```

Set `PERFORMANCE_BASELINE_MODULE` to an importable copy of the pre-change analytics module to enable comparison; set `PERFORMANCE_OUTPUT` to select the result file. The baseline module must resolve the same dependencies and authorization helpers as the candidate. The harness creates 1,000/10,000/100,000 calls and messages across 45 days and multiple conversations, collects planner statistics after bulk insertion, and deletes only its generated tenant/user IDs. Fixture preparation uses the owner role; timed reads and `EXPLAIN (ANALYZE, BUFFERS)` use the app role and operator RLS context. A 60-second statement timeout bounds failed experiments. Each size has three interleaved before/after repetitions of ten measured requests after warmup. Every response must exactly match the baseline and remain unchanged throughout measurement.

```sh
pnpm exec tsx scripts/performance/compare.ts /tmp/lobbystack-performance/analytics.json
```

The comparison requires at least one selected scenario to improve p95 by 15% in all three repetitions and rejects missing/error samples or a repeatable regression above 5% in any included scenario. This is a local analytics gate, not a substitute for protected end-to-end scenarios.

## Evidence and limitations

Raw reports now live in LobbyStack internal under `Reports/Performance/2026-09-08/`. The code repository retains the scripts and this summary.

The local analytics report, `analytics-local.json`, contains all samples and app-role query plans. Median p95 across three repetitions:

| Calls and messages per tenant | Before | After | Improvement |
| --- | ---: | ---: | ---: |
| 1,000 each | 92.62 ms | 38.35 ms | 58.6% |
| 10,000 each | 607.65 ms | 252.83 ms | 58.4% |
| 100,000 each | 5,685.88 ms | 2,386.04 ms | 58.0% |

Each individual repetition improved p95 by 53–61%, with zero errors and exact response equivalence. These are single-client, warm-cache, in-process domain timings, including app-role database work; they exclude HTTP, authentication transport, browser rendering, and providers. Ten samples per repetition cannot establish a reliable tail-capacity limit. The large tenant remains slow enough to require staging follow-up despite the improvement.

The browser evidence includes the local baseline (`browser-before.json`), candidate (`browser-after.json`), and read-only staging baseline (`browser-staging.json`) in that internal folder. These measure login startup only. The initial browser runner represented missing LCP observations as zero; those baseline zeros are invalid observations, and the runner now emits `null`. Neither these artifacts nor their zero observed CLS establish a field Web Vitals pass.

Median login startup across five runs per cell:

| Metric | Before | After |
| --- | ---: | ---: |
| Cold transferred resource bytes | 383,820 | 296,749 (−22.7%) |
| Translation requests | 16 | 2 |
| Cold desktop form readiness | 88.7 ms | 81.6 ms |
| Cold throttled-mobile form readiness | 2,890.6 ms | 2,176.6 ms (−24.7%) |
| Warm throttled-mobile form readiness | 1,029.8 ms | 417.4 ms |

Readiness means the configured form selector exists after navigation; it is not LCP or an authenticated-dashboard result. These observations support the translation/startup change locally, with staging comparison still required.

Validation checks (`checks.json` in that internal folder): `pnpm typecheck`, `pnpm test` (854 tests), and `pnpm build` passed. Five affected Playwright checks passed, including mobile auth layout, French namespace failure/retry, English fallback, and locale switching. Real PostgreSQL analytics certification passed all five granularities and cross-period pairing; database check and RLS verification passed with RLS enabled and forced on 63 tables. No migrations were introduced.

The baseline checkout was `10e1b724289a3661bec74b5527fb897d3bd743c6`; dependency upgrades already present in that checkout were retained for before/after comparisons. Local validation used Node 26.8.1, pnpm 10.30.3, PostgreSQL 16, and the installed Next.js 16.3.1 / AI SDK 7 versions. Repeat acceptance on the deployed Node version.

Production browser tests used the compiled Next application through a local launcher with installed workspace dependencies. The existing standalone output could not resolve `@swc/helpers` in this environment; this launcher does not validate the deployment package. Staging login was measured read-only on admin deployment `cf9fd17f-b05a-4ef2-961e-00b45fbc1a73`; it is a baseline, not a deployed candidate result.

An initial large-fixture run exposed a pathological plan before statistics had caught up with bulk inserts. That run was cancelled and excluded. The harness now analyzes fixtures before either variant runs. Do not infer production capacity from a local synthetic database or hide this sensitivity when reviewing staging plans.

## Acceptance and rollout still required

- Create provider-isolated staging fixtures for authenticated dashboard, analytics, contacts, appointments, call detail, widget opening/chat, voice setup, and 100/1,000/10,000 knowledge chunks. Current staging contains live provider configuration. Stub billing, SMS, email, calendar writes, and AI calls before mutation or conversational load; report simulated and real-provider latency separately.
- Run the full concurrency matrix and 30-minute soak. Capture API p50/p95/p99, error rates, SQL execution and pool wait, Redis connections, event-loop delay, queue age, ingestion stages, memory growth, and voice/chat stage latency. No concurrency, pool-size, vector-index, CPU-isolation, or image changes are justified by the local measurements alone.
- Compare authenticated browser routes, landing with/without widget, widget startup, French/English locale changes, tenant switching, reconnects, and streaming cancellation. Collect Lighthouse TBT and real Web Vitals; validate important interactions on physical Android.
- Verify deployed CDN caching/compression and unbuffered streams. Test slow consumers, long calls, disconnect cleanup, Twilio interruption/playback acknowledgements, snapshot refresh, worker retry/crash recovery, and knowledge fingerprint/fallback behavior.
- Require three repeatable comparison runs, ≥15% improvement in the selected metric, no reproducible >5% protected-scenario regression, and no correctness regression. Revert ineffective experiments. After staging acceptance, release one change group at a time and observe production telemetry for seven days before closing rollout. Revert the affected group if its gates fail; no data migration is needed for these changes.

## Implementation references

Installed Next.js and AI SDK documentation takes precedence over newer examples. The implementation follows [i18next namespace loading](https://www.i18next.com/how-to/add-or-load-translations), [Next.js package analysis](https://nextjs.org/docs/app/guides/package-bundling), [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults), [Redis Pub/Sub delivery semantics](https://redis.io/docs/latest/develop/pubsub/), [PostgreSQL 16 EXPLAIN](https://www.postgresql.org/docs/16/using-explain.html), [node-postgres pooling](https://node-postgres.com/features/pooling), [OpenTelemetry JavaScript instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/), and [PostHog Web Vitals](https://posthog.com/docs/web-analytics/web-vitals).

Further measured work should use [BullMQ concurrency](https://docs.bullmq.io/guide/workers/concurrency), [pgvector exact/approximate search](https://github.com/pgvector/pgvector#indexing), [Astro images](https://docs.astro.build/en/guides/images/), [Astro hydration directives](https://docs.astro.build/en/reference/directives-reference/#client-directives), [Cloudflare Pages serving](https://developers.cloudflare.com/pages/configuration/serving-pages/), [Twilio Media Streams messages](https://www.twilio.com/docs/voice/media-streams/websocket-messages), and [OpenAI latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization).
