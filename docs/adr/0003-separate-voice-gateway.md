# ADR 0003: use a separate voice gateway

LobbyStack isolates latency-sensitive voice transport from the dashboard and durable backend.

## Status

Accepted

## Decision

Use a separate Node.js voice gateway for Twilio Voice, Media Streams, and OpenAI Realtime.

## Rationale

Live audio streaming is a distinct runtime concern with different latency requirements than the main app backend.
