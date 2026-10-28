# ADR 0009: partners bill their businesses through their own Stripe

A partner's businesses pay the partner. The partner connects its own Stripe account, and Stripe bills each business in the partner's name. The host bills the partner itself through Polar.

## Status

Accepted on 2026-10-24. Nothing is built yet.

## Decision

The host bills each partner through Polar each month. The bill covers the tier fee and any usage beyond the pool, across all the partner's businesses.

A partner connects its Stripe account through Stripe Connect. The deployment then creates these on that account as direct charges:

- The packages the partner defines: a monthly price, an optional setup fee, and an allowance
- Each business's subscription to a package, which the business starts from a link on the partner's domain, at a Stripe Checkout in the partner's name
- Each business's overage charges

Stripe sends invoices and receipts in the partner's name, charges cards, and retries failed payments. The partner handles refunds and disputes in its own Stripe dashboard. The host never holds a business's payment. Businesses that buy a plan from the host keep paying it through Polar.

Both providers are optional on a deployment. Without Stripe Connect, every partner business is billed outside LobbyStack. Without tier products in Polar, the host doesn't bill partners through LobbyStack.

## Rationale

A partner owns the relationship with its businesses, so the bill has to come from the partner. Polar sells as the merchant of record, so a Polar invoice can't carry a partner's name.

We considered two alternatives:

- **Billing outside the product.** The deployment would send businesses no bill, and partners would invoice from their own tools. echowin and RingReady work this way, and Synthflow has since September 2026. We rejected it: a small partner without billing tools would have to set some up before it could sell LobbyStack.
- **The host collects and pays partners out.** The host would charge businesses and send partners their share. That makes the host responsible for each business's tax, refunds, and failed payments, and for partner payouts.

Six of the full white-label products we studied bill through the partner's Stripe: GoHighLevel, Autocalls, Famulor, Vapify, VoiceAI Connect, and Assistable.

## Consequences

- A deployment can run two billing providers. Polar handles the host's own sales, and Stripe Connect handles partners' businesses. The deployment reports a partner business's usage twice: to Polar for the partner's bill, and to the partner's Stripe for the business's charges.
- The partner sets up tax collection on its own Stripe account. Autocalls blocks business upgrades until the partner turns on Stripe Tax.
- A business's subscription lives on the partner's Stripe account. If the partner disconnects Stripe or leaves, the host can't move those subscriptions.
