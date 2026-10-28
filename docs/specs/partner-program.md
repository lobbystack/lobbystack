# Spec: the partner program

Status: ready-for-agent

## Problem Statement

Agencies, consultants, MSPs, and phone companies want to sell an AI receptionist to the small businesses they already serve, under their own name. Today they can't do that with LobbyStack. A company that sets up businesses through a platform key hands each one to its owner, who then sees LobbyStack's brand and pays LobbyStack. The company keeps no relationship and earns nothing on the business's usage.

Several problems follow from that:

- **The product shows LobbyStack everywhere.** Every business sees the same dashboard, the same domain, the same sign-in page, and LobbyStack's emails.
- **Branding only works for a whole deployment.** It applies to every business on a self-hosted deployment, and the cloud turns it off.
- **Nothing lets a reseller run its clients.** It has no console to create and manage many businesses, set prices, bill them, or see their usage.
- **Self-hosters have no way to resell to many clients**, even though the MIT license lets them, because the product has no partner model.

Competitors already sell this (Trillet, Autocalls, Famulor, echowin, GoHighLevel, and others), and agencies expect their brand, their domain, their prices, and their billing.

## Solution

A partner signs up, puts its own brand on the product, and resells LobbyStack to businesses it keeps:

- **Each partner gets a branded dashboard on its own address**: a subdomain of the host's neutral domain (`receptionistportal.com` on the cloud), or its own custom domain on paid tiers. Sign-in, the dashboard, and the emails all show the partner's brand.
- **The partner runs its businesses from a console.** It creates businesses there, opens any of them, sets each one's access level, sells packages, and sees usage.
- **The partner bills its businesses through its own Stripe account** connected with Stripe Connect. Stripe sends invoices and receipts in the partner's name. The host never holds a business's money.
- **The partner pays the host for a tier through Polar.** A tier is a monthly fee plus a pool of minutes and chats that all the partner's businesses share. Overage on the pool is on by default, up to a cap the partner sets.
- **Callers, website visitors, and text recipients deal with the business.** Calls and chats represent the business. Texts come from the host's verified number and name the business, with the host named only where carriers require it.
- **Every feature works on any deployment.** A self-hoster turns each piece on by configuring its provider account: Stripe Connect, Polar tier products, a partner base domain, and on-demand TLS.

## User Stories

### Partners and their teams

1. As a prospective partner, I want to sign up for a partner account myself, so that I can start reselling without waiting for an application review.
2. As a prospective partner on a host that hasn't opened signup yet, I want an invitation link to work, so that the host can let me in early.
3. As a partner owner, I want my partner account to start on the free tier with no card, so that I can try reselling before I pay.
4. As a partner owner, I want to invite people to my partner team as admins or members, so that my staff can work on our clients.
5. As a partner owner, I want to remove a partner member, so that a person who leaves my company loses access to every client at once.
6. As a partner admin, I want to manage businesses, packages, branding, domains, keys, and the team, so that I can run the partner account without needing the owner.
7. As a partner member, I want to work inside my partner's businesses without seeing billing or Stripe settings, so that I can support clients without handling money.
8. As a partner owner, I want only owners to manage Polar billing, the Stripe connection, and deleting the partner, so that the riskiest actions stay with me.
9. As a partner member, I want to use the console from my partner's domain or the host's domain with the same account, so that I can work from either address.
10. As a person who works for two partners, I want one account with one password, so that I don't manage separate logins per brand.

### Branding and domains

11. As a partner admin, I want to set my company's name, logo, favicon, and brand color, so that my clients see my brand and not LobbyStack's.
12. As a partner admin, I want my terms, privacy, and support links on the sign-in page and the dashboard, so that my clients find my policies and my support.
13. As a partner on the free tier, I want a subdomain of the host's neutral domain, such as `acme.receptionistportal.com`, so that my clients have an address that never says LobbyStack.
14. As a partner on a paid tier, I want to connect my own subdomain, such as `app.acmeagency.com`, so that the dashboard lives on my own website's domain.
15. As a partner admin adding a custom domain, I want to see exactly which DNS records to add and whether each one checks out, so that I can finish the setup without contacting support.
16. As a partner admin, I want my custom domain to get a certificate automatically, so that my clients never see a security warning.
17. As a partner's client, I want the sign-in page, the dashboard, and the browser tab to show my partner's brand, so that I know I'm in the right place.
18. As a partner's client, I want every email I get to come from my partner's name, with my partner's support address as the reply address, so that I reply to the people who serve me.
19. As a partner's client, I want never to receive LobbyStack's marketing, onboarding, or founder emails, so that my partner's relationship with me isn't undermined.
20. As a partner's client, I want to sign in with email and password on my partner's domain, so that I never see another company's Google sign-in screen.
21. As a partner's client, I want my website chat widget's script to load from my partner's domain, so that my website's source doesn't name another company.
22. As a host, I want an unknown hostname to get a "not found" page, so that nobody can point a domain at my deployment and serve the dashboard under it.
23. As a host, I want my own domain to keep showing my brand to my direct businesses, so that partner branding never leaks onto my main product.

### Creating and running businesses

24. As a partner admin, I want to create a business for a client from the console, so that I can set up their receptionist before they ever sign in.
25. As a partner admin, I want to create a business from a template, so that a new client in a vertical I serve starts with my proven setup.
26. As a partner admin, I want to save a business's setup as a template, so that I can reuse what works across clients.
27. As a partner admin, I want to invite a business's owner from the console, so that they can sign in on my domain and see their receptionist.
28. As a partner admin, I want to choose whether a business's people get full access or activity only, so that I decide how much of the setup my clients can change.
29. As an operator at a partner's business with full access, I want to edit the receptionist, knowledge, hours, services, and team, so that I can keep my business's details current myself.
30. As an operator at a partner's business with activity-only access, I want to see calls, chats, appointments, contacts, and messages, so that I follow what the receptionist does without changing its setup.
31. As an operator at a partner's business, I want billing, API keys, and MCP hidden, so that my dashboard only shows what my partner offers me.
32. As a partner member, I want to open any of my partner's businesses with full access without joining its team, so that I can support a client right away.
33. As an operator at a partner's business, I want every time my partner's people open my business to be recorded in its audit log, so that I can see who looked at my calls and when.
34. As an operator at a partner's business, I want partner members to stay off my team list, so that my team shows only my own people.
35. As a partner admin, I want to see each business's minutes and chats used this month, so that I know which clients are growing and which need attention.
36. As an operator at a partner's business, I want to see my usage against my allowance, so that I know whether I'm close to my limit.
37. As a partner admin, I want to release a business to its owner, so that a client who leaves me can keep their receptionist directly with the host.
38. As a partner admin, I want to delete a business, so that a client who stops using the service doesn't linger in my console.
39. As a client of a partner, I want my business to stay with my partner unless my partner releases it, so that nobody moves my account without my partner's agreement.
40. As a host, I want a business that already pays me directly to be unable to move under a partner, so that partners can't take my direct customers.
41. As a partner member, I want to make prospect demos under my brand, so that I can show a prospect their own receptionist before they buy.
42. As a prospect who tries a partner's demo, I want to claim the demo and keep it with that partner, so that my setup carries over when I sign up.

### Selling to businesses

43. As a partner owner, I want to connect my own Stripe account from the console, so that my clients' payments go to me.
44. As a partner admin, I want to define packages with a name, a monthly price, an optional setup fee, and an allowance of minutes and chats, so that I sell plans that fit my market.
45. As a partner admin, I want each package priced in my Stripe account's currency, so that I can sell outside the United States.
46. As a partner admin, I want to turn overage on or off for each business, so that some clients pay a fixed monthly amount and others pay for extra usage.
47. As a partner admin, I want to set each business's overage rate and a monthly overage cap in money, so that no client gets a surprise bill.
48. As a partner admin, I want to mark a business "billed outside LobbyStack", so that I can serve comped clients, annual contracts, or clients I bill another way.
49. As a business owner invited by a partner, I want to pay from my partner's domain at a checkout in my partner's name, so that I subscribe to my partner, not to an unfamiliar company.
50. As a business owner at a partner, I want invoices and receipts in my partner's name from Stripe, so that my bookkeeping shows who I actually pay.
51. As a business owner at a partner, I want my billing page to open my partner's Stripe customer portal, so that I can update my card and download invoices.
52. As a partner admin, I want Stripe to retry failed payments, so that I don't chase every declined card myself.
53. As a partner admin, I want to handle refunds and disputes in my own Stripe dashboard, so that I keep control of my customer relationships.
54. As a partner on a deployment without Stripe Connect, I want every business billed outside LobbyStack, so that I can still resell and bill however I like.

### What the partner pays the host

55. As a partner owner, I want to choose a tier with a clear monthly price, pool, and included numbers, so that I know my costs before I sell.
56. As a partner owner, I want annual billing at 20% off, so that I save when I commit for a year.
57. As a partner owner, I want my pool shared by any number of businesses, so that I can add clients without paying per business.
58. As a partner owner, I want pool overage on by default and charged as I go, so that my clients keep being answered when I grow past my pool.
59. As a partner owner, I want to set a monthly cap on my pool overage or turn it off, so that my bill never exceeds what I planned.
60. As a partner owner, I want overage to cost less per minute and per chat on higher tiers, so that growing pays off.
61. As a partner owner, I want my tier to include phone numbers and extra numbers billed at the host's cost, so that I can give every client a number without a markup.
62. As a partner on the free tier, I want one 14-day trial number that my team or the business's owner can claim, so that I can show a prospect a real call.
63. As a partner owner, I want alerts at 80% and 100% of my pool and my cap, so that I can upgrade or raise my cap in time.
64. As a partner owner whose tier ends, I want my businesses to keep answering for 30 days, so that I have time to fix billing or release my clients.
65. As a partner owner, I want to release businesses during those 30 days, so that my clients can keep their receptionists if I stop reselling.
66. As a host, I want a partner's businesses to pause after those 30 days and to be deleted 90 days after the tier ended, so that unpaid partners don't keep running.
67. As a self-hoster without tier products configured, I want partners to have no pool limit unless I set one, so that I can run partners on my own terms. Built: the host sets or clears a partner's pool with `pnpm partner-pool:set`, and that pool is the limit, with no overage and no cap.

### Callers, website visitors, and text recipients

68. As a caller to a partner's business, I want the receptionist to represent the business, so that I feel I'm talking to the business itself.
69. As a caller to a business that ran out of minutes, I want my call to forward to the business's transfer number or its owner's phone, so that I still reach someone instead of a busy signal.
70. As a website visitor at a business that ran out of chats, I want the existing "We can't reply here right now" message, so that I know to call instead.
71. As a customer receiving appointment texts, I want the first text from a business to confirm my opt-in and name the business, so that I know who will text me.
72. As a customer receiving appointment texts, I want every other text to name only the business, so that the messages read as coming from the business.
73. As a customer who texts HELP or STOP, I want the reply to name the business and the sender, so that I know what I'm opting out of.

### Developers and self-hosters

74. As a partner's developer, I want to make platform keys in the console, so that I can automate creating and managing my partner's businesses.
75. As a partner's developer, I want my keys to reach only my partner's businesses, so that a leaked key can't touch anyone else's data.
76. As a partner's developer, I want to use `lobbystack onboard` with my partner's key, so that I can set up businesses from a file.
77. As a partner owner, I want a revoked key to stop working at once and its webhooks to turn off, so that I can cut off access cleanly.
78. As a self-hoster with existing platform keys, I want my current `PLATFORM_API_KEYS` entries to keep working after the field rename, so that upgrading doesn't break my integrations.
79. As a self-hoster, I want each partner feature to turn on when I configure its provider account, so that I can adopt the program piece by piece.
80. As a self-hoster, I want my Caddy proxy to issue certificates for my partners' custom domains on demand, so that I don't manage certificates by hand.
81. As a host, I want my host keys to keep reaching every business when they're set to do so, so that my own operations keep working.
82. As a partner member, I want to connect Claude, Cursor or another MCP client to my agency by signing in, so that I can make demos and set up clients from chat with my own role.
83. As a partner owner or admin, I want to see and disconnect every MCP client my team connected to the agency, so that someone who leaves can't keep working through one.
84. As a partner's developer, I want my partner's platform key to work on the MCP server, so that a coding assistant can run the console's work without a person's sign-in.

### Telemetry

85. As a partner admin, I want to turn the console's telemetry off for my whole team, so that the host doesn't see how we use the console.
86. As a host, I want a new partner's signup to reach my analytics while its telemetry is on, so that I can count partner signups that have no business yet.

## Implementation Decisions

The product decisions are settled in "How partners resell LobbyStack", the billing design in ADR 0009, and the platform key design in ADR 0010. "Understand the partner program's architecture" defines the modules, their interfaces, and the data flows. This list summarizes the decisions an implementer must follow.

**Terms.** Code, docs, and dashboard copy use the glossary's words: partner, partner member, host, operator, business, tier, pool, package, allowance, plan, platform key, claim, and release. The dashboard says "partner", not "agency".

**Modules.**

- **Partner features** reports what this deployment has turned on. The admin and the worker both read it, and nothing else reads the partner environment variables.
- **Brands** turns a hostname or a business into a brand. It returns no brand for an unknown hostname, caches answers including misses, and clears them on change through Redis. Texts always use the host's brand.
- **Business access** answers whether a person may act in a business and what they may do there. Callers check capabilities (activity, setup, team, billing, API keys, MCP), never roles. Direct businesses keep today's role rules.
- **Partner operations** are the functions behind the console. The console and partner platform keys call the same functions, so their behavior can't drift.
- **Entitlement** replaces checks of a plan's slug everywhere, including the SQL copies in number claims. It says whether a business is live and gives its allowance, overage terms, pool, and included numbers. Amounts use the package's currency.
- **Usage metering** keeps its current interface. The pool sits behind it, so callers in calls, web calls, chat, alert texts, and transfers don't change.
- **Partner lifecycle** is a pure state function (active, past due, ending, paused, deleted) plus one module that applies each change to the partner's businesses and numbers.
- **Platform keys** resolve from the environment first, then the database, behind one interface.
- **Business templates** export a business's setup in the `lobbystack onboard` file format and apply one. Applying runs through a setup port with two adapters: in-process for the admin, HTTP for the CLI.
- **Billing reconcile** maps Polar tier events and Stripe package events into partner and business state.
- **Stripe Connect provider** and **custom hostname provider** are new outside-service interfaces. The custom hostname provider has a Cloudflare for SaaS adapter for the cloud and a Caddy adapter with a DNS check for self-hosting.

**Schema.**

- New tables:
  - Partners, with their brand and telemetry setting
  - Partner members, with roles (owner, admin, member)
  - Partner domains, with kind and verification state
  - Audited partner opens
  - Active business per user and brand
  - Partner billing accounts
  - Partner monthly usage (the pool)
  - Partner number charges
  - Stripe connected accounts
  - Packages
  - Platform keys made in the console
  - Business templates
- New columns on businesses: the partner and the access level.
- New billing account fields: package (none means billed outside LobbyStack), overage switch, rates in minor units, cap, and Stripe customer and subscription.
- Usage events record the terms in force when they happened, with separate sync status for Polar and Stripe.
- Number trials gain a partner, with at most one trial per partner.
- Number claims record whether a partner member made them, so only the partner's claim quotas count a partner member's claims.
- The platform key link table and its grouping column are renamed from "partner" to "group". The old field and access value stay accepted as aliases.
- Every table enables and forces row-level security.

**Access and security.**

- A partner member reaches a business only through an audited open. The database checks the same open the application does, so RLS and the application agree.
- A partner member verifies their own mobile in a business only to claim the partner's trial number. Their verification never finishes the owner's onboarding, and SMS alerts stay with the business's own team.
- The team list stays limited to the business's own operators.
- Claim links are refused for partner businesses.
- A business on one brand never appears on another brand's domain.
- Console-made keys can never reach every business, set managed plans, create claim links, or start Polar checkout. The database enforces the first rule as well.

**Requests on many hostnames.**

- The proxy resolves each request's host to a brand and passes it on in a header it controls, stripping any copy the client sends.
- Better Auth trusts an origin only when the proxy resolved it, and builds every link from that origin.
- Partner hosts have no Google sign-in.
- MCP, OAuth, the OpenAPI document, and provider webhooks stay on the host's domain.
- An agency connects an MCP client to the partner with a partner platform key, or with an OAuth grant one person on its team approves for the partner. The grant works only while they're on the team, with their role at each request. Each per-business tool then names the business, which must be the partner's, and a person's call opens it as the console does. [ADR 0011](../adr/0011-agency-mcp-grants.md) records the design.
- Public pages that are prerendered today render per partner host and refresh when the partner's brand changes.
- Browser analytics and uploads never send a partner's visitors to a host-named domain.
- On the host's domain, the console's pages take telemetry consent from the partner's own setting, which starts on like a business's. A business's pages keep taking it from the business's setting, even while a partner member has the business open. Partner signup and invitation pages belong to no partner yet and send nothing, so signup's event waits for the new partner's console.

**Billing.**

- The host bills partners through Polar, using a separate customer reference per partner.
- Partners bill businesses through Stripe Connect direct charges on their own accounts.
- One usage sync job reports a business's overage to its partner's Stripe and a pool's overage to Polar. Each report sends only the overage.
- Reserving usage locks the business first and the pool second, every time, and grants the smaller of what each has left.
- Running out of a business's allowance, a pool, or a cap raises the existing voice limit. Calls then forward the way direct plans already do.
- Without tier billing, the host can set each partner's pool. Nothing prices overage there, so that pool is the limit, with no overage and no cap.

**Tiers on the cloud.**

| Tier | Monthly price | Pool | Numbers | Minute overage | Chat overage |
| --- | --- | --- | --- | --- | --- |
| Free | $0 | 30 minutes, 50 chats | 1 trial number | Off | Off |
| Starter | $49 | 250 minutes, 1,000 chats | 2 | $0.20 | $0.02 |
| Growth | $199 | 1,300 minutes, 5,000 chats | 10 | $0.15 | $0.015 |
| Scale | $499 | 4,000 minutes, 10,000 chats | 25 | $0.12 | $0.01 |

- Annual billing is 20% off, as on direct plans.
- Extra numbers cost what the host pays for them.
- Tiers don't limit simultaneous calls.

**Lifecycle.** When a tier is cancelled or a payment fails, the partner's businesses answer for 30 days, then pause, with calls forwarding and chat showing its message. The host deletes them 90 days after the tier ended. An hourly job moves partners through these states.

**Configuration.** Each partner feature turns on only when its configuration exists:

- the Stripe Connect keys and webhook secret
- the Polar tier product ids
- the partner base domain
- the Cloudflare for SaaS credentials, or Caddy's on-demand TLS

Partner signup switches between open and invite. The cloud defaults to invite until tier billing is configured, then to open. `PARTNER_SIGNUP` overrides either default.

**Order of work.** Build in the five phases of "Build the partner program":

0. Groundwork that keeps today's behavior
1. Partners, subdomains, and the console, with businesses billed outside LobbyStack and no pool limit. This phase ships first and works self-hosted.
2. Tiers and the pool
3. Packages on the partner's Stripe
4. Custom domains, console-made keys, templates, demos, and OAuth callbacks on partner domains

Every phase ships on its own, and direct businesses keep behaving exactly as they do today.

## Testing Decisions

A good test exercises a module through its interface and asserts what a caller can observe: a refused request, a granted reservation, a stored event, an email queued under the right brand. It never asserts on internal calls or reaches past the interface into tables the module owns. Tests describe behavior, so they survive refactoring.

The program uses three test seams, from highest to lowest:

- **Domain functions against PostgreSQL, with the real runtime roles and row-level security.** This is the main seam:
  - business access and audited opens, including that a partner member can't reach a business without an open, or another partner's businesses at all
  - brands
  - partner operations
  - entitlement
  - usage metering with pools, locks, caps, and the terms recorded on each event
  - platform keys from both sources, including the aliases
  - templates, number claims and quotas, and lifecycle transitions

  Prior art: the existing domain integration tests for platform keys, the public API, billing, and affiliates.
- **The admin's request pipeline.** Host resolution in the proxy, sign-in and CSRF on partner domains, branded public pages, refused unknown hosts, and the TLS ask route. Prior art: the existing route handler and proxy tests.
- **Provider interfaces with fakes.** The worker's usage sync to Polar and Stripe, the Polar and Stripe webhook routes and reconcile, and custom hostname provisioning. Prior art: the worker's job handler tests, which inject a fake Polar.

The pure modules (partner features and the lifecycle state function) are tested directly, with no database.

Repository rules also apply:

- Every new telemetry event gets a test that it fires from its real production path.
- Migrations and RLS changes pass the schema check and the RLS verification against the test database.
- Phase 2 changes how calls end, so it runs the voice evaluation, and a staging call test runs before merging.

## Out of Scope

These wait until after v1:

- Partner-wide webhooks for events across a partner's businesses
- Annual packages
- A public signup page where a business picks a package itself
- Revenue and margin reports for partners
- Google sign-in on partner domains

The program won't do these at all:

- Move a business that pays the host directly under a partner
- Neutral Google and Meta apps (Calendar and Instagram connect through the host's apps, so their consent screens name the host)
- A dedicated text sender per business (texts stay on the host's verified number)
- Concurrent-call limits sold by tier
- Branded mobile or desktop apps, a website builder for partners, white-labeled help docs, MCP or API keys for a partner business's own operators, and an AI disclosure or call recording notice. The partner's own team reaches its businesses over MCP through agency connections, as [MCP for agencies](../architecture/partners.md#mcp-for-agencies) describes

## Further Notes

The decisions behind this spec, all in the repository:

- "How partners resell LobbyStack" (`docs/white-label.md`)
- "Build the partner program" (`docs/white-label-build-plan.md`)
- "Understand the partner program's architecture" (`docs/architecture/partners.md`)
- ADR 0009 and ADR 0010 (`docs/adr/`)
- The glossary (`GLOSSARY.md`)

The host sets up a few things outside the code, and the build waits on them with test doubles:

- the Stripe Connect platform account and webhook secret
- the Polar tier products
- the `receptionistportal.com` Cloudflare zone, fallback origin, and API token
- the Twilio trunk's disaster recovery URL, which call forwarding needs
- Twilio's STOP reply wording

Partner guides for the docs site get written as each phase ships.
