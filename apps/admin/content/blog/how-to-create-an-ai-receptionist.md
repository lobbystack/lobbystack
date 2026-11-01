---
title: "How to create an AI receptionist with Claude or ChatGPT"
seoTitle: "How to Create an AI Receptionist Without Code"
description: "Create an AI receptionist without code: import your website, test it in your browser, then let Claude or ChatGPT fill in FAQs, hours and fixes in plain language."
pubDate: 2026-11-01T13:00:00-05:00
updatedDate: 2026-11-01T13:00:00-05:00
author: "LobbyStack Team"
category: "Guides"
featured: false
coverImage: "/illustrations/how-to-create-an-ai-receptionist-hero.webp"
coverImageAlt: "Beige LobbyStack cover card with the title How to create an AI receptionist with Claude or ChatGPT"
locale: "en"
canonicalSlug: "how-to-create-an-ai-receptionist"
---

To **create an AI receptionist** without code, sign up for a receptionist service, give it your website, test it in your browser, and connect Claude or ChatGPT to finish the setup in plain language. On LobbyStack the first pass takes about 10 minutes, and you don't need a card to start.

Your assistant can't answer your phone by itself. LobbyStack answers the calls on GPT-Live, the model behind ChatGPT Voice, and your assistant works on the setup: it reads your calls, writes FAQs and changes your hours. If you'd rather build from scratch, read [how to build an AI receptionist](/blog/how-to-build-an-ai-receptionist/) instead.

## What do you need before you start?

- your website address, if you have one
- a mobile phone that can receive a text, because LobbyStack can't verify internet (VoIP) numbers
- a Claude or ChatGPT account for steps 5 and 6

## Step 1: Create your account and import your website

[Sign up for free](/pricing/) and name your business. Enter your website address, and LobbyStack starts reading your public pages, such as services, about, FAQ, hours and contact. The read runs in the background, so you can move on while it works.

No website? Choose **I don't have a website**, then upload documents or paste text about your business.

## Step 2: Set your greeting and language

Write the first line callers hear, such as "Thanks for calling Northside Dental, how can I help?" Pick the language calls open in: English, French, Spanish, Serbian, German, Portuguese, Italian or Dutch. The receptionist switches when a caller asks or speaks another language.

New businesses start with the voice Marin, and you can pick another of [GPT-Live's voices](/blog/openai-voices/) later. LobbyStack doesn't clone voices.

## Step 3: Call it from your browser

Start a test call and talk the way a caller would. Ask about your prices, your hours and the thing customers always get wrong. Each wrong answer tells you what to add in step 6.

Test calls count toward the Free plan's 30 voice minutes, so keep them short.

## Step 4: Get a phone number

Verify your mobile with a 6-digit code, then pick a number. LobbyStack sells numbers in the United States, Canada and Puerto Rico, and without a paid plan your number is free for 14 days. During the trial, the receptionist transfers calls only to the mobile you verified. Call the number from any phone to hear your greeting.

## Step 5: Connect Claude or ChatGPT

LobbyStack runs an MCP server, a standard way for AI assistants to use outside tools. The [MCP page](/features/mcp/) lists what an assistant can do. The server address is `https://app.lobbystack.com/api/mcp`. You don't need to install anything for these two:

**Claude.** Go to **Customize** > **Connectors**, click **+ Add**, then **Add custom connector**. Name it LobbyStack, paste the address, and click through the sign-in. Pick your business, and uncheck anything Claude shouldn't do. The Free plan allows one custom connector. [The full steps](https://docs.lobbystack.com/ai/connect-claude) cover Team and Enterprise plans.

**ChatGPT.** Go to **Plugins**, click **+**, then **Add custom MCP server**. Name it LobbyStack, paste the address and choose OAuth. ChatGPT can change your data on Business, Enterprise and Edu plans. On Pro it can only read, so it can't add FAQs. [The full steps](https://docs.lobbystack.com/ai/connect-chatgpt) show each screen.

## Step 6: Let your assistant finish the setup

Start with this prompt. Copy it, fill in the brackets and send it:

```text
You're helping me set up my LobbyStack AI receptionist. First call get_business
and tell me what you see, then list my services.

Then ask me, one at a time, the 10 questions my callers ask most. I run
[type of business] in [city]. Write each answer as an FAQ in my own words,
show it to me, and add it with add_knowledge once I approve it.

Only add facts I gave you. Don't guess prices.
```

Once real calls come in, these prompts keep it sharp:

```text
Read my last 10 calls. List every question the receptionist couldn't answer,
and draft an FAQ for each one. Wait for my answers before you add them.
```

```text
Who called yesterday and didn't book? Show me the messages I still owe a reply.
```

```text
Close on Saturdays from now on. Show me the new hours before you change them.
```

Your assistant works with the permissions you approved, and LobbyStack records each change it makes in your audit log. You can disconnect it at any time under **Settings** > **API keys**.

## What can your assistant change, and what stays with you?

| Job | Who does it |
| --- | --- |
| Add FAQs and notes | Your assistant |
| Change opening hours | Your assistant |
| Read calls, transcripts and messages | Your assistant |
| Find contacts, and book or move appointments | Your assistant |
| Create your account and verify your mobile | You |
| Choose or buy a phone number | You, in the dashboard |
| Change the greeting, voice, rules and services | You, under **Agent** in the dashboard |
| Connect your calendar | You, because Google asks you to agree in a browser |

## Step 7: Send your real calls to it

Open **Agent** in the dashboard and check **AI settings**, **Knowledge**, **Services** and **Rules** one last time. To keep the number your customers already dial, [forward your business line](/blog/how-to-forward-business-calls/) to your LobbyStack number. Forward the calls you miss first, and move to all calls once you trust it.

## Can it use your brand colors?

Your callers hear your business name and greeting, so colors don't reach them. They matter in two other places:

- **Your dashboard, if you sell it to others.** With [White Label](/white-label/), you set a name, logo, favicon and brand color, and your clients see them on your own address. Connect Claude to your partner, then ask "Set our brand color to #0f766e." Our guide to [selling a white label AI agent](/blog/white-label-ai-agent/) has the rest.
- **A website widget.** The widget has its own color setting, but website chat isn't part of hosted plans. You can turn it on when you self-host.

## How much does it cost?

| Plan | Monthly price | Voice minutes | Extra minute |
| --- | --- | --- | --- |
| Free | $0 | 30 | None |
| Starter | $30 | 150 | $0.20 |
| Pro | $100 | 500 | $0.18 |

Annual billing takes 20% off. Starter and Pro include one number. Prices are in US dollars, as of November 1, 2026. See [what an AI receptionist costs](/blog/ai-receptionist-savings/) for how other vendors compare.

## FAQ

### How long does it take to create an AI receptionist?

About 10 minutes for the first pass on LobbyStack. A large website keeps reading in the background, and the FAQs in step 6 take as long as your answers do.

### Can ChatGPT answer my business phone?

Not by itself. ChatGPT has no phone line for your business. A service such as LobbyStack holds the number and answers on GPT-Live, and you can connect ChatGPT or Claude to manage it.

### Do I need to know how to code?

No. Every step in this guide happens in a website or a chat. If you want a coding assistant to build on the [API](https://docs.lobbystack.com/api/overview), you can do that later.

### Can it book appointments?

Yes. Add your services, connect Google Calendar or Cal.com, and set **Appointments** to **Books appointments**. Your assistant can book and move appointments too.

### Can it reply to text messages?

No. LobbyStack sends alerts and appointment texts, and it doesn't reply to inbound texts with AI.

## Create yours now

[Start on the Free plan](/pricing/) with no card, import your website, and call your receptionist from your browser. The [setup guide](https://docs.lobbystack.com/quickstart) covers each screen.
