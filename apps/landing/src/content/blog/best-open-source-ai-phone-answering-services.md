---
title: "Best Open Source AI Phone Answering Services"
description: "Compare open-source AI phone answering services for self-hosting: Asterisk agents, LiveKit voice stacks, and full receptionist platforms."
pubDate: 2026-07-08T10:00:00-04:00
author: "LobbyStack Team"
category: "Guides"
featured: false
coverImage: "/illustrations/best-open-source-ai-phone-answering-services-hero.webp"
locale: "en"
canonicalSlug: "best-open-source-ai-phone-answering-services"
---

Most businesses searching for an **open source AI phone answering service** are not looking for a weekend hackathon project. They want fewer missed calls, cleaner booking handoffs, and a stack they can inspect, host, and change without waiting on a vendor roadmap.

The open-source side of this market splits into two camps. Some projects give you a voice agent you wire into Asterisk or LiveKit. Others ship closer to an open-source virtual receptionist: transcripts, dashboards, booking, notifications, and business rules. Picking the wrong camp is the usual mistake. You download a voice repo, get a decent demo, then realize you still need calendars, call logs, staff review, and escalation logic before anyone trusts it with a real phone line.

This guide compares the strongest open-source options as of mid-2026, with plain criteria so you can match a project to your phone setup and your team's appetite for ops work.

## How to judge an open-source phone answering stack

Before the list, decide what you actually need on a live call.

**Telephony fit.** Do you already run Asterisk or FreePBX? Do you want Twilio or Telnyx SIP? Can you accept browser-only voice for now? A project that fights your phone setup will burn time before the AI says hello.

**Voice architecture.** Speech-to-speech models (OpenAI Realtime, Google Live) sound natural and cut latency. STT + LLM + TTS pipelines are easier to swap and cheaper at scale, especially with local models. Neither is automatically better. Busy service businesses care about interruptions and handoff speed. Privacy-sensitive teams care about keeping audio on-prem.

**Product depth.** Message-taking is table stakes. Booking, CRM writes, SMS follow-up, staff alerts, and post-call review separate a phone toy from something a front desk will use.

**Ops burden.** Self-hosting means Docker, secrets, upgrades, backups, and call testing. "No SaaS fee" does not mean "no labor."

**License.** MIT and Apache-style licenses are simple for internal use and client work. AGPL projects can work, but read the copyleft terms before you white-label for customers.

Run a real call test for each finalist: booking request, pricing question, angry caller, wrong number, and after-hours call. The repo with the best README rarely wins that test.

## The best open-source options, by use case

### LobbyStack — best full receptionist platform (cloud or self-hosted)

**GitHub:** [lobbystack/lobbystack](https://github.com/lobbystack/lobbystack)  
**License:** AGPL-3.0  
**Best for:** Service businesses and agencies that want calls, booking, transcripts, dashboards, billing, and self-hosting without assembling ten repos

[LobbyStack](https://lobbystack.com/) is the option on this list closest to a complete **AI receptionist** product. It covers inbound calls, appointment booking and changes, transcripts and summaries, business context and FAQs, SMS, human handoff, staff dashboards, usage tracking, and client-style deployments. You can run the hosted cloud, use it as an [open-source AI receptionist](/solutions/open-source-ai-receptionist/), or [self-host with Docker](/solutions/self-hosted-ai-receptionist/).

The tradeoff is scope. You get a real operating layer around the call, but you still bring provider accounts (Twilio, OpenAI, calendar, email, and related services) and own the deployment if you self-host. That is the honest cost of skipping SaaS lock-in while keeping product depth.

Choose LobbyStack when your problem is "answer calls and finish the work," not "prove voice AI in a lab."

### AVA (Asterisk AI Voice Agent) — best for existing Asterisk / FreePBX shops

**GitHub:** [hkjarral/Asterisk-AI-Voice-Agent](https://github.com/hkjarral/Asterisk-AI-Voice-Agent)  
**License:** MIT  
**Best for:** Teams already on Asterisk who want a modular voice agent with cloud, hybrid, or fully local pipelines

AVA is the most active open-source **Asterisk AI voice agent** community right now. It plugs into Asterisk through ARI, supports AudioSocket and ExternalMedia RTP, and lets you mix STT, LLM, and TTS providers. You can run cloud providers (OpenAI Realtime, Google Live, Deepgram, and others), a local hybrid setup, or a fully on-prem stack with Faster Whisper, llama.cpp, and Kokoro TTS.

What you get: serious telephony integration, production-oriented baselines, and deep tuning per agent context. What you do not get out of the box: a polished multi-tenant receptionist dashboard, booking product layer, or agency billing. You are buying flexibility on the voice pipe, then building or gluing the business workflows.

Choose AVA when Asterisk is already your phone system and you want maximum control over the voice pipeline.

### Helix AI Virtual Receptionist — best local-first Asterisk receptionist

**GitHub:** [BB-AI-Arena/helix-ai-virtual-receptionist](https://github.com/BB-AI-Arena/helix-ai-virtual-receptionist)  
**License:** MIT  
**Best for:** Operators who want Asterisk-based answering without sending speech or LLM traffic to external APIs

Helix targets the receptionist job more directly than a bare voice agent. It runs on Asterisk ARI with local Whisper STT, Ollama intent handling, Kokoro TTS, Google Calendar scheduling, voicemail, VIP routing, business-hours gates, and an operations dashboard. The project is newer and smaller than AVA, but the direction is clear: self-hosted multilingual front desk with optional CRM hooks (Vtiger) and less reliance on per-minute cloud AI bills.

The tradeoff is hardware and tuning. Local voice on CPU can feel slow. GPU helps. You will also own more of the product polish yourself.

Choose Helix when privacy, predictable costs, and Asterisk-native routing matter more than plugging into the latest hosted speech model on day one.

### AIReceptionist — best minimal OpenAI Realtime + LiveKit stack

**GitHub:** [kirklandsig/AIReceptionist](https://github.com/kirklandsig/AIReceptionist)  
**License:** AGPL-3.0  
**Best for:** Developers who want speech-to-speech quality fast, with YAML config and SIP through LiveKit

This project is intentionally narrow. It connects inbound PSTN calls (Twilio or Telnyx) to a LiveKit room, runs OpenAI's Realtime API for speech-to-speech conversation, and exposes FAQ answering, transfers, message taking, after-hours rules, and multi-business config from YAML. Noise handling for phone audio is built in.

You trade breadth for speed to a good-sounding line. There is no full operator dashboard, booking engine, or billing layer. AGPL matters if you plan to resell without contributing changes.

Choose AIReceptionist when you already like LiveKit, want Realtime voice quality, and will build the business layer yourself.

### Hearthline — best open-source option tuned for home services

**GitHub:** [codewithmuh/hearthline](https://github.com/codewithmuh/hearthline)  
**License:** AGPL-3.0 (commercial license available)  
**Best for:** HVAC, plumbing, and similar trades that want calls, SMS, quotes, and dispatch-style workflows

Hearthline is vertical software, not a generic voice kit. The stack combines Django, Next.js, Postgres, Vapi for voice, Twilio for SMS, and per-business encrypted API keys. It focuses on lead qualification, photo quotes, price books, CRM connectors, and channel rules that home-service teams actually use.

You still bring voice and AI providers. Multi-tenant shared hosting is on the roadmap; today it is closer to one business per deployment.

Choose Hearthline when your calls are trade-specific and you want open code aimed at that workflow, not a horizontal receptionist you have to bend into shape.

## Quick comparison

| Project | Phone entry point | Voice style | Product depth | Maturity signal |
| --- | --- | --- | --- | --- |
| LobbyStack | Twilio / voice gateway | Realtime voice stack | Full receptionist platform | Production-oriented monorepo |
| AVA | Asterisk / FreePBX | Modular STT/LLM/TTS or realtime | Voice agent + admin UI | Large community, frequent releases |
| Helix | Asterisk ARI | Local STT/LLM/TTS | Receptionist features + dashboard | Newer, local-first focus |
| AIReceptionist | LiveKit + SIP trunk | OpenAI Realtime speech-to-speech | Voice agent config | Small, focused codebase |
| Hearthline | Vapi + Twilio | Provider-hosted voice | Home-service front desk | Vertical product, active development |

## What these projects will not save you from

Open source removes license mystery. It does not remove:

- **Prompt and policy work.** Hours, services, pricing boundaries, and escalation rules still need a human owner.
- **Call testing.** Real callers mumble, interrupt, and ask questions in the wrong order.
- **Compliance thinking.** Recordings, transcripts, and customer data still need retention and access rules.
- **Provider bills.** Twilio minutes, OpenAI usage, and calendar APIs still show up on invoices unless you go fully local.

If you are deciding between building, buying, and self-hosting, pair this list with [how to choose an AI receptionist](/blog/how-to-choose-an-ai-receptionist/) and [build or buy an AI receptionist](/blog/build-or-buy-ai-receptionist/).

## Practical next steps

1. **Write down your top five call types** (booking, quote, emergency, existing customer, spam) and the outcome each one needs.
2. **Match telephony first.** Asterisk shop → AVA or Helix. Twilio/LiveKit shop → AIReceptionist or LobbyStack. Home services → shortlist Hearthline.
3. **Run the five-call test** on every finalist before you forward a production number.
4. **Decide who owns ops.** Self-hosting needs someone who will patch, monitor, and replay bad calls weekly.

## Bottom line

The best **open source AI phone answering service** for you is the one that matches your phone system and finishes the call the way your staff would.

- Need a full receptionist product you can self-host or run in the cloud → **LobbyStack**
- Need maximum Asterisk flexibility → **AVA**
- Need local voice on Asterisk without cloud AI dependencies → **Helix**
- Need a slim Realtime voice agent on LiveKit → **AIReceptionist**
- Need a home-service front desk → **Hearthline**

If you want to inspect a full stack before you forward your main line, start with the [LobbyStack GitHub repo](https://github.com/lobbystack/lobbystack) or the [open-source AI receptionist stack overview](/blog/open-source-ai-receptionist-stack/).
