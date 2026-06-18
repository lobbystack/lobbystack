# Open-Source AI Receptionist Stack Research

## Target audience

- Technical founders, agencies, consultants, and operators who are considering building an AI receptionist from Retell/Vapi/Twilio, n8n/Zapier, calendar APIs, transcript storage, prompt logic, dashboards, billing, and monitoring.
- SMB teams with privacy, deployment, or client-infrastructure requirements who want the product outcome of an AI receptionist without accepting a closed black box.
- Developers evaluating whether LobbyStack can be used as an open-source base instead of starting from a blank telephony-agent repo.

## SEO recommendation

- **SEO title:** Open-Source AI Receptionist Stack | LobbyStack
- **Meta description:** LobbyStack replaces custom AI receptionist glue with an open-source stack for calls, booking, transcripts, dashboards, billing, and self-hosting.
- **Suggested slug:** `open-source-ai-receptionist-stack`

## Existing blog posts to avoid duplicating

- `lobbystack-is-live`: launch narrative, missed-call problem, product overview, open-source motivation.
- `build-or-buy-ai-receptionist`: broad build vs buy decision, cost/risk tradeoffs, self-hosting as a third option.
- `how-to-choose-an-ai-receptionist`: buyer checklist for call quality, features, pricing, integrations, handoff, reporting.
- `ai-receptionist-savings`: ROI math, missed-call revenue, labor/answering-service comparison.

## Core positioning

LobbyStack should be positioned as the open-source AI receptionist platform that replaces the fragile “build your own stack” path: realtime voice vendor plus Twilio wiring, automation glue, scheduling logic, transcripts, prompt/routing rules, dashboard, usage billing, alerts, and monitoring. The article should argue that a demo voice bot is easy, but a production receptionist requires an integrated operating system for calls, messages, appointments, knowledge, staff handoff, and review.

Use the contrast carefully: not “Retell/Vapi/n8n/Zapier are bad,” but “assembling them still leaves you owning the product layer.” LobbyStack provides that layer as an AGPL-licensed, inspectable codebase with hosted cloud for speed and Docker/self-hosting for infrastructure control.

## Article outline

1. **The hidden work behind an AI receptionist**
   - A phone agent is more than voice in/voice out.
   - Real businesses need booking, transcripts, callbacks, rules, team visibility, billing, and failure handling.

2. **Why rebuilds turn into glue projects**
   - Retell/Vapi/Twilio-style voice infrastructure handles only part of the workflow.
   - n8n/Zapier-style automations help connect events but do not become a receptionist dashboard, source of truth, or durable call workflow by themselves.

3. **What LobbyStack includes as a platform**
   - Calls, SMS, appointments, knowledge, human handoff, transcripts, recordings, contacts, follow-ups, analytics, usage, and billing in one operator dashboard.
   - Plain-language receptionist behavior backed by structured business context and tools.

4. **How the voice runtime works**
   - Twilio Voice and Media Streams connect to a narrow Node voice gateway.
   - OpenAI Realtime powers the live speech-to-speech conversation.
   - Convex remains the source of truth for business state, booking, knowledge, workflows, transcripts, recordings, and settings.
   - The gateway loads a business context snapshot once per call and calls backend tools only for authoritative actions.

5. **Hosted cloud, self-hosting, and BYO keys**
   - LobbyStack Cloud is for teams that want the product managed.
   - Docker Compose self-hosting runs Convex backend/dashboard, web dashboard, voice gateway, and Caddy on one host.
   - Self-hosted deployments bring their own Convex, Twilio, OpenAI, calendar, email, analytics, and billing/provider accounts.
   - Agencies or client-infrastructure deployments can run on the business or client’s own environment.

6. **When to use LobbyStack instead of rebuilding**
   - Strong fit: agencies, local-service operators, regulated or privacy-sensitive teams, multi-location operators, and teams that want inspectable call logic.
   - Less about avoiding engineering entirely; more about starting from a working receptionist product instead of rebuilding every layer.

## Specific talking points grounded in local content

1. **Open-source control is central.** README positions LobbyStack as open source by default: inspect, self-host, extend, and keep control of data. Landing copy reinforces “no black-box call logic” and “no vendor lock-in.”

2. **The product scope is broader than voice.** README and docs list phone calls, SMS, appointment booking, reschedules/cancellations, human handoff, shared inbox, transcripts, recordings, contacts, appointments, follow-ups, analytics, usage, and billing.

3. **The live call path uses OpenAI Realtime deliberately.** Voice docs describe a speech-to-speech Realtime API path for low latency, natural turn-taking, and consistent voice quality, with non-realtime work kept behind backend workflows.

4. **Business context is snapshot-based, not per-turn backend chatter.** Architecture docs say Convex stores structured business configuration and knowledge, compiles a `business_context_snapshot`, and the voice gateway fetches it once at call start.

5. **Tools turn plain-language behavior into safe actions.** Local voice tools include business hours, services, knowledge search, availability lookup, booking, appointment change verification/OTP, cancellation, rescheduling, transfer, hold, end call, and message/callback capture.

6. **Booking is treated as authoritative, not improvised.** The shared snapshot policy says never promise a booking until the booking tool confirms success, matching the positioning that LobbyStack is for outcomes, not just conversation.

7. **Self-hosting is documented as a real deployment model.** The Docker Compose guide includes Convex open-source backend, Convex dashboard, web dashboard, voice gateway, Caddy, public HTTPS, Twilio webhooks, provider keys, verification, and a production checklist.

8. **Hosted and self-hosted are the same open-source core with different ownership.** README says hosted cloud is for managed product operation, while self-hosting is for teams that want their own infrastructure and API keys. The useful phrase: “Full product control in the hosted app. Infrastructure ownership when you self-host.”

## Source notes

- README.md
- mintlify/introduction.mdx
- mintlify/self-hosting/overview.mdx
- mintlify/self-hosting/docker-compose.mdx
- mintlify/self-hosting/providers.mdx
- docs/architecture/overview.md
- docs/voice/runtime.md
- apps/landing/src/lib/seo-landing-pages.ts
- apps/landing/src/content/blog/*.md
- apps/voice-gateway/src/realtime/toolExecutor.ts
