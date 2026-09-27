# ADR 0008: answer calls with GPT-Live and one agent core

OpenAI hosts call audio, and LobbyStack's admin and worker run the call. This replaces the voice gateway from [ADR 0003](0003-separate-voice-gateway.md).

## Status

Accepted. Every phone number now sits on the Twilio SIP trunk, and we removed `apps/voice-gateway` from the repository.

## Decision

Answer phone and browser calls with OpenAI's `gpt-live-1`, with client delegation. Phone calls reach OpenAI through a Twilio Elastic SIP trunk and browser calls through WebRTC. The admin app accepts or creates each session, and the worker holds its sideband connection and answers delegated requests.

Answer every delegated request, and every website chat message, with one agent core: an AI SDK `ToolLoopAgent` in `packages/agent-core`. It uses the `AI_CHAT_*` text model, `gpt-6-luna` with high reasoning by default.

## Rationale

The gateway existed to relay audio between Twilio Media Streams and OpenAI Realtime. With OpenAI terminating SIP and WebRTC, LobbyStack no longer carries audio, so a separate public runtime adds a service to deploy without adding a capability. The remaining work, recording the call, answering tool requests, and writing the outcome, uses the same domain code as the rest of the backend.

One agent core means website chat and calls book, reschedule, and take messages through the same tools and rules.

We considered LiveKit for self-hosted media. Railway can't accept inbound UDP, so a self-hosted SIP server can't run there.
