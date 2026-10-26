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

## Create the partner tier products

Partners pay you for a tier from the console's **Billing** page. Create one recurring product for each tier and interval, and copy its ID into the matching variable. Partners can buy a tier only when all six are set, each to its own product. Until then, partners pay you no tier, and nothing limits their pools or their phone numbers.

| Product | Price | Environment variable |
| --- | --- | --- |
| Partner Starter monthly | $49 each month | `POLAR_PARTNER_STARTER_MONTHLY_PRODUCT_ID` |
| Partner Starter annual | $470.40 each year | `POLAR_PARTNER_STARTER_ANNUAL_PRODUCT_ID` |
| Partner Growth monthly | $199 each month | `POLAR_PARTNER_GROWTH_MONTHLY_PRODUCT_ID` |
| Partner Growth annual | $1,910.40 each year | `POLAR_PARTNER_GROWTH_ANNUAL_PRODUCT_ID` |
| Partner Scale monthly | $499 each month | `POLAR_PARTNER_SCALE_MONTHLY_PRODUCT_ID` |
| Partner Scale annual | $4,790.40 each year | `POLAR_PARTNER_SCALE_ANNUAL_PRODUCT_ID` |

The **Billing** page shows these prices from `partnerTierCatalog` in `packages/shared/src/billing.ts`, so give your products the same ones. A partner that pays for no tier is on Free, which needs no product.

A partner's Polar customer has the external ID `partner:<partner ID>`, never a business's. The webhook route stores its events with the partner, and the worker sets the partner's tier, subscription state, pool and included numbers from them. Keep "Allow multiple subscriptions" off, so a partner holds one tier at a time.

## Charge partners for extra numbers

Each tier includes some phone numbers. A partner on a paid tier can hold more. Each number past the included ones costs the partner what Twilio charges you for it each month. Your deployment counts and charges partners' numbers only while all six tier products are set. The worker records that when it starts, so restart it after you change them. Set up Polar to bill those charges:

1. Create a meter that counts the `billing.partner_extra_numbers` event and sums its `quantity` metadata.
2. Add a metered price for that meter to each of the six partner tier products, at $0.01 a unit.

The worker reads a number's monthly price from Twilio's Pricing API before it buys a number that counts against a partner's tier. It stores the price in `partner_number_charges`. Each hour, the `billing.chargePartnerNumbers` job sends Polar one event for each month of each extra number, under the partner's customer:

- **Which numbers are extra**: the partner's oldest numbers are the included ones.
- **Quantity**: the number's monthly price, in US cents.
- **`external_id`**: the number and the month, so Polar charges each month once.

A partner on Free gets no number past its included ones, and Free includes none. Without the meter and its prices, Polar ingests the events and charges nothing for them. When Polar refuses a partner's event, the job retries that partner's charges on its next run and still settles everyone else's.

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

POLAR_PARTNER_STARTER_MONTHLY_PRODUCT_ID=your_partner_starter_monthly_product_id
POLAR_PARTNER_STARTER_ANNUAL_PRODUCT_ID=your_partner_starter_annual_product_id
POLAR_PARTNER_GROWTH_MONTHLY_PRODUCT_ID=your_partner_growth_monthly_product_id
POLAR_PARTNER_GROWTH_ANNUAL_PRODUCT_ID=your_partner_growth_annual_product_id
POLAR_PARTNER_SCALE_MONTHLY_PRODUCT_ID=your_partner_scale_monthly_product_id
POLAR_PARTNER_SCALE_ANNUAL_PRODUCT_ID=your_partner_scale_annual_product_id
```

Match `POLAR_API_BASE_URL` to the environment that issued the token, webhook secret, and product IDs.

## Route billing requests

The Next.js app exposes these billing entry points:

| Route | Purpose |
| --- | --- |
| `POST /api/billing/checkout` | Queue a Starter or Pro checkout request. Returns HTTP 409 while the business has a live paid plan or a checkout from the last 30 minutes. |
| `POST /api/billing/portal` | Create a customer portal session for an active paid subscription. |
| `POST /api/billing/cancel` | Cancel an active Starter or Pro subscription at the end of its billing period. |
| `POST /api/partner/billing/checkout` | Queue a partner tier checkout for one of the partner's owners. Returns HTTP 409 while the partner's tier is live, while another owner's checkout from the last 30 minutes is open, or when the tier products aren't all set. |
| `POST /api/partner/billing/portal` | Create a customer portal session for a partner's owner, to change or cancel the tier and update the card. |
| `POST /api/webhooks/polar` | Verify and store Polar events for worker reconciliation. |

Grant your token `subscriptions:write` access for the cancel route, which calls `PATCH /v1/subscriptions/{id}`.

Configure Polar to send subscription and order webhooks to `https://app.example.com/api/webhooks/polar`. Replace `app.example.com` with your admin application’s public host.

Set `POLAR_WEBHOOK_SECRET` in production. The route rejects missing secrets and invalid signatures with HTTP 401.

Set `POLAR_ACCEPT_LEGACY_BUSINESS_IDS=true` only in production. It lets signed webhooks resolve `business:<legacy-id>` customer references from before the PostgreSQL move through the `businesses.legacy_convex_id` column. Keep it disabled in staging so a shared Polar organization cannot route production customer events into the staging database.

## Understand the billing flow

Use this sequence to check where a checkout stops:

1. The admin API writes a checkout request and enqueues `billing.createCheckout`.
2. The worker creates the Polar checkout with the configured product ID.
3. The browser opens the checkout URL after the request becomes ready.
4. After payment, Polar sends the browser to `/billing/success`, which polls the checkout request until step 7 finishes.
5. Polar sends subscription and order events to the Next.js webhook route.
6. The route stores each provider event once and enqueues `billing.reconcile`.
7. The worker updates local subscription and transaction records.

A partner's tier follows the same steps with its own records. The checkout request and the jobs name the partner instead of a business: `billing.createPartnerCheckout` creates the checkout, and `billing.reconcilePartner` updates `partner_billing_accounts`. Polar sends the owner back to the **Billing** page on the console's address they started from.

The billing page reads PostgreSQL for plan, usage, spending-cap, and transaction data. It creates portal sessions on the server for billing administrators.

## Recover failed usage syncs

Use `billing_usage_events` to investigate metered usage that did not reach Polar.

Inspect these columns and the worker’s job logs:

- `sync_status`
- `source_key`
- `quantity` and `billable_quantity`
- `is_final`
- `updated_at`

The worker tries each `billing.syncUsage` job 12 times. It waits 5 seconds before the first retry and doubles the wait each time, so it gives up about 3 hours after the first failure. Inspect worker logs for provider failures before you requeue a job.

Fix the provider error before you requeue `billing.syncUsage`. Keep the usage row and source key to prevent duplicate ingestion.

## Recover missing orders

Replay a signed Polar webhook when Polar contains an order missing from `billing_transactions`.

The webhook handler uses provider event IDs for idempotency. Do not insert billing transactions by hand.

## Validate the integration

Run these checks in the Polar sandbox before enabling production billing:

- Confirm only business administrators can start checkout or open the portal.
- Confirm only a partner's owners can start a tier checkout or open its portal, and that the partner's tier and pool follow each subscription change.
- Give a partner on a paid tier one number more than its tier includes, and confirm Polar charges the partner that number's monthly price within the hour.
- Complete monthly and annual checkout for Starter and Pro.
- Confirm invalid webhook signatures receive an unauthorized response.
- Confirm duplicate webhook deliveries create one provider event.
- Generate each metered usage type and verify the Polar quantity.
- Confirm annual subscriptions send monthly overage quantities.
- Confirm worker logs identify usage-sync failures and that requeueing recovers them.

Self-hosted workspaces remain outside hosted billing enforcement.
