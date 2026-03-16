# Twilio SMS Booking End-to-End Validation

## Summary

This document captures the real Twilio-backed SMS booking validation for `OPE-17`.

Validation status: passed for the live happy path, current-appointment lookup, and unsupported appointment-change replies on the dev deployment.

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
- post-booking current-appointment lookup over SMS
- grounded unsupported cancel/reschedule reply over SMS
- outbound Twilio delivery
- Twilio status callback reconciliation back into persisted message state

## Follow-Up Transcript

Additional live carrier turns observed on `2026-03-16` for the same conversation:

1. Customer: `When is my appoitment?`
2. Assistant: `I'm sorry, could you rephrase that?`
3. Customer: `When is my appointment?`
4. Assistant: `Your Initial Consultation is on Tuesday, March 24 at 1:30 PM.`
5. Customer: `Can you cancel my appointment?`
6. Assistant: `You have an Initial Consultation confirmed for Tuesday, March 24 at 1:30 PM. Unfortunately, we cannot cancel or reschedule appointments via SMS. Please contact the office directly if you need to make changes to your booking.`

Observed persisted outbound messages:

- typo fallback reply `SM7a0aecbe18e9256168aa4c78d70ea4a1`
  - local message status: `delivered`
  - provider status: `delivered`
- current-appointment reply `SM54f844ff380fbfea1550c16cde574982`
  - local message status: `delivered`
  - provider status: `delivered`
- unsupported cancellation reply `SM1ce4db188ff10bfc08eb884372fb3cf8`
  - local message status: `delivered`
  - provider status: `delivered`

Note:

- the first lookup attempt contained the typo `appoitment` and fell back to a generic rephrase prompt
- the correctly spelled retry succeeded immediately and returned the grounded appointment details

## Follow-Up Finding

During inspection, the contact attached to the validated SMS thread had a stale bad name value:

- contact id: `m575mk9c5qqzgbhv0yt7bs68yn83141m`
- stored name: `Parlez-vous français`

That value does not match the validated thread transcript and should be treated as historical data corruption or prior name-capture fallout, not as evidence that the current merged runtime still reproduces the bug.

Status update:

- `OPE-52` shipped a runtime fix on `main` and on this branch to stop explicit language-switch prompts from being persisted as SMS contact names
- the remaining cleanup for this specific dev record is operational only and can be handled directly in the Convex dashboard
