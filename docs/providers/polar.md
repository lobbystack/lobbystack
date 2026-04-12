# Polar billing setup

This repo uses Polar for hosted cloud billing.

## Products

Create these Polar products:

- `Pro`
  - recurring monthly product
  - mapped to `POLAR_PRO_PRODUCT_ID`
- `AI SMS add-on`
  - recurring monthly product
  - mapped to `POLAR_AI_SMS_ADDON_PRODUCT_ID`
- `AI SMS setup`
  - one-time product
  - mapped to `POLAR_AI_SMS_SETUP_PRODUCT_ID`

The current hosted pricing model is:

- `Free Cloud`
  - no Polar subscription
  - `10` voice minutes included
  - `10` Alert SMS segments included
  - `2` outbound call attempts included
  - no AI SMS
  - no overages
- `Pro`
  - `$15/month`
  - `80` voice minutes included
  - `50` Alert SMS segments included
  - `20` outbound call attempts included
  - overages after the included pool is consumed
- `AI SMS add-on`
  - `$5/month`
  - `$19` one-time setup
  - `$0.03` per AI SMS segment

## Metered events

The app sends these usage events to Polar:

- `billing.voice_minutes`
- `billing.alert_sms_segments`
- `billing.outbound_call_attempts`
- `billing.ai_sms_segments`

`Alert SMS` and `AI SMS` are intentionally separate:

- `Alert SMS` is sent from Noncia's shared platform sender
- `AI SMS` is sent from the customer's own business number

## Environment variables

Set these values in Convex and local development when billing is enabled:

- `POLAR_SERVER`
- `POLAR_ORGANIZATION_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PRO_PRODUCT_ID`
- `POLAR_AI_SMS_ADDON_PRODUCT_ID`
- `POLAR_AI_SMS_SETUP_PRODUCT_ID`
- `SITE_URL`

For hosted Alert SMS, also configure:

- `TWILIO_ALERT_SMS_FROM`

## Webhook routing

Polar routes are registered from [convex/http.ts](/Users/raphael/Coding/ai-receptionist/convex/http.ts) through [convex/billing.ts](/Users/raphael/Coding/ai-receptionist/convex/billing.ts).

Use the Convex HTTP endpoint:

- `/polar/events`

## Notes

- `Self-host` workspaces stay outside hosted billing enforcement.
- Legacy billing records from earlier pricing models are still accepted by the current schema to keep the dev deployment deployable during migration.
