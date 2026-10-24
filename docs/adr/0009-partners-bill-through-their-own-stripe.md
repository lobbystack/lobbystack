# ADR 0009: partners bill their businesses through their own Stripe

A white-label partner's businesses pay the partner. The partner connects its own Stripe account, and Stripe bills each business in the partner's name. LobbyStack keeps billing the partner itself through Polar.

## Status

Accepted on 2026-10-24. Nothing is built yet.

## Decision

LobbyStack bills each partner through Polar each month. The bill covers a tier fee plus voice minutes and chat conversations across all the partner's businesses.

A partner connects its Stripe account through Stripe Connect. LobbyStack then creates these on that account as direct charges:

- The plans the partner defines: monthly price, included minutes and chats, and overage rates
- Each business's subscription, which the business starts at a checkout on the partner's domain
- Each business's usage charges

Stripe sends invoices and receipts in the partner's name, charges cards, and retries failed payments. The partner handles refunds and disputes in its own Stripe dashboard. LobbyStack never holds a business's payment. Businesses that sign up directly keep paying LobbyStack through Polar.

## Rationale

A partner owns the relationship with its businesses, so the bill has to come from the partner. Polar sells as the merchant of record, so a Polar invoice can't carry a partner's name.

We considered two alternatives:

- **Billing outside the product.** LobbyStack would send businesses no bill, and partners would invoice from their own tools. echowin and RingReady work this way, and Synthflow has since September 2026. We rejected it: a small partner without billing tools would have to set some up before it could sell LobbyStack.
- **LobbyStack collects and pays partners out.** LobbyStack would charge businesses and send partners their share. That makes LobbyStack responsible for each business's tax, refunds, and failed payments, and for partner payouts.

Six of the full white-label products we studied bill through the partner's Stripe: GoHighLevel, Autocalls, Famulor, Vapify, VoiceAI Connect, and Assistable. The comparison is in [the white-label research](../../research/white-label-reseller-programs.md#billing).

## Consequences

- LobbyStack runs two billing providers. Polar handles LobbyStack's own sales, and Stripe Connect handles partners' businesses. LobbyStack reports a partner business's usage twice: to Polar for the partner's bill, and to the partner's Stripe for the business's charges.
- The partner sets up tax collection on its own Stripe account. Autocalls blocks business upgrades until the partner turns on Stripe Tax.
- A business's subscription lives on the partner's Stripe account. If the partner disconnects Stripe or leaves, LobbyStack can't move those subscriptions.
