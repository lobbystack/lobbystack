# Voice Runtime

`apps/voice-gateway` is a narrow public runtime for Twilio Voice, Media Streams, and OpenAI Realtime. Durable business state remains in PostgreSQL behind the admin backend.

## Responsibilities

The gateway owns:

- Twilio webhook and media-stream validation
- bidirectional audio transport
- OpenAI Realtime session lifecycle
- interruption, transfer, and playback control
- short-lived snapshot caching
- signed requests to authoritative backend operations

The gateway does not own authentication, tenant state, booking records, contacts, messages, knowledge ingestion, billing, or long-running workflows.

## Call Flow

1. Twilio sends an authenticated voice webhook.
2. The gateway resolves the called number through `BACKEND_INTERNAL_URL` and fetches a business context snapshot.
3. It creates the call record through a signed backend request.
4. It starts one OpenAI Realtime session with the snapshot and available tool definitions.
5. Common replies use the in-memory snapshot. Booking, message capture, transfer state, and other authoritative actions call the backend.
6. On completion, transcripts, recording metadata, usage, and final call state are persisted through signed requests. Binary recordings are uploaded to S3-compatible storage through the backend.

## Failure Behavior

- Production never falls back to demo business data.
- Development can use `demoSnapshot` when backend context lookup fails.
- Backend connectivity is available to private callers at `/health/backend` with `INTERNAL_SERVICE_TOKEN`.
- Twilio signatures and web-call origin/rate policies are validated before sessions begin.

## Security

Use `INTERNAL_SERVICE_SECRET` for HMAC-signed requests. Keep `BACKEND_INTERNAL_URL` private where the hosting platform supports private networking. Do not expose provider credentials to browser code.
