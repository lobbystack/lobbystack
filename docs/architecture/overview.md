# Understand the platform architecture

LobbyStack is a TypeScript monorepo with four application runtimes:

- `apps/admin/` serves the Next.js dashboard, authentication, and HTTP API. It also starts GPT-Live calls.
- `apps/worker/` processes queued work, dispatches the transactional outbox, and runs each GPT-Live call.
- `apps/voice-gateway/` answers Twilio numbers that aren't on the SIP trunk yet, through Media Streams and OpenAI Realtime.
- `apps/landing/` serves the public marketing site.

PostgreSQL is the durable source of truth. `packages/db` owns schema, migrations, role-specific clients, and row-level security. `packages/domain` owns business operations shared by admin and worker runtimes. `packages/agent-core` holds the receptionist agent that website chat and calls share. Redis provides queues, rate limiting, and realtime coordination. S3-compatible storage holds recordings and uploaded documents.

## Follow the voice data flow

OpenAI hosts call audio, so LobbyStack's runtimes only handle call setup and the agent's work:

1. The admin and worker compile structured facts and indexed knowledge into a business context snapshot.
2. The admin loads that snapshot once when a call starts, records the call, and gives GPT-Live the business's instructions.
3. The worker connects to the session and answers GPT-Live's delegated requests with the agent core.
4. Booking, message capture, and call state go through `packages/domain` against PostgreSQL.
5. Durable side effects enter the PostgreSQL outbox, and the worker dispatches them.

See [the voice runtime](../voice/runtime.md) for the phone and browser call flows.
