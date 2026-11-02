---
title: "How to add an AI receptionist to your SaaS with an API"
seoTitle: "AI Receptionist API: Add Call Answering to Your SaaS"
description: "Use an AI receptionist API to give each customer of your SaaS a receptionist and a phone number, with curl examples for setup, numbers, webhooks and limits."
pubDate: 2026-11-01T09:00:00-05:00
updatedDate: 2026-11-01T09:00:00-05:00
author: "LobbyStack Team"
category: "Guides"
featured: false
coverImage: "/illustrations/ai-receptionist-api-hero.webp"
coverImageAlt: "Beige LobbyStack cover card with the title How to add an AI receptionist to your SaaS with an API"
locale: "en"
canonicalSlug: "ai-receptionist-api"
---

An **AI receptionist API** lets your software create a receptionist for each of your customers, buy it a phone number and read every call from your own code. With LobbyStack, one platform key does all of that through the v1 API, and your customers stay inside your product.

This guide walks through the requests in order. It suits a booking tool, a practice management system, a field service app or any SaaS whose customers miss calls. You need a server that can make HTTPS requests and receive a webhook.

## What should an AI receptionist API cover?

A voice agent API gives you a talking agent, and you build the job around it. A receptionist API starts one level higher: the job already exists, and you configure it for each customer.

| You need | Voice agent API | LobbyStack v1 API |
| --- | --- | --- |
| The conversation | Your prompt, tools and call logic | A receptionist on [GPT-Live](/blog/ai-voice-agent-gpt-live/), set up with a greeting, rules and knowledge |
| What it knows | Your own retrieval | Website reads, files, FAQs and notes through `/knowledge` |
| Booking | Your calendar tools | Services, availability and appointments, with Google Calendar, Cal.com or Calendly |
| Phone numbers | Your carrier account, or the vendor's | `POST /phone-numbers/search` and `POST /phone-numbers/claims` |
| Each customer's data | Your tenancy model | One business per customer, reached with a `LobbyStack-Business` header |
| What happened on the call | Your own logging | Summaries, outcomes and transcripts through `/calls` and webhooks |

If you need outbound campaigns or a custom call flow, a voice agent API fits better. Our [Vapi comparison](/blog/vapi-alternative/) covers that choice.

## Step 1: Get a platform key

[Sign up as a partner](https://docs.lobbystack.com/white-label/sign-up), the account LobbyStack gives companies that serve many businesses. Then open the partner console's **API keys** page and create a key with these scopes:

- `businesses:create`, `business:read` and `business:write`
- `knowledge:read` and `knowledge:write`
- `phone_numbers:manage` and `phone_numbers:purchase`, which you turn on as **Find, buy and replace phone numbers**
- `calls:read`, `appointments:read`, `messages:read` and `webhooks:manage`

Keep the key on your server. The Free tier lets you build and test every step except buying a number, which needs a [paid tier](https://docs.lobbystack.com/white-label/tiers).

## Step 2: Create a business for each customer

Each of your customers becomes one business. Leave `owner_email` out, so LobbyStack sends nobody an invitation and your key runs the business:

```bash
curl https://app.lobbystack.com/api/v1/businesses \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "Idempotency-Key: $YOUR_CUSTOMER_ID-business" \
  -H "Content-Type: application/json" \
  -d '{"name":"Harbor Dental","timezone":"America/Toronto","locale":"en"}'
```

`POST /businesses` requires an `Idempotency-Key`, and a retry with the same value returns the business it already created. The response wraps the new business in `data`. Store `data.id` next to your customer record, and send it as `LobbyStack-Business` on every request from here on. `locale` sets the language calls open in: `en`, `fr`, `es`, `sr`, `de`, `pt`, `it` or `nl`. The receptionist switches when a caller asks or speaks another language.

## Step 3: Teach the receptionist the business

Point it at the customer's website. The first read takes a sample of the site, and `POST /knowledge/sources/{source_id}/expand` reads the rest:

```bash
curl https://app.lobbystack.com/api/v1/knowledge/sources \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"type":"website","url":"https://harbordental.example"}'
```

Then set how it answers:

```bash
curl -X PATCH https://app.lobbystack.com/api/v1/receptionist \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"greeting":"Thanks for calling Harbor Dental, how can I help?","transfer_mode":"on_urgent","transfer_number":"+14165550100","booking_mode":"request"}'
```

Set `transfer_number` on every business your key runs. A business with no owner has nobody else to reach, so LobbyStack refuses calls the receptionist can't take when the number is missing.

Your product already holds much of this data. Map your customer's services to `POST /services`, their FAQs to `POST /knowledge` and their policies to `POST /rules`, so a settings page in your app becomes the receptionist's setup.

## Step 4: Buy a phone number

Search, then claim an offer within 5 minutes. LobbyStack sells numbers in the United States, Canada and Puerto Rico:

```bash
curl https://app.lobbystack.com/api/v1/phone-numbers/search \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"country":"CA","area_code":"416"}'

curl https://app.lobbystack.com/api/v1/phone-numbers/claims \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Idempotency-Key: $YOUR_CUSTOMER_ID-number" \
  -H "Content-Type: application/json" \
  -d '{"offer_token":"token_from_the_search"}'
```

A claim costs money, so it requires an `Idempotency-Key`. Poll `GET /phone-numbers/claims/{claim_id}` until its status reads `claimed` or `failed`. Your customer can then [forward their existing line](/blog/how-to-forward-business-calls/) to the new number and keep the one their clients already dial.

Finish with `POST /onboarding/complete`. Send `{"skip_number":true}` for a business that has no number yet.

## Step 5: Get every call back into your product

Subscribe an endpoint for each business, so you never need to poll:

```bash
curl https://app.lobbystack.com/api/v1/webhooks \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://api.yourapp.example/hooks/lobbystack","events":["call.completed","appointment.booked","message.taken"]}'
```

The response carries the signing secret once, so store it then. Payloads follow the [Standard Webhooks format](https://docs.lobbystack.com/api/webhooks), and the `data` of `call.completed` has the same shape as `GET /calls`: `outcome`, `summary`, `caller_phone`, `duration_seconds` and more. `GET /calls/{call_id}` returns the transcript.

Show those in your customer's dashboard. Sum `duration_seconds` by business if you want to meter usage on your own invoices.

## How do you bill your customers?

You bill them yourself, inside your SaaS. LobbyStack's [packages](https://docs.lobbystack.com/white-label/packages) need an owner to pay at checkout, so a business with no owner can't take one. You pay LobbyStack one [tier](/white-label/) for a pool of minutes that all your businesses share:

| Tier | Monthly price | Pool | Numbers included | Extra minute |
| --- | --- | --- | --- | --- |
| Starter | $49 | 250 minutes | 2 | $0.20 |
| Growth | $199 | 1,300 minutes | 10 | $0.15 |
| Scale | $499 | 4,000 minutes | 25 | $0.12 |

Annual billing takes 20% off. Each extra number costs what LobbyStack pays for it, billed monthly. Prices are in US dollars, as of November 1, 2026.

## What limits should you plan around?

- **Rate limits.** Each key makes 120 requests a minute. Your keys share 30 new businesses an hour and 20 number searches in 10 minutes.
- **Number limits.** Your businesses buy up to 2 numbers a day or your tier's included count, whichever is more. Over 30 days they buy up to 5, or twice your included count. A business can replace its number once.
- **Calendars.** Google, Cal.com and Calendly each ask a person to agree in a browser, so the API can't connect a calendar alone. `POST /calendars/google/connect` and the matching `calcom` and `calendly` routes return a link, and whoever opens it signs in as an admin of the business. Invite that person with `POST /team/invitations`, which needs `team:manage`, or use `booking_mode` `off` or `request` if your product holds the calendar.
- **Handover.** A key can't invite an owner later, so you can't release a business you created without one. Use `owner_email` for customers who may want their own login.
- **Alerts.** Your partner's owners and admins get the operational emails, such as a failed transfer or a calendar that stopped syncing. [The Help Center lists them](https://docs.lobbystack.com/white-label/api-keys#run-businesses-from-your-own-product).

## Can a coding assistant do this for you?

Yes. Keep the key in your environment and give Claude Code, Codex or Cursor a prompt like this:

```text
Read https://app.lobbystack.com/api/v1/openapi.json and
https://docs.lobbystack.com/white-label/api-keys.

Add a server-side LobbyStack client to this app. When a customer turns on call
answering, create a business with no owner_email, read their website, set the
greeting and transfer number from their settings, and save the business ID.
Add a webhook route that verifies the signature and stores call.completed.
Read the key from LOBBYSTACK_PLATFORM_KEY. Never send it to the browser.
Show me the plan before you write code.
```

The OpenAPI document needs no key, and LobbyStack generates it from the schemas the server validates against. The `lobbystack onboard` command also builds a business from [one YAML or JSON file](https://docs.lobbystack.com/api/cli), which helps when your team sets up customers by hand.

## FAQ

### What is an AI receptionist API?

An AI receptionist API is a set of HTTP endpoints that create and run a phone receptionist from your own software. You set its knowledge, greeting and rules, give it a number, and read calls, messages and appointments back. LobbyStack's API lives at `https://app.lobbystack.com/api/v1`.

### Do my customers see LobbyStack?

Callers hear the business's name, and your customers use your product. Text messages run on LobbyStack's verified number, so a customer's first appointment text and the reply to HELP name LobbyStack. The [White Label overview](https://docs.lobbystack.com/white-label/overview) lists each place.

### Can my customers choose the voice?

Yes, from GPT-Live's voices, with `voice` on `PATCH /receptionist`. LobbyStack doesn't clone voices.

### Does the receptionist answer text messages or website chat?

No. LobbyStack sends alerts and appointment texts, and its receptionist doesn't reply to inbound texts with AI. Website chat isn't part of hosted plans, so `POST /widget-keys` returns `403` there.

### Can I self-host instead?

Yes. LobbyStack is [MIT licensed](https://github.com/lobbystack/lobbystack), and the [Railway template](https://docs.lobbystack.com/self-hosting/overview) deploys the admin, the worker and their data stores. You supply OpenAI and Twilio credentials, then finish the email and phone steps the guide lists. On your own deployment, you make host keys with `pnpm platform-key:create`.

## Build your first business

[Sign up as a partner](/white-label/) on the Free tier and run steps 1 to 3 against one test business, then open it in the console and place a browser test call. The [API overview](https://docs.lobbystack.com/api/overview) and [platform key guide](https://docs.lobbystack.com/white-label/api-keys) cover the rest.
