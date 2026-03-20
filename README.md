# AI Receptionist

Open-source AI receptionist software for clinics, repair shops, salons, and service businesses. The product is cloud-first, self-hostable from day one, and keeps one shared core codebase across hosted and self-hosted deployments.

## Architecture

- `convex/` is the main backend and source of truth.
- `apps/voice-gateway/` is a narrow Node.js runtime for Twilio Voice + Media Streams + OpenAI Realtime.
- `apps/web/` is a React/Vite admin dashboard built with TypeScript and shadcn-style UI primitives.
- Personalization for live calls is snapshot-based: the voice gateway fetches a precomputed business context snapshot once at call start and uses it locally during the conversation.

## Workspace

```text
apps/
  web/
  voice-gateway/
convex/
packages/
docs/
docker/
```

## Local Development

1. Copy `.env.example` to `.env`.
2. Install dependencies with `pnpm install`.
3. Configure a Convex deployment and generate backend types with `pnpm convex dev`.
4. Run `pnpm dev`.
5. Seed demo data with `pnpm seed:demo`.

Mock providers are part of the default development path so contributors can exercise flows without live Twilio, OpenAI, calendar, or email credentials.
Password reset email uses the official Convex Resend component. Setup and local verification steps live in [docs/providers/resend.md](/Users/raphael/Coding/ai-receptionist/docs/providers/resend.md).

## Product Principles

- Convex is the primary backend and owns persistent business state.
- The voice gateway must not become a second backend.
- Structured business facts are authoritative. RAG augments documents and FAQs but does not replace hours, services, or transfer rules.
- Cloud and self-hosted deployments share the same core code and feature set.

## Status

This repository is being bootstrapped around the MVP architecture. See [docs/architecture/overview.md](/Users/raphael/Coding/ai-receptionist/docs/architecture/overview.md), the ADRs in [docs/adr](/Users/raphael/Coding/ai-receptionist/docs/adr), the execution methodology in [docs/tracking/linear-methodology.md](/Users/raphael/Coding/ai-receptionist/docs/tracking/linear-methodology.md), and current progress in [docs/tracking/mvp-status.md](/Users/raphael/Coding/ai-receptionist/docs/tracking/mvp-status.md).
