---
title: "How we built an open source white label AI receptionist"
seoTitle: "How We Built an Open Source White Label AI Receptionist"
description: "A white label AI receptionist lets an agency sell call answering under its own brand. Here are the decisions behind LobbyStack's, and the trade-offs we accepted."
pubDate: 2026-10-27T10:00:00-04:00
author: "LobbyStack Team"
category: "Product updates"
featured: false
coverImage: "/illustrations/white-label-ai-receptionist-hero.webp"
coverImageAlt: "Beige LobbyStack cover card with the title How we built an open source white label AI receptionist"
locale: "en"
canonicalSlug: "white-label-ai-receptionist"
---

A **white label AI receptionist** is an AI phone receptionist that an agency sells to its clients under the agency's own name. It answers the client's calls, books appointments and transfers urgent callers. The client signs in at the agency's address, sees the agency's logo and pays the agency's price. LobbyStack's version, [White Label](/white-label/), shipped on October 27, 2026, and its code is MIT licensed.

Before we built it, we looked for an open source white label AI receptionist to learn from and couldn't find one. The products we studied were hosted platforms, and the voice infrastructure vendors pointed agencies to separate dashboard tools. So we wrote down our own decisions as we went, in [ADRs](https://github.com/lobbystack/lobbystack/tree/main/docs/adr) and a [partner architecture doc](https://github.com/lobbystack/lobbystack/blob/main/docs/architecture/partners.md). Below are the decisions that shaped the product, with the places where we gave something up.

## What does a white label AI receptionist need?

We researched 30 white label and reseller programs before we wrote any code. Most of them sold the same shape: a monthly platform fee, a bundle of minutes, one sub-account per client, a template to copy a working setup, and client billing through the agency's own Stripe account. We kept that shape and added three things we thought agencies would care about:

- one pool of minutes and chats across all clients, with no fee per business
- a record of every time agency staff open a client's dashboard
- the whole program in the open source repository, so it runs on your own servers

## Partners and businesses are separate records

The first decision was the data model. A **partner** is the agency. A **business** is one of its clients. Each has its own team, and the two never mix.

A partner's team has three roles:

| Role | What they can do |
| --- | --- |
| Owner | Everything an admin can do, plus billing, the Stripe connection and other owners |
| Admin | Businesses, packages, templates, branding, the domain, API keys, settings and the team's admins and members |
| Member | Work inside the partner's businesses and see their usage |

We tried tying agency access to ordinary user accounts first, and rejected it in [ADR 0010](https://github.com/lobbystack/lobbystack/blob/main/docs/adr/0010-partners-make-their-own-platform-keys.md). Access tied to a person breaks when that person leaves, and it would have capped an agency at the 10 businesses a user account can own. A partner is a database record that owns its keys, staff, brand, domain, Stripe account and tier, so a staff change doesn't break anything.

Partner members also never join a client's team. They reach a business through an "open" that lasts eight hours, and each open writes a row to that business's audit log with the person's name. The business's owners and admins see every visit on a **Partner access** tab. An agency can fix a client's setup without borrowing their password, and the client can see who looked.

## Every request resolves to one brand

The second decision was branding, and it touched more code than anything else. Every request and every email now resolves to one brand: the host's (LobbyStack on our cloud) or a partner's.

A partner sets a name, logo, favicon, brand color, and its own terms, privacy and support links. Those show on:

- the sign-in, sign-up and password reset pages
- the client's dashboard
- invitations, alerts and other emails, which go out under the partner's name
- the website widget's script, served from the partner's domain

Each partner starts on a subdomain of `receptionistportal.com`, a neutral domain with no LobbyStack name in it. On a paid tier, a partner can connect a subdomain of its own website, such as `app.acmeagency.com`. On our cloud, those custom domains go through Cloudflare for SaaS: the partner adds a CNAME and a TXT record, and Cloudflare issues the certificate. A self-hosted deployment uses Caddy's on-demand TLS instead. Before Caddy issues a certificate, it asks an endpoint in the app, which approves only the host's own domain and verified partner domains.

A few places still show LobbyStack, and we chose to say so on the [White Label page](/white-label/) instead of hiding it:

- **Texts.** Every business texts from our verified toll-free number. Carriers expect that number's verified brand in the first text and in HELP replies, so those name LobbyStack next to the business. Every other text names only the business.
- **Google sign-in.** It would show our Google app's name, so partner domains offer email and password sign-in only.
- **Google Calendar and Instagram.** Their consent screens show our app's name. The callback returns to the partner's domain.

## One pool of minutes for every client

Usage was the third decision. A partner buys a **tier** from us, and each tier includes a monthly pool of voice minutes and website chats that all its businesses share. A quiet client covers a busy one, and adding a business costs nothing extra.

| Tier | Monthly price | Pool each month | Phone numbers | Overage past the pool |
| --- | --- | --- | --- | --- |
| Free | $0 | 30 minutes, 50 chats | One 14-day trial number | Off |
| Starter | $49 | 250 minutes, 1,000 chats | 2 included | $0.20 a minute, $0.02 a chat |
| Growth | $199 | 1,300 minutes, 5,000 chats | 10 included | $0.15 a minute, $0.015 a chat |
| Scale | $499 | 4,000 minutes, 10,000 chats | 25 included | $0.12 a minute, $0.01 a chat |

Prices as of October 2026. Annual billing takes 20% off.

The hard part was metering. Each call now checks two limits: what the business has left on its package and what the partner has left in its pool. The call gets the smaller of the two. To keep two calls from overspending the same pool, the code always takes the business lock before the pool lock, in that order, everywhere.

We also dropped one idea during the build. Early drafts limited simultaneous calls per tier. Inbound callers decide when they call, so a cap would send the fifth caller to a busy signal. Tiers have no concurrency limit.

When a business or a pool runs out with overage off, calls forward to the business's transfer number or the owner's verified phone, and website chat says it can't reply right now. The partner and the business get alerts at 80% and 100%. We changed the whole product for this: direct businesses at their limit used to get a busy signal, and now their calls forward too.

## Clients pay the partner through Stripe Connect

Billing got its own record, [ADR 0009](https://github.com/lobbystack/lobbystack/blob/main/docs/adr/0009-partners-bill-through-their-own-stripe.md). There are two bills:

1. **We bill the partner** for its tier and any pool overage, through Polar, the same way we bill direct customers.
2. **The partner bills its clients** through its own Stripe account, connected with Stripe Connect. The packages, subscriptions and overage charges are direct charges on the partner's account. Clients pay at a Stripe checkout in the partner's name, Stripe sends the invoices and retries failed cards, and refunds stay in the partner's Stripe dashboard.

We considered two other models. In the first, the product sends no client bills and agencies invoice from their own tools. That's simpler for us, but a small agency would need billing software before it could sell anything. In the second, we collect from clients and pay agencies their share. That would have made us responsible for every client's tax, refunds and failed payments. Polar sells as the merchant of record, so a Polar invoice can't carry an agency's name anyway.

A partner's **package** has a name, a monthly price, an allowance of minutes and chats, and an optional one-time setup fee. Per client, the partner can turn on overage at its own rate per minute and per chat, up to a monthly cap. A partner can also mark a business "billed outside LobbyStack" and invoice it however it likes.

The trade-off: a client's subscription lives on the partner's Stripe account. If a partner disconnects Stripe, we can't move those subscriptions, and the partner sets up its own tax collection.

## Templates, demos and keys for repeat work

Agencies sell the same setup many times, so we built three tools for repeat work.

**Templates** copy a business's receptionist settings, hours, services, rules, FAQs, texts and documents. They leave out what belongs to one business: its name, website, phone numbers, owner and the greeting that names it. Templates use the same file format as `lobbystack onboard`, our command line tool, so we only had to maintain one format.

**Demos** build a receptionist from a prospect's website. The agency publishes it, sends a secure link on its own domain, and the prospect talks to a receptionist that already knows their business. When the prospect claims it, the demo becomes one of the partner's businesses with the prospect as owner. Demo calls draw on the partner's pool like any client's calls, so a Free partner can run a few demos on its 30 minutes.

**Platform keys** let an agency's own code create businesses through the [v1 API](/docs/api/). A partner makes keys in its console, and a key reaches only that partner's businesses. The same key works with `lobbystack onboard`, which builds a business from one YAML file and changes only what differs when you run it again.

## Handing a business back to its owner

An agency has to trust that the platform won't take its clients. So a business stays with its partner, and only the partner can release it.

When a partner releases a business, its owner keeps the setup and starts paying LobbyStack directly on our Free plan. The release also:

- ends every open the partner's staff had on the business
- turns off the webhooks the partner's keys or people set up, so calls and contacts stop going to the agency
- revokes the team invitations that anyone off the business's own team sent

We found the last two gaps before launch. A released business kept sending webhooks to the agency until the server restarted, and invitations sent by a partner's key survived the release because of a SQL `NOT IN` that never matched a null. Both are fixed and audited.

If a partner stops paying, its businesses keep answering for 30 days, and the partner can release them during that time. After that they pause, and we delete them 90 days after the tier ended. We never contact a partner's clients ourselves.

## Keeping White Label open source

Every partner feature is in the [public repository](https://github.com/lobbystack/lobbystack) under the MIT license, and every one works on a self-hosted deployment. Each piece turns on when the host configures what it needs:

| Piece | What a self-hoster configures |
| --- | --- |
| Client billing | Stripe Connect keys. Without them, every business is billed outside LobbyStack. |
| Tier billing | Polar products. Without them, a host can set each partner's pool with `pnpm partner-pool:set`, or leave it unlimited. |
| Partner subdomains | A partner base domain |
| Custom domains | Caddy's on-demand TLS, or Cloudflare for SaaS |

This cost us time. Every feature needed a path for "this provider isn't configured," and a test for it. We think it's worth it: an agency that outgrows our cloud, or needs its clients' call records in its own database, can move the whole program to its own servers. The [self-hosting guide for White Label](https://docs.lobbystack.com/self-hosting/white-label) covers the setup, and the [MIT license post](/blog/lobbystack-mit-license-ai-receptionist-resellers/) explains what the license lets you do with the code.

## What White Label doesn't do yet

These are on the list after v1:

- partner-wide webhooks (webhooks are per business today)
- annual packages for clients
- revenue and margin reports
- Google sign-in on partner domains

## FAQ

### What is a white label AI receptionist?

It's an AI receptionist that an agency or reseller sells to clients under its own brand. The client signs in at the agency's address, sees the agency's logo and pays the agency, while the platform runs the calls underneath.

### How much does LobbyStack White Label cost?

The Free tier costs $0 and includes 30 voice minutes, 50 chats and one 14-day trial number. Paid tiers cost $49, $199 and $499 a month, as of October 2026, each with a larger shared pool and included phone numbers.

### Can I self-host LobbyStack White Label?

Yes. The code is MIT licensed, and every partner feature works on your own servers once you configure Stripe Connect, a partner domain and TLS for custom domains. LobbyStack charges no license fee.

### Do my clients ever see the LobbyStack name?

On sign-in, the dashboard, emails and the widget, they see your brand. The first text to each customer and HELP replies name LobbyStack, as carriers require, and the Google Calendar and Instagram consent screens show our app's name.

## Try it

[Start on the Free tier](/white-label/) to set up your brand and run a demo for a prospect, or read the code on [GitHub](https://github.com/lobbystack/lobbystack). If you're comparing programs, our [comparison of white label AI voice agent platforms](/blog/white-label-ai-voice-agent-platforms/) puts LobbyStack next to five others, and the [guide to starting an AI receptionist business](/blog/start-ai-receptionist-business/) covers niches, pricing and onboarding.
