# How partners resell LobbyStack

A partner resells LobbyStack to businesses under its own brand, domain, and bills. This page records what v1 of the partner program does, as decided on 2026-10-24. Nothing is built yet. [`GLOSSARY.md`](../GLOSSARY.md) defines the terms, and [the white-label research](../research/white-label-reseller-programs.md) compares 30 competitors.

## Terms

The code, the docs, and the dashboard all use these words:

- **Host**: the company that runs a deployment. LobbyStack hosts the cloud, and a self-hoster hosts its own.
- **Partner**: a company that resells LobbyStack under its own brand and keeps the businesses it sets up.
- **Operator**: a person on a business's team who uses its dashboard.
- **Tier** and **pool**: what a partner buys from the host. A tier is a monthly fee plus a pool of minutes and chats that all the partner's businesses share.
- **Package** and **allowance**: what a partner sells to a business. A package is a price plus an allowance of minutes and chats.
- **Plan**: what the host sells to a business directly, such as Starter or Pro.

## What a partner pays the host

The host bills each partner through Polar ([ADR 0009](adr/0009-partners-bill-through-their-own-stripe.md)):

- A tier has a monthly fee and a pool of voice minutes and chat conversations. A partner can have any number of businesses.
- Annual billing takes 20% off, as it does on direct plans.
- Alert texts and transfer attempts don't use the pool, up to a fair-use cap.
- The entry tier costs about what direct plans cost per minute, and higher tiers cost less per minute. A single business gains nothing by signing up as a partner.
- Each tier includes some phone numbers. Extra numbers cost what the host pays for them.
- Overage costs less per minute and per chat on higher tiers.
- Pool overage is on by default and bills pay as you go, up to a monthly cap the partner sets. The partner can turn overage off.
- Tiers don't limit simultaneous calls, because a cap on an inbound receptionist sends callers to a busy signal.
- The free tier needs no card. It includes one 14-day number trial per partner, ever, with the same 30 minutes and rules as direct Free.

LobbyStack's cloud sells these tiers:

| Tier | Monthly price | Pool | Numbers | Minute overage | Chat overage |
| --- | --- | --- | --- | --- | --- |
| Free | $0 | 30 minutes, 50 chats | 1 trial number | Off | Off |
| Starter | $49 | 250 minutes, 1,000 chats | 2 | $0.20 | $0.02 |
| Growth | $199 | 1,300 minutes, 5,000 chats | 10 | $0.15 | $0.015 |
| Scale | $499 | 4,000 minutes, 10,000 chats | 25 | $0.12 | $0.01 |

## What a business pays its partner

A partner bills its businesses through its own Stripe account, connected with Stripe Connect ([ADR 0009](adr/0009-partners-bill-through-their-own-stripe.md)):

- A package has a name, a monthly price, an optional one-time setup fee, and an allowance. It uses the currency of the partner's Stripe account.
- For each business, the partner turns overage on or off and sets the overage rate and a monthly cap in money.
- A partner can mark a business "billed outside LobbyStack". Its usage still draws on the pool, and Stripe charges it nothing.

When a business runs out of allowance with overage off, or reaches its cap:

- Calls forward to the business's transfer number or the owner's verified phone. With neither, the caller hears a busy signal.
- Chat shows "We can't reply here right now."
- The partner and the business get alerts at 80% and 100%.

When the partner's pool runs out with overage off, or the partner reaches its own cap, all its businesses fall back the same way.

## Partners and their teams

- Partners sign up themselves, without an application.
- A partner's team has three roles. Owners manage Polar billing and the Stripe connection, and can delete the partner. Admins manage businesses, packages, branding, the domain, keys, and the team. Members work inside businesses.
- The partner console is part of the same app. Staff open it from the partner's domain or the host's.
- Partner staff can open any of the partner's businesses with full access, without joining its team. Each time they open one, the business's audit log records who did it.

The console has these pages in v1:

- Businesses: create, open, release, and delete them, and see each one's usage
- Packages
- Templates
- Demos
- Branding & domain
- Team
- API keys
- Billing: the tier, pool usage, and overage cap
- Stripe: the connection

## Businesses under a partner

- A person has one account across every brand. Each domain lists only its own brand's businesses.
- The partner creates each business in the console and sends the owner a link. The link opens a Stripe checkout on the partner's domain, or sign-in for a business billed outside LobbyStack.
- The partner gives each business one of two access levels. Full access has today's owner and admin powers, minus billing, API keys, and MCP. Activity only shows calls, chats, appointments, contacts, and messages.
- The business's billing page opens the partner's Stripe customer portal. Its dashboard shows usage against its allowance, and only Stripe invoices show prices.
- Partners can save a business's setup as a template in the `lobbystack onboard` file format, then apply it to new businesses.
- Partners can make prospect demos under their own brand.

A business stays with its partner:

- A business that pays the host directly can never move under a partner.
- Only the partner can release a business to its owner, who then pays the host directly. The partner can also delete it.
- The host never contacts a partner's businesses.
- When a partner cancels its tier or stops paying, its businesses keep answering for 30 days, and the partner can release them. Then they pause, with calls forwarding as above. The host deletes them after 90 days.

## Platform keys

Partners make their own platform keys in the console ([ADR 0010](adr/0010-partners-make-their-own-platform-keys.md)):

- A partner's keys reach only its businesses, through today's Platform endpoints and `lobbystack onboard`.
- Keys in `PLATFORM_API_KEYS` belong to the host.
- Each entry's `partner` field becomes `group`, and `platform_partner_businesses` becomes `platform_key_businesses`. Entries keep accepting `partner`, so existing self-hosted keys keep working.
- Webhooks stay per business, as today. Partner-wide webhooks come after v1.

## Branding

A deployment has two layers of branding:

- The host's brand comes from today's [deployment branding](branding.md). It shows on the host's main domain and is the verified sender of its texts.
- Each partner's brand shows on that partner's domains.

A partner sets these in v1:

- Name, logo, favicon, and brand color
- A custom subdomain with automatic TLS on paid tiers, or a subdomain of the host's neutral domain on the free tier
- Branded sign-in and dashboard, with the partner's terms, privacy, and support links
- Emails under the partner's name, sent from the neutral domain
- The website widget's script, served from the partner's domain

A few places keep the host's name:

- Partner domains offer email and password sign-in only, because Google sign-in would show the host's Google app.
- Google Calendar and Instagram connect through the host's apps, so their consent screens show the host's name. Their callbacks return to the partner's domain.
- Texts come from the host's verified number, as the next section describes.

A partner's businesses never get the host's marketing, onboarding, or founder emails.

## Texts

Every business, direct or partner, texts from the host's verified toll-free number. Carriers expect that number's verified brand in the first text and in HELP and STOP replies. [The research's SMS section](../research/white-label-reseller-programs.md#sms-sender-rules) has the sources.

- The first text to each customer of each business confirms the opt-in and names the host and the business.
- HELP and STOP replies name the host and the business.
- Every other text names only the business.

Direct businesses already work this way, except STOP, which still gets Twilio's default reply.

## Compliance

The partner agreement makes each partner responsible for its businesses' legal duties: recording consent, AI disclosure where the law requires it, and consent for texts. Partners pass the host's acceptable use policy on to their businesses.

## Self-hosted deployments

Every partner feature works on any deployment. Each piece turns on when the host configures what it needs:

- **Stripe Connect**: packages bill on partners' Stripe accounts. Without it, every partner business is billed outside LobbyStack.
- **Tier products in Polar**: partners pay for tiers. Without them, pools are unlimited unless the host sets a pool and cap for a partner.
- **A partner base domain**: partners get default subdomains, and their emails go out from it. Without it, each partner needs a custom domain.
- **On-demand TLS in the proxy**: partners' custom domains get certificates. Self-hosted Compose already runs Caddy, which can issue them.

On LobbyStack's cloud:

- The partner base domain is `receptionistportal.com`. It's its own Cloudflare zone, with a wildcard record that points at the same server as the dashboard.
- Partners' custom domains go through Cloudflare for SaaS. A partner points a CNAME at LobbyStack, and Cloudflare issues the certificate. The first 100 custom domains are free, and each one after that costs $0.10.
- Traefik has one catch-all route that sends every partner hostname to the admin.

## After v1

These wait until v1 ships:

- Partner-wide webhooks
- Annual packages
- Public business signup
- Revenue and margin reports
- Google sign-in on partner domains
