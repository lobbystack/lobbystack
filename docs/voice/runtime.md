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
