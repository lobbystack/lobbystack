# ADR 0011: an agency connects an MCP client to the partner, not to each business

Someone on a partner's team can connect Claude, ChatGPT, Codex, Cursor or another MCP client to the partner itself, and then run the console's work from chat. The OAuth grant belongs to that person and that partner. It works only while they're on the partner's team, and each request acts with their role at the time.

## Status

Accepted on 2026-10-28. Built in migration 0164.

## Decision

The MCP server at `/api/mcp` takes two kinds of partner connection on top of business ones:

- A partner's platform key (`lsp_`), made on the console's API keys page. It acts as the partner with an admin's rights, as on the v1 Partner endpoints ([ADR 0010](./0010-partners-make-their-own-platform-keys.md)). The host's keys from `PLATFORM_API_KEYS` stay refused.
- An agency grant: an OAuth grant that a person approves on the consent page by picking one of their agencies instead of a business.

Better Auth stores each grant as an `oauth_consents` row, and the consent page decides its `reference_id`, which the tokens issued under the grant copy. A business grant keeps the business id there. An agency grant keeps `partner:<partner id>`. Nothing else in Better Auth's tables changes, so the plugin issues, rotates and revokes both kinds the same way.

`app.resolve_partner_oauth_access_token` resolves an agency token, and answers only while the client, the grant and the token are live, the partner is active, and the person is an active member of its team. It returns the person's role as the database has it on that request. `app.resolve_oauth_access_token` never answers an agency token, since no business has `partner:<id>` as its id.

Each request acts as a `PartnerActor` with `kind: "member"`, so the partner operations check the person's role as they do in the console. Only owners reach Stripe and billing. The consent page offers the `partner.billing` scopes to owners only, as the console offers them only to owners making a key, and an owner who stops being one loses billing on their next request. Scopes limit which tools a connection lists; the role decides what each call may do.

The per-business tools take a `business_id`. A key reaches a business as it does on REST with the `LobbyStack-Business` header. A person reaches it through an audited open, as in the console. On every call the server checks that the business is active and belongs to the grant's partner, and that the person is still on that partner's team. It reuses an open of that partner from the last half of its 8 hours, or opens the business again, so the business's audit log and its Partner access tab show the agency's visits. An open the person made from another partner's console reaches nothing through this grant. Through the open the person gets the console's full access whatever the business's access level, and never billing, API keys or MCP of the business's own.

The console's API keys page lists the partner's agency connections. Owners and admins see and disconnect every one, and anyone else sees and disconnects their own. Approving and disconnecting one write `oauth_grant.approved` and `oauth_grant.revoked` to `partner_audit_logs`, which keeps what happens to the partner itself rather than to one of its businesses.

Removing someone from the team ends their agency grants to the partner in the same transaction, and writes `oauth_grant.revoked` with the reason `member_removed` for each. If the partner adds them back, they connect again. A role change keeps the grant and changes what its next request may do.

## Rationale

An agency works across dozens of businesses. A grant per business would mean one consent per client, and an assistant juggling a connection for each. A partner's business also never gets MCP of its own, so its owner couldn't grant it anyway.

A platform key already does the partner's work, but a key outlives the person who pasted it into a coding assistant, and it can't act as a person. An OAuth grant ties the connection to the person's session and their role, so removing someone from the team, or making an owner an admin, takes effect on the next request. The console's rules stay in one place, because the grant and the console call the same partner operations with the same kind of actor.

Keeping the partner in `reference_id` reuses Better Auth's consent, token and revocation flow as it is. A separate column would need the plugin to write it, which it can't. The prefix can't collide with a business id, so the business resolver can't mistake one for the other.

Opening the business as the console does keeps one rule for how a partner's people reach a client's data, and keeps the client's view of those visits complete.

## Consequences

- Reversing this means migrating grants whose `reference_id` names a partner, and the tokens under them.
- Every code path that reads `oauth_consents.reference_id` must treat a `partner:` value as a partner, never as a business. The business listing and revocation under MCP connections in Settings > API keys filter on the business id, so they never see one.
- `scopes_supported` now lists the partner scopes and `businesses:create`. A client that registered before 2026-10-28 with dynamic registration keeps the scopes it registered with, so it registers again to ask for partner scopes.
- The MCP server lists more tools for a partner connection, and each per-business tool requires `business_id` there. A business connection sees no change.
- Agency tool calls count against the grant's rate limit, and a key's against the key's, shared with its REST requests. Work that costs the host, such as a demo or an email, counts against the person's console limits or the partner's key limits.
