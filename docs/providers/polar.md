# Polar billing setup

This repo uses Polar for hosted cloud billing.

The integration is intentionally hosted and backend-driven:

- checkout creation stays in [convex/billing.ts](/convex/billing.ts)
- customer self-service uses Polar customer sessions instead of custom billing UI
- subscription and transaction state are synchronized from Polar webhooks
- metered usage is emitted from backend usage events, never from the client

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

- `Free`
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

## Secret handling

Treat these as backend-only secrets:

- `POLAR_ORGANIZATION_TOKEN`
- `POLAR_WEBHOOK_SECRET`

Do not expose them to the web app, mobile clients, third-party scripts, or browser-visible env vars.

Operational defaults:

- use separate Polar credentials for `sandbox` and `production`
- keep `POLAR_SERVER` aligned with the matching token, webhook secret, and product IDs
- store secrets in your deployment platform's secret manager or protected environment configuration
- never log Polar secrets, paste them into tickets, or include them in analytics payloads

If a Polar secret is exposed:

1. Rotate the affected credential immediately.
2. Review recent checkout, subscription, transaction, and metered-event activity.
3. Re-verify webhook delivery and metered usage sync after rotation.

This repo does not assume Stripe-style restricted API keys exist in Polar. Until Polar documents an equivalent scoped credential for this workflow, keep the organization token limited to backend infrastructure you control.

## Webhook routing

Polar routes are registered from [convex/http.ts](/convex/http.ts) through [convex/billing.ts](/convex/billing.ts).

Use the Convex HTTP endpoint:

- `/polar/events`

Webhook handling expectations:

- signature verification is enforced by `@convex-dev/polar` before app handlers run
- webhook updates are the source of truth for hosted plan, add-on, and transaction state
- do not introduce separate manual renewal loops or invoice polling to drive subscription state

## Metered usage operations

Polar metered usage is driven by rows in the `billing_usage_events` table.

Important fields:

- `syncStatus`
- `syncAttemptedAt`
- `syncedAt`
- `syncError`

Expected retry behavior for `internal.billing.syncUsageEventToPolar`:

- immediate first attempt from the triggering workflow
- best-effort retries after `30s`, `2m`, `10m`, and `30m`

Operational guidance:

- treat repeated `syncStatus = "failed"` rows as an alertable billing issue
- check `syncError` first for token, customer-link, or transient Polar API failures
- after fixing the underlying issue, manually re-run `internal.billing.syncUsageEventToPolar` for the affected usage event IDs
- do not backfill usage by minting ad hoc Polar events outside this table unless you also reconcile local billing records deliberately

## Validation

Before go-live, confirm:

- checkout creation works only from backend actions and only for billing admins
- customer portal sessions are created server-side and only for billing admins
- `/polar/events` rejects missing or invalid webhook signatures
- metered usage failures are visible through `billing_usage_events.syncStatus`

## Notes

- `Self-host` workspaces stay outside hosted billing enforcement.
- Legacy billing records from earlier pricing models are still accepted by the current schema to keep the dev deployment deployable during migration.
