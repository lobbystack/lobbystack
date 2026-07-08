# Polar billing setup

This repo uses Polar for hosted cloud billing.

The integration is intentionally hosted and backend-driven:

- checkout creation stays in [convex/billing.ts](/convex/billing.ts)
- customer self-service uses Polar customer sessions instead of custom billing UI
- subscription and transaction state are synchronized from Polar webhooks
- metered usage is emitted from backend usage events, never from the client

## Products

Create or verify these Polar products:

- `LobbyStack Starter Monthly`
  - recurring monthly product
  - `$30/month`
  - mapped to `POLAR_STARTER_MONTHLY_PRODUCT_ID`
  - created product ID: `fc07b74d-3dc7-4efb-9270-be74de48e187`
- `LobbyStack Starter Annual`
  - recurring annual product
  - `$288/year`
  - mapped to `POLAR_STARTER_ANNUAL_PRODUCT_ID`
  - created product ID: `40145a2c-9cfd-491c-8cec-b6aa63b6b52f`
- `LobbyStack Pro Monthly`
  - recurring monthly product
  - `$100/month`
  - mapped to `POLAR_PRO_MONTHLY_PRODUCT_ID`
  - created product ID: `f1e1fbeb-a0d5-4f40-bb98-b27d70a2c0d3`
- `LobbyStack Pro Annual`
  - recurring annual product
  - `$960/year`
  - mapped to `POLAR_PRO_ANNUAL_PRODUCT_ID`
  - created product ID: `747a648b-0939-4626-967f-93941bcff296`
- `LobbyStack Starter Monthly + AI SMS`
  - recurring monthly product
  - mapped to `POLAR_STARTER_MONTHLY_AI_SMS_PRODUCT_ID`
  - include the Starter monthly base price, the `$5/month` AI SMS recurring price, and the AI SMS metered unit price
- `LobbyStack Starter Annual + AI SMS`
  - recurring annual Starter base product with monthly AI SMS metered usage
  - mapped to `POLAR_STARTER_ANNUAL_AI_SMS_PRODUCT_ID`
  - include the Starter annual base price, the `$5/month` AI SMS recurring price, and the AI SMS metered unit price
- `LobbyStack Pro Monthly + AI SMS`
  - recurring monthly product
  - mapped to `POLAR_PRO_MONTHLY_AI_SMS_PRODUCT_ID`
  - legacy fallback env: `POLAR_PRO_AI_SMS_PRODUCT_ID`
  - include the Pro monthly base price, the `$5/month` AI SMS recurring price, and the AI SMS metered unit price
- `LobbyStack Pro Annual + AI SMS`
  - recurring annual Pro base product with monthly AI SMS metered usage
  - mapped to `POLAR_PRO_ANNUAL_AI_SMS_PRODUCT_ID`
  - include the Pro annual base price, the `$5/month` AI SMS recurring price, and the AI SMS metered unit price
- `AI SMS setup`
  - one-time purchase product
  - mapped to `POLAR_AI_SMS_SETUP_PRODUCT_ID`
  - include the `$19` one-time setup price on this product

Do not model the `$19` AI SMS setup fee as metered usage. Polar renders every
metered price under "Additional metered usage", which makes a setup fee look
usage-based. AI SMS enablement uses a one-time setup checkout first. After Polar
confirms the setup order is paid, the backend updates the existing Pro
subscription to the `Pro + AI SMS` product. This keeps the customer on one Polar
subscription while preserving a real one-time setup charge.

The current hosted pricing model is:

- `Free`
  - no Polar subscription
  - `30` voice minutes included
  - `10` Alert SMS segments included
  - `2` outbound call attempts included
  - no AI SMS
  - no overages
- `Starter`
  - `$30/month` or `$288/year`
  - `150` voice minutes included per month
  - `50` Alert SMS segments included per month
  - `20` outbound call attempts included per month
  - overages after the included pool is consumed
- `Pro`
  - `$100/month` or `$960/year`
  - `500` voice minutes included per month
  - `200` Alert SMS segments included per month
  - `100` outbound call attempts included per month
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

Monthly hosted products use Polar meter-credit benefits for the included usage
pool. Annual hosted products should not grant annual meter-credit benefits for
voice minutes, Alert SMS segments, or outbound call attempts. LobbyStack tracks
included usage by calendar month and sends only monthly overage quantities to
Polar for annual hosted subscriptions, preserving monthly usage resets while the
base subscription renews yearly.

`Alert SMS` and `AI SMS` are intentionally separate:

- `Alert SMS` is sent from Noncia's shared platform sender
- `AI SMS` is sent from the customer's own business number

## Environment variables

Set these values in Convex and local development when billing is enabled:

- `POLAR_SERVER`
- `POLAR_ORGANIZATION_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_STARTER_MONTHLY_PRODUCT_ID`
- `POLAR_STARTER_ANNUAL_PRODUCT_ID`
- `POLAR_PRO_MONTHLY_PRODUCT_ID`
- `POLAR_PRO_ANNUAL_PRODUCT_ID`
- `POLAR_STARTER_MONTHLY_AI_SMS_PRODUCT_ID`
- `POLAR_STARTER_ANNUAL_AI_SMS_PRODUCT_ID`
- `POLAR_PRO_MONTHLY_AI_SMS_PRODUCT_ID`
- `POLAR_PRO_ANNUAL_AI_SMS_PRODUCT_ID`
- `POLAR_AI_SMS_SETUP_PRODUCT_ID`
- `POLAR_REFERRAL_DISCOUNT_ID`
- `SITE_URL`

`POLAR_AI_SMS_ADDON_PRODUCT_ID` is optional and only exists to recognize legacy
separate AI SMS subscriptions from the older add-on subscription flow. New AI SMS
enablement uses `POLAR_AI_SMS_SETUP_PRODUCT_ID` for checkout and
the matching `{plan, interval} + AI SMS` product for the existing paid
subscription update. `POLAR_PRO_AI_SMS_PRODUCT_ID` is still accepted as a legacy
fallback for `POLAR_PRO_MONTHLY_AI_SMS_PRODUCT_ID`.

Create a 5% percentage discount in Polar for referred customers and set its ID as
`POLAR_REFERRAL_DISCOUNT_ID`. LobbyStack applies this discount server-side when
an eligible referred business starts a hosted plan checkout. Referral discounts
are not entered by the customer as coupon codes; the checkout receives the
configured Polar discount automatically from the stored referral attribution.

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
