# Polar Billing

This repo uses a hybrid Polar integration:

- `@convex-dev/polar` owns product and subscription sync plus webhook registration.
- App-owned Convex code owns workspace billing identity, usage metering, transaction history, and entitlement enforcement.

## Workspace Billing Identity

- Billing is scoped to a business workspace, not an operator user.
- Each Polar customer uses `external_id = business:<businessId>`.
- Checkout and portal access always resolve a customer from that workspace billing key first.

## Product Shape

The paid catalog is expected to contain two recurring monthly products:

- `Starter`
  - fixed recurring price of `$5.00 USD`
  - metered voice price of `$0.22/min`
  - metered SMS price of `$0.03/text`
- `Growth`
  - fixed recurring price of `$20.00 USD`
  - metered voice price of `$0.18/min`
  - metered SMS price of `$0.025/text`

The Convex billing wrapper currently expects the product ids in:

- `POLAR_STARTER_PRODUCT_ID`
- `POLAR_GROWTH_PRODUCT_ID`

## Meter Event Names

The app sends usage events to Polar with these event names:

- `billing.voice_seconds`
- `billing.sms_segments`

Create Polar meters that map to those event names, then attach them to both
recurring products as metered unit prices.

Because the voice meter is reported in seconds, the Polar metered unit amounts
should be configured in cents per second:

- `Starter` voice: `0.366666666667` cents per second (`$0.22/min`)
- `Growth` voice: `0.3` cents per second (`$0.18/min`)

For SMS, the metered unit amount stays in cents per message:

- `Starter` SMS: `3`
- `Growth` SMS: `2.5`

## Required Environment Variables

Set these on the Convex deployment:

- `POLAR_SERVER`
- `POLAR_ORGANIZATION_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_STARTER_PRODUCT_ID`
- `POLAR_GROWTH_PRODUCT_ID`
- `SITE_URL`

`SITE_URL` is used for hosted checkout and the customer portal return URL.
`POLAR_WEBHOOK_SECRET` must match the webhook endpoint secret from Polar so the
Convex component can validate incoming webhook signatures.

## Webhook Endpoint

The registered Polar webhook route is:

- `https://<your-convex-site>/polar/events`

Use the default route from the Convex Polar component and subscribe it to:

- `product.created`
- `product.updated`
- `subscription.created`
- `subscription.updated`
- `subscription.active`
- `subscription.canceled`
- `subscription.uncanceled`
- `subscription.revoked`
- `subscription.past_due`
- `order.created`
- `order.paid`
- `order.refunded`
- `refund.created`
- `refund.updated`

The endpoint secret returned by Polar should be stored in:

- `POLAR_WEBHOOK_SECRET`

## Free Tier Enforcement

The free tier is enforced in app code with monthly UTC buckets:

- `1,800` voice seconds
- `60` SMS segments

Voice and SMS are blocked only on billable paths. The dashboard and settings remain accessible after the free tier is exhausted.
