<p align="center">
  <img src=".github/readme/lobbystack-hero.png" width="100%" alt="LobbyStack dashboard hero image">
</p>

<div align="center">

# LobbyStack

### The open-source AI receptionist for phone calls and appointments

LobbyStack is an open-source AI receptionist platform for small businesses. It answers phone calls, books appointments, handles appointment changes, and transfers calls to a person when needed.

It is built for clinics, salons, repair shops, local service companies, restaurants, and any business that loses revenue when nobody is available to answer the phone.

LobbyStack gives teams a modern AI front desk that can be hosted in the cloud or self-hosted on their own infrastructure.

[Website](https://lobbystack.com) &middot; [Try the app](https://app.lobbystack.com/signup) &middot; [Docs](https://docs.lobbystack.com) &middot; [Self-hosting](https://docs.lobbystack.com/self-hosting/overview) &middot; [GitHub](https://github.com/lobbystack/lobbystack) &middot; [Discord](https://discord.gg/WKX4wCTTpJ)

[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](./LICENSE) [![Open source](https://img.shields.io/badge/open%20source-yes-22c55e.svg)](https://github.com/lobbystack/lobbystack) [![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178c6.svg)](https://www.typescriptlang.org/) [![PostgreSQL](https://img.shields.io/badge/backend-PostgreSQL-336791.svg)](https://www.postgresql.org/) [![Self-hostable](https://img.shields.io/badge/deploy-self--hostable-7c3aed.svg)](https://docs.lobbystack.com/self-hosting/overview)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/lobbystack)

</div>

## Why teams use LobbyStack

Most AI receptionist tools are closed, expensive, and difficult to adapt to real business workflows. LobbyStack is different.

- **Open source by default.** Inspect the code, self-host it, extend it, and keep control of your data.
- **Built for real phone calls.** Handle natural voice conversations, interruptions, live transfers, and messages for your team.
- **Calls and texts in one place.** Review calls, recordings, transcripts, and incoming texts from the same dashboard.
- **Scheduling built in.** Book, reschedule, and cancel appointments through Google Calendar.
- **Designed for small businesses.** Guided setup, transparent pricing, and no enterprise-only feature gatekeeping.
- **Human fallback.** Transfer calls or escalate messages when the AI should not handle something alone.

## Core features

### ☎️ AI phone receptionist

LobbyStack answers inbound calls with a natural voice agent trained on your business information. It can answer common questions, collect caller details, take messages, qualify requests, offer appointment slots, and transfer to a human when required.

### 💬 Text messages

LobbyStack saves texts sent to your business number and alerts your team. You read the thread and reply by hand from the dashboard. The AI doesn't answer texts; STOP and HELP get fixed replies.

### 📅 Appointment scheduling

LobbyStack connects to Google Calendar, checks availability, offers time slots, books appointments, and sends a confirmation text and one reminder text 24 hours before, if the caller agrees. Callers can also reschedule or cancel during a later call.

### 📚 Knowledge base

Upload business information, FAQs, services, pricing, policies, and internal notes. The AI uses this knowledge to answer accurately and consistently.

### 🧑‍💼 Human handoff

LobbyStack can transfer a live call, take a message, or notify the team by email or opt-in SMS when a person needs to respond.

### 📥 Shared inbox

Review calls, SMS threads, transcripts, recordings, appointments, and customer details from one dashboard.

### 🔌 Integrations

LobbyStack connects to Google Calendar to check availability and book appointments. It doesn't connect to other calendars or CRMs yet.

## Use cases

LobbyStack can be adapted for many local business workflows:

- Clinics and healthcare offices
- Salons, spas, and barbershops
- Auto repair shops
- Home service companies
- Restaurants
- Dental offices
- Law firms and professional services
- Property managers
- Any business that receives appointment, pricing, hours, or availability questions by phone

## Product areas

| Area | What it gives you |
| --- | --- |
| Voice reception | Inbound phone and browser calls answered by OpenAI GPT-Live, with phone numbers from Twilio or Telnyx. |
| Business knowledge | Answers from structured business facts, text entries, documents, and imported website pages. |
| Booking | Service-aware scheduling with availability checks and calendar handoff. |
| Appointment changes | Safer cancellation and rescheduling flows with appointment lookup and verification. |
| Human handoff | Live transfer and follow-up tasks for calls that need staff attention. |
| Messages | Incoming texts with manual replies, connected to customer history. |
| Website widget | Embeddable chat, lead capture, and browser calls with per-site access controls. Restricted: new widget keys are off unless you set `WIDGET_KEY_ISSUANCE_ENABLED=true`. |
| Dashboard | Calls, messages, contacts, appointments, recordings, transcripts, follow-ups, and analytics together. |
| Usage and billing | Hosted plans, voice usage, alert SMS, transfer attempts, storage, and spending caps. |
| Bring your own API keys | Self-hosted deployments can use your own Twilio or Telnyx, OpenAI-compatible AI, calendar, email, analytics, and billing provider credentials. |

## Technology

| Layer | Main components |
| --- | --- |
| App | Next.js, React, Tailwind CSS, shadcn/ui |
| Backend | PostgreSQL, Drizzle ORM, Redis, BullMQ |
| Voice | OpenAI GPT-Live over SIP and WebRTC, through Twilio Elastic SIP Trunking or Telnyx SIP connections |
| Agent | Vercel AI SDK, `gpt-6-luna` or any OpenAI-compatible model |

## Hosted and open source

LobbyStack is open source with a hosted cloud service.

Use **LobbyStack Cloud** when you want the product managed for you. You still control the receptionist behavior, knowledge, services, rules, numbers, integrations, and team workflow from the app.

Self-host when your team wants to run the stack on your own infrastructure, bring your own API keys, and use your own PostgreSQL, Twilio or Telnyx, OpenAI-compatible AI, calendar, analytics, billing, and email provider accounts.

To self-host on Railway, deploy the [LobbyStack template](https://railway.com/deploy/lobbystack). Railway generates every secret and database password, and you enter an OpenAI API key and your Twilio credentials.

After deploying, set a few variables in Railway:

- **Email:** `SMTP_*` and `EMAIL_FROM` on the worker. Password resets, verification codes, and invites fail without them.
- **Phone calls:** an OpenAI webhook to `https://your_admin_domain/api/webhooks/openai/live`, its secret as `OPENAI_WEBHOOK_SECRET` on the admin, and your Twilio Elastic SIP trunk as `TWILIO_SIP_TRUNK_SID` on the worker. See [`docs/voice/runtime.md`](./docs/voice/runtime.md#set-up-the-phone-path). To use Telnyx for some countries or all of them, follow [Use Telnyx](./docs/voice/runtime.md#use-telnyx).
- **Optional:** `FIRECRAWL_API_KEY` on the worker for website import, and `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the admin for Google Calendar.
- **Custom domain:** `APP_BASE_URL` on the admin. The other URL variables reference it.

The [self-hosting guide](https://docs.lobbystack.com/self-hosting/overview#after-deploying) has each step.

Full product control in the hosted app. Infrastructure ownership when you self-host. Same open-source core either way.

## Architecture for contributors

LobbyStack is a TypeScript monorepo with PostgreSQL as the durable source of truth. OpenAI hosts call audio; the admin app starts each call and the worker runs it.

```text
apps/
  admin/           Next.js dashboard and HTTP API
  worker/          asynchronous jobs, outbox dispatch, and live calls
packages/embed/    Vite bundle for the embeddable website widget loader
packages/          database, domain, agent core, jobs, providers, telemetry, and shared contracts
mintlify/          public documentation source
docs/              architecture notes, ADRs, provider docs, and validation notes
```

Read the [self-hosting overview](https://docs.lobbystack.com/self-hosting/overview) for the provider map and deployment expectations, or use the [Docker Compose guide](https://docs.lobbystack.com/self-hosting/docker-compose) for the official single-host baseline.

## Get started

### Use the hosted app

1. [Create a LobbyStack account](https://app.lobbystack.com/signup).
2. Verify your mobile number.
3. Import website knowledge, or skip and add knowledge manually later.
4. Choose a plan.
5. Claim a business number on Starter or Pro.
6. Configure AI settings, services, knowledge, and rules before sending live calls.

The full hosted walkthrough lives in the [setup guide](https://docs.lobbystack.com/quickstart).

### Run local development

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres redis
pnpm db:migrate
pnpm dev
```

Local development stores recordings and uploads under `.lobbystack/storage`. Set `STORAGE_PROVIDER=s3` when you need to test an S3-compatible service.

Mock providers are part of the default development path, so contributors can exercise flows without live Twilio, AI, calendar, or email credentials. Provider setup notes live in the [docs](https://docs.lobbystack.com/self-hosting/providers).

### Deploy with Docker Compose

```bash
git clone https://github.com/lobbystack/lobbystack.git
cd lobbystack
pnpm install
cp .env.example .env
# Replace every placeholder before exposing the stack.
docker compose --env-file .env up -d --build
```

The stack uses stdout logs and health endpoints without running monitoring containers. Set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` to send server telemetry to PostHog or another OTLP-compatible backend.

For prerequisites, local smoke vs production go-live, helper scripts, and troubleshooting, see the [Docker Compose self-hosting guide](https://docs.lobbystack.com/self-hosting/docker-compose).

## Environment variables

`.env.example` lists every variable. `pnpm env:generate` writes a `.env` from it with fresh secrets, and `pnpm env:sync` brings an existing `.env` up to date with it (see [local debugging](./docs/voice/local-debugging.md)). Default `generated` means `pnpm env:generate` fills in a random secret; `blank` means the feature stays off until you set it.

| Variable | Default | What it does |
| --- | --- | --- |
| `AI_CHAT_API_KEY` | blank | API key for the text AI that powers website chat, call summaries and delegated call requests. Falls back to `OPENAI_API_KEY`. |
| `AI_CHAT_BASE_URL` | `https://api.openai.com/v1` | Base URL of the OpenAI-compatible endpoint for text AI. OpenAI uses the Responses API; any other endpoint uses chat completions. |
| `AI_CHAT_MODEL` | blank | Model for website chat. Blank uses the built-in default. |
| `AI_CHAT_REASONING_EFFORT` | blank | Reasoning effort for website chat. Blank uses the built-in default. |
| `AI_CHAT_PROVIDER_NAME` | `openai` | Provider name recorded with usage and cost data for the chat model. |
| `AI_SUMMARY_MODEL` | blank | Model for call summaries. Blank reuses the chat model. |
| `AI_SUMMARY_REASONING_EFFORT` | blank | Reasoning effort for call summaries. Blank means low. |
| `AI_DELEGATION_MODEL` | blank | Model that answers requests GPT-Live delegates during a call. Blank reuses the chat model. |
| `AI_DELEGATION_REASONING_EFFORT` | blank | Reasoning effort for delegated requests. Blank means low. |
| `AI_DELEGATION_SERVICE_TIER` | blank | OpenAI service tier for delegated requests. Blank uses the built-in default. |
| `AI_CHAT_INPUT_COST_PER_MILLION_TOKENS` | blank | Price of chat input tokens per million, in US dollars. Used to estimate cost; set it when the chat model is not a built-in one. |
| `AI_CHAT_CACHED_INPUT_COST_PER_MILLION_TOKENS` | blank | Price of cached chat input tokens per million. Blank uses the input price. |
| `AI_CHAT_OUTPUT_COST_PER_MILLION_TOKENS` | blank | Price of chat output tokens per million, in US dollars. |
| `AI_CHAT_PRICING_VERSION` | blank | Label for the chat price list, stored with each cost estimate. |
| `AI_CHAT_PRICING_SOURCE` | blank | Where the chat prices come from, such as the provider's pricing page URL. |
| `AI_CHAT_PRICING_EFFECTIVE_DATE` | blank | Date the chat prices took effect. |
| `AI_EMBEDDING_API_KEY` | blank | API key for the embeddings that index knowledge. Falls back to `OPENAI_API_KEY`. |
| `AI_EMBEDDING_BASE_URL` | `https://api.openai.com/v1` | Base URL of the OpenAI-compatible embeddings endpoint. |
| `AI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model. |
| `AI_EMBEDDING_PROVIDER_NAME` | `openai` | Provider name recorded with embedding usage. |
| `AI_EMBEDDING_REVISION` | `1` | Embedding revision number. Raise it to mark stored vectors as stale after you change the model. |
| `AI_EMBEDDING_INPUT_COST_PER_MILLION_TOKENS` | blank | Price of embedding input tokens per million, in US dollars. |
| `AI_EMBEDDING_PRICING_VERSION` | blank | Label for the embedding price list. |
| `AI_EMBEDDING_PRICING_SOURCE` | blank | Where the embedding prices come from. |
| `AI_EMBEDDING_PRICING_EFFECTIVE_DATE` | blank | Date the embedding prices took effect. |
| `AI_EMBEDDING_TIMEOUT_MS` | `30000` | Timeout for one embedding request, in milliseconds. |
| `AI_EMBEDDING_MAX_PARALLEL_CALLS` | `4` | Most embedding requests in flight at once. |
| `APP_BASE_URL` | `http://localhost:13000` | Public URL of the admin app. Used for links in emails, OAuth callbacks and the trusted host list. |
| `APP_HOSTNAME` | `localhost` | Hostname the bundled Caddy proxy answers on in Docker Compose. |
| `BRAND_APP_NAME` | blank | Product name shown in place of LobbyStack. It wins over the name saved in onboarding. |
| `BRAND_LOGO_URL` | blank | Logo shown in place of the LobbyStack logo. It wins over the logo saved in onboarding. |
| `CALCOM_CLIENT_ID` | blank | Client ID of a confidential Cal.com OAuth client with every scope in `packages/providers/src/calcom/calendar.ts`. Set all four `CALCOM_*` values to enable Cal.com. |
| `CALCOM_CLIENT_SECRET` | blank | Client secret of that Cal.com OAuth client. |
| `CALCOM_REDIRECT_URI` | `http://localhost/api/calendar/calcom/callback` | OAuth callback registered with Cal.com. It ends in `/api/calendar/calcom/callback`. |
| `CALCOM_PLACEHOLDER_EMAIL_DOMAIN` | blank | Domain of the stand-in attendee address Cal.com gets instead of the caller's email. Cal.com checks it for an MX record, so point it at a mail server that discards mail. |
| `CALENDLY_CLIENT_ID` | blank | Client ID of a Calendly OAuth app with every scope in `packages/providers/src/calendly/calendar.ts`. Set all five `CALENDLY_*` values to enable Calendly. |
| `CALENDLY_CLIENT_SECRET` | blank | Client secret of the Calendly app. Calendly shows it once, when you create the app. |
| `CALENDLY_REDIRECT_URI` | `http://localhost/api/calendar/calendly/callback` | OAuth callback registered with Calendly. It ends in `/api/calendar/calendly/callback`. |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | blank | Key that verifies Calendly webhooks. Calendly shows it once, when you create the app. |
| `CALENDLY_PLACEHOLDER_EMAIL_DOMAIN` | blank | Domain of the stand-in invitee address Calendly gets instead of the caller's email. Point it at a mail server that discards mail, since Calendly sends its notifications there. |
| `CLOUDFLARE_SAAS_API_TOKEN` | blank | Cloudflare API token that issues certificates for partners' custom domains through Cloudflare for SaaS. Set it together with `CLOUDFLARE_SAAS_ZONE_ID`. |
| `CLOUDFLARE_SAAS_ZONE_ID` | blank | Cloudflare zone ID that holds the custom hostnames. Set it together with the token. |
| `CONTENT_RETENTION_ENABLED` | `true` | Set to `false` to turn off content retention for the whole deployment. It is on otherwise. |
| `CONTENT_RETENTION_POLICY_JSON` | blank | JSON that overrides the retention days per content category for paid plans. Free stays capped at 30 days. Invalid JSON is ignored. |
| `CONTENT_RETENTION_DATABASE_URL` | blank | Database URL that `scripts/content-retention-backfill.ts` connects to as the worker role. |
| `EMAIL_FROM` | `LobbyStack <no-reply@example.com>` | From address of the emails the worker sends. |
| `EMAIL_REPLY_TO` | blank | Default Reply-To address of those emails. |
| `FINANCE_EXPORT_ENABLED` | `false` | Set to `true` to serve the internal finance export endpoint. It answers 404 otherwise. |
| `FINANCE_EXPORT_TOKEN` | blank | Bearer token the finance export endpoint requires. |
| `FIRECRAWL_API_KEY` | blank | Firecrawl API key for importing website knowledge. Blank turns the import off. |
| `FIRECRAWL_BASE_URL` | blank | Base URL of a self-hosted Firecrawl. Blank uses Firecrawl's hosted API. |
| `GOOGLE_CLIENT_ID` | blank | Google OAuth client ID, for Google sign-in and Google Calendar. |
| `GOOGLE_CLIENT_SECRET` | blank | Google OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | `http://localhost/api/calendar/google/callback` | OAuth callback registered with Google Calendar. It ends in `/api/calendar/google/callback`. |
| `INSTAGRAM_APP_ID` | blank | Meta app ID for the Instagram integration. |
| `INSTAGRAM_APP_SECRET` | blank | Meta app secret for the Instagram integration. |
| `INSTAGRAM_REDIRECT_URI` | `http://localhost/api/integrations/instagram/callback` | OAuth callback registered with Meta. It ends in `/api/integrations/instagram/callback`. |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | blank | Token Meta sends when it verifies the Instagram webhook. |
| `INTERNAL_SERVICE_SECRET` | generated | Secret that signs the admin's internal tokens, such as browser call sessions, and the fallback signing key for local storage URLs. Generated by `pnpm env:generate`. |
| `INTERNAL_SERVICE_TOKEN` | generated | Bearer token the worker requires on its internal live-call requests from the admin. Generated by `pnpm env:generate`. |
| `LOBBYSTACK_FINANCE_EXPORT_DATABASE_URL` | blank | Database URL of the separately provisioned read role the finance export uses. The export fails while it is blank. |
| `LOBBYSTACK_APP_PASSWORD` | generated | Password of the `lobbystack_app` database role, which the admin uses for tenant queries. |
| `LOBBYSTACK_AUTH_PASSWORD` | generated | Password of the `lobbystack_auth` database role. |
| `LOBBYSTACK_WORKER_PASSWORD` | generated | Password of the `lobbystack_worker` database role. |
| `LOBBYSTACK_DISPATCHER_PASSWORD` | generated | Password of the `lobbystack_dispatcher` database role, which dispatches the outbox. |
| `LOBBYSTACK_MIGRATOR_PASSWORD` | generated | Password of the `lobbystack_migrator` role that runs migrations. |
| `LOBBYSTACK_READONLY_PASSWORD` | generated | Password of the `lobbystack_readonly` role. |
| `LOBBYSTACK_MAINTENANCE_MODE` | `false` | Set to `true` to put the admin in maintenance mode. |
| `LOBBYSTACK_CERTIFICATION_MODE` | `false` | Set to `true` to run in certification mode, where outbound email, texts and calendar writes only reach the allowed targets below. |
| `LOBBYSTACK_CERTIFICATION_EMAILS` | blank | Email addresses certification mode may send to, separated by commas. |
| `LOBBYSTACK_CERTIFICATION_PHONES` | blank | Phone numbers certification mode may text or call, separated by commas. |
| `LOBBYSTACK_CERTIFICATION_CALENDARS` | blank | Calendar IDs certification mode may write to, separated by commas or newlines. |
| `LOCAL_STORAGE_PATH` | `.lobbystack/storage` | Directory for recordings and uploads when `STORAGE_PROVIDER` is `local`. |
| `LOCAL_STORAGE_SIGNING_SECRET` | generated | Secret that signs local storage download URLs. Generated by `pnpm env:generate`. |
| `MAILPIT_SMTP_PORT` | `1025` | Host port of the Mailpit SMTP server in Docker Compose. |
| `MAILPIT_UI_PORT` | `8025` | Host port of the Mailpit web inbox in Docker Compose. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:13000` | Public URL of the admin app, read by browser code. Marketing links to the app use it. |
| `NEXT_PUBLIC_LANDING_SITE_URL` | blank | Your marketing site's URL, shown in dashboard links. |
| `NEXT_PUBLIC_TERMS_URL` | blank | Link to your terms of service. |
| `NEXT_PUBLIC_PRIVACY_URL` | blank | Link to your privacy policy. |
| `NEXT_PUBLIC_DOCS_SITE_URL` | blank | Link to your help center. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | blank | Contact email address shown in the product. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | blank | Cloudflare Turnstile site key. Sign-up forms show the challenge when it is set. |
| `NEXT_PUBLIC_LIVE_CALL_ENDPOINT` | `http://localhost:13000/api/voice/live/session` | Endpoint the marketing site's web call widget starts calls against. |
| `NEXT_PUBLIC_WEB_CALL_BUSINESS_SLUG` | blank | Slug of the business the marketing site's web call widget talks to. |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | blank | PostHog project token for browser analytics. |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://ts.lobbystack.com` | PostHog host for browser analytics. |
| `OPENAI_API_KEY` | blank | OpenAI API key for GPT-Live calls and, unless you set the `AI_*_API_KEY` values, text AI and embeddings. |
| `OPENAI_WEBHOOK_SECRET` | blank | Secret that verifies OpenAI's incoming-call webhooks. |
| `OPENAI_PROJECT_ID` | blank | OpenAI project ID. Required for Telnyx numbers, and for staff-first answering on Twilio numbers, in both admin and worker. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | blank | OTLP endpoint that receives server telemetry. Blank sends none. |
| `OTEL_EXPORTER_OTLP_HEADERS` | blank | Headers for the OTLP exporter, such as an authorization header. |
| `PARTNER_BASE_DOMAIN` | blank | Base domain for partner subdomains. |
| `PARTNER_DOMAIN_CNAME_TARGET` | blank | Hostname partners point their custom domain's CNAME at. |
| `PARTNER_SIGNUP` | blank | `open` lets anyone sign up as a partner; `invite` needs an invitation. Blank is `open`, except a cloud deployment without a Polar product for every tier, which is `invite`. |
| `POLAR_ACCESS_TOKEN` | blank | Polar access token for billing. |
| `POLAR_WEBHOOK_SECRET` | generated | Secret that verifies Polar webhooks. Only you can supply it, so `pnpm env:generate` leaves it blank. |
| `POLAR_ACCEPT_LEGACY_BUSINESS_IDS` | `false` | Set to `true` to accept Polar events that carry a business ID from the previous platform. |
| `POLAR_ORGANIZATION_ID` | blank | Polar organization ID. |
| `POLAR_API_BASE_URL` | blank | Polar API base URL, such as the sandbox. Blank uses production. |
| `POLAR_STARTER_MONTHLY_PRODUCT_ID` | blank | Polar product for the Starter plan, billed monthly. |
| `POLAR_STARTER_ANNUAL_PRODUCT_ID` | blank | Polar product for the Starter plan, billed yearly. |
| `POLAR_PRO_MONTHLY_PRODUCT_ID` | blank | Polar product for the Pro plan, billed monthly. |
| `POLAR_PRO_ANNUAL_PRODUCT_ID` | blank | Polar product for the Pro plan, billed yearly. |
| `POLAR_PARTNER_STARTER_MONTHLY_PRODUCT_ID` | blank | Polar product for the partner Starter tier, billed monthly. |
| `POLAR_PARTNER_STARTER_ANNUAL_PRODUCT_ID` | blank | Polar product for the partner Starter tier, billed yearly. |
| `POLAR_PARTNER_GROWTH_MONTHLY_PRODUCT_ID` | blank | Polar product for the partner Growth tier, billed monthly. |
| `POLAR_PARTNER_GROWTH_ANNUAL_PRODUCT_ID` | blank | Polar product for the partner Growth tier, billed yearly. |
| `POLAR_PARTNER_SCALE_MONTHLY_PRODUCT_ID` | blank | Polar product for the partner Scale tier, billed monthly. |
| `POLAR_PARTNER_SCALE_ANNUAL_PRODUCT_ID` | blank | Polar product for the partner Scale tier, billed yearly. |
| `POSTGRES_PASSWORD` | generated | Password of the Postgres superuser in Docker Compose. `DATABASE_URL` carries the same password. |
| `POSTGRES_PORT` | `15433` | Host port of Postgres in Docker Compose. |
| `POSTHOG_API_KEY` | blank | PostHog project key for server-side product analytics. |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | PostHog host for server-side analytics. |
| `REDIS_PORT` | `16380` | Host port of Redis in Docker Compose. |
| `REDIS_URL` | `redis://127.0.0.1:16380` | Redis connection URL. Without it the admin runs without Redis. |
| `S3_ENDPOINT` | blank | Endpoint of an S3-compatible service. Setting any `S3_*` value selects S3 storage unless `STORAGE_PROVIDER` says otherwise. |
| `S3_BUCKET` | `lobbystack` | Bucket for recordings and uploads. |
| `S3_REGION` | `us-east-1` | Bucket region. |
| `S3_ACCESS_KEY_ID` | blank | Access key ID. Set it together with the secret. |
| `S3_SECRET_ACCESS_KEY` | blank | Secret access key. Set it together with the key ID. |
| `S3_FORCE_PATH_STYLE` | `false` | Set to `true` for services that need path-style URLs, such as MinIO. |
| `SMTP_HOST` | blank | SMTP server the worker sends email through. Authentication emails fail while it is blank. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_SECURE` | `false` | Set to `true` for TLS from the first byte (usually port 465). |
| `SMTP_USERNAME` | blank | SMTP username. |
| `SMTP_PASSWORD` | blank | SMTP password. |
| `STRIPE_CONNECT_SECRET_KEY` | blank | Stripe secret key for Connect payments. Set it together with the webhook secret to turn Stripe Connect on. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | blank | Secret that verifies Stripe Connect webhooks. |
| `TELEPHONY_NUMBERS` | blank | Carrier that sells numbers, per country, as `COUNTRY:carrier` pairs such as `US:telnyx,*:twilio`. `*` is the fallback. Blank means Twilio. See `docs/voice/runtime.md`. |
| `TELEPHONY_VERIFY` | blank | Carrier that verifies phone numbers at onboarding: `twilio` or `telnyx`. Blank means Twilio. |
| `TELEPHONY_LOOKUP` | blank | Carrier that looks up phone numbers: `twilio` or `telnyx`. Blank means Twilio. |
| `TELEPHONY_ALERT_SMS` | blank | Carrier that sends alert texts: `twilio` or `telnyx`. Blank means Twilio. |
| `TELEPHONY_ALERT_SMS_FROM` | blank | Number alert texts come from. Falls back to `TWILIO_ALERT_SMS_FROM`. |
| `TELNYX_API_KEY` | blank | Telnyx API key. |
| `TELNYX_PUBLIC_KEY` | blank | Public key that verifies the Ed25519 signature on Telnyx webhooks. |
| `TELNYX_OUTBOUND_VOICE_PROFILE_ID` | blank | Telnyx outbound voice profile for the numbers you buy. |
| `TELNYX_TEXML_APPLICATION_ID` | blank | Telnyx TeXML application for the fallback call path. |
| `TELNYX_TEXML_WEBHOOK_SECRET` | blank | Secret Telnyx sends as the `key` query parameter on TeXML voice webhooks that carry no signature. |
| `TELNYX_MESSAGING_PROFILE_ID` | blank | Telnyx messaging profile for texts. |
| `TELNYX_VERIFY_PROFILE_ID` | blank | Telnyx Verify profile for phone verification. |
| `TELNYX_GB_REQUIREMENT_GROUP_ID` | blank | Telnyx requirement group that approves United Kingdom number purchases. |
| `TELNYX_AU_REQUIREMENT_GROUP_ID` | blank | Telnyx requirement group that approves Australian number purchases. |
| `TELNYX_NZ_REQUIREMENT_GROUP_ID` | blank | Telnyx requirement group that approves New Zealand number purchases. |
| `TRUSTED_CLIENT_IP_HEADER` | blank | Header that carries the real client IP: `x-real-ip` or `cf-connecting-ip`. Blank disables per-client IP attribution, and requests share one rate-limit bucket. |
| `TRUSTED_CLIENT_COUNTRY_HEADER` | blank | Country header your edge sets when the IP header is not Cloudflare's own. Only name a header the edge overwrites: a free trial reads it to pick the mobile check. |
| `TWILIO_ACCOUNT_SID` | blank | Twilio account SID. |
| `TWILIO_AUTH_TOKEN` | generated | Twilio auth token. Only you can supply it, so `pnpm env:generate` leaves it blank. |
| `TWILIO_SIP_TRUNK_SID` | blank | SID of the Elastic SIP trunk that sends calls to GPT-Live. |
| `TWILIO_VERIFY_SERVICE_SID` | blank | Twilio Verify service for phone verification at onboarding. |
| `TWILIO_GB_BUNDLE_SID` | blank | Approved regulatory bundle for United Kingdom numbers. |
| `TWILIO_AU_BUNDLE_SID` | blank | Approved regulatory bundle for Australian numbers. |
| `TWILIO_AU_ADDRESS_SID` | blank | Address of the Australian bundle. |
| `TWILIO_NZ_BUNDLE_SID` | blank | Approved regulatory bundle for New Zealand numbers. |
| `TWILIO_NZ_ADDRESS_SID` | blank | Address of the New Zealand bundle. |
| `TWILIO_ALERT_SMS_FROM` | blank | Older name of `TELEPHONY_ALERT_SMS_FROM`. |
| `TWILIO_ALERT_ACCOUNT_SID` | blank | Separate Twilio account that sends alert texts. Blank uses the main account. |
| `TWILIO_ALERT_API_KEY_SID` | blank | API key SID for the alert account. |
| `TWILIO_ALERT_API_KEY_SECRET` | blank | API key secret for the alert account. |
| `TWILIO_ALERT_WEBHOOK_KEY_ID` | blank | Signing key SID of the alert account's webhooks. |
| `TWILIO_ALERT_WEBHOOK_SECRET` | blank | Signing key secret of the alert account's webhooks. |
| `TWILIO_SMS_WEBHOOK_URL` | `http://127.0.0.1:13000/api/webhooks/twilio/sms` | Public URL Twilio posts incoming texts to. Twilio signs this exact URL, so it must match. |
| `TWILIO_STATUS_CALLBACK_URL` | `http://127.0.0.1:13000/api/webhooks/twilio/status` | Public URL Twilio posts message status updates to. |
| `WEB_CALL_PUBLIC_BUSINESS_SLUG` | blank | Slug of the business that anonymous browser calls reach. |
| `WEB_CALL_ALLOWED_ORIGINS` | `http://localhost:13000,http://lobbystack.localhost:13000` | Origins allowed to start browser calls, separated by commas. |
| `WIDGET_SESSION_SECRET` | generated | Secret that signs website chat widget sessions. Falls back to `BETTER_AUTH_SECRET`. Generated by `pnpm env:generate`. |
| `WIDGET_KEY_ISSUANCE_ENABLED` | `false` | Set to `true` to let businesses create new widget keys. Existing keys keep working. |
| `WORKER_PORT` | `13002` | Port the worker listens on. |
| `WORKER_INTERNAL_URL` | `http://127.0.0.1:13002` | URL the admin uses to reach the worker. |
| `ADMIN_PORT` | `13000` | Port of the admin app. In Docker Compose it is the host port. |
| `ALLOWED_DEV_ORIGINS` | blank | Extra hosts the Next.js dev server accepts, such as a tunnel's. |
| `AUTH_TRUSTED_ORIGINS` | blank | Extra origins that may call the auth endpoints, separated by commas. |
| `BETTER_AUTH_SECRET` | generated | Secret that signs sessions. At least 32 random characters. Required in production. |
| `CADDY_ON_DEMAND_TLS` | blank | Set to `true` when the host's Caddy asks the admin before it issues a certificate for a partner's domain. Cloudflare for SaaS wins when both are set. |
| `DATABASE_URL` | `postgres://postgres:replace-with-a-long-local-password@127.0.0.1:15433/lobbystack` | PostgreSQL connection URL. |
| `DEPLOYMENT_MODE` | `self_hosted_standard` | `development`, `self_hosted_standard` or `cloud`. Changes billing and signup behaviour. |
| `ENCRYPTION_KEY` | generated | Key that encrypts stored credentials, such as calendar tokens. Changing it makes them unreadable. |
| `FEEDBACK_TO_EMAIL` | blank | Address that receives feedback sent from the dashboard. |
| `HTTP_PORT` | `80` | Host port of the Caddy proxy in Docker Compose. |
| `LIVE_PROTOTYPE_ENABLED` | `true` | Set to `true` to turn on browser test calls and GPT-Live. Admin and worker both need it. |
| `MARKETING_HOSTS` | `lobbystack.localhost,www.lobbystack.localhost` | Hosts that serve the marketing site instead of the dashboard, separated by commas. |
| `NUMBER_CLAIM_TOKEN_SECRET` | generated | Secret that signs number-claim tokens. At least 32 random characters. |
| `OTP_HASH_SECRET` | generated | Secret that hashes verification codes and keypad PINs. Admin and worker share it, and changing it invalidates saved PINs. |
| `PASSKEY_RP_ID` | `app.lobbystack.localhost` | Relying party ID passkeys are bound to. Blank uses the hostname of `APP_BASE_URL`. Changing it locks users out of the passkeys they made. |
| `PLATFORM_API_KEYS` | blank | Platform API keys for the host's own integrations. `pnpm platform-key:create` prints an entry. |
| `PROSPECT_DEMO_OPERATOR_EMAIL` | blank | Email of the one operator allowed to use the prospect demo endpoints and script. They answer 503 while it is blank. |
| `PUBLIC_API_RATE_LIMIT_PER_MINUTE` | `120` | Requests per minute each key may make to the v1 API. |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | Set to `true` to require email verification before sign-in. |
| `SERVICE_VERSION` | `development` | Version string reported in telemetry. |
| `STORAGE_PROVIDER` | `local` | `local` or `s3`. Blank picks S3 when any `S3_*` value is set, otherwise local. |
| `TURNSTILE_SECRET_KEY` | blank | Cloudflare Turnstile secret key that verifies the sign-up challenge. |
| `VOICE_RECOVERY_DATABASE_URL` | blank | Database URL that `scripts/operations/voice-recovery.ts` connects to as the worker role. |

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md), keep durable business logic in the domain and database layers, and put the receptionist's tools in the agent core.

Before opening a PR, run:

```bash
pnpm typecheck
pnpm build
pnpm test
```

## License

LobbyStack is licensed under the [MIT License](./LICENSE).
