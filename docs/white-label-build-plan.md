# Build the partner program

This plan builds v1 of the partner program that [How partners resell LobbyStack](white-label.md) describes, in five phases. Each phase ships on its own and leaves the product working. [The partner architecture](architecture/partners.md) defines the modules and interfaces the phases build. Phase 1 ships first: partners on a subdomain of the partner base domain, with their businesses billed outside LobbyStack and no pool limit. That's the setup a deployment gets without Stripe Connect or tier products, so self-hosted deployments can use it as soon as it ships. On the cloud, partner signup stays invite-only until phase 2 bills tiers.

Planned on 2026-10-24 from the code as it stood at commit `49765094`. Nothing is built yet.

## Phase 0: groundwork

These changes keep today's behavior and remove what blocks the later phases.

**Rename the platform key grouping** ([ADR 0010](adr/0010-partners-make-their-own-platform-keys.md)):

- Rename the entry field `partner` to `group` in `packages/domain/src/server/publicApi/platformKeys.ts`. Accept `partner` as an alias, and refuse an entry that sets both.
- Rename the access value `partner` to `group` the same way, keeping the old value as an alias.
- Add a migration that renames `platform_partner_businesses` to `platform_key_businesses`, `partner_id` to `group_id`, and the policy, index, and `app.list_platform_partner_businesses` function. Update `app.finish_business_handover` (migration 0117), the grant lists in `packages/db/src/cli.ts`, and `raw-migrations.ts`.
- Rename `partnerId` on `PlatformKeyCaller` (`operations.ts:179`), in audit payloads, in `GET /me`, in `scripts/platform-key.ts`, and in the CLI. New audit rows write `groupId`, and readers accept both keys.
- Update `mintlify/api/authentication.mdx`, `mintlify/self-hosting/environment-variables.mdx`, `mintlify/api/cli.mdx`, and their `fr/` and `es/` copies.

**Let a business exist without an owner.** `insertBusinessInTransaction` (`packages/domain/src/server/tenancy.ts:92`) makes the caller the owner. Give it a path that creates a business with no owner yet, for partner businesses.

**Count only direct businesses toward the cap.** `maxOwnedBusinesses` (`tenancy.ts:34`) should count businesses with no partner.

**Replace the paid-plan check with an entitlement.** `isPaidSubscription` (`packages/shared/src/billing.ts:48`) hard-codes Starter, Pro, and Enterprise, and SQL repeats it in migrations 0101 and 0121. Add `hasLiveEntitlement(account)`, which later phases extend to partner businesses. Make `BillingContext` in `packages/domain/src/server/usage.ts` carry an entitlement object (allowances, rates, cap) instead of a plan slug.

**Resolve the brand per request.** Today `apps/admin/src/lib/branding.ts` caches one brand for the whole deployment. Add `resolveBrand(host)`, which returns the host brand for every host until phase 1 adds partners. Route `/api/branding`, `/api/branding/logo`, `BrandingProvider`, and the root document through it.

**Give emails a brand context.** Add a `brand` field to every `email.send` payload, and pass `replyTo` through the worker's handler (`apps/worker/src/handlers.ts:380`). Template the logo, name, and links in `packages/providers/src/email/smtp.ts`. Every email still renders the host brand.

## Phase 1: partners, domains, and the console

This phase ships first. A partner signs up, brands its console, and creates businesses on `<partner>.<partner base domain>`. Its businesses are billed outside LobbyStack, and its pool has no limit.

**Schema:**

| Table or column | Purpose |
| --- | --- |
| `partners` | Name, slug, status, and brand: logo, favicon, color, terms, privacy, and support links |
| `partner_members` | Partner, user, role (owner, admin, or member), and status |
| `partner_domains` | Hostname (unique), partner, kind (subdomain or custom), and verification state |
| `businesses.partner_id`, `businesses.partner_access_level` | The business's partner, and the access level of its own operators: full or activity |
| `partner_business_opens` | Partner member, business, and expiry. Each open also writes `audit_logs`. |
| `user_active_businesses` | The active business per user on each partner's domain. The host's domain keeps `users.active_business_id` |

**Row-level security:**

- Add a SECURITY DEFINER `app.has_partner_access(business_id)`. It's true when the current user is active on the business's partner and has an unexpired open of that business.
- Make `app.has_business_membership` return true for partner access too, so every tenant policy picks it up.
- Update the functions that join `business_memberships` themselves: migrations 0006, 0023, 0027, 0044, 0060, 0069, 0075, 0079, 0090, 0101, 0113, and 0125. Keep the team list (`app.list_business_members`) to the business's own operators, so partner members never appear on a business's team.
- Replace `requireBusinessMembership` with an access check that returns the role and how the person got access. Call it from `forBusiness` in `apps/admin/src/lib/operator-request.ts`.

**Hostnames:**

- In `apps/admin/proxy.ts`, after the marketing check, resolve the host. The host's own domain is the host brand. A subdomain of `PARTNER_BASE_DOMAIN`, or a verified row in `partner_domains`, is that partner. Any other host gets a 404.
- Cache the lookup per process, including misses, and clear it through Redis when a domain changes. Pass the partner in a request header, and strip any copy the client sends.
- Better Auth 1.7.7 accepts a function for `trustedOrigins` and `allowedHosts` for `baseURL`. Use them so sign-in works on partner hosts. Build every link from the resolved origin, including verification, reset, invitations, and the platform API's `appOrigin()`.
- On partner hosts, turn off Google sign-in in `/api/auth/providers`, and refuse `/sign-in/social` and `/callback/google`. Add partner hosts to Turnstile.
- Trust the resolved origin in the CSRF check, `hasVerificationFlow` (`verification-flow.ts:31`), and test calls (`live-web-call.ts:88`).
- Keep MCP, OAuth, OpenAPI, and the Twilio and Polar webhooks on the host's domain.

**Branding on partner hosts:**

- Prerendered public pages such as sign-in can't read the database at build time. Have the proxy rewrite partner hosts to an internal `[host]` route tree rendered with ISR, the way `marketingProxy` already rewrites. Saving a brand revalidates that partner's pages.
- Emails for partner businesses and on partner hosts come from `"<Partner name>" <no-reply@<partner base domain>>`, with the partner's support address as Reply-To.
- Don't schedule or send host lifecycle emails for partner businesses: the founder check-in (`onboarding.ts:219`), trial and release emails with host prices (`handlers.ts:780-826`), and marketing. Check at scheduling and again at sending.
- SMS keeps the host brand from `deploymentAppName()`. Add a test that a partner brand never replaces it.
- On partner hosts, turn off browser analytics or serve them from a same-origin path, so `ts.lobbystack.com` never appears.
- Upload from partner hosts through a same-origin route, because R2's CORS rules can't list every partner domain.

**Accounts and access:**

- Filter `app.list_user_businesses` by the request's brand, and store the active business per brand. On a partner host with no business, show "no businesses" instead of onboarding.
- Enforce access levels with capability checks. Full access gets today's owner and admin powers, minus billing, API keys, and MCP. Activity only shows calls, chats, appointments, contacts, and messages.
- Refuse claim links for partner businesses in `createClaimLinkForApi` and `acceptInvitation`.

**Partner console:**

- Add `app/(partner)/partner/*` with its own shell and a `partner` locale namespace in `en`, `fr`, `es`, and `sr`. Follow the shadcn/ui rules in `AGENTS.md`.
- Partner signup lives on the host's domain. It creates the partner, its owner membership, and its subdomain.
- Pages in this phase: Businesses (create, open, release, delete, and usage per business), Branding & domain (subdomain only), and Team.
- Creating a business makes it owner-less and sends the owner an invitation on the partner's domain at the chosen access level. The owner's onboarding skips the business, number trial, attribution, and brand steps, and keeps phone verification, because calls forward to the owner's verified phone.
- Releasing a business sets its owner, removes its partner, and puts it on the host's Free plan. A business needs an owner who accepted the invitation before the partner can release it.
- `PARTNER_SIGNUP` switches signup between `open` and `invite`. The cloud uses `invite` until phase 2.

## Phase 2: tiers and the pool

Partners pay the host for a tier through Polar, and the pool limits their businesses. The cloud opens partner signup at the end of this phase.

**Schema:**

| Table or column | Purpose |
| --- | --- |
| `partner_billing_accounts` | Tier, interval, Polar customer and subscription, state, and the partner's monthly overage cap. The billing key is `partner:<id>`. |
| `partner_usage_months` | Per partner and period: voice seconds, chats, overage spend, and the 80% and 100% alert flags |
| `provider_events.partner_id` | Polar events that belong to a partner, not a business |
| `partner_number_charges` | Extra numbers and their monthly cost at purchase |
| `number_trials.partner_id` | One trial number per partner, ever, with a partial unique index |
| `phone_numbers.reclaim_reason` | A new `partner_ended` value |

**Code:**

- Add `partnerTierCatalog` next to the plan catalog in `packages/shared/src/billing.ts`, with the tiers in `docs/white-label.md`.
- Polar: add `POLAR_PARTNER_<TIER>_<INTERVAL>_PRODUCT_ID`, teach `apps/admin/src/lib/polar-event.ts` the `partner:` reference, and add a partner reconcile with its own lock. Reuse the client, the checkout outbox, `provider_events` idempotency, and the signature checks.
- Pool reservations: take the business lock first, then `billing-pool:<partner>:<period>`, in that order every time. Reach the pool through SECURITY DEFINER functions, as `app.number_trial_used` does. Grant the smaller of what the business has left and what the pool has left, and apply the change in reserve, extend, and correct.
- Update `partner_usage_months` as usage happens. Replaying every business's events on each reservation won't scale.
- Calls reserve even when the business has no limit, because the pool may have one. Chat gets a rate at both levels.
- Report pool overage minutes, pool overage chats, and extra numbers to Polar meters, sending only the overage.
- When the pool runs out with overage off, or the partner reaches its cap, raise `voice_limit_reached`. Calls then forward as commit `c5dd718e` set up.
- Send alerts at 80% and 100% to the partner's owners and admins.
- Phone numbers: count active numbers across the partner's businesses in `app.reserve_api_number_claim` (migration 0121), under a partner lock, against the tier's included numbers. Apply claim quotas per partner, so creating businesses can't get around them.
- The free tier gets its pool, no overage, and one trial number per partner.
- Partner lifecycle: when a tier is cancelled or a payment fails, the partner's businesses answer for 30 days, then pause, and the host deletes them at 90 days. Paused businesses answer with SIP 503 so calls forward.
- The managed-plan endpoint refuses partner businesses.
- Add the console's Billing page.

## Phase 3: packages on the partner's Stripe

Partners bill their businesses through Stripe Connect ([ADR 0009](adr/0009-partners-bill-through-their-own-stripe.md)).

**Schema:**

| Table or column | Purpose |
| --- | --- |
| `partner_stripe_accounts` | The connected account, its state, and its currency |
| `partner_packages` | Name, monthly price, setup fee, allowance, and the Stripe product and price on the connected account |
| `billing_accounts` columns | `package_id`, where none means billed outside LobbyStack, the Stripe account, customer, subscription and its state, the open checkout, `overage_enabled`, rates in minor units, and cap. The business's partner stays on `businesses.partner_id`. |
| `billing_usage_events` columns | The package terms at record time, and separate Polar and Stripe sync status |

**Code:**

- Add a Stripe client to `packages/providers` that sends the `Stripe-Account` header, and `STRIPE_CONNECT_SECRET_KEY` and `STRIPE_CONNECT_WEBHOOK_SECRET`. Without them, every partner business is billed outside LobbyStack.
- Connect onboarding from the console's Stripe page.
- Create a Checkout Session on the connected account for the business's package, opened from the invitation link on the partner's domain. Open the Stripe customer portal from the business's billing page.
- Add a Connect webhook route that stores events as provider `stripe` and reconciles each one in the request. It handles checkout completion, subscription changes, failed payments, account updates, and deauthorization. Account updates and deauthorization name no business, so the route applies them as it stores them. For checkout, subscription and invoice events, it reads the subscription back from Stripe first.
- Extend `live` for partner businesses: billed outside LobbyStack, or a live Stripe subscription (`hasLivePackageSubscription`), and the partner's tier live or in its 30 days. `hasLiveEntitlement` keeps answering for direct businesses.
- Add `billing.syncStripeUsage`, queued wherever Polar syncs are queued. It sends overage as Stripe meter events on the connected account, with the source key as the identifier.
- Caps work in the package's currency, not in US cents.
- Console pages: Packages and Stripe. Each business gets its package, overage switch, rate, and cap.

## Phase 4: custom domains, keys, templates, and demos

The parts of this phase are independent and can run in parallel.

**Custom domains:**

- On the cloud, use Cloudflare for SaaS. Set a fallback origin in the `receptionistportal.com` zone, and give Traefik one catch-all route to the admin, with a Cloudflare Origin CA certificate. The worker creates, polls, and deletes custom hostnames through Cloudflare's API with `CLOUDFLARE_SAAS_API_TOKEN` and `CLOUDFLARE_SAAS_ZONE_ID`. A domain goes live when its hostname and certificate are both active.
- On self-hosted deployments, use Caddy's on-demand TLS. Add `/api/tls/ask`, which approves only the host's domain and verified partner domains, and keep it reachable during maintenance. Publish ports 80 and 443, and keep an HTTP-only Caddyfile for local use.
- Only paid tiers can add a custom domain.

**Platform keys in the database** ([ADR 0010](adr/0010-partners-make-their-own-platform-keys.md)):

- Add a `platform_keys` table (partner, prefix, hash, name, scopes, revoked, last used), and `app.resolve_platform_key(prefix)` modeled on `app.resolve_api_key`. Make the resolver async: the environment first, then the database.
- Keys from the database act as the partner. Callers that need a person (number claims, invitations, calendar links) get a partner rule.
- Refuse database keys `access: "all"`, with a CHECK constraint too, and refuse them managed plans, claim links, and Polar checkout.
- Fix the startup webhook cleanup in `apps/admin/src/lib/platform-key-webhooks.ts`. It sends only the environment's key ids, so it would turn off every webhook a database key made. Pass the active database ids too. Revoking a key turns its endpoints off right away.
- Add the console's API keys page, reusing `LiveApiKeysSurface`.

**Templates:**

- Move the onboard manifest schema from `packages/cli/src/manifest.ts` into `packages/shared`, without its local file reading.
- Add `exportBusinessTemplate` from the existing read functions, leaving out ids, slug, plan, phone number, and owner. Add `applyBusinessTemplate`, which calls the `*ForApi` writes with the CLI's compare-then-change logic moved out of `onboard.ts`.
- Add a `business_templates` table scoped to the partner, with copied storage objects for files, and the console's Templates page.

**Prospect demos:**

- Add `partner_id` to `prospect_demos`, and authorize partner members by role instead of `PROSPECT_DEMO_OPERATOR_EMAIL`.
- Build the demo prompt from the brand name (`demos.ts:197`).
- Claiming a partner demo keeps the business with the partner, on its domain, at its access level. Demo usage draws on the pool.
- Add the console's Demos page, reusing `LiveDemosSurface`.

**Calendar, Instagram, and the widget:**

- Put the partner origin in the signed OAuth state for Google Calendar and Instagram. The callbacks on the host's domain hand the code and state to a finish route on the partner's domain, which holds the session.
- The widget API snippet uses the partner's primary domain, and the widget frame takes the brand of its host.

## Every phase

- Run `pnpm typecheck`, `pnpm test`, and `pnpm build`. Migrations and RLS changes also need `pnpm db:check` and `pnpm db:verify-rls`.
- Every new telemetry event needs a test that it fires from its real production path (`AGENTS.md`). Expected events include partner signup, business creation, business opens, release, domain verification, tier start, Stripe connection, and package subscription.
- Phase 2 changes when calls end, so run `pnpm voice:eval` and `pnpm voice:call` against staging before merging (`docs/voice/testing.md`).
- Add every new environment variable to `.env.example`, `docker-compose.yml`, and `PROVIDER_CREDENTIALS`, with a presence check in `packages/shared` so the admin and worker agree on what's on.
- Update `docs/white-label.md` when a decision changes, and add partner guides to `mintlify/` as each phase ships.
