# ADR 0010: partners make their own platform keys

A partner creates and manages its businesses with the same platform keys a host issues today, but it makes them itself, in its console. The deployment stores those keys in its database. Keys in `PLATFORM_API_KEYS` belong to the host.

## Status

Accepted on 2026-10-24. Nothing is built yet.

## Decision

Platform keys come from two places:

- The `PLATFORM_API_KEYS` environment variable holds the host's keys, as it does today.
- A database table holds the keys a partner makes in its console.

Both kinds use the `lsp_` format, the Platform endpoints (`POST /businesses`, `GET /businesses`, `POST /users`), and the same table of linked businesses. `lobbystack onboard` works with either.

Nothing about platform keys says "partner". Each key belongs to a group, and a key reaches the businesses that its group's keys created. An entry in `PLATFORM_API_KEYS` names its group in a `group` field. It still accepts the old `partner` field, so existing self-hosted keys keep working. The `platform_partner_businesses` table becomes `platform_key_businesses`. A partner's keys use the partner as their group.

A key made in a console reaches only its partner's businesses. It can't have `access: "all"`, and it can't call host-only endpoints such as managed plans.

A partner is a database record. It owns its keys, staff, brand, domain, Stripe account, and tier. Its keys act as the partner, where a host's key acts as the account its `owner_email` names. The businesses a partner creates count against its tier, not the cap of 10 businesses per account.

A partner keeps its businesses. A business's own operators join it at the access level the partner allows, and never claim it. Only the partner can release a business to its owner, who then pays the host directly, or delete it. Claims remain for businesses the host sets up with its own keys.

## Rationale

The Platform endpoints already create businesses idempotently, refuse any business outside the key's links, and record the key on every change. A separate key type for partners would duplicate that work and give a deployment two ways to create a business. Keys tied to a user account would break when that person leaves, cap a partner at 10 businesses, and leave no record to hold its brand, domain, or Stripe account.

A platform key creates businesses for whoever holds it, and most holders aren't partners. Naming the grouping field `partner` would give that word two meanings, so keys use a neutral group.

A key that acts as one person stops working when that person leaves. A business's own API key already fails with `key_owner_inactive` once its creator loses admin rights. A partner's keys act as the partner, so staff changes don't affect them.

Partners need to trust that the host won't take their clients. A business therefore can't leave its partner without a release.

## Consequences

- The key resolver checks the environment first, then the database.
- A group has to mean the same thing whether the key came from the environment or the database.
- Self-hosted entries keep the `partner` alias until their hosts rename the field.
- If a partner could make a key with `access: "all"`, that key would reach every business on the deployment. Tests must prove that a console-made key never gets it.
