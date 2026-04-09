# Polar Billing

This repo uses a hybrid Polar integration:

- `@convex-dev/polar` owns product and subscription sync plus webhook registration.
- App-owned Convex code owns workspace billing identity, usage metering, transaction history, and entitlement enforcement.

## Workspace Billing Identity

- Billing is scoped to a business workspace, not an operator user.
- Each Polar customer uses `external_id = business:<businessId>`.
- Checkout and portal access always resolve a customer from that workspace billing key first.

## Product Shape

The paid plan is expected to be a recurring monthly product with:

- one fixed recurring price of `$5.00 USD`
- one metered unit price for voice usage
- one metered unit price for SMS usage

The Convex billing wrapper currently expects the paid subscription product id in:

- `POLAR_PAID_PRODUCT_ID`

## Meter Event Names

The app sends usage events to Polar with these event names:

- `billing.voice_seconds`
- `billing.sms_segments`

Create Polar meters that map to those event names, then attach them to the recurring product as metered unit prices.

## Required Environment Variables

Set these on the Convex deployment:

- `POLAR_SERVER`
- `POLAR_ORGANIZATION_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PAID_PRODUCT_ID`
- `SITE_URL`

`SITE_URL` is used for hosted checkout and the customer portal return URL.
`POLAR_WEBHOOK_SECRET` must match the webhook endpoint secret from Polar so the
Convex component can validate incoming webhook signatures.

## Webhook Endpoint

The registered Polar webhook route is:

- `https://<your-convex-site>/polar/events`

Use the default route from the Convex Polar component and subscribe it to:

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
