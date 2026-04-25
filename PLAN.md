# LobbyStack MVP Plan, Updated For Convex Components And Low-Latency Voice

## 1. Executive Summary
- Build one pnpm monorepo with `apps/web`, `apps/voice-gateway`, root `convex/`, and shared packages. `Convex` remains the main backend and source of truth; the voice gateway remains a narrow live-call runtime.
- Personalization is snapshot-based for voice: Convex stores business data, docs, FAQs, hours, and policies, then compiles that into a compact `business_context_snapshot` fetched once at call start and held in memory for the duration of the call.
- This preserves cloud-first, self-hosted, and open-source goals because the same core codebase, schema, components, and features run in all modes; only deployment, credentials ownership, telemetry defaults, and support posture differ.

## 2. Scope Definition
- In scope: inbound voice, inbound SMS, booking, Google/Outlook sync, human transfer, message taking, SMS confirmations/reminders, minimal dashboard, business customization with docs/FAQs/hours/policies, mock mode, self-hosted path.
- Out of scope: payments, multi-location, multilingual support, custom workflow builder, CRM/EHR integrations, advanced analytics, enterprise SSO, website crawling, OCR-heavy ingestion.
- Post-MVP: recurring bookings, richer reporting, website ingestion, more providers, customer portal, compliance hardening.

## 3. Priority Order
- Foundation and repo trust.
- Auth, tenants, dashboard shell.
- Business Context MCP layer and knowledge ingestion.
- Booking core and calendar sync.
- SMS assistant.
- Voice gateway and live call flows.
- Notifications, self-hosting, telemetry sinks, hardening.
- This is optimal because both SMS and voice should share the same structured business context and booking engine, while voice latency concerns require the voice architecture to be explicit before coding.

## 4. Milestone Plan
- `M0 Foundation`: monorepo, Convex component mounting, CI, env/config, docs, ADRs. Accept when scaffold boots and CI passes. Docs: repo docs, ADRs, env docs.
- `M1 Tenant Core`: auth, businesses, memberships, services, staff, hours, closures, transfer settings, dashboard shell. Accept when owner can configure a business. Docs: auth/role/onboarding docs.
- `M2 Business Context MCP`: receptionist profile, FAQs, document uploads, knowledge ingestion, RAG indexing, context snapshot generation, preview console. Accept when admin updates content and preview reflects it. Docs: knowledge architecture and ingestion guide.
- `M3 Booking + Calendars`: availability engine, appointments, Google/Outlook connect, busy sync, event CRUD. Accept when booking avoids double-booking. Docs: booking and provider docs.
- `M4 SMS`: inbound SMS, FAQ and booking flows, confirmations/reminders, operator notifications. Accept when SMS can answer and book end-to-end. Docs: SMS and notification docs.
- `M5 Voice`: Twilio Voice + Media Streams, OpenAI Realtime, snapshot fetch at call start, tool bridge for authoritative actions, transfer, message taking. Accept when calls can answer, book, transfer, or take messages smoothly. Docs: voice model and troubleshooting.
- `M6 Hardening`: Docker Compose, mock providers, seed demo data, telemetry sinks, release/versioning, upgrade docs, pilot checklist. Accept when cloud and self-hosted run the same MVP features.

## 5. System Architecture
- `apps/web`: React/Vite/shadcn admin SPA for setup, inbox, appointments, knowledge, integrations, and preview.
- `convex/`: source of truth for tenants, authz, booking, conversations, notifications, integrations, audit, telemetry, knowledge metadata, and durable workflows.
- `apps/voice-gateway`: only Twilio Voice ingress, Media Streams, OpenAI Realtime session control, transfer control, and event forwarding.
- Voice hot path rule: no per-turn Convex retrieval for common replies. The gateway loads a business snapshot once, answers from local memory, and calls Convex only for authoritative tools such as availability lookup, booking, transfer, and message save.
- Convex component rule: use components for knowledge, durable text/async flows, and workflow execution; do not put `Agent` or `RAG` in the default per-turn live voice loop.

## 6. Repository Structure
- `apps/web`
- `apps/voice-gateway`
- `convex/{auth,businesses,appointments,conversations,notifications,integrations,ai,telemetry,audit,lib}`
- `packages/{ai,config,domain,providers,shared,telemetry,testing}`
- `docs/{adr,architecture,auth,deployment,providers,self-hosting,telemetry,troubleshooting,voice,knowledge}`
- `docker`, `scripts`, `.github`

## 7. Data Model
- Core tenant/app tables: `users`, `businesses`, `business_memberships`, `staff`, `services`, `staff_service_assignments`, `business_hours`, `closures`, `phone_numbers`, `contacts`, `conversations`, `messages`, `calls`, `transcripts`, `appointments`, `calendar_connections`, `calendar_busy_blocks`, `notifications`, `inbox_items`, `audit_logs`, `workflow_jobs`, `idempotency_keys`.
- Personalization tables: `receptionist_profiles`, `knowledge_documents`, `knowledge_snippets`, `business_context_snapshots`.
- App tables remain canonical for hours/services/transfer policy. RAG stores unstructured retrieval data only. Component-owned thread/chunk state stays inside components; app code stores only mapping ids and business-level metadata.

## 8. Core Domain Flows
- `Inbound SMS question`: Twilio webhook -> Convex -> resolve business/conversation -> agent/tool wrapper uses structured facts plus knowledge search -> send reply.
- `Inbound SMS booking`: same start, then authoritative availability and booking mutation -> confirmation -> reminder scheduling.
- `Inbound voice FAQ`: gateway resolves business -> fetches context snapshot once -> runs OpenAI Realtime session locally -> answers from local snapshot.
- `Inbound voice booking`: Realtime tool calls Convex only for `checkAvailability` and `bookAppointment`; never promise before booking succeeds.
- `Human transfer/message taking`: gateway invokes deterministic Convex-backed policy tools, then executes transfer or stores a structured inbox item.
- `Calendar sync/failure handling`: booking writes app record first, external side effects run durably with retries and dead-letter visibility.

## 9. Auth And Authorization Plan
- Use Convex Auth for MVP behind app-level auth helpers so the integration remains swappable.
- Login methods: email/password, email verification, password reset, invite links.
- Roles: `platform_admin`, `business_owner`, `business_admin`, `scheduler`, `viewer`.
- Every public function resolves auth, membership, and business scope before reading or mutating app data or calling a component wrapper.

## 10. Provider Abstraction Plan
- External provider interfaces: `TelephonyProvider`, `SmsProvider`, `RealtimeVoiceProvider`, `TextAiProvider`, `CalendarProvider`, `EmailProvider`.
- Internal runtime abstractions: `BusinessContextRuntime`, `ConversationAgentRuntime`, `KnowledgeIndexRuntime`, `DurableExecutionRuntime`.
- First implementations: Twilio Voice/SMS, OpenAI Realtime, OpenAI text, Google Calendar, Microsoft Graph, Resend, Convex Agent, Convex RAG, Convex Workflow/Workpool/Retrier/Crons.
- Feature code must call app wrappers, not SDKs or component APIs directly.

## 11. Integration Plan
- Twilio: inbound voice, Media Streams, transfer, inbound/outbound SMS, status callbacks.
- OpenAI Realtime: voice gateway only.
- OpenAI text: SMS, preview, summaries, ingestion helpers.
- Google Calendar and Microsoft Graph: OAuth, busy-time reads, event CRUD.
- Resend: auth and operator emails.
- Convex components:
  - `Agent` for SMS threads, admin preview, and async text flows.
  - `RAG` for tenant-scoped docs/FAQ retrieval and snapshot preparation.
  - `Persistent Text Streaming` for preview/test UI and long-running text generation UX.
  - `Workflow` for multi-step durable flows.
  - `Workpool` for concurrency-limited bulk work.
  - `Retrier` for isolated idempotent outbound retries.
  - `Crons` for runtime-configurable recurring jobs where needed.
- Sources: [Convex Agent](https://docs.convex.dev/agents), [Convex RAG](https://docs.convex.dev/agents/rag), [Using Components](https://docs.convex.dev/components/using-components), [Scheduling and durable components](https://docs.convex.dev/scheduling).

## 12. Async / Workflow Strategy
- Use `Workflow` for document ingestion, booking follow-ups, post-call processing, and external sync recovery.
- Use `Workpool` with at least `highPriority` and `bulk` queues.
- Use `Retrier` only for simple isolated idempotent calls.
- Use runtime `Crons` for configurable recurring reconciliation and cleanup; keep root `convex/crons.ts` only for fixed app-wide jobs.
- Use one-off scheduled functions for reminders rather than recurring crons.

## 13. Telemetry Architecture
- Internal typed telemetry only; feature code emits domain events, never vendor SDK calls.
- PostHog for product analytics, OTel for runtime observability, Langfuse for redacted AI traces, DB audit sink for first-party audit history.
- Add knowledge/agent/workflow event families, but never export raw docs, full transcripts, or sensitive payloads to analytics.
- Telemetry is always non-blocking and mode-aware.

## 14. Email Architecture
- MVP email scope: auth emails and operator alerts only.
- Customer booking communication stays SMS-first.
- Resend is the default `EmailProvider`.
- Failed sends use `Retrier` or become a step inside a larger `Workflow`.

## 15. Deployment Profiles
- `cloud`: Convex Cloud, SPA host, voice gateway container, platform-managed secrets, telemetry enabled by default.
- `self_hosted_standard`: self-hosted Convex, SPA container, voice gateway container, operator-managed secrets, outbound telemetry off by default.
- `development`: local web + gateway + Convex dev deployment, mock providers, console/noop telemetry.
- Same codebase and same core features across all profiles.

## 16. Hosting Recommendation
- Lean MVP: Convex Cloud + static SPA host + Fly.io voice gateway in US-East.
- More serious production-minded MVP: keep Convex Cloud, move only the voice gateway to AWS ECS Fargate in `us-east-1`.
- Do not add a second general-purpose backend service.

## 17. Self-Hosting Plan
- Official install path is Docker Compose.
- Required services: reverse proxy, web app, voice gateway, self-hosted Convex backend, Convex dashboard.
- Operators bring their own Twilio/OpenAI/Google/Microsoft/Resend credentials and app secrets.
- Upgrade docs must cover schema changes, component version upgrades, and knowledge reindex steps.

## 18. Development And Mock Mode
- Default contributor flow uses mock SMS, mock telephony/call simulator, mock calendar, mock email, and seeded demo tenants.
- Add an admin `Preview Receptionist` console backed by `Agent` plus persistent text streaming so contributors can test personalization without Twilio.
- Voice simulation should use the same authoritative Convex tools as the real voice runtime.

## 19. Security And Compliance-Aware Design
- Verify all webhooks and OAuth state.
- Encrypt stored provider tokens and redact sensitive logs.
- Keep call recording off by default; transcripts and retention must be configurable.
- Accept only `pdf`, `txt`, and `md` for MVP uploads; sanitize metadata and isolate retrieval by tenant.
- Structured app data, not RAG alone, remains authoritative for hours/services/transfer policy.

## 20. Open-Source Governance And Trust Plan
- Repo must include `LICENSE`, `README`, `CONTRIBUTING`, `SECURITY`, `CODE_OF_CONDUCT`, issue templates, PR template, CI, changelog/versioning, self-host docs, upgrade docs, and `.env.example`.
- Add ADRs for monorepo, Convex as backend, separate voice gateway, snapshot-based voice personalization, booking as app-owned core, and internal telemetry abstraction.
- Recommended license remains `AGPL-3.0` plus a trademark policy.

## 21. Testing Strategy
- Unit: availability engine, prompt/snapshot builder, knowledge normalization, authz helpers, redaction.
- Integration: component wrappers, ingestion workflows, RAG tenant filtering, booking workflows, webhook validation, calendar sync.
- E2E: admin updates hours/docs/FAQs and preview reflects it; SMS uses current business context; voice uses call-start snapshot; booking/transfer/message-taking work.
- Must-pass before pilots: no cross-tenant retrieval, deterministic hours/services answers, no double-booking, workflow retry/resume, smooth voice flow with no per-turn backend dependency.

## 22. Implementation Sequence
1. Scaffold workspace, root config, CI, repo governance files.
2. Add `convex/convex.config.ts` and mount required components.
3. Implement env/config loading and deployment mode handling.
4. Implement telemetry core.
5. Define provider/runtime interfaces.
6. Implement auth, users, businesses, memberships.
7. Build dashboard shell and onboarding.
8. Add services, staff, hours, closures, phone routing, transfer settings.
9. Add receptionist profiles, knowledge docs/snippets, snapshot tables.
10. Build app wrappers around Agent, RAG, persistent text streaming, and durable components.
11. Implement document ingestion and context snapshot generation.
12. Build admin knowledge UI and preview console.
13. Implement contacts, appointments, staff-service assignments, availability engine.
14. Add Google/Outlook sync.
15. Implement SMS assistant.
16. Build voice gateway with call-start snapshot fetch and authoritative tool bridge.
17. Add transfer, message-taking, notifications, post-call workflows.
18. Add self-hosting, mocks, release automation, and pilot hardening.

## 23. Definition Of Done For MVP
- Businesses can configure hours, services, transfer rules, FAQs, docs, and receptionist instructions.
- Admin preview uses the latest business context.
- SMS and voice both use the same authoritative business context model.
- Voice uses a call-start snapshot and does not depend on per-turn Convex retrieval for common responses.
- Booking, transfer, message-taking, confirmations, reminders, and calendar sync work.
- Cloud and self-hosted share the same core codebase and features.
- Mock/dev mode is usable without real providers.

## 24. Post-MVP Roadmap
- Website ingestion and richer file support.
- Better knowledge quality evals and auto-refresh.
- Multi-location routing and recurring appointments.
- More providers and deeper analytics/compliance features.

## Assumptions And Defaults
- Voice personalization is snapshot-based by default; live RAG during a call is fallback-only, not the normal path.
- `Agent` and `RAG` are used heavily for SMS, admin preview, ingestion, and async text flows, but not in the default per-turn voice hot loop.
- Hours, closures, services, and transfer policy remain deterministic structured data in app tables.
- Supported knowledge uploads in MVP are `pdf`, `txt`, and `md`.
- Recommended first milestone: `M0 Foundation`, including Convex component mounting and the business-context snapshot architecture.
- First 15 tasks: workspace scaffold; governance files; app/package scaffold; component mounting; env/config; telemetry core; interfaces; auth/tenants; dashboard shell; operational config CRUD; receptionist profile/knowledge tables; component wrappers; ingestion workflow; preview console; booking core.
- Top 5 non-negotiable decisions:
  1. Convex is the main backend; the voice gateway stays narrow.
  2. Voice uses call-start snapshots, not per-turn backend retrieval.
  3. Structured business facts are authoritative; RAG augments unstructured knowledge.
  4. Durable work uses Convex durable components deliberately and centrally.
  5. Cloud and self-hosted remain one product codebase.
