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

## Architecture Choice

For the receptionist itself, the live call path is intentionally **speech-to-speech** with the Realtime API.

That is the right default for this product because we care about:

- low latency on phone calls
- natural turn-taking
- consistent voice quality from greeting through conversation

We still use a **chained** pattern for specialized work, but only behind tools and backend workflows. For example:

- Convex-backed booking checks and mutations
- Gemini-backed non-realtime text tasks
- future policy validation or specialist sub-agents

The live phone loop should not be rebuilt as a full chained STT -> text agent -> TTS pipeline unless there is a very strong product reason.

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
- The gateway exposes three distinct Twilio callback paths:
  - `POST /twilio/voice/stream-status` for Media Stream lifecycle diagnostics
  - `POST /twilio/voice/transfer-action` for `<Dial>` child-leg transfer outcomes
  - `POST /twilio/voice/call-status` for authoritative parent call progress and final call reconciliation
- Parent call status callbacks should be treated as provider truth for generic terminal outcomes, but they must not overwrite more specific dispositions the gateway already knows, such as transfer results or provider-outage recoveries.

## Realtime Session Notes

- The OpenAI Realtime websocket is opened only after the Twilio `start` event arrives.
- The gateway waits for Twilio stream metadata, resolves the cached business snapshot, initializes the call record in Convex, then starts the Realtime session.
- The initial greeting is generated inside the same Realtime session as the rest of the call, so the greeting and conversation share one consistent voice.
- Audio received before OpenAI is ready is buffered in memory and flushed once the session is configured.
- OpenAI is used only for this live audio path. Non-realtime text and embeddings stay on Gemini inside Convex.
- Transcript persistence should stay narrow and final-event based:
  - caller turns from `conversation.item.input_audio_transcription.completed`
  - assistant turns from `response.output_audio_transcript.done`
- Avoid persisting assistant transcript text from multiple overlapping final events, or duplicate transcript rows will appear.

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
