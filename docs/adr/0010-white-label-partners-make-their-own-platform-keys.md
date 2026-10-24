# ADR 0010: white-label partners make their own platform keys

A white-label partner creates and manages its businesses with the same platform keys LobbyStack issues today, but it makes those keys itself, in its dashboard. LobbyStack stores them in the database. Keys that reach every business stay in `PLATFORM_API_KEYS`.

## Status

Accepted on 2026-10-24. Nothing is built yet.

## Decision

Platform keys come from two places:

- The `PLATFORM_API_KEYS` environment variable holds the keys LobbyStack's operators make, as it does today.
- A database table holds the keys a white-label partner makes in its dashboard.

Both kinds use the `lsp_` format, the Platform endpoints (`POST /businesses`, `GET /businesses`, `POST /users`), and the link in `platform_partner_businesses`. `lobbystack onboard` works with either.

A key made in a dashboard reaches only its partner's businesses. It can't have `access: "all"`, and it can't call operator-only endpoints such as managed plans.

A white-label partner is a database record. It owns its keys, staff, brand, domain, Stripe account, and tier. Its keys act as the partner, where a key from the environment acts as the account its `owner_email` names. The businesses it creates count against its tier, not the cap of 10 businesses per account.

A white-label partner keeps its businesses. A client joins its business as a member, with the access the partner allows, and never claims it. Only the partner can release a business to its client, who then pays LobbyStack directly, or delete it. Partners without white label keep today's claim flow, where the owner claims the business and pays LobbyStack.

## Rationale

The Platform endpoints already create businesses idempotently, refuse any business outside the partner's links, and record the partner on every change. A separate agency key type would duplicate that work and give LobbyStack two ways to create a business. Keys tied to a user account would break when that person leaves, cap an agency at 10 businesses, and leave no record to hold its brand, domain, or Stripe account.

A key that acts as one person stops working when that person leaves. A business's own API key already fails with `key_owner_inactive` once its creator loses admin rights. A partner's keys act as the partner, so staff changes don't affect them.

Agencies need to trust that LobbyStack won't take their clients. A client therefore can't move its business out without the partner's release.

## Consequences

- The key resolver checks the environment first, then the database.
- A partner id in `platform_partner_businesses` has to mean the same partner whether the key came from the environment or the database.
- If a partner could make a key with `access: "all"`, that key would reach every business on the deployment. Tests must prove that a dashboard-made key never gets it.
