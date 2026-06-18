# Research: Open-Source AI Receptionist Stack

Research date: June 18, 2026

Topic: turning a Reddit-style product announcement into a website blog post about LobbyStack as an open-source AI receptionist platform that helps teams avoid rebuilding the same voice, automation, scheduling, dashboard, billing, monitoring, and glue-code stack from scratch.

## Target Audience

- Technical founders, indie hackers, and product engineers who have already considered wiring together Retell/Vapi/Twilio, n8n/Zapier, calendars, notifications, transcripts, prompt logic, dashboards, and billing.
- Agencies and consultants building AI phone agents for local businesses, franchises, clinics, salons, home services, restaurants, and professional services clients.
- Operators at privacy-sensitive or infrastructure-conscious businesses who want hosted convenience today but need a credible path to self-hosting, BYO provider accounts, or client-controlled infrastructure.
- Developers comparing "build a voice agent from primitives" against starting from an open-source product with voice, SMS, booking, business knowledge, dashboard review, billing, and monitoring already represented.

Primary reader mindset: "I can build the demo, but do I really want to own every supporting system around it?"

## SEO Recommendation

Recommended SEO title: **Open-Source AI Receptionist Stack | LobbyStack**

Alternative title: **Stop Rebuilding the AI Receptionist Stack**

Meta description: **LobbyStack is an open-source AI receptionist stack for calls, SMS, booking, transcripts, dashboards, billing, and self-hosted deployment.**

Suggested slug: `open-source-ai-receptionist-stack`

Primary keyword: `open-source AI receptionist`

Secondary keywords:

- `self-hosted AI receptionist`
- `AI receptionist stack`
- `AI phone agent platform`
- `open source voice agent`
- `Twilio OpenAI Realtime receptionist`
- `AI appointment booking receptionist`

Search intent: commercial and technical investigation. The reader is not asking "what is an AI receptionist?" They are comparing whether to assemble tools, buy a closed product, or start from an auditable open-source platform.

## Existing LobbyStack Blog Posts To Avoid Duplicating

- `lobbystack-is-live`: already announces LobbyStack as live, explains the small-business problem, lists core features, and introduces open source by design. Avoid repeating the broad launch story.
- `build-or-buy-ai-receptionist`: already frames build vs buy vs self-hosting and covers hidden cost, compliance, pricing comparisons, and the "open-source middle path." Avoid writing another decision framework.
- `how-to-choose-an-ai-receptionist`: already covers buyer criteria, real-call testing, pricing, handoff, reporting, and compliance questions. Avoid turning this into a generic vendor evaluation checklist.
- `ai-receptionist-savings`: already covers ROI, missed-call revenue, human answering comparisons, and cost justification. Avoid making the post primarily about savings math.

Recommended differentiation: make this a product/technical positioning article. The post should feel like a polished version of a Reddit/Hacker News announcement: "We open-sourced the AI receptionist stack people keep rebuilding."

## Core Positioning

LobbyStack is not just a voice prompt connected to a phone number. It is an open-source AI receptionist platform that packages the practical systems a real phone receptionist needs:

- Low-latency inbound voice using Twilio Voice, Twilio Media Streams, and OpenAI Realtime.
- A narrow Node.js voice gateway for live call handling, transfers, recording, and transcript buffering.
- Convex as the source of truth for business state, auth, booking, knowledge, workflows, calls, contacts, appointments, billing state, and settings.
- A React/Vite dashboard where teams manage calls, messages, contacts, appointments, transcripts, recordings, usage, billing, integrations, rules, and business knowledge.
- Plain-text rules so operators can describe behavior in human terms instead of maintaining brittle flowcharts.
- Hosted cloud for teams that want managed setup, plus Docker Compose self-hosting for teams that need infrastructure control.
- Bring-your-own provider accounts for self-hosted deployments, including Convex, Twilio, OpenAI, calendar, email, analytics, and billing-related credentials.

The thesis: most teams can build a convincing AI phone demo quickly. The hard part is the stack around it: scheduling, transcripts, storage, dashboards, usage metering, billing, notifications, monitoring, privacy controls, provider setup, and call-specific failure handling. LobbyStack gives teams that base layer as open source.

## Suggested Outline

### Hook

Open with the pain of "weekend-demo voice agents" becoming a production system:

> The first AI receptionist demo is the easy part. The second week is when you realize you also need phone numbers, realtime audio, scheduling, transcripts, notifications, dashboards, billing, monitoring, and a place for non-engineers to change what the agent is allowed to do.

### 1. The Stack People Keep Rebuilding

List the usual assembled pieces:

- Retell or Vapi for voice-agent orchestration, or Twilio plus custom realtime audio handling.
- n8n, Zapier, Make, or custom webhooks for glue workflows.
- Google Calendar or Outlook for availability and booking.
- A database for contacts, calls, transcripts, recordings, appointments, and business settings.
- A dashboard for staff to review what happened.
- Prompt/version logic, business facts, rules, and guardrails.
- SMS/email notifications, callback tasks, transfer rules, and quote requests.
- Usage tracking, billing, monitoring, alerts, and provider error handling.

Position this as understandable, not foolish. These tools are useful. The issue is that a production receptionist needs the whole system to work together.

### 2. What LobbyStack Packages

Explain the repo-backed product areas:

- Voice reception through Twilio Voice, Media Streams, and OpenAI Realtime.
- SMS conversations and alerts connected to the same customer history.
- Booking and appointment changes through calendar-backed workflows.
- Knowledge base from structured business facts, text entries, documents, and imported website pages.
- Human handoff through live transfers, messages, callback tasks, SMS/email alerts, and dashboard review.
- Calls dashboard with outcomes, summaries, transcripts, recordings, and follow-up tasks.
- Billing and usage surfaces for hosted plans, voice minutes, SMS segments, outbound call attempts, storage, add-ons, and transactions.

### 3. Plain-Language Instructions Instead Of Brittle Flows

Use the docs' rules concept: operators can write rules like a teammate handoff.

Examples to include:

- "If pricing depends on the customer's situation, explain the starting point and offer a team follow-up."
- "If the caller asks for a human and transfer is unavailable, take a callback message."
- "If the receptionist is unsure, take a message instead of guessing."
- "Outside business hours, collect the caller's preferred callback window."

Tie this to tools: the AI can still call authoritative backend operations for availability, booking, transfers, saved messages, callback tasks, notes, and notifications.

### 4. Hosted Cloud Or Self-Hosted Docker

Make the deployment choice explicit:

- Hosted cloud is for speed: create an account, configure the receptionist, connect integrations, and go live without managing infrastructure.
- Self-hosting is for control: run the stack on client-controlled infrastructure, bring provider accounts, manage secrets, set retention policies, and decide where data lives.
- Docker Compose is the official single-host baseline, including Convex backend, Convex dashboard, web dashboard, voice gateway, and Caddy for HTTPS.
- Production self-hosting still needs public HTTPS URLs, Twilio, OpenAI, provider credentials, DNS/TLS, secrets, backups, monitoring, and operational ownership.

Avoid saying self-hosting is effortless. Say it avoids blank-page engineering while keeping control.

### 5. Bring Your Own Keys, Keep Your Own Steering Wheel

Use the BYO angle:

- Self-hosted deployments can use their own Twilio, OpenAI, Convex, Google Calendar, Resend, PostHog, billing, and analytics-related credentials.
- Users pay providers directly in self-hosted mode and can operate within client procurement, compliance, or data-residency constraints.
- Agencies can deploy on infrastructure controlled by the client instead of asking the client to trust an opaque SaaS account.

Important caveat: current docs specifically name OpenAI Realtime for live voice; Gemini is used for embeddings and non-realtime text tasks in current self-hosted provider docs. Avoid claiming fully arbitrary model switching unless the code/docs support it in the final post.

### 6. Why Open Source Matters For Phone Calls

Ground this in trust:

- Calls contain customer names, phone numbers, needs, urgency, sometimes sensitive details, and purchase intent.
- Open source lets teams inspect call handling, data paths, routing, storage, prompts, and escalation logic.
- It gives a path to customization when the client's workflow does not fit a closed vendor's product shape.
- It reduces lock-in around the app layer, even though provider accounts and operations still need care.

### CTA

End with two paths:

- Try LobbyStack Cloud if you want the product managed.
- Use the Docker/self-hosting docs or GitHub repo if you want to inspect, fork, or deploy it yourself.

## Specific Talking Points Grounded In Repo/Site Context

1. **LobbyStack's live voice path is intentionally speech-to-speech with OpenAI Realtime.** The voice gateway handles Twilio Voice ingress, Media Streams, Realtime session orchestration, transfer execution, transcript buffering, and recording upload. This is stronger than saying "AI phone calls"; it signals a real low-latency phone architecture.

2. **Convex is the source of truth, while the voice gateway stays narrow.** Repo architecture docs say Convex owns durable business state, booking, knowledge, workflows, auth, and storage. The gateway fetches a business context snapshot once at call start and calls Convex only for authoritative actions like availability checks, booking, transfer decisions, message saving, transcripts, and recordings.

3. **The product already covers the operational surfaces a stitched stack usually lacks.** README and docs reference calls, SMS threads, contacts, appointments, recordings, transcripts, follow-ups, analytics, usage, billing, and settings in the dashboard. This is the "not just a voice agent" proof point.

4. **Plain-text rules are a major contrast against visual workflow sprawl.** The docs say the Rules page lets teams shape behavior in plain text instead of maintaining decision trees. That directly supports the article's positioning against brittle n8n/Zapier-style glue for call-specific logic.

5. **Self-hosting is real and documented, not just an enterprise promise.** The README and Mintlify docs include a Docker Compose path using `docker-compose.self-hosted.yml`, `.env.self-hosted`, helper scripts for secrets and Convex env sync, and `pnpm self-hosted:verify`.

6. **Docker Compose packages the core services on one host.** The documented baseline runs Convex open-source backend, Convex dashboard, web dashboard, voice gateway, and Caddy. That is the concrete infrastructure story to include when the article says "deploy on client-controlled infrastructure."

7. **BYO provider accounts are part of the self-hosted value proposition.** The README explicitly says self-hosted deployments can use your own Convex, Twilio, OpenAI, calendar, email, analytics, and billing provider credentials. Provider docs name Twilio for phone/SMS, OpenAI for Realtime voice, Google Calendar for booking, Firecrawl for website import, Gemini for embeddings/non-realtime text, Resend for email, and PostHog for telemetry.

8. **Business context is snapshot-based, not per-turn backend polling.** Architecture docs say Convex compiles business configuration and knowledge into a `business_context_snapshot`; the voice gateway loads it once per call. This is a good technical detail because it explains how LobbyStack balances low-latency calls with authoritative backend actions.

## Claims To Use Carefully

- Say "helps you avoid rebuilding" rather than "replaces Retell/Vapi/Twilio/n8n/Zapier entirely." Twilio is still a required provider for live calls in current docs, and automation tools may still be useful for downstream workflows.
- Say "bring your own provider accounts/API keys in self-hosted deployments" rather than implying BYO keys apply equally to managed cloud.
- Say "self-hosting gives infrastructure and data-control options" rather than "makes compliance automatic."
- Say "plain-language rules reduce workflow glue" rather than "no workflows are ever needed."
- Say "open-source core" and "same codebase can be hosted or self-hosted" while avoiding promises about perfect cloud-to-self-host migration unless verified in product docs at publication time.

## Internal Links To Include

- `/solutions/open-source-ai-receptionist/`
- `/solutions/self-hosted-ai-receptionist/`
- `/features/`
- `/pricing/`
- `/docs/api/`
- `https://github.com/lobbystack/lobbystack`
- `https://docs.lobbystack.com/self-hosting/overview`
- `https://docs.lobbystack.com/self-hosting/docker-compose`
- `https://docs.lobbystack.com/agent/rules`

## Source Notes From Repo/Site

- `README.md`: product positioning, core features, product areas, hosted/self-hosted positioning, BYO keys, repo structure, Docker Compose quickstart.
- `docs/architecture/overview.md`: Convex as source of truth, voice gateway fetches business snapshot once per call.
- `docs/voice/runtime.md`: gateway boundary, OpenAI Realtime live speech path, Twilio callback paths, transcript and recording support.
- `mintlify/self-hosting/overview.mdx`: deployment models, Docker Compose baseline, required providers, what the team manages.
- `mintlify/self-hosting/docker-compose.mdx`: concrete self-hosting steps, helper scripts, verification, production checklist, Twilio webhook paths.
- `mintlify/self-hosting/providers.mdx`: provider map for Convex, Twilio, OpenAI, voice gateway hosting, Google Calendar, Firecrawl, Gemini, Resend, PostHog.
- `mintlify/agent/rules.mdx`: plain-text rules, transfer/callback behavior, transcripts/recordings.
- `mintlify/dashboard/calls.mdx`, `mintlify/dashboard/messages.mdx`, `mintlify/dashboard/contacts.mdx`, `mintlify/dashboard/analytics.mdx`: dashboard surfaces for calls, SMS, contacts, transcripts, recordings, tasks, and analytics.
- `mintlify/billing/plans.mdx`, `mintlify/billing/usage.mdx`: hosted billing and usage surfaces.
- `apps/landing/src/lib/seo-landing-pages.ts`: existing open-source AI receptionist positioning and self-hosted solution copy.

