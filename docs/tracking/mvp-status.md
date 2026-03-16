# MVP Status

## Milestone Status

| Milestone | Status | Stage | Notes |
| --- | --- | --- | --- |
| `M0 Foundation` | done | implemented | Monorepo, CI, Convex project, component mounting, env config, ADRs, baseline docs exist. |
| `M1 Tenant Core` | in progress | implemented | Auth, business bootstrap, memberships, dashboard shell, services, hours, transfer settings exist. Still needs fuller admin coverage and tighter authorization review. |
| `M2 Business Context MCP` | in progress | implemented | Snapshot generation, FAQ/doc knowledge layer, preview flow, and dashboard customization exist. Needs richer ingestion and provider validation. |
| `M3 Booking + Calendars` | in progress | scaffolded | Availability engine and booking mutations exist. Calendar integrations are mostly placeholder/mock behavior and need real provider sync. |
| `M4 SMS` | in progress | provider-validated | Twilio inbound SMS routing, outbound delivery, status callback reconciliation, a live SMS booking path, current-appointment lookup, and unsupported cancel/reschedule replies have been validated on the dev deployment. Operator tooling and broader polish still remain. |
| `M5 Voice` | in progress | implemented | Twilio voice ingress, Media Streams endpoint, OpenAI Realtime bridge, transcript persistence, and recording upload/download path exist. Needs real live-call validation. |
| `M6 Hardening` | backlog | scaffolded | CI and some docs/tests exist. Self-host packaging, release discipline, provider validation, and pilot hardening are incomplete. |

## Current Reality

What is already real:

- businesses can configure receptionist profile, hours, services, FAQs, and manual docs
- Convex builds `business_context_snapshots`
- the voice gateway loads the snapshot once per call
- the voice gateway now has a live media-stream bridge shape
- calls can persist transcript segments
- calls can persist downloadable audio recordings in Convex storage
- the dashboard can list recent calls and expose recording download links
- the Twilio SMS path has produced a real inbound conversation, live booking confirmation, delivered outbound messages, and reconciled provider statuses on the dev deployment

What is not yet proven:

- real OpenAI Realtime call quality and barge-in behavior
- real booking success over live voice
- real human transfer execution
- real Google Calendar and Microsoft Graph synchronization
- full pilot-grade reliability

## Next Validation Priorities

1. Validate one full live Twilio -> OpenAI Realtime -> transcript -> recording call.
2. Validate the voice tool bridge for availability and booking with real Convex data.
3. Validate live transfer behavior through Twilio call updates.
4. Replace mock calendar sync with real provider CRUD and reconciliation.
5. Add operator tooling for inspecting and managing SMS conversations and booking outcomes.
