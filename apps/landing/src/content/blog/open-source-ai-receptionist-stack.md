---
title: "Open-Source AI Receptionist Stack"
description: "LobbyStack is an open-source AI receptionist stack for calls, booking, transcripts, dashboards, billing, self-hosting, and client deployments."
pubDate: 2026-06-18T10:00:00-04:00
author: "LobbyStack Team"
category: "Guides"
featured: false
coverImage: "/illustrations/open-source-ai-receptionist-stack-hero.webp"
locale: "en"
canonicalSlug: "open-source-ai-receptionist-stack"
---

An open-source AI receptionist stack needs more than a voice agent. It needs phone routing, realtime voice, booking, transcripts, callbacks, staff alerts, dashboard review, usage tracking, billing, monitoring, and a way for the business to change what the AI can do.

That is the part many teams end up rebuilding.

[LobbyStack](https://lobbystack.com/) is an **open-source AI receptionist stack** for teams that want that product layer already in place. Use the hosted cloud when you want someone else to run it, or self-host it with Docker when you want the infrastructure under your control.

## The stack people keep rebuilding

Many AI receptionist projects start with the same pile of tools:

- Retell, Vapi, or Twilio for voice
- n8n, Zapier, Make, or custom webhooks for glue
- Google Calendar or Outlook for booking
- a database for calls, contacts, transcripts, recordings, and appointments
- prompt logic for business rules, escalation, and handoff
- SMS and email notifications
- an admin dashboard for staff
- usage tracking, billing, logs, and provider alerts

Those tools can work. The problem starts when the demo becomes the phone system a business depends on.

A clinic wants different booking rules from a med spa. A home service company needs quote requests, service areas, urgent routing, and callback windows. A law firm may want intake, but it may not want the AI to answer legal questions. An agency deploying for clients may need the same base product, with different infrastructure and provider accounts for each customer.

At that point, the voice agent is one piece. You still need the operating system around the call.

## What the LobbyStack platform includes

[LobbyStack's features](/features/) package the receptionist layer instead of leaving you to assemble it from scratch.

It handles:

- inbound AI phone calls
- appointment booking, reschedules, and cancellations
- transcripts, recordings, summaries, and call outcomes
- business context, FAQs, services, prices, policies, and rules
- SMS conversations and email or SMS notifications
- human handoff, transfers, messages, callbacks, and tasks
- quote requests and lead qualification
- contacts, appointments, call history, analytics, usage, and billing surfaces

The point is not to replace every tool you already use. Twilio, calendars, email providers, analytics tools, and billing providers still matter. LobbyStack gives you the receptionist product that sits across them.

Instead of building fragile workflow chains for basic behavior, you describe what the receptionist should do in plain language.

For example:

```text
If the caller asks for a quote, collect the service type, location,
timeline, and budget. Share approved starting prices when they exist.
If exact pricing depends on the job, create a callback task for the team.
```

The AI can talk through the call, but it still uses tools for the actions that need authority: checking availability, booking appointments, saving notes, creating callbacks, transferring calls, sending notifications, and ending the call cleanly.

## How the live call path works

LobbyStack uses OpenAI Realtime for the live voice conversation and Twilio Voice with Media Streams for the phone path.

The voice gateway stays narrow. It handles the live call, streams audio, manages the realtime session, executes call tools, buffers transcripts, and sends recordings where they need to go.

Convex stays the source of truth. It owns business state, booking, knowledge, contacts, appointments, messages, workflows, transcripts, settings, and billing state.

That split matters. A phone call needs low latency, but a business action needs the backend to make the final decision. LobbyStack loads the business context snapshot at the start of a call, then calls backend tools when the AI needs to book, transfer, save a message, update an appointment, or create a follow-up task.

The receptionist can sound conversational without improvising the important parts.

## Hosted cloud or self-hosted Docker

Some teams want the product managed. [LobbyStack Cloud](/pricing/) is for that. Create an account, configure the business, connect the pieces, and start testing real calls without running the infrastructure yourself.

Other teams want the stack on their own infrastructure. LobbyStack supports that too.

The [self-hosted AI receptionist](/solutions/self-hosted-ai-receptionist/) path uses Docker Compose as the single-host baseline. The documented setup runs the Convex backend, Convex dashboard, web dashboard, voice gateway, and Caddy for HTTPS. You bring the provider accounts you want to control, including Twilio, OpenAI, calendar, email, analytics, and billing-related credentials.

That gives agencies and technical operators a cleaner client story. If a clinic, med spa, home service company, or law firm wants the system on its own servers or cloud account, you can deploy there instead of forcing the business into a closed hosted app.

Self-hosting still requires ownership. Someone needs to manage secrets, DNS, provider credentials, backups, upgrades, monitoring, and call testing. The value is that you start from a working [open-source AI receptionist](/solutions/open-source-ai-receptionist/) instead of a blank repo.

## A better base for client implementations

If you build AI receptionists for clients, the margin is rarely in rebuilding transcripts, dashboards, usage meters, booking flows, and call logs again.

The margin is in understanding the business:

- Which calls should book?
- Which calls should become quote requests?
- Which calls need a human now?
- Which details should staff see after the call?
- Which rules matter for that niche?
- Which provider accounts and infrastructure does the client need to own?

LobbyStack gives you a base to customize around those questions.

You can run it for your own business, deploy it for a client, or use the hosted cloud when infrastructure control is not the main concern. In self-hosted deployments, you can bring your own provider keys and keep the deployment inside the environment the business controls.

## When LobbyStack is a good fit

LobbyStack is a good fit when you want an AI receptionist that does more than answer a call.

It is especially useful if you need:

- open-source code you can inspect and adapt
- Docker-based self-hosting
- hosted cloud when speed matters
- bring-your-own provider accounts for self-hosted deployments
- appointment booking and appointment changes
- transcripts, recordings, summaries, and call outcomes
- SMS, email notifications, callbacks, and tasks
- client-controlled infrastructure for agency or regulated deployments

It is not a way to avoid operations. Phone systems still need testing. AI behavior still needs review. Provider accounts still need care.

It is a way to skip months of product plumbing before you can focus on the business workflow.

If you are comparing open-source phone answering options first, see the guide to the [best open-source AI phone answering services](/blog/best-open-source-ai-phone-answering-services/).

## Try it or self-host it

Start with [LobbyStack Cloud](https://lobbystack.com/) if you want to test the product quickly.

Use the [self-hosting overview](https://docs.lobbystack.com/self-hosting/overview) and [Docker Compose guide](https://docs.lobbystack.com/self-hosting/docker-compose) if you want to run the stack yourself.

The code is public on [GitHub](https://github.com/lobbystack/lobbystack). If an open-source AI receptionist stack would help your business or client work, a star helps more people find it.
