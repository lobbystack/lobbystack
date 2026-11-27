<p align="center">
  <img src=".github/readme/lobbystack-hero.png" width="100%" alt="LobbyStack dashboard hero image">
</p>

<div align="center">

# LobbyStack

### The open-source AI receptionist you can self-host, white-label and resell

LobbyStack answers a business's phone calls and website chats with an AI agent that books appointments, takes messages and transfers callers to a person. You get the finished product around the voice model: a console for reselling it to many businesses under your brand, a booking engine, phone numbers, billing, an API, a CLI and an MCP server. Fork it instead of assembling a receptionist yourself on a voice platform.

[Website](https://lobbystack.com) &middot; [Docs](https://docs.lobbystack.com) &middot; [Self-hosting](https://docs.lobbystack.com/self-hosting/overview) &middot; [Build on LobbyStack](https://docs.lobbystack.com/build/architecture) &middot; [Discord](https://discord.gg/WKX4wCTTpJ)

[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](./LICENSE) [![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178c6.svg)](https://www.typescriptlang.org/) [![PostgreSQL](https://img.shields.io/badge/backend-PostgreSQL-336791.svg)](https://www.postgresql.org/) [![Self-hostable](https://img.shields.io/badge/deploy-self--hostable-7c3aed.svg)](https://docs.lobbystack.com/self-hosting/overview)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/lobbystack)

</div>

## Quickstart

You need Docker and an OpenAI API key. This command creates a `lobbystack/` directory, asks for the key, pulls the prebuilt images and starts the stack at `http://localhost:3000`:

```bash
curl -fsSL https://raw.githubusercontent.com/lobbystack/lobbystack/main/scripts/quickstart.sh | bash
```

From a clone of this repository, run `./scripts/quickstart.sh` instead.

Open `http://localhost:3000`, sign up, and skip the website and phone number steps. Start a browser test call to hear your agent. A phone number needs a public URL and a Twilio Elastic SIP trunk or a Telnyx FQDN connection, which you can add later. The [self-hosting quickstart](https://docs.lobbystack.com/self-hosting/quickstart) walks through each step.

Other ways to start:

- **Railway**: the [LobbyStack template](https://railway.com/deploy/lobbystack) deploys the admin, worker, PostgreSQL, Redis and storage, and generates every secret. You enter an OpenAI API key and your Twilio credentials, then finish the steps in [After deploying](https://docs.lobbystack.com/self-hosting/overview#after-deploying).
- **Claude Code**: run `/plugin marketplace add lobbystack/lobbystack`, then `/plugin install lobbystack@lobbystack`, and ask "set up LobbyStack". Codex gets the same setup skill.
- **Docker Compose on your own server**: follow the [Docker Compose guide](https://docs.lobbystack.com/self-hosting/docker-compose) for TLS, backups and going live.

## What you get instead of building it yourself

On a voice platform, you start with an agent that can hold a call. To sell a receptionist, you also need the business data behind it, the booking rules, the phone numbers, a dashboard for each client and a way to bill them. LobbyStack ships those parts.

### A console for reselling to many businesses

The partner console runs any number of businesses from one place, each with its own agents, numbers, team and billing:

- **Your brand**: your name, logo, color, email sender and links on every sign-in page, dashboard and email your clients see
- **Your domain**: each partner gets a subdomain, and can connect its own domain through Caddy's on-demand TLS or Cloudflare for SaaS
- **Packages**: you set a monthly price, a setup fee and the minutes and chats each client gets, and clients pay you through your own Stripe account with Stripe Connect
- **Tiers and pools**: as the host, you can sell partners tiers through Polar, each with a shared pool of minutes and chats, or run partners with no limits
- **Templates and demos**: you save a business's setup to start the next one from it, and build an agent for a prospect before they buy
- **Platform keys**: your own product creates and manages businesses through the API, and a business owner can claim theirs later

[Run white label on your own servers](https://docs.lobbystack.com/self-hosting/white-label) lists the variables each part needs.

### Calls

- Inbound phone calls and browser calls answered by OpenAI GPT-Live, in 15 caller languages, with a switch to the caller's language mid-call
- Phone numbers from Twilio or Telnyx, mixed by country if you like, bought from the dashboard
- Live transfers to the business or to a named employee, under rules such as "only during business hours"
- Appointment changes by phone, with caller ID checks, a one-time code by text, or a PIN typed on the keypad
- Recordings, transcripts and call summaries, and a forward to the business's transfer number or the owner's phone once a plan runs out of minutes

LobbyStack answers calls. It doesn't place outbound calls or run call campaigns.

### Booking engine

- Services with durations, employees with the services they do and their time off, opening hours and planned closures
- Instant booking, booking requests the team confirms, or no booking, per business
- Cancelling and rescheduling, or requests the team approves in one click
- Busy times read from Google Calendar, Cal.com or Calendly, and bookings written back
- A confirmation text and a reminder 24 hours before, to callers who agree on the call

### Knowledge

- Text entries, uploaded documents and imported website pages, searched with embeddings when the agent needs a fact
- A business summary and opening hours drafted from those sources, unless an operator wrote them
- A list of the questions the agent couldn't answer, for the team to fill in

Website import needs a [Firecrawl](https://www.firecrawl.dev) API key.

### Channels besides the phone

- **Website widget**: chat, lead capture and browser calls, with a per-site key. New widget keys are off unless you set `WIDGET_KEY_ISSUANCE_ENABLED=true`.
- **Instagram**: the agent answers direct messages to a business's professional account, with your own Meta app
- **Text messages**: the dashboard saves incoming texts and alerts the team, who reply by hand. AI replies to texts are off by default, and the host turns them on per business with `pnpm text-replies:set`.

### API, CLI and MCP server

- A [REST API](https://docs.lobbystack.com/api/overview) at `/api/v1`, with an OpenAPI spec, scoped API keys and signed webhooks
- A [Zapier integration](integrations/zapier) built on that API
- The [`lobbystack` CLI](https://docs.lobbystack.com/api/cli): `lobbystack onboard` reads one YAML file and sets up a business, its knowledge, agent, services, plan, number and owner
- An [MCP server](#mcp-server) for Claude, ChatGPT, Cursor and other MCP clients

LobbyStack doesn't sync with CRMs or practice-management software. Connect them through the API, webhooks or Zapier.

### Dashboard

Operators work from one dashboard, in English, French, Spanish or Serbian: an inbox of calls and messages, contacts, appointments, follow-ups and analytics. A business can run several agents, each with its own name, voice, rules and channels.

## Models

Voice runs on OpenAI GPT-Live (`gpt-live-1.1`). OpenAI terminates the SIP and WebRTC connections and hosts the call audio, so LobbyStack never relays it. [ADR 0008](docs/adr/0008-gpt-live-voice.md) records that decision. LobbyStack doesn't support other voice models yet.

GPT-Live hands anything that needs business data to LobbyStack's agent core, which also answers website chat, Instagram and text messages. That agent runs on any OpenAI-compatible endpoint:

| Variables | What they set | Default |
| --- | --- | --- |
| `AI_CHAT_API_KEY`, `AI_CHAT_BASE_URL`, `AI_CHAT_MODEL`, `AI_CHAT_REASONING_EFFORT` | The model behind every tool call and every website chat | `gpt-6-luna` on high reasoning, through OpenAI's Responses API |
| `AI_DELEGATION_MODEL`, `AI_DELEGATION_REASONING_EFFORT`, `AI_DELEGATION_SERVICE_TIER` | The same agent while a caller waits on a live call | The `AI_CHAT_*` model on low reasoning and the priority tier |
| `AI_EMBEDDING_*` | Knowledge search | `text-embedding-3-large` |

Endpoints other than OpenAI's use chat completions. The [environment variables reference](https://docs.lobbystack.com/self-hosting/environment-variables) lists every setting.

## How LobbyStack compares

### Closed AI receptionists

These products answer calls for a business as a hosted service. We took each vendor's prices from its own pages on the dates below, in our comparison posts. Prices change, so check the vendor's site before you decide.

| | LobbyStack | [ElevenLabs Reception](https://lobbystack.com/blog/elevenlabs-reception-alternative/) | [Smith.ai](https://lobbystack.com/blog/smith-ai-alternative/) | [Upfirst](https://lobbystack.com/blog/upfirst-alternative/) | [Frontdesk](https://lobbystack.com/blog/my-ai-front-desk-alternative/) (formerly My AI Front Desk) |
| --- | --- | --- | --- | --- | --- |
| Entry paid plan | $30 a month for 150 minutes (hosted) | $29 a month for 75 minutes | From $150 a month for 75 calls | $24.95 a month for 30 calls | $99 a month for 200 voice minutes |
| Source code | Public, MIT license | Closed | Not advertised | Not advertised | Not advertised |
| Self-hosting | Docker Compose or Railway | Hosted only | Not advertised | Not advertised | Not advertised |
| Prices checked | November 27, 2026 | September 19, 2026 | July 30, 2026 | July 30, 2026 | October 9, 2026 |

Smith.ai backs its AI with a network of live receptionists, which LobbyStack doesn't offer. ElevenLabs Reception doesn't let agencies rebrand and resell it. Frontdesk sells white-label partner plans from $500 a month.

### Voice platforms

Vapi, Retell and Dograh give you the parts to build voice agents for sales, support or a front desk. You design the call flow, pick the models and connect your own tools. LobbyStack is one finished agent, a receptionist, with the business data, booking, numbers, dashboards and multi-tenant billing already built.

| | LobbyStack | [Vapi](https://vapi.ai) | [Retell](https://www.retellai.com) | [Dograh](https://github.com/dograh-hq/dograh) |
| --- | --- | --- | --- | --- |
| What you start with | A receptionist that answers for many businesses | A developer platform for voice agents | A hosted platform for voice agents | A self-hosted voice agent builder with a visual workflow editor |
| License | MIT | Closed, hosted | Closed, hosted | BSD 2-Clause |
| Price | Free to self-host | $0.05 a minute for hosting, plus your providers | $0.07 to $0.31 a minute | Free to self-host |
| Voice models | GPT-Live only | Your choice of transcriber, model and voice, GPT-Live included | Your choice of model and voice, or a speech-to-speech model, GPT-Live included | Your choice of speech-to-text, model and text-to-speech, or speech-to-speech |
| Booking and numbers | Booking engine with services, staff and hours; Twilio or Telnyx numbers | Google Calendar tools; free US numbers | Appointment booking; Twilio or Telnyx numbers | Your Twilio, Vonage, Telnyx, Plivo or other telephony account |
| Client dashboards and billing | Partner console with your brand, domains, packages and Stripe Connect | You build them | You build a client portal on its API, since Retell's dashboard can't be rebranded | Not in its README |

Choose a voice platform when you need outbound calls, a voice model other than GPT-Live, or an agent that isn't a front desk. Choose LobbyStack when you want to sell receptionists to businesses and would rather change working code than write it.

We read Vapi's [pricing](https://vapi.ai/pricing) and [docs](https://docs.vapi.ai/quickstart/introduction) on November 1, 2026, Retell's [white label page](https://www.retellai.com/use-cases/white-label-ai-voice-agents) on October 27, 2026 and its [pricing](https://www.retellai.com/pricing) on November 27, 2026, and Dograh's [README](https://github.com/dograh-hq/dograh) on November 27, 2026.

## MCP server

LobbyStack runs a [Model Context Protocol](https://modelcontextprotocol.io) server, so you can connect Claude, ChatGPT, Claude Code, Cursor, VS Code or any other MCP client to a business and ask in plain language: "Who called yesterday and didn't book?" or "Book Dana Whitfield for a cleaning on Tuesday morning."

| Setting | Value |
| --- | --- |
| Server URL | `https://app.lobbystack.com/api/mcp` (self-hosted: `https://<your-domain>/api/mcp`) |
| Transport | Streamable HTTP |
| Authentication | Sign in with LobbyStack (OAuth), or `Authorization: Bearer <API key>` |
| Registry name | `io.github.lobbystack/lobbystack` in the [official MCP Registry](https://registry.modelcontextprotocol.io) |

Add it to Claude Code:

```bash
claude mcp add --transport http lobbystack https://app.lobbystack.com/api/mcp
```

The server exposes 18 tools for one business. Each tool needs a scope, and every change goes in the business's audit log.

| Tools | Scope |
| --- | --- |
| `get_business`, `list_services`, `list_staff` | `business:read` |
| `update_business_hours` | `business:write` |
| `list_calls`, `get_call` | `calls:read` |
| `search_contacts`, `get_contact` | `contacts:read` |
| `create_contact`, `update_contact` | `contacts:write` |
| `list_appointments`, `get_appointment`, `check_availability` | `appointments:read` |
| `book_appointment`, `cancel_appointment`, `reschedule_appointment` | `appointments:write` |
| `list_messages` | `messages:read` |
| `add_knowledge` | `knowledge:write` |

Read-only tools carry `readOnlyHint`, and tools that cancel, move or replace data carry `destructiveHint`. Partners get more tools to run their console: create businesses, packages and demos, manage domains and the team, and claim phone numbers.

The implementation lives in [`apps/admin/src/lib/mcp/`](apps/admin/src/lib/mcp): `server.ts` builds the `McpServer` and registers the tools from `tools.ts` and `partner-tools.ts`, and [`apps/admin/app/api/mcp/route.ts`](apps/admin/app/api/mcp/route.ts) serves it. The [MCP server guide](https://docs.lobbystack.com/ai/mcp) covers scopes, errors and limits.

## Architecture

LobbyStack is a TypeScript monorepo. PostgreSQL holds every durable record, with row-level security on each business's data. Redis runs the job queues, and S3-compatible storage holds recordings and documents.

```text
apps/
  admin/            Next.js dashboard, partner console, HTTP API, MCP server and website widget
  worker/           queued jobs, the outbox dispatcher, and every live call
packages/
  agent-core/       the agent shared by calls and chats: its tools, instructions and GPT-Live session
  domain/           business operations: booking, messages, knowledge, billing, partners
  db/               Drizzle schema, SQL migrations, database roles and row-level security
  providers/        adapters for Twilio, Telnyx, calendars, email and embeddings
  cli/              the lobbystack command, built on the v1 API
  embed/            the website widget's loader script
  shared/           types, billing catalogs, locales and the business snapshot
mintlify/           the Help Center at docs.lobbystack.com
docs/               ADRs, architecture, voice, deployment and operations notes
```

### How a phone call runs

1. The number's carrier sends the call to your OpenAI project's SIP address, through a Twilio Elastic SIP trunk or a Telnyx FQDN connection.
2. OpenAI sends a `live.transport.incoming` webhook to the admin. The admin finds the business from the dialled number, records the call, reserves minutes, and accepts the session with the agent's voice and instructions.
3. The admin asks the worker to attach. The worker opens a sideband WebSocket to the session and greets the caller.
4. GPT-Live talks with the caller and delegates anything that needs business data. The worker answers each request with the agent core, whose tools call `packages/domain`.
5. After the call, the worker saves the transcript, the summary and the call's outcome.

Browser calls follow the same path over WebRTC. GPT-Live starts each call with a snapshot of the business: its hours, services, rules and common answers. It answers those without a round trip to the backend. [The voice runtime](docs/voice/runtime.md) covers transfers, keypad PINs, greetings and failure handling.

### Add a capability

The agent core in `packages/agent-core` is an AI SDK `ToolLoopAgent`. Phone calls, browser calls, website chat, Instagram and text replies all run it, so a tool you add there works on every channel:

1. Write the business operation as a function in `packages/domain`, which runs its queries inside `withBusinessTransaction`.
2. Add the tool's name to `TOOL_USE` in `packages/agent-core/src/capabilities.ts`, and decide in `agentCapabilities` which conversations get it.
3. Define the tool in `createAgentTools` in `packages/agent-core/src/tools.ts`, calling your domain function.
4. Test the domain function, the tool and the capability decision with Vitest.

The [capability guide](https://docs.lobbystack.com/build/add-a-capability) walks through a full example. The [ADRs](docs/adr) record why the stack looks the way it does: [snapshot-based personalization](docs/adr/0004-snapshot-based-voice-personalization.md), [PostgreSQL as the main backend](docs/adr/0007-postgresql-main-backend.md), [GPT-Live](docs/adr/0008-gpt-live-voice.md) and [partner billing through Stripe](docs/adr/0009-partners-bill-through-their-own-stripe.md).

## Run it yourself, or let LobbyStack host it

### Run it yourself

The Complete edition is this repository: every feature, including the partner console, free under the MIT license. The community helps on [Discord](https://discord.gg/WKX4wCTTpJ) and GitHub. You pay OpenAI, Twilio or Telnyx, and your other providers yourself.

LobbyStack sells support plans for self-hosted installs, paid through Polar:

| Plan | For a business that runs its own install | For a partner that runs the partner program |
| --- | --- | --- |
| Premium support | $25 a month per business, or $20 billed annually | $199 a month, or $159 billed annually |
| Enterprise support | $100 a month per business, or $80 billed annually | $499 a month, or $399 billed annually |

Premium answers by email within 1 business day and helps with setup and upgrades. Enterprise replies within 4 business hours and adds a private Slack channel with a named engineer and a monthly check-in call. A partner's plan covers its team and every client business for one price. See [self-hosted pricing for businesses](https://lobbystack.com/pricing/self-hosted/) and [for partners](https://lobbystack.com/white-label/#self-hosted-tiers).

### Let LobbyStack host it

- **For your clients, under your brand**: [White Label](https://lobbystack.com/white-label/) runs the partner console on LobbyStack's cloud. Partner tiers cost $0, $49, $199 or $499 a month, each with a pool of minutes and chats your clients share. You set your own prices, and clients pay you through your Stripe account.
- **For one business**: [LobbyStack Cloud](https://lobbystack.com) starts free with 30 voice minutes a month. Starter costs $30 a month for 150 minutes, and Pro $100 for 500. See [pricing](https://lobbystack.com/pricing/).

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md), which sets the repository's rules, and use the terms in [GLOSSARY.md](./GLOSSARY.md).

Run the stack from source with mock providers, so you need no Twilio, AI, calendar or email credentials for most changes:

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres redis
pnpm db:migrate
pnpm dev
```

Recordings and uploads go under `.lobbystack/storage`. Set `STORAGE_PROVIDER=s3` to test an S3-compatible service.

Before you open a pull request, run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## License

LobbyStack is licensed under the [MIT License](./LICENSE).
