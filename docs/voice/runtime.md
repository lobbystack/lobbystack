# Voice Runtime Model

## Boundary

`apps/voice-gateway` is a narrow runtime dedicated to live call handling.

It is responsible for:

- Twilio Voice ingress
- loading a business snapshot once per call
- caching the snapshot for the active call
- Media Streams / Realtime session orchestration
- transfer execution
- buffering transcript segments and call audio for durable persistence

It is not responsible for:

- tenant data ownership
- booking source of truth
- knowledge authoring
- calendar integrations
- durable business workflows

Those remain in Convex.

## Low-Latency Rule

The gateway does not ask Convex for every conversational turn.

Instead:

1. Twilio hits the inbound voice route.
2. The gateway resolves the business snapshot from Convex using the called number.
3. The snapshot is cached in memory for the call.
4. The live session answers from that cached context.
5. Convex is called only for authoritative operations such as:
   - checking availability
   - booking
   - transfer decisions
   - saving a taken message
   - persisting transcripts and recordings

## Twilio Runtime Notes

- The inbound voice webhook returns TwiML with `<Connect><Stream>`.
- Stream metadata is passed with Twilio custom `<Parameter>` tags, not WebSocket query strings.
- The gateway validates Twilio signatures on both the inbound webhook and the Media Stream websocket handshake when `TWILIO_AUTH_TOKEN` is configured.
- The gateway also exposes a Twilio stream status callback for `stream-started`, `stream-stopped`, and stream error diagnostics during provider validation.

## Realtime Session Notes

- The OpenAI Realtime websocket is opened only after the Twilio `start` event arrives.
- The gateway waits for Twilio stream metadata, resolves the cached business snapshot, initializes the call record in Convex, then starts the Realtime session.
- Audio received before OpenAI is ready is buffered in memory and flushed once the session is configured.
- OpenAI is used only for this live audio path. Non-realtime text and embeddings stay on Gemini inside Convex.

## Failure Mode

In development, the gateway can fall back to a seeded demo snapshot if the Convex lookup fails.

In cloud and self-hosted modes, a failed snapshot lookup should fail fast instead of silently running with stale tenant data.

## Recording And Transcript Support

The gateway captures both sides of the live media stream it already sees:

- inbound caller audio from Twilio Media Streams
- outbound assistant audio sent back to Twilio

At call completion it renders those legs into a stereo WAV recording and uploads it to Convex storage. The app stores:

- a signed download URL via Convex storage
- byte size and duration metadata
- final transcript segments for both caller and assistant

The admin dashboard can then list recent calls, download audio, and inspect stored transcripts.

## Provider Validation Checklist

For a real `OPE-19` validation pass:

1. Expose the voice gateway on public HTTPS/WSS.
2. Configure a Twilio voice webhook to `POST /twilio/voice/inbound`.
3. Confirm the inbound webhook and websocket handshake pass Twilio signature validation.
4. Place a real inbound call and verify:
   - Twilio connects the media stream
   - OpenAI Realtime returns audio
   - interruption and turn-taking feel normal
   - transcripts persist in Convex
   - the recording downloads from the dashboard
