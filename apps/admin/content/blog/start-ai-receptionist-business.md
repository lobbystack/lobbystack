---
title: "How to start an AI receptionist business"
seoTitle: "How to Start an AI Receptionist Business: Agency Guide"
description: "Start an AI receptionist business in six steps: pick a niche, demo from the prospect's website, price packages, onboard fast, get paid on Stripe, then support."
pubDate: 2026-10-27T12:00:00-04:00
author: "LobbyStack Team"
category: "Guides"
featured: false
coverImage: "/illustrations/start-ai-receptionist-business-hero.webp"
coverImageAlt: "Beige LobbyStack cover card with the title How to start an AI receptionist business"
locale: "en"
canonicalSlug: "start-ai-receptionist-business"
---

An **AI receptionist business** sets up AI phone receptionists for local businesses and charges them each month to keep them running. You pick a type of business, show each prospect a receptionist built from their own website, sell a package of minutes, and handle setup and support. A white label platform runs the calls under your brand.

This guide walks through the six steps of starting an AI receptionist agency on [LobbyStack White Label](/white-label/). The steps apply to other platforms too, and our [comparison of white label AI voice agent platforms](/blog/white-label-ai-voice-agent-platforms/) can help you pick one. If you want to know what the MIT license lets you do with LobbyStack's code, read the [license post](/blog/lobbystack-mit-license-ai-receptionist-resellers/) instead. This one is about selling.

## Step 1: Pick one niche

Pick one kind of business to start. A receptionist for a dental office books cleanings and flags emergencies. One for a plumber asks for the address, checks the service area and sends burst pipes to the owner's phone. Selling to one niche lets you reuse the same setup, the same demo script and the same answers to objections.

Choose a niche where:

- the owner is often on a job or with a patient and can't answer
- one missed call can be a lost job
- calls follow a few patterns: book, quote, emergency, question
- you already know people, or speak the trade's language

Home services, dental offices, salons and property managers fit that list. Our solution pages show what a receptionist does in each: [HVAC](/solutions/ai-receptionist-for-hvac/), [plumbers](/solutions/ai-receptionist-for-plumbers/), [dental offices](/solutions/ai-receptionist-for-dental-offices/), [salons and spas](/solutions/ai-receptionist-for-salons-and-spas/) and [property management](/solutions/property-management-answering-service/). Use them to plan the questions your receptionist should ask.

## Step 2: Demo from the prospect's own website

Show prospects their own business. A demo built from their website already knows their services and hours, so the first question they ask gets a real answer.

In the LobbyStack partner console, open **Demos** and click **Create demo**. Enter the prospect's business name and website, add a greeting, and write two or more questions they can try, such as "Can I get a quote for a water heater?" LobbyStack reads the website and builds the receptionist. When the demo is ready, publish it and send the secure link. It opens on your domain, under your brand, and the prospect starts a voice call in the browser.

A few things to know:

- Demo calls use your partner pool's minutes. The Free tier includes 30 minutes, enough for a few demos.
- A demo expires 30 days after you create it, and you can rotate the link or turn it off.
- When the prospect clicks **Claim this receptionist**, the demo becomes one of your businesses with the prospect as owner, and keeps any settings you changed.

The [demos guide](https://docs.lobbystack.com/white-label/demos) has the full steps.

## Step 3: Price your packages

You set your own prices. On the **Packages** page, each package has a name, a monthly price, an allowance of voice minutes and chats, and an optional one-time setup fee.

Price from your costs. On LobbyStack, you pay for a partner tier, and all your clients share its pool:

| Tier | Monthly price | Shared pool | Phone numbers included |
| --- | --- | --- | --- |
| Free | $0 | 30 minutes, 50 chats | One 14-day trial number |
| Starter | $49 | 250 minutes, 1,000 chats | 2 |
| Growth | $199 | 1,300 minutes, 5,000 chats | 10 |
| Scale | $499 | 4,000 minutes, 10,000 chats | 25 |

Prices as of October 2026. Annual billing takes 20% off.

These numbers illustrate the math and aren't market rates. Say you have 8 clients who each use about 150 minutes a month. That's 1,200 minutes, which fits Growth's 1,300-minute pool, and Growth includes 10 numbers. Your platform cost is $199 a month, about $25 per client. If you sold each client a package at $150 a month, you'd collect $1,200, less Stripe's processing fees and your own time. Run the same math with your own prices and your clients' real call volume.

Three decisions shape each package:

- **Setup fee.** Charge once for the work of reading the client's website, writing their rules and testing calls. Stripe collects it at checkout, before the first call.
- **Monthly allowance.** Size it to the client's call volume with some room. A business that gets 5 calls a day at 3 minutes each uses about 450 minutes in a 30-day month.
- **Overage cap.** Turn overage on for a client, set your rate per minute and per chat, and cap the monthly total. You and the client get alerts at 80% and 100%. With overage off or at the cap, calls forward to the client's transfer number or the owner's phone.

Be honest with yourself about value. LobbyStack also sells direct: Pro costs $100 a month for 500 minutes. A client could sign up there. They pay you for the setup, the tuning, the support and someone to call, so make that work visible in your package.

## Step 4: Onboard each client fast

Once your first client is set up and working, save that setup as a **template**. On the **Businesses** page, open the client's **More actions** menu and choose **Save as template**. A template copies receptionist settings, hours, services, rules, FAQs, texts and documents. It leaves out the client's name, website, phone numbers and owner.

For the next client in the same niche:

1. Click **Create a business**, enter the name and time zone, and pick the template.
2. Pick the package, or mark the business as billed outside LobbyStack.
3. Choose **Full access**, so the owner can edit the receptionist, or **Activity only**, so they see calls and you manage the setup.
4. Enter the owner's email. LobbyStack sends your invitation under your brand.
5. Add the client's website on the **Knowledge** page, connect Google Calendar, and set a transfer number.
6. Call the number and test every rule before you hand it over.

If you onboard many clients, make a platform key on the **API keys** page and use the `lobbystack onboard` command. It builds a business from one YAML file and only changes what differs when you run it again. The [API keys guide](https://docs.lobbystack.com/white-label/api-keys) has an example file.

## Step 5: Get paid through Stripe Connect

Connect your own Stripe account on the **Payments** page. Clients then pay at a Stripe checkout in your company's name and in your account's currency. Stripe sends the invoices, retries failed cards, and keeps refunds and disputes in your Stripe dashboard. LobbyStack never holds your clients' money.

Before you take the first payment:

- Turn on tax collection in your Stripe account if you need it. You set that up yourself.
- Know that each package renews on the 1st of the month, in UTC. The first invoice charges for the rest of that month.
- Decide which clients you'll bill some other way, and mark those businesses billed outside LobbyStack.

## Step 6: Support clients, and hand them over when it's time

Your clients see your brand, so they contact you. Plan for the questions you'll get in the first week: "Why did it book that?", "Can it say our prices?", "Why did it transfer this call?" Open the client's dashboard from your console to look at a call. The business's audit log records who on your team opened it, and the owner can see each visit.

You're also responsible for your clients' legal duties: call recording consent, AI disclosure where the law requires it, and consent for texts. Put those in your client contract.

Some clients will leave, or want to run the receptionist themselves. Only you can **release** a business. Its owner keeps the setup and starts paying LobbyStack directly. The release turns off the webhooks your team set up and ends your team's access, so the owner leaves with a working receptionist and your systems stop getting their data. If you stop paying for your tier, your businesses keep answering for 30 days, which gives you time to release them.

## Can you run an AI receptionist business on your own servers?

Yes. LobbyStack's code is MIT licensed, and every partner feature works on a self-hosted deployment, using your own Twilio and OpenAI accounts. That suits an agency whose clients need their call records in the agency's own database. The [build story of White Label](/blog/white-label-ai-receptionist/) explains which providers turn on which features, and the [self-hosted pricing page](/pricing/self-hosted/) lists support plans.

## FAQ

### How much does it cost to start an AI receptionist business?

On LobbyStack, you can start for $0. The Free tier needs no card and includes 30 minutes, 50 chats and one 14-day trial number. When your first client signs, Starter costs $49 a month, as of October 2026.

### How do you sell AI voice agents to local businesses?

Show each prospect a receptionist built from their own website, and let them call it. Then offer a package with a setup fee and a monthly allowance, and test every rule with them before launch.

### Do I need to know how to code to start an AI agency?

No. You set up each receptionist in the console, in plain language. Code helps only if you want to create clients through the API or self-host the platform.

## Start your AI receptionist agency

[Create a free partner account](/white-label/) and build a demo for your first prospect today. If you'd rather earn a commission without running clients yourself, the [affiliate program](/blog/ai-receptionist-affiliate-program/) pays 20% for 12 months on each referral.
