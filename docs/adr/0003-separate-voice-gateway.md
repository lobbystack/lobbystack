# ADR 0003: Use A Separate Voice Gateway

## Status

Accepted

## Decision

Use a separate Node.js voice gateway for Twilio Voice, Media Streams, and OpenAI Realtime.

## Rationale

Live audio streaming is a distinct runtime concern with different latency requirements than the main app backend.
