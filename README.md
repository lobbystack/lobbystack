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

Every variable in `.env` is described in [Environment variables](#environment-variables). Local development stores recordings and uploads under `.lobbystack/storage`. Set `STORAGE_PROVIDER=s3` when you need to test an S3-compatible service.

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

`.env.example` lists every variable with its default, grouped by the prefix of its name. Copy it to `.env`, then change the values in these tables that apply to you. Replace every `placeholder` before you expose a deployment, and keep secrets out of `NEXT_PUBLIC_*` variables, because Next.js writes those into browser bundles. The [self-hosting guide](https://docs.lobbystack.com/self-hosting/environment-variables) covers how to set them in production.

### AI

| Variable | Default | Description |
| --- | --- | --- |
| `AI_CHAT_API_KEY` | empty | API key for the chat model. Falls back to `OPENAI_API_KEY`. |
| `AI_CHAT_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible endpoint for the chat model. |
| `AI_CHAT_MODEL` | empty | Chat model. Leave it blank on OpenAI to use `gpt-6-luna`. Set it for any other OpenAI-compatible endpoint. |
| `AI_CHAT_REASONING_EFFORT` | empty | OpenAI only: `none`, `minimal`, `low`, `medium`, `high`, or `xhigh`. Defaults to `high`. |
| `AI_CHAT_PROVIDER_NAME` | `openai` | Provider label recorded with each usage and cost entry. |
| `AI_SUMMARY_MODEL` | empty | Model that writes the one-line summary of each finished call and picks up the caller's name. Blank uses `AI_CHAT_MODEL`. |
| `AI_SUMMARY_REASONING_EFFORT` | empty | OpenAI only: reasoning effort for call summaries. Defaults to `low`. |
| `AI_DELEGATION_MODEL` | empty | Model that answers what GPT-Live hands off during a call, such as a booking or a message. Blank uses `AI_CHAT_MODEL`. |
| `AI_DELEGATION_REASONING_EFFORT` | empty | OpenAI only: reasoning effort for answers during calls. Defaults to `low`. Website chat keeps `AI_CHAT_REASONING_EFFORT`. |
| `AI_DELEGATION_SERVICE_TIER` | empty | OpenAI only: processing tier for answers during calls: `auto`, `default`, `flex`, or `priority`. Defaults to `priority`, which answers faster and costs twice the standard token price. |
| `AI_CHAT_INPUT_COST_PER_MILLION_TOKENS` | empty | Input price of the chat model in USD per million tokens, so usage records what it cost. |
| `AI_CHAT_CACHED_INPUT_COST_PER_MILLION_TOKENS` | empty | Cached input price in USD per million tokens. Blank uses the input price. |
| `AI_CHAT_OUTPUT_COST_PER_MILLION_TOKENS` | empty | Output price of the chat model in USD per million tokens. |
| `AI_CHAT_PRICING_VERSION` | empty | Label for the chat prices. A cost is recorded only when the version, source, and effective date are all set. |
| `AI_CHAT_PRICING_SOURCE` | empty | URL where the chat prices are published. |
| `AI_CHAT_PRICING_EFFECTIVE_DATE` | empty | Date the chat prices took effect. |
| `AI_EMBEDDING_API_KEY` | empty | API key for embeddings. Falls back to `OPENAI_API_KEY`. |
| `AI_EMBEDDING_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible embeddings endpoint. |
| `AI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model. It must return 1536 dimensions. |
| `AI_EMBEDDING_PROVIDER_NAME` | `openai` | Provider label recorded with usage and in the embedding fingerprint. |
| `AI_EMBEDDING_REVISION` | `1` | Revision label that goes into the embedding fingerprint. Change it to mark stored embeddings as made by an older setup. |
| `AI_EMBEDDING_INPUT_COST_PER_MILLION_TOKENS` | empty | Embedding price in USD per million tokens. The Docker Compose file defaults it to `0.02`. |
| `AI_EMBEDDING_PRICING_VERSION` | empty | Label for the embedding prices. |
| `AI_EMBEDDING_PRICING_SOURCE` | empty | URL where the embedding prices are published. |
| `AI_EMBEDDING_PRICING_EFFECTIVE_DATE` | empty | Date the embedding prices took effect. |
| `AI_EMBEDDING_TIMEOUT_MS` | `30000` | Timeout for one embedding request, in milliseconds. |
| `AI_EMBEDDING_MAX_PARALLEL_CALLS` | `4` | Most embedding requests sent at the same time. |

### APP

| Variable | Default | Description |
| --- | --- | --- |
| `APP_BASE_URL` | `http://localhost:13000` | Public URL of the dashboard and API. Webhook URLs and redirect addresses are built from it. |
| `APP_HOSTNAME` | `localhost` | Hostname the Docker Compose health check sends as its `Host` header. |

### BRAND

| Variable | Default | Description |
| --- | --- | --- |
| `BRAND_APP_NAME` | empty | Name the dashboard shows instead of LobbyStack, up to 40 characters. Wins over the name the first owner chooses in onboarding. |
| `BRAND_LOGO_URL` | empty | Logo beside the name and in the browser tab. An `https://` URL or a path on the dashboard, such as `/brand/logo.svg`. |

### CAL.COM

| Variable | Default | Description |
| --- | --- | --- |
| `CALCOM_CLIENT_ID` | empty | Client ID of a confidential Cal.com OAuth client with every scope in `packages/providers/src/calcom/calendar.ts`. |
| `CALCOM_CLIENT_SECRET` | empty | Cal.com OAuth client secret. |
| `CALCOM_REDIRECT_URI` | `http://localhost/api/calendar/calcom/callback` | Callback URL registered with Cal.com, ending in `/api/calendar/calcom/callback`. |
| `CALCOM_PLACEHOLDER_EMAIL_DOMAIN` | empty | Required with the client. Domain of the stand-in attendee address Cal.com gets instead of the caller's email. Cal.com checks it for an MX record, so point it at a mail server that discards mail. |

### CALENDLY

| Variable | Default | Description |
| --- | --- | --- |
| `CALENDLY_CLIENT_ID` | empty | Client ID of a Calendly OAuth app with every scope in `packages/providers/src/calendly/calendar.ts`. |
| `CALENDLY_CLIENT_SECRET` | empty | Calendly client secret. Calendly shows it once, when the app is created. |
| `CALENDLY_REDIRECT_URI` | `http://localhost/api/calendar/calendly/callback` | Callback URL registered with Calendly, ending in `/api/calendar/calendly/callback`. |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | empty | Signing key for Calendly webhooks. Calendly shows it once, when the app is created. |
| `CALENDLY_PLACEHOLDER_EMAIL_DOMAIN` | empty | Required with the app. Domain of the stand-in invitee address Calendly gets instead of the caller's email. Point it at a mail server that discards mail, because Calendly sends its notifications there. |

### CLOUDFLARE

| Variable | Default | Description |
| --- | --- | --- |
| `CLOUDFLARE_SAAS_API_TOKEN` | empty | Cloudflare API token that can edit custom hostnames in the zone of `CLOUDFLARE_SAAS_ZONE_ID`. With both set, partners connect domains through Cloudflare for SaaS instead of Caddy. |
| `CLOUDFLARE_SAAS_ZONE_ID` | empty | ID of the Cloudflare zone that holds your custom hostnames. |

### CONTENT

| Variable | Default | Description |
| --- | --- | --- |
| `CONTENT_RETENTION_ENABLED` | `true` | Retention is on unless this is `false`, which turns it off for the whole deployment. |
| `CONTENT_RETENTION_POLICY_JSON` | empty | Optional JSON policy that overrides the plan's retention days per category (`messages`, `transcripts`, `recordings`, `follow_ups`). Leave it blank for the plan defaults. |
| `CONTENT_RETENTION_DATABASE_URL` | empty | Worker-role connection string the retention backfill script needs. Only that script reads it. |

### EMAIL

| Variable | Default | Description |
| --- | --- | --- |
| `EMAIL_FROM` | `LobbyStack <no-reply@example.com>` | Sender for transactional email. |
| `EMAIL_REPLY_TO` | empty | Reply-To address of the deployment's email. A white-label brand can set its own per email. |

### FINANCE

| Variable | Default | Description |
| --- | --- | --- |
| `FINANCE_EXPORT_ENABLED` | `false` | The export answers only when this is `true`. Otherwise it returns 404. |
| `FINANCE_EXPORT_TOKEN` | empty | Bearer token that callers of the export present. It doesn't accept the internal service credentials. |

### FIRECRAWL

| Variable | Default | Description |
| --- | --- | --- |
| `FIRECRAWL_API_KEY` | empty | Firecrawl API key for website knowledge ingestion. |
| `FIRECRAWL_BASE_URL` | empty | Firecrawl endpoint, for a self-hosted instance. Blank uses the hosted API. |

### GOOGLE

| Variable | Default | Description |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | empty | Google OAuth client ID for Google Calendar and **Continue with Google**. |
| `GOOGLE_CLIENT_SECRET` | empty | Google OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | `http://localhost/api/calendar/google/callback` | Callback URL registered with Google, ending in `/api/calendar/google/callback`. |

### INSTAGRAM

| Variable | Default | Description |
| --- | --- | --- |
| `INSTAGRAM_APP_ID` | empty | App ID of a Meta app with Instagram Business Login. |
| `INSTAGRAM_APP_SECRET` | empty | App secret of that Meta app. |
| `INSTAGRAM_REDIRECT_URI` | `http://localhost/api/integrations/instagram/callback` | Callback URL registered with Meta, ending in `/api/integrations/instagram/callback`. |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | empty | Token for the `/api/webhooks/instagram` subscription. |

### INTERNAL

| Variable | Default | Description |
| --- | --- | --- |
| `INTERNAL_SERVICE_SECRET` | placeholder | Signs browser call end tokens and other short-lived internal values. Replace the placeholder. |
| `INTERNAL_SERVICE_TOKEN` | placeholder | Authenticates the admin's call handoff to the worker and protected internal health routes. Use the same value on the admin and the worker. |

### LOBBYSTACK

| Variable | Default | Description |
| --- | --- | --- |
| `LOBBYSTACK_FINANCE_EXPORT_DATABASE_URL` | empty | Connection string for the read-only `lobbystack_finance_export` database role. |
| `LOBBYSTACK_APP_PASSWORD` | placeholder | Password of the `lobbystack_app` role. |
| `LOBBYSTACK_AUTH_PASSWORD` | placeholder | Password of the `lobbystack_auth` role. |
| `LOBBYSTACK_WORKER_PASSWORD` | placeholder | Password of the `lobbystack_worker` role. |
| `LOBBYSTACK_DISPATCHER_PASSWORD` | placeholder | Password of the `lobbystack_dispatcher` role. |
| `LOBBYSTACK_MIGRATOR_PASSWORD` | placeholder | Password of the `lobbystack_migrator` role, which runs migrations. |
| `LOBBYSTACK_READONLY_PASSWORD` | placeholder | Password of the read-only role. |
| `LOBBYSTACK_MAINTENANCE_MODE` | `false` | Set to `true` to put the deployment in maintenance mode. Any other value keeps normal operation. |
| `LOBBYSTACK_CERTIFICATION_MODE` | `false` | Set to `true` to restrict email, texts, calendars, and billing to the allow-lists below, for provider certification runs. |
| `LOBBYSTACK_CERTIFICATION_EMAILS` | empty | Comma- or newline-separated emails that certification mode may write to. |
| `LOBBYSTACK_CERTIFICATION_PHONES` | empty | Comma- or newline-separated E.164 numbers that certification mode may text. |
| `LOBBYSTACK_CERTIFICATION_CALENDARS` | empty | Comma- or newline-separated calendar IDs that certification mode may use. `primary` is never allowed. |

### LOCAL

| Variable | Default | Description |
| --- | --- | --- |
| `LOCAL_STORAGE_PATH` | `.lobbystack/storage` | Directory for local storage, shared by the admin and the worker. |
| `LOCAL_STORAGE_SIGNING_SECRET` | placeholder | Signs short-lived local upload and download URLs. Use a long random value. |

### MAILPIT

| Variable | Default | Description |
| --- | --- | --- |
| `MAILPIT_SMTP_PORT` | `1025` | Host port for the local Mailpit SMTP server that Docker Compose starts. |
| `MAILPIT_UI_PORT` | `8025` | Host port for the Mailpit web inbox. |

### NEXT

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:13000` | The dashboard's URL as the browser sees it. |
| `NEXT_PUBLIC_LANDING_SITE_URL` | empty | Your website. The public demo page and the SMS HELP reply link to it. |
| `NEXT_PUBLIC_TERMS_URL` | empty | Your terms of service, linked under the sign-up form and at the foot of onboarding. |
| `NEXT_PUBLIC_PRIVACY_URL` | empty | Your privacy policy, linked under the sign-up form and at the foot of onboarding. |
| `NEXT_PUBLIC_DOCS_SITE_URL` | empty | Your docs, linked from the feedback panel and the MCP server's metadata. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | empty | The one address people write to: the feedback panel, the Enterprise plan's contact button, and SMS HELP replies. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | empty | Cloudflare Turnstile site key for the sign-up and email-code forms. |
| `NEXT_PUBLIC_LIVE_CALL_ENDPOINT` | `http://localhost:13000/api/voice/live/session` | URL the marketing site's demo posts to when it starts a call, ending in `/api/voice/live/session`. |
| `NEXT_PUBLIC_WEB_CALL_BUSINESS_SLUG` | empty | Slug of the business that answers the marketing site's demo call, as the browser sends it. |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | empty | PostHog project token for the browser. |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://ts.lobbystack.com` | PostHog ingestion host for the browser. |

### ONBOARDING

| Variable | Default | Description |
| --- | --- | --- |
| `ONBOARDING_FOLLOWUP_FROM` | empty | Sender address of the founder check-in email. Worker only. The email goes out only when this and the sender name are both set. |
| `ONBOARDING_FOLLOWUP_SENDER_NAME` | empty | Sender name of the founder check-in email. Worker only. |

### OPENAI

| Variable | Default | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | empty | GPT-Live calls, and the fallback key for `AI_CHAT_*` and `AI_EMBEDDING_*`. |
| `OPENAI_WEBHOOK_SECRET` | empty | Verifies OpenAI's incoming-call webhook at `/api/webhooks/openai/live`. Phone calls only. |
| `OPENAI_PROJECT_ID` | empty | Your OpenAI project ID (`proj_…`). The worker needs it to buy Telnyx numbers, and the admin and the worker both need it for staff answers first on Twilio numbers. |

### OTEL

| Variable | Default | Description |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | OTLP base URL. LobbyStack appends `/v1/traces`, `/v1/metrics`, and `/v1/logs`. Leave it blank to turn export off. |
| `OTEL_EXPORTER_OTLP_HEADERS` | empty | Comma-separated `key=value` headers for each OTLP request. |

### PARTNER

| Variable | Default | Description |
| --- | --- | --- |
| `PARTNER_BASE_DOMAIN` | empty | Domain partners get subdomains of, such as `receptionistportal.com`. |
| `PARTNER_DOMAIN_CNAME_TARGET` | empty | Hostname partners point their domain's CNAME record at. Defaults to the zone's fallback origin with Cloudflare for SaaS, and to the hostname in `APP_BASE_URL` with Caddy. |
| `PARTNER_SIGNUP` | empty | Who can sign up as a partner: `open` or `invite`. Defaults to `open`, except on cloud deployments with partner tier billing off, where it defaults to `invite`. |

### POLAR

| Variable | Default | Description |
| --- | --- | --- |
| `POLAR_ACCESS_TOKEN` | empty | Polar access token. |
| `POLAR_WEBHOOK_SECRET` | placeholder | Verifies Polar webhooks. Replace the placeholder. |
| `POLAR_ACCEPT_LEGACY_BUSINESS_IDS` | `false` | Set to `true` to accept Polar webhooks that name a business by its ID from the previous Convex platform. |
| `POLAR_ORGANIZATION_ID` | empty | Polar organization ID. |
| `POLAR_API_BASE_URL` | empty | Polar API URL. Set it to the sandbox URL when you test. |
| `POLAR_STARTER_MONTHLY_PRODUCT_ID` | empty | Polar product for the Starter plan, billed monthly. |
| `POLAR_STARTER_ANNUAL_PRODUCT_ID` | empty | Polar product for the Starter plan, billed annually. |
| `POLAR_PRO_MONTHLY_PRODUCT_ID` | empty | Polar product for the Pro plan, billed monthly. |
| `POLAR_PRO_ANNUAL_PRODUCT_ID` | empty | Polar product for the Pro plan, billed annually. |
| `POLAR_PARTNER_STARTER_MONTHLY_PRODUCT_ID` | empty | Polar product for the partner Starter tier, billed monthly. Partner tier billing turns on when all six partner products are set. |
| `POLAR_PARTNER_STARTER_ANNUAL_PRODUCT_ID` | empty | The same tier, billed annually. |
| `POLAR_PARTNER_GROWTH_MONTHLY_PRODUCT_ID` | empty | Polar product for the partner Growth tier, billed monthly. |
| `POLAR_PARTNER_GROWTH_ANNUAL_PRODUCT_ID` | empty | The same tier, billed annually. |
| `POLAR_PARTNER_SCALE_MONTHLY_PRODUCT_ID` | empty | Polar product for the partner Scale tier, billed monthly. |
| `POLAR_PARTNER_SCALE_ANNUAL_PRODUCT_ID` | empty | The same tier, billed annually. |

### POSTGRES

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | placeholder | Password of the `postgres` superuser in the Docker Compose database. |
| `POSTGRES_PORT` | `15433` | Host port of the Docker Compose database. |

### POSTHOG

| Variable | Default | Description |
| --- | --- | --- |
| `POSTHOG_API_KEY` | empty | PostHog key for server-side product analytics and error reporting. |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | PostHog ingestion host for the server. |

### REDIS

| Variable | Default | Description |
| --- | --- | --- |
| `REDIS_PORT` | `16380` | Host port of the Docker Compose Redis. |
| `REDIS_URL` | `redis://127.0.0.1:16380` | Redis connection URL for the admin and the worker. |

### S3

| Variable | Default | Description |
| --- | --- | --- |
| `S3_ENDPOINT` | empty | S3-compatible endpoint. Leave it blank for AWS S3. |
| `S3_BUCKET` | `lobbystack` | Bucket for recordings and uploads. |
| `S3_REGION` | `us-east-1` | S3 region. |
| `S3_ACCESS_KEY_ID` | empty | Object-storage access key ID. |
| `S3_SECRET_ACCESS_KEY` | empty | Object-storage secret access key. |
| `S3_FORCE_PATH_STYLE` | `false` | Set to `true` for MinIO. |

### SMTP

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_HOST` | empty | SMTP server. Without it, the worker logs a warning and sign-in and other email jobs fail. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_SECURE` | `false` | Set to `true` for an implicit TLS connection, usually on port 465. |
| `SMTP_USERNAME` | empty | SMTP username. |
| `SMTP_PASSWORD` | empty | SMTP password. |

### STRIPE

| Variable | Default | Description |
| --- | --- | --- |
| `STRIPE_CONNECT_SECRET_KEY` | empty | Secret (`sk_...`) or restricted (`rk_...`) key of your Stripe platform account, for partners' billing through Connect. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | empty | Signing secret (`whsec_...`) of the webhook endpoint at `APP_BASE_URL` + `/api/webhooks/stripe`. |

### TELEPHONY

| Variable | Default | Description |
| --- | --- | --- |
| `TELEPHONY_NUMBERS` | empty | Carrier that sells numbers in each country, such as `US:telnyx,*:twilio`. A malformed value stops the worker at startup. |
| `TELEPHONY_VERIFY` | empty | Carrier for the onboarding phone code. |
| `TELEPHONY_LOOKUP` | empty | Carrier for the line type check. |
| `TELEPHONY_ALERT_SMS` | empty | Carrier for the shared sender's texts. |
| `TELEPHONY_ALERT_SMS_FROM` | empty | The shared sender's number. Falls back to `TWILIO_ALERT_SMS_FROM`. |

### TELNYX

| Variable | Default | Description |
| --- | --- | --- |
| `TELNYX_API_KEY` | empty | Telnyx API key. |
| `TELNYX_PUBLIC_KEY` | empty | Telnyx public key that verifies webhook signatures. |
| `TELNYX_OUTBOUND_VOICE_PROFILE_ID` | empty | Outbound voice profile that each Telnyx number's connection gets, which call transfers dial through. |
| `TELNYX_TEXML_APPLICATION_ID` | empty | TeXML application a Telnyx number moves to when the agent stops answering it, such as a trial out of minutes. |
| `TELNYX_TEXML_WEBHOOK_SECRET` | empty | Secret that application's voice URL carries as `?key=`. |
| `TELNYX_MESSAGING_PROFILE_ID` | empty | Telnyx messaging profile for texts. |
| `TELNYX_VERIFY_PROFILE_ID` | empty | Telnyx verify profile for phone codes. |
| `TELNYX_GB_REQUIREMENT_GROUP_ID` | empty | Approved Telnyx requirement group for United Kingdom numbers. Needed when `TELEPHONY_NUMBERS` sends that country to Telnyx. |
| `TELNYX_AU_REQUIREMENT_GROUP_ID` | empty | The same for Australian numbers. |
| `TELNYX_NZ_REQUIREMENT_GROUP_ID` | empty | The same for New Zealand numbers. |

### TRUSTED

| Variable | Default | Description |
| --- | --- | --- |
| `TRUSTED_CLIENT_IP_HEADER` | empty | Name of the client address header that your proxy overwrites: `x-real-ip` or `cf-connecting-ip`. Leave it blank when no proxy sets one. |
| `TRUSTED_CLIENT_COUNTRY_HEADER` | empty | Name of the country header that your edge overwrites, when the client address header isn't Cloudflare's own. Name only a header the edge overwrites: a free trial reads it to pick the mobile check. |

### TWILIO

| Variable | Default | Description |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | empty | Twilio account SID. |
| `TWILIO_AUTH_TOKEN` | placeholder | Twilio auth token. Also authenticates Twilio webhooks. Replace the placeholder. |
| `TWILIO_SIP_TRUNK_SID` | empty | Twilio Elastic SIP trunk that sends calls to your OpenAI project. New numbers join it, and the worker won't provision a number without it. |
| `TWILIO_VERIFY_SERVICE_SID` | empty | Twilio Verify service for the sign-up phone code. |
| `TWILIO_GB_BUNDLE_SID` | empty | Twilio regulatory bundle for United Kingdom numbers. |
| `TWILIO_AU_BUNDLE_SID` | empty | Twilio regulatory bundle for Australian numbers. |
| `TWILIO_AU_ADDRESS_SID` | empty | Twilio address for Australian numbers. |
| `TWILIO_NZ_BUNDLE_SID` | empty | Twilio regulatory bundle for New Zealand numbers. |
| `TWILIO_NZ_ADDRESS_SID` | empty | Twilio address for New Zealand numbers. |
| `TWILIO_ALERT_SMS_FROM` | empty | Number the shared sender texts from. |
| `TWILIO_ALERT_ACCOUNT_SID` | empty | Twilio account that sends the shared sender's texts. |
| `TWILIO_ALERT_API_KEY_SID` | empty | SID of a restricted Twilio API key that can only create messages. |
| `TWILIO_ALERT_API_KEY_SECRET` | empty | Secret of that restricted API key. |
| `TWILIO_ALERT_WEBHOOK_KEY_ID` | empty | ID of the key that signs delivery callbacks for the shared sender's texts. |
| `TWILIO_ALERT_WEBHOOK_SECRET` | empty | Secret of that signing key. |
| `TWILIO_SMS_WEBHOOK_URL` | `http://127.0.0.1:13000/api/webhooks/twilio/sms` | Public URL Twilio sends incoming texts to, ending in `/api/webhooks/twilio/sms`. |
| `TWILIO_STATUS_CALLBACK_URL` | `http://127.0.0.1:13000/api/webhooks/twilio/status` | Public URL Twilio sends text delivery status to, ending in `/api/webhooks/twilio/status`. |

### WEB

| Variable | Default | Description |
| --- | --- | --- |
| `WEB_CALL_PUBLIC_BUSINESS_SLUG` | empty | Slug of the business that answers the public demo call. Set it to the same value as `NEXT_PUBLIC_WEB_CALL_BUSINESS_SLUG`. |
| `WEB_CALL_ALLOWED_ORIGINS` | `http://localhost:13000,http://lobbystack.localhost:13000` | Comma-separated sites allowed to start that public demo call. |

### WIDGET

| Variable | Default | Description |
| --- | --- | --- |
| `WIDGET_SESSION_SECRET` | placeholder | Signs cross-origin website-widget sessions. |
| `WIDGET_KEY_ISSUANCE_ENABLED` | `false` | Set to `true` to let operators create widget keys. |

### WORKER

| Variable | Default | Description |
| --- | --- | --- |
| `WORKER_PORT` | `13002` | Port the worker listens on. |
| `WORKER_INTERNAL_URL` | `http://127.0.0.1:13002` | Private URL of the worker, which the admin uses to hand it each call. |

### Other

| Variable | Default | Description |
| --- | --- | --- |
| `ADMIN_PORT` | `13000` | Port the admin app listens on. |
| `ALLOWED_DEV_ORIGINS` | empty | Hostnames, without `https://`, that the dev server accepts. Add a tunnel's hostname here to open the dashboard through it. |
| `AUTH_TRUSTED_ORIGINS` | empty | Origins that sign-in accepts, besides `APP_BASE_URL`. Patterns such as `*.example.com` work. |
| `BETTER_AUTH_SECRET` | placeholder | Better Auth signing secret. Use at least 32 random characters. |
| `CADDY_ON_DEMAND_TLS` | empty | Set to `true` when Compose's Caddy serves HTTPS through `docker-compose.tls.yml`, so partners can connect a subdomain of their own website. |
| `DATABASE_URL` | `postgres://postgres:replace-with-a-long-local-password@127.0.0.1:15433/lobbystack` | PostgreSQL connection for the service's main role: `lobbystack_app` for the admin, `lobbystack_worker` for the worker. |
| `DEPLOYMENT_MODE` | `self_hosted_standard` | `cloud`, `self_hosted_standard`, or `development`. |
| `ENCRYPTION_KEY` | placeholder | Encrypts stored application credentials and webhook secrets, and keys the HMAC that stores API key hashes. Use the same value on the admin and the worker. Changing it invalidates every API key and webhook secret. |
| `FEEDBACK_TO_EMAIL` | empty | Address that receives feedback sent from the dashboard. Without it, the email isn't delivered. |
| `HTTP_PORT` | `80` | Host port Docker Compose's Caddy publishes for HTTP. |
| `LIVE_PROTOTYPE_ENABLED` | `true` | Set to `true` on the admin and the worker. Browser calls fail without it. |
| `MARKETING_HOSTS` | `lobbystack.localhost,www.lobbystack.localhost` | Comma-separated hosts that serve the marketing site instead of the dashboard. |
| `NUMBER_CLAIM_TOKEN_SECRET` | placeholder | Signs the tokens that let a business claim a phone number. Use at least 32 random characters. |
| `OTP_HASH_SECRET` | placeholder | Hashes one-time verification codes and callers' keypad PINs. Use the same value on the admin and the worker. Changing it makes every saved PIN stop working. |
| `PASSKEY_RP_ID` | `app.lobbystack.localhost` | Domain that passkeys are tied to. Defaults to the hostname of `APP_BASE_URL`. Changing it stops existing passkeys from working. |
| `PLATFORM_API_KEYS` | empty | JSON array of platform keys (`lsp_...`) that onboard and manage businesses on `/api/v1`. `pnpm platform-key:create` prints an entry. |
| `PROSPECT_DEMO_OPERATOR_EMAIL` | empty | Verified email of the one operator who can run prospect demos. Without it, demo operations answer 503. |
| `PUBLIC_API_RATE_LIMIT_PER_MINUTE` | `120` | Requests per minute for each API key on `/api/v1`. Defaults to `120`. |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | Set to `true` to require a verified email before sign-in. |
| `SERVICE_VERSION` | `development` | Version label sent with telemetry. A Railway commit SHA or deployment ID wins over it. |
| `STORAGE_PROVIDER` | `local` | `local` by default. Set it to `s3` for AWS S3, MinIO, or another compatible service. |
| `TURNSTILE_SECRET_KEY` | empty | Cloudflare Turnstile secret key that verifies those forms. Without it, verification passes only when `APP_BASE_URL` is `localhost` or `127.0.0.1`. |
| `VOICE_RECOVERY_DATABASE_URL` | empty | Worker-role connection string the voice recovery script needs. Only that script reads it. |

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
