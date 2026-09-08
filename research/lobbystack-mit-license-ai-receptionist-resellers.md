# Research: LobbyStack is now MIT: Build and sell your own

Research date: 2026-09-04  
Scope: repository sources and Git history on `feature/nextjs-platform-port`  
Editorial constraint: describe permissions from the repository's license text without presenting legal advice.

## Findings to anchor the article

### License history and the change

- LobbyStack began under `AGPL-3.0-only`. The initial repository commit identified that license, the April product rename changed the named project to LobbyStack, and the May license-detection commit added the complete GNU Affero GPL v3 text. The pre-change README still showed an `AGPL-3.0-only` badge and named AGPL in its license section. Sources: [initial license commit](https://github.com/lobbystack/lobbystack/commit/27b3d111fb5113596dd8cec6f57528da2b73e852), [rename commit](https://github.com/lobbystack/lobbystack/commit/ae161b268970dfb23e202c05e193c0a6077832e5), [full AGPL text commit](https://github.com/lobbystack/lobbystack/commit/139ef14705b3df03ea8b96a9da6154e0df921c4c), and [README immediately before the MIT change](https://github.com/lobbystack/lobbystack/blob/153e8bedeec816c98f8b5e2b10ed66d784672297/README.md#license).
- Commit [`1374d073`](https://github.com/lobbystack/lobbystack/commit/1374d073efd3023f83ac36b5d7033ef33cb6d646), dated 2026-08-30, replaced the AGPL text with the MIT License and updated the README, website copy, terms, and English/French blog references. Its subject, “Shorten LICENSE file to the applicable license text,” understates the substantive change; call it the relicensing commit in the article, while using the exact date and hash if chronology matters.
- The current repository license permits anyone who receives the software to “use, copy, modify, merge, publish, distribute, sublicense, and/or sell” it. The condition is equally clear: copies or substantial portions must include the copyright notice and permission notice. The text also includes the standard warranty and liability disclaimer. Source: [`LICENSE`, lines 1–20](../LICENSE#L1-L20).
- Safe plain-language formulation: “The MIT License lets you use, change, distribute, sublicense, and sell LobbyStack’s code, provided you keep its copyright and permission notice in copies or substantial portions.” Do not promise that a reseller has no other obligations; providers, telecommunications rules, customer contracts, privacy duties, and other law remain outside the software license.

### Why the license changed

- The business premise comes from the product owner, not from a public metric in the repository: product adoption and outside contributor adoption fell short of the team’s expectations. Keep this qualitative. Do not invent signup, revenue, GitHub-star, customer, or contributor counts.
- Recommended account: AGPL protected the reciprocal open-source model, but it added another question for agencies and commercial evaluators who wanted to adapt or resell the product. The team chose MIT to make the answer clearer and widen the set of viable client and product uses.
- Avoid claiming that AGPL forbade resale. Its former license text explicitly allowed charging for copies, subject to its terms. The accurate marketing point is that MIT removes copyleft obligations from LobbyStack’s code and permits sublicensing; it reduces evaluation and resale friction. Do not characterize this paragraph as a legal interpretation or criticize AGPL as defective.
- Pair the license change with the platform move. LobbyStack now uses a familiar TypeScript stack: Next.js and React for the app, PostgreSQL and Drizzle for durable data, Redis and BullMQ for asynchronous work, and Fastify for the voice gateway. Sources: [`README`, lines 95–125](../README.md#L95-L125) and [ADR 0007](../docs/adr/0007-postgresql-main-backend.md#L9-L21).
- The repository states concrete reasons for PostgreSQL: explicit migrations, role-specific connections, row-level security, portable self-hosting, and transactional coordination between durable state and asynchronous side effects. Shared domain modules keep the admin, worker, and voice runtimes aligned. Source: [ADR 0007, lines 9–21](../docs/adr/0007-postgresql-main-backend.md#L9-L21).

### What a reseller can build

The code and current product support several defensible business models:

1. **A branded vertical product.** A company can modify the MIT-licensed application for a niche such as clinics, salons, repair shops, home services, law firms, or property managers. LobbyStack already supplies inbound voice, website chat and SMS, scheduling, knowledge, handoff, call records, analytics, usage, and billing surfaces. The operator can focus on niche rules, integrations, onboarding, and service. Sources: [`README`, lines 34–101](../README.md#L34-L101) and [the open-source stack article, lines 38–65](../apps/landing/src/content/blog/open-source-ai-receptionist-stack.md#L38-L65).
2. **Managed deployments for clients.** An agency can deploy the Docker Compose stack in its own environment or a client’s, connect client-controlled provider accounts, and charge for setup, customization, support, monitoring, and operation. The documented baseline runs PostgreSQL, Redis, Next.js, the worker, voice gateway, and Caddy; self-hosters bring Twilio, AI, calendar, email, analytics, billing, and storage accounts as needed. Sources: [open-source stack article, lines 79–106](../apps/landing/src/content/blog/open-source-ai-receptionist-stack.md#L79-L106) and [provider reference](../mintlify/self-hosting/providers.mdx#L8-L44).
3. **Custom integrations and workflow services.** The provider package defines interfaces for telephony, SMS, realtime voice, text AI, calendars, email, business snapshots, conversations, knowledge indexing, and durable execution. Agencies can sell the work that connects LobbyStack to a client’s systems and implements its booking, routing, knowledge, escalation, and follow-up policies. Sources: [`packages/providers/src/index.ts`, lines 1–108](../packages/providers/src/index.ts#L1-L108) and [the agency example, lines 78–92](../apps/landing/src/content/blog/my-ai-front-desk-alternative.md#L78-L92).
4. **A separately hosted commercial derivative.** MIT permits sale and sublicensing of copies, so a business can operate its own hosted version, set its own commercial model, and keep application modifications private, while preserving the required MIT notices. This claim comes from the license grant, not from a turnkey “reseller mode.” Source: [`LICENSE`, lines 5–13](../LICENSE#L5-L13).

Do not promise a one-click white-label or reseller portal. The repository supports per-business data, team memberships, roles, workspace switching, and tenant isolation, but the business still owns packaging, branding, customer support, provider billing, security, and operations. Sources: [`packages/domain/src/server/tenancy.ts`, lines 12–124](../packages/domain/src/server/tenancy.ts#L12-L124), [ADR 0007](../docs/adr/0007-postgresql-main-backend.md#L9-L21), and [agency evaluation guidance](../apps/landing/src/content/blog/my-ai-front-desk-alternative.md#L84-L92).

### Code rights are separate from the LobbyStack brand

- The MIT grant applies to the software and associated documentation. The site terms state that hosted accounts, plans, support, websites, and trademarks remain governed separately, and that the LobbyStack name, logos, branding, and goodwill do not receive unrestricted use through the open-source license. Source: [`terms.astro`, lines 127–148](../apps/landing/src/pages/terms.astro#L127-L148).
- The repository’s SEO guidance repeats the rule: keep trademark rights separate from the software license when discussing white-label use. Source: [`docs/seo-remediation.md`, lines 49–55](../docs/seo-remediation.md#L49-L55).
- Recommended article wording: “You can rebrand and sell a product built from the code. The MIT License does not give you unrestricted rights to the LobbyStack name or logos.” Avoid saying the article grants trademark permission.

### Hosted and self-hosted positioning

- LobbyStack Cloud serves buyers who want LobbyStack to manage the product. Self-hosting serves operators who want their own infrastructure, API keys, PostgreSQL, Twilio, OpenAI-compatible AI, calendar, analytics, billing, and email accounts. The repository presents both as the same open-source core with different ownership of operations. Source: [`README`, lines 103–111](../README.md#L103-L111).
- Self-hosting creates work as well as control. The current article should name secrets, DNS, provider credentials, backups, upgrades, monitoring, call testing, security, registrations, billing setup, and end-user notices. Sources: [open-source stack article, lines 79–106](../apps/landing/src/content/blog/open-source-ai-receptionist-stack.md#L79-L106) and [`terms.astro`, lines 144–148](../apps/landing/src/pages/terms.astro#L144-L148).
- Marketing position: agencies can use the code as the base of their own offer; buyers who want to start without operating infrastructure can use LobbyStack Cloud. Avoid suggesting that Cloud grants private-label or trademark rights.

## Adoption language: safe boundaries

Use first-person, qualitative language:

> Convex helped us ship the first version sooner, and it has served our paying customers well. LobbyStack and its contributor community did not grow as fast as we expected. We decided to reduce two points of friction at once: move to a stack more developers already know and adopt a license that gives agencies and commercial builders more room to work.

Keep the subject on **LobbyStack’s adoption**. Do not say Convex has poor community or product adoption. Do not imply technical failure, downtime, lost customer data, or customer dissatisfaction. Keep the technical migration discussion short in this license article and link to the dedicated PostgreSQL post for the full rationale.

## Proposed article argument

1. Open with the practical consequence: an agency can now adapt LobbyStack, deploy it for clients, and charge for the result under MIT while retaining the required notice.
2. Explain the honest business reason: LobbyStack’s adoption did not meet the team’s expectations, and the former combination of AGPL plus a less familiar backend increased evaluation friction.
3. Credit the old choices. Convex helped the team ship sooner and continues to serve paying customers during cutover; AGPL reflected a legitimate reciprocal open-source goal.
4. State the MIT permissions and notice condition in one compact paragraph.
5. Put the reader in concrete scenarios: a home-services agency with client deployments, a vertical product for clinics, or an integrator connecting the receptionist to calendars and business systems.
6. Draw the brand boundary and the operator-responsibility boundary.
7. Close with a choice between building on the repository and using the managed cloud.

## Proposed links and CTA

- Primary build CTA: [Clone or inspect LobbyStack on GitHub](https://github.com/lobbystack/lobbystack).
- Self-host CTA: [Read the self-hosting overview](https://docs.lobbystack.com/self-hosting/overview) and [Docker Compose guide](https://docs.lobbystack.com/self-hosting/docker-compose).
- Managed CTA: [Try LobbyStack Cloud](https://app.lobbystack.com/signup) or review [hosted pricing](https://lobbystack.com/pricing/).
- Related reading: `/blog/why-lobbystack-is-moving-away-from-convex/` once the paired launch post ships, plus `/blog/open-source-ai-receptionist-stack/` for the product and deployment overview.
- Suggested final CTA: “Clone LobbyStack and build the receptionist offer your clients need. If you would rather start with the managed product, create a LobbyStack Cloud account and test a real call.”

## Claims to avoid

- Any adoption metric or causal claim unsupported by internal data.
- “MIT means you can do literally anything.” The copyright and permission notice condition still applies, and other obligations sit outside the code license.
- “AGPL prevented resale.” It allowed charging under its conditions.
- “White-label LobbyStack” without distinguishing code modification from rights to the LobbyStack name and logos.
- “Convex failed us,” “Convex cannot scale,” or “Convex lacks adoption.” The owner’s account says Convex worked well and serves paying customers.
- “Turnkey reseller platform” or “no operations required.” Agencies still own the commercial and operational layer around self-hosted or derivative deployments.
