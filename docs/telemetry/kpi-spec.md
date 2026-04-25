# Product KPI Spec

## Goal

This document defines the canonical KPI set for product analytics phase 2 so PostHog dashboards, saved insights, and validation steps all describe the same outcomes.

## KPI groups

### Onboarding activation

Primary questions:

- are new businesses getting through onboarding?
- do they reach meaningful product usage after setup?

Canonical milestones:

- verified phone
- claimed number
- calendar connected
- first meaningful operator usage

Meaningful first usage is the first occurrence of one of:

- `web.messages.thread_opened`
- `web.messages.reply_sent`
- `web.contacts.contact_opened`
- `web.agent.settings_saved`

Primary asset:

- `KPI - Onboarding Activation Funnel`

### Messaging adoption

Primary questions:

- are inbound SMS conversations arriving?
- are replies generated and delivered?
- are operators stepping in too often?

Canonical metrics:

- inbound SMS volume
- reply rate
- delivery success rate
- automation pause rate
- operator reply rate

Primary assets:

- `KPI - SMS Adoption Funnel`
- `Telemetry - Delivery and Workflow Failures`

### Voice adoption

Primary questions:

- are voice calls being answered and completed?
- how often do calls convert to bookings?
- how often do transfers happen?

Canonical metrics:

- call started volume
- call completed rate
- transfer requested rate
- transfer completed rate
- follow-up completion rate

Primary assets:

- `KPI - Voice Booking Funnel`

### Booking outcomes

Primary questions:

- are bookings succeeding?
- where are bookings failing?
- which source channels drive bookings?

Canonical metrics:

- booking success rate
- booking failure rate
- booking source breakdown by `sourceChannel`

Primary assets:

- `KPI - Booking Success vs Failure`

### Operational quality

Primary questions:

- are workflows and integrations healthy enough to trust product analytics?
- is knowledge activity showing the expected operator usage?

Canonical metrics:

- workflow started vs failed
- calendar sync failure rate
- knowledge indexing volume
- knowledge search volume

Primary assets:

- `KPI - Workflow Health`
- `KPI - Calendar Integration Health`

## Hosted PostHog assets

### Dashboards

- `LobbyStack - Product KPIs`
- `LobbyStack - Operator Workflow`
- `LobbyStack - Messaging`
- `LobbyStack - Voice & Booking Outcomes`
- `LobbyStack - Analytics Health`

### Saved insights

- `KPI - Onboarding Activation Funnel`
- `KPI - SMS Adoption Funnel`
- `KPI - Voice Booking Funnel`
- `KPI - Booking Success vs Failure`
- `KPI - Calendar Integration Health`
- `KPI - Workflow Health`
- `KPI - Meaningful Usage by Business`
- `KPI - Analytics Critical Event Volume`

### Action

- `Meaningful First Usage`

## Group analytics model

PostHog should be analyzed at the `business` group level first.

Rules:

- operators are identified as `user:{userId}`
- system events are identified as `system:business:{businessId}`
- event grouping uses `business:{businessId}`
- customers do not become PostHog persons

Target business cohorts to maintain in PostHog:

- onboarded businesses
- calendar-connected businesses
- active SMS businesses
- active voice businesses
- businesses with booking activity in the last 30 days
- businesses with workflow or calendar issues in the last 7 days

## Notes

- experiments and feature flags are intentionally out of scope for this phase
- PostHog now covers both KPI reporting and the current phase of operational telemetry
- the KPI dashboards should become the default reporting surface; `LobbyStack Telemetry v1` remains useful as a raw telemetry backup
