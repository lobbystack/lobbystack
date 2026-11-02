---
title: "White label AI agent: sell one under your own brand"
seoTitle: "White Label AI Agent: Sell One Under Your Own Brand"
description: "A white label AI agent lets you sell AI under your brand. See three ways to do it with a receptionist: a branded dashboard, your own UI, or your own servers."
pubDate: 2026-11-01T11:00:00-05:00
updatedDate: 2026-11-01T11:00:00-05:00
author: "LobbyStack Team"
category: "Guides"
featured: false
coverImage: "/illustrations/white-label-ai-agent-hero.webp"
coverImageAlt: "Beige LobbyStack cover card with the title White label AI agent: sell one under your own brand"
locale: "en"
canonicalSlug: "white-label-ai-agent"
---

A **white label AI agent** is an AI agent one company builds and another sells under its own name, logo and prices. Your client sees your brand, and the vendor runs the model and the infrastructure. A phone receptionist is one of the easiest agents to sell this way, because every local business already understands the job.

This guide covers three ways to sell one on LobbyStack, from a branded dashboard you can set up today to a receptionist inside your own product. If you're still comparing vendors, start with our [white label AI voice agent platform comparison](/blog/white-label-ai-voice-agent-platforms/).

## Which white label route fits you?

Pick the route by asking where your client will log in.

| | Branded dashboard | Your own UI | Your own servers |
| --- | --- | --- | --- |
| Your client logs in to | Your subdomain, under your brand | Your product | Either one |
| Best for | Agencies and resellers | SaaS companies | Teams that need control of data and costs |
| Who bills the client | You, through your Stripe account | You, in your own billing | You |
| Coding needed | None | Yes, through the API | Server administration |
| What you pay LobbyStack | A tier, from $0 | A paid tier for numbers | Your own providers, plus optional support |

## Route 1: Sell a branded dashboard

Your clients sign in at your address, see your logo and pay you. LobbyStack stays behind your brand. Setup takes [five steps](https://docs.lobbystack.com/white-label/overview), and you can bill your first client yourself before you connect payments:

1. **Sign up as a partner.** Pick a company name and a subdomain such as `acme.receptionistportal.com`. You can't change the subdomain in the console later.
2. **Add your brand.** Set your name, logo, favicon and brand color, plus your terms, privacy and support links. Your pages show the changes within a minute.
3. **Make a demo.** Enter a prospect's business name and website, and LobbyStack builds a receptionist the prospect can call from a secure link on your address.
4. **Create a package.** Connect your Stripe account, then set a monthly price, an optional setup fee and the minutes each month includes. LobbyStack takes no share of those payments.
5. **Add a paid tier when you're ready.** Paid tiers add phone numbers, more pool minutes and a subdomain of your own website, such as `app.acmeagency.com`.

Our guide to [starting an AI receptionist business](/blog/start-ai-receptionist-business/) covers niches, pricing and support once this is running.

### Can an AI assistant do this for you?

Yes, for most of the console's work. After you sign up, [connect Claude or ChatGPT to your partner](https://docs.lobbystack.com/white-label/mcp-for-agencies) through LobbyStack's MCP server, then ask in plain language:

```text
Set our brand color to #0f766e and our support email to help@acmeagency.example.

Make a demo for joesplumbing.example with these suggested prompts:
"Can I get a quote for a water heater?" and "Do you take emergency calls?"
Tell me when it's ready, then publish it.

Create a package called Starter Answering at $149 a month with 200 minutes.
```

The assistant calls the same operations the console uses, under the same permissions. It can't sign you up, and Stripe still asks you to enter your company's details yourself. You open those links in your browser.

## Route 2: Put the receptionist inside your own UI

SaaS companies often want the receptionist as a feature, with no second login. A [platform key](https://docs.lobbystack.com/white-label/api-keys#run-businesses-from-your-own-product) makes that work. Leave `owner_email` out of `POST /businesses`, and nobody gets an invitation. Your key sets up the business, buys its number on a paid tier, and reads calls through the API and webhooks.

You build the screens. Your customer sees your settings page, your call log and your bill. Our [AI receptionist API guide](/blog/ai-receptionist-api/) has every request in order.

This route gives up three things:

- You bill your customers yourself, because a package needs an owner at checkout.
- You can't hand a business over later, because a key can't invite an owner.
- Your team gets the operational alerts, such as a failed transfer.

Use `owner_email` for any customer who might want their own login. The partner console then treats that business like Route 1.

## Route 3: Run it on your own servers

LobbyStack's [source code](https://github.com/lobbystack/lobbystack) is MIT licensed, so you can run the whole product, partner features included. The [Railway template](https://docs.lobbystack.com/self-hosting/overview) deploys the admin, worker and migration services with PostgreSQL, Redis and a storage bucket. You enter an OpenAI API key and your Twilio credentials, and Railway generates the secrets.

Browser test calls work once the deploy finishes. Email, phone calls and website import each need more setup, which the guide lists. You then keep the backups, upgrades and monitoring, and you pay OpenAI and Twilio directly. [Running white label yourself](https://docs.lobbystack.com/self-hosting/white-label) adds wildcard DNS and optional Stripe Connect and tier billing.

Our [MIT license post](/blog/lobbystack-mit-license-ai-receptionist-resellers/) explains what you may change and sell. The [self-hosted page](/solutions/self-hosted-ai-receptionist/) sums up the setup.

## What does a white label AI agent cost?

On LobbyStack's cloud, you pay one tier, and every client draws on its shared pool of minutes. You can have as many businesses as you like on any tier.

| Tier | Monthly price | Pool | Phone numbers | Extra minute |
| --- | --- | --- | --- | --- |
| Free | $0 | 30 minutes | 1 trial number for 14 days | None |
| Starter | $49 | 250 minutes | 2 | $0.20 |
| Growth | $199 | 1,300 minutes | 10 | $0.15 |
| Scale | $499 | 4,000 minutes | 25 | $0.12 |

Annual billing takes 20% off. Prices are in US dollars, as of November 1, 2026.

Ten clients who use 100 minutes each need 1,000 minutes, which fits Growth at about $20 per client. You set what each client pays you.

A client also counts against its own package, so it stops at whichever limit it reaches first. Calls past the limit forward to the business's transfer number or its owner's phone.

## What can't you white label?

A few places name LobbyStack because they run on its accounts:

- Your sign-in pages offer email and password without **Continue with Google**.
- Consent screens for Google Calendar and Instagram name LobbyStack when a business connects them.
- Texts come from LobbyStack's verified number. A customer's first appointment text and the reply to HELP name LobbyStack and the business.

On a call, the receptionist answers in the business's name.

## FAQ

### What is the difference between a white label AI agent and a reseller program?

Reseller is the looser word: some programs keep the vendor's brand on the product. A white label AI agent runs under your brand, and you set the price and bill the client. LobbyStack also has an [affiliate program](/affiliate-program/) if you only want to refer businesses.

### Do I need to know how to code?

Not for the branded dashboard. You need an API only to put the receptionist inside your own product, and a server administrator only to host it yourself.

### Can I make the receptionist match my client's colors?

The dashboard uses one brand color: yours. The receptionist answers by voice, so callers hear the business's name and greeting. LobbyStack's website widget has its own color setting, but website chat isn't part of hosted plans. On a self-hosted deployment, you can turn widget keys on.

### Can the agent use a custom or cloned voice?

No. Pick one of GPT-Live's voices for each business. LobbyStack doesn't clone voices.

### Does it answer text messages?

No. The receptionist answers calls. LobbyStack sends alerts and appointment texts, and it doesn't reply to inbound texts with AI.

## Start on the Free tier

[Create your partner account](/white-label/) with no card, add your brand and send one prospect a demo. If you want to read the code first, the [GitHub repository](https://github.com/lobbystack/lobbystack) has all of it.
