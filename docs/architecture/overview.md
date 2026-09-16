# Understand the platform architecture

LobbyStack is a TypeScript monorepo with four active application runtimes:

- `apps/admin/` serves the Next.js dashboard, authentication, and HTTP API.
- `apps/worker/` processes queued work and dispatches the transactional outbox.
- `apps/voice-gateway/` handles Twilio webhooks, Media Streams, and OpenAI Realtime sessions.
- `apps/landing/` serves the public marketing site.

PostgreSQL is the durable source of truth. `packages/db` owns schema, migrations, role-specific clients, and row-level security. `packages/domain` owns business operations shared by admin and worker runtimes. Redis provides queues, rate limiting, and realtime coordination. S3-compatible storage holds recordings and uploaded documents.

## Follow the voice data flow

1. The admin/worker runtimes compile structured facts and indexed knowledge into a business context snapshot.
2. The voice gateway resolves that snapshot once at call start through the private admin backend.
3. The gateway answers common questions from memory during the live session.
4. Booking, message capture, call state, and other authoritative operations use signed backend requests.
5. Durable side effects enter the PostgreSQL outbox and are dispatched by the worker.

This keeps the live audio path responsive without moving business state into the voice gateway.
