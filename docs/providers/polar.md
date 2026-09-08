---
meta:
  title: Configure Polar billing
  navLabel: Polar Billing
  contentType: How-to
  category: Providers
---

<!-- Content plan: Help operators configure hosted billing. Cover products, event ingestion, secrets, webhooks, and verification. Goal: connect an existing Polar organization without changing its prices. Open questions: none for application configuration; confirm live prices in Polar before taking payments. -->

# Configure Polar billing

Use this guide to connect your Polar organization to hosted Starter and Pro billing. You need access to Polar settings and your deployment platform’s secret store.

## Create the hosted products

Copy your four recurring product IDs into the matching environment variables. Reuse existing products during a migration. Confirm their live prices in Polar before accepting payments.

| Product | Price | Environment variable |
| --- | --- | --- |
| Starter monthly | $30 each month | `POLAR_STARTER_MONTHLY_PRODUCT_ID` |
| Starter annual | $288 each year | `POLAR_STARTER_ANNUAL_PRODUCT_ID` |
| Pro monthly | $100 each month | `POLAR_PRO_MONTHLY_PRODUCT_ID` |
| Pro annual | $960 each year | `POLAR_PRO_ANNUAL_PRODUCT_ID` |

Use `starter` or `pro` for checkout, with monthly or annual billing. The checkout worker ignores separate product IDs for AI-generated text messages.

## Configure usage event ingestion

The worker sends finalized paid-plan usage from `billing_usage_events` to Polar.

| Usage | Event name | Quantity unit |
| --- | --- | --- |
| Voice | `billing.voice_minutes` | Minutes (seconds divided by 60) |
| Alert text messages | `billing.alert_sms_segments` | Short Message Service (SMS) segments |
| Outbound call attempts | `billing.outbound_call_attempts` | Attempts |

Grant your token `events:write` access for `POST /v1/events/ingest`. You don’t need `POLAR_*METER_ID` variables. The worker sends these fields:

| Field | Value |
| --- | --- |
| `external_customer_id` | The account’s billing key |
| `external_id` | The usage source key, which prevents duplicate ingestion |
| `metadata` | Quantity, business ID, and usage kind |

Keep your existing Polar meters and prices. Connecting this application leaves them unchanged. See [Polar event ingestion](https://polar.sh/docs/features/usage-based-billing/event-ingestion) for the request format.

Starter and Pro include usage allowances that reset each month, including on annual subscriptions. The worker sends `billableQuantity` when present, including zero; otherwise, it sends the recorded quantity.

The worker skips these events:

- Provisional usage
- Free-plan usage
- Usage without a linked Polar customer

## Set the environment variables

Copy these variable names from [`.env.example`](../../.env.example) into your deployment platform’s secret store. Replace the placeholder values with credentials from the same Polar environment.

```dotenv
POLAR_ACCESS_TOKEN=your_polar_access_token
POLAR_WEBHOOK_SECRET=your_polar_webhook_secret
POLAR_ORGANIZATION_ID=your_polar_organization_id
POLAR_API_BASE_URL=https://sandbox-api.polar.sh

POLAR_STARTER_MONTHLY_PRODUCT_ID=your_starter_monthly_product_id
POLAR_STARTER_ANNUAL_PRODUCT_ID=your_starter_annual_product_id
POLAR_PRO_MONTHLY_PRODUCT_ID=your_pro_monthly_product_id
POLAR_PRO_ANNUAL_PRODUCT_ID=your_pro_annual_product_id
```

Match `POLAR_API_BASE_URL` to the environment that issued the token, webhook secret, and product IDs.

## Route billing requests

The Next.js app exposes three billing entry points.

| Route | Purpose |
| --- | --- |
| `POST /api/billing/checkout` | Queue a Starter or Pro checkout request. |
| `POST /api/billing/portal` | Create a customer portal session for an active paid subscription. |
| `POST /api/webhooks/polar` | Verify and store Polar events for worker reconciliation. |

Configure Polar to send subscription and order webhooks to `https://app.example.com/api/webhooks/polar`. Replace `app.example.com` with your admin application’s public host.

Set `POLAR_WEBHOOK_SECRET` in production. The route rejects missing secrets and invalid signatures with HTTP 401.

## Understand the billing flow

Use this sequence to check where a checkout stops:

1. The admin API writes a checkout request and enqueues `billing.createCheckout`.
2. The worker creates the Polar checkout with the configured product ID.
3. The browser opens the checkout URL after the request becomes ready.
4. Polar sends subscription and order events to the Next.js webhook route.
5. The route stores each provider event once and enqueues `billing.reconcile`.
6. The worker updates local subscription and transaction records.

The billing page reads PostgreSQL for plan, usage, spending-cap, and transaction data. It creates portal sessions on the server for billing administrators.

## Recover failed usage syncs

Use `billing_usage_events` to investigate metered usage that did not reach Polar.

Inspect these columns and the worker’s job logs:

- `sync_status`
- `source_key`
- `quantity` and `billable_quantity`
- `is_final`
- `updated_at`

The queue allows five attempts per job, with exponential backoff between attempts. Inspect worker logs for provider failures before retrying.

Fix the provider error before you requeue `billing.syncUsage`. Keep the usage row and source key to prevent duplicate ingestion.

## Recover missing orders

Replay a signed Polar webhook when Polar contains an order missing from `billing_transactions`.

The webhook handler uses provider event IDs for idempotency. Do not insert billing transactions by hand.

## Validate the integration

Run these checks in the Polar sandbox before enabling production billing:

- Confirm only business administrators can start checkout or open the portal.
- Complete monthly and annual checkout for Starter and Pro.
- Confirm invalid webhook signatures receive an unauthorized response.
- Confirm duplicate webhook deliveries create one provider event.
- Generate each metered usage type and verify the Polar quantity.
- Confirm annual subscriptions send monthly overage quantities.
- Confirm worker logs identify usage-sync failures and that requeueing recovers them.

Self-hosted workspaces remain outside hosted billing enforcement. Convex billing data appears only in migration and reconciliation workflows.
