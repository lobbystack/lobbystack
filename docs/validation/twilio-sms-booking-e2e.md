# Twilio SMS Booking End-to-End Validation

## Summary

This document captures the real Twilio-backed SMS booking validation for `OPE-17`.

Validation status: passed for the live happy path on the dev deployment, with follow-up validation still needed for post-booking lookup and unsupported appointment-change SMS branches.

Validated date: `2026-03-16`

## Environment

- Convex deployment: `dev:valiant-ibis-521`
- Convex site URL: `https://valiant-ibis-521.convex.site`
- Twilio SMS webhook: `POST /twilio/sms/inbound`
- Twilio SMS status callback handler: `POST /twilio/sms/status`
- Twilio number:
  - one active SMS-capable number is configured on the Twilio account
  - the number is mapped to the dev clinic business in Convex
  - the live `sms_url` on Twilio points to `https://valiant-ibis-521.convex.site/twilio/sms/inbound`
- Target business:
  - business: `Maple Family Clinic`
  - slug: `maple-family-clinic`
  - deployment mode: `development`
  - timezone: `America/Toronto`
- Booking setup confirmed on the deployment:
  - active SMS-enabled phone route exists
  - active `Initial Consultation` service exists
  - active staff member exists
  - staff-service assignment exists
  - business hours are configured for all seven days

## Live Validation Evidence

### Conversation

- conversation id: `md70v6x77jqd3zwx7va249d2c9830x0m`
- channel: `sms`
- status: `open`
- business id: `kh70h73crf0cvbp8pcn0azcf1182mc57`

### Happy-Path Transcript

Observed inbound and outbound messages on the deployment:

1. Customer: `Hello, do you have room for an Initial Consultation on March 23rd`
2. Assistant: `The next available Initial Consultation times on Monday, Mar 23 are 9:00 AM, 9:15 AM, 9:30 AM. What time would you prefer?`
3. Customer: `What about in the evening?`
4. Assistant: `I have Initial Consultation availability on Monday, Mar 23 in the evening: 4:00 PM, 4:15 PM, 4:30 PM. What time would you prefer?`
5. Customer: `4h30`
6. Assistant: `That works. Could you please provide your name so I can get that Initial Consultation booked for you on March 23rd at 4:30 PM?`
7. Customer: `Wait, do you have room at 1h30 on the 24?`
8. Assistant: `I have Initial Consultation available for Tuesday, Mar 24 at 1:30 PM. Does that work for you?`
9. Customer: `Yes`
10. Assistant: `Great, I booked your Initial Consultation for Tuesday, Mar 24 at 1:30 PM.`

### Delivery And Provider Status

Observed on persisted outbound messages:

- offered slot reply `SM6691f93ae5eb5f2f88ee8904c4cd5705`
  - local message status: `delivered`
  - provider status: `delivered`
- final booking confirmation `SM9b2427101f99fa9bb49ec581d4711a15`
  - local message status: `delivered`
  - provider status: `delivered`
  - provider updated at: `2026-03-16T20:27:56.811Z`
  - Twilio message record confirms:
    - direction: `outbound-api`
    - status: `delivered`
    - `from`: the mapped business SMS number
    - `to`: the test customer number

### Persistence Checks

Observed on the deployment after the live thread:

- confirmed appointment exists:
  - appointment id: `j5750zkjg7r83n8zxx9ncs2zmn8311df`
  - source channel: `sms`
  - status: `confirmed`
  - starts at: `2026-03-24T17:30:00.000Z`
  - calendar sync state: `synced`
- conversation booking state exists:
  - mode: `booked`
  - requested date: `2026-03-24`
  - last confirmed appointment id matches the created appointment
  - last confirmed service id matches `Initial Consultation`
- inbound idempotency keys were recorded with `processed` status for the Twilio inbound message SIDs in the thread

## Result

The following were validated against the live dev deployment:

- Twilio inbound webhook routing to the correct Convex business
- persisted inbound SMS conversation/message creation
- AI-driven availability replies over the real Twilio path
- follow-up slot selection over SMS
- booking confirmation over SMS
- appointment creation with `sourceChannel: "sms"`
- outbound Twilio delivery
- Twilio status callback reconciliation back into persisted message state

## Observed Gaps

The following were not freshly validated through a new live carrier turn during this run:

- post-booking appointment lookup replies
- unsupported cancel/reschedule replies

Reason:

- the validated live conversation `md70v6x77jqd3zwx7va249d2c9830x0m` still only contains the happy-path booking turns captured above
- a follow-up scan of recent dev deployment SMS messages on `2026-03-16` did not surface any real carrier turns exercising appointment lookup or unsupported change handling
- the Twilio account only exposed one active number here, so a second controlled inbound source was not available from the repo environment alone

These remain good follow-up validation checks after the next dev deployment refresh or from a separate physical test device.

## Next Live Validation Script

Use the same dev Twilio number and a physical test device for the next carrier-backed run.

Suggested sequence:

1. Reuse or create a contact with a confirmed SMS-booked appointment.
2. Send `When is my appointment?`
3. Capture the inbound and outbound message bodies, provider SIDs, and delivery status.
4. Send `Can you cancel my appointment?` or `Can you move my appointment?`
5. Capture the inbound and outbound message bodies, provider SIDs, and delivery status.
6. Verify the reply does not claim the appointment was changed and still references the grounded appointment context.
7. Append the transcript and persistence evidence to this document.

## Follow-Up Finding

During inspection, the contact attached to the validated SMS thread had a stale bad name value:

- contact id: `m575mk9c5qqzgbhv0yt7bs68yn83141m`
- stored name: `Parlez-vous français`

That value does not match the validated thread transcript and should be treated as historical data corruption or prior name-capture fallout, not as evidence that the current merged runtime still reproduces the bug.

Status update:

- `OPE-52` shipped a runtime fix on `main` and on this branch to stop explicit language-switch prompts from being persisted as SMS contact names
- the remaining cleanup for this specific dev record is operational only and can be handled directly in the Convex dashboard
