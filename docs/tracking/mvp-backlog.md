# MVP Backlog

This backlog is intentionally opinionated. It is the exact queue that should be mirrored into Linear.

## M1 Tenant Core

### Ready

- `Expand admin CRUD for staff assignments and closures`
  - labels: `area/web`, `area/convex`, `type/feature`
- `Add stronger role-aware authorization coverage for tenant admin paths`
  - labels: `area/convex`, `type/testing`, `risk/high`

### Backlog

- `Add richer business settings screens for phone routing and transfer policies`
  - labels: `area/web`, `type/feature`

## M2 Business Context MCP

### Ready

- `Support real file-backed knowledge uploads for pdf txt md`
  - labels: `area/web`, `area/convex`, `area/knowledge`, `type/feature`, `risk/high`
- `Persist preview sessions and streamed responses in the dashboard`
  - labels: `area/web`, `area/convex`, `area/knowledge`, `type/feature`

### Backlog

- `Add knowledge reindex and deletion flows`
  - labels: `area/convex`, `area/knowledge`, `type/feature`
- `Add knowledge-specific tests for tenant isolation and snapshot refresh`
  - labels: `area/convex`, `area/knowledge`, `type/testing`

## M3 Booking + Calendars

### Ready

- `Implement real Google Calendar event CRUD and busy-time sync`
  - labels: `area/convex`, `area/booking`, `type/integration`, `provider/google`, `risk/high`
- `Implement real Microsoft Graph event CRUD and busy-time sync`
  - labels: `area/convex`, `area/booking`, `type/integration`, `provider/microsoft`, `risk/high`
- `Add booking management views to the dashboard`
  - labels: `area/web`, `area/booking`, `type/feature`

### Backlog

- `Add reconciliation workflow for calendar drift and failed sync`
  - labels: `area/convex`, `area/booking`, `type/feature`

## M4 SMS

### Ready

- `Implement real outbound SMS sending and delivery status handling`
  - labels: `area/convex`, `type/integration`, `provider/twilio`, `risk/high`
- `Validate SMS booking flow end to end against Twilio`
  - labels: `area/convex`, `type/testing`, `provider/twilio`

### Backlog

- `Add message inbox views for SMS conversations`
  - labels: `area/web`, `type/feature`

## M5 Voice

### Ready

- `Validate live Twilio Media Streams with OpenAI Realtime`
  - labels: `area/voice`, `type/testing`, `provider/twilio`, `provider/openai`, `risk/high`
- `Validate transcript and recording persistence from a real call`
  - labels: `area/voice`, `area/convex`, `type/testing`, `provider/twilio`, `provider/openai`
- `Validate live transfer execution through Twilio`
  - labels: `area/voice`, `type/testing`, `provider/twilio`, `risk/high`
- `Harden voice error handling for provider disconnects and tool failures`
  - labels: `area/voice`, `type/bug`, `risk/high`

### Backlog

- `Add call status callbacks from Twilio to reconcile final call state`
  - labels: `area/voice`, `area/convex`, `type/integration`, `provider/twilio`
- `Add operator view for taken voice messages and call disposition`
  - labels: `area/web`, `type/feature`

## M6 Hardening

### Ready

- `Create Docker Compose self-hosted path`
  - labels: `area/devops`, `type/feature`, `risk/high`
- `Document self-hosting and upgrade process`
  - labels: `type/docs`, `area/devops`
- `Add end-to-end tests for snapshot-based voice path`
  - labels: `type/testing`, `area/voice`

### Backlog

- `Add release and changelog discipline with milestone-based notes`
  - labels: `type/docs`, `area/devops`
- `Create pilot readiness checklist`
  - labels: `type/docs`, `type/testing`
