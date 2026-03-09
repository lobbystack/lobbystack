# Architecture Overview

## Core Structure

- `convex/` is the main backend, source of truth, and workflow engine.
- `apps/voice-gateway/` handles Twilio Voice, Media Streams, OpenAI Realtime, and transfer control.
- `apps/web/` is the admin SPA.

## Voice Personalization

Voice uses precomputed business context snapshots.

1. Convex stores structured business configuration and unstructured knowledge.
2. Convex compiles that data into a compact `business_context_snapshot`.
3. The voice gateway fetches that snapshot once when a call starts.
4. The gateway answers locally from memory and only calls Convex for authoritative actions.

This keeps the live call path smooth while preserving Convex as the source of truth.
