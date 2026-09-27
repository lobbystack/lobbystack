---
title: "Our AI Voice Agent Now Runs on GPT-Live, the Model Behind ChatGPT Voice"
seoTitle: "AI Voice Agent on GPT-Live, the ChatGPT Voice Model"
description: "LobbyStack's AI voice agent now runs on OpenAI's GPT-Live, the model behind ChatGPT Voice. It keeps talking while it books, checks hours, and takes messages."
pubDate: 2026-09-26T21:00:00-04:00
author: "LobbyStack Team"
category: "Product updates"
featured: false
coverImage: "/illustrations/ai-voice-agent-gpt-live-hero.webp"
coverImageAlt: "A glowing voice waveform above a receptionist disc, linked to a calendar with a booked day, a message note, and a phone handset"
locale: "en"
canonicalSlug: "ai-voice-agent-gpt-live"
---

A caller asks whether you have anything Tuesday morning. With most AI voice agents, the line goes quiet while software checks the calendar. LobbyStack's AI voice agent keeps the conversation going while it checks, because it now runs on GPT-Live, the voice model OpenAI built for ChatGPT Voice.

Every LobbyStack call now runs on GPT-Live, on the phone and in the browser. This post covers what GPT-Live is, how we connected it to a receptionist that takes real actions, and what we learned in the switch.

## What GPT-Live is

OpenAI launched GPT-Live in ChatGPT in July 2026 and opened it to developers on September 10. It's the [default voice model for paid ChatGPT users](https://deploymentsafety.openai.com/gpt-live), so if you've used ChatGPT Voice on a paid plan, you've heard it.

OpenAI describes it as full-duplex: it listens and speaks at the same time, the way two people do on a phone call. A caller notices this in three places:

- When they cut in, it stops and listens instead of finishing its sentence.
- It tells a caller who is thinking apart from a caller who has finished.
- A quick "mm-hmm" or "right" doesn't throw it off.

OpenAI's [developer announcement](https://community.openai.com/t/introducing-gpt-live-1-in-the-api/1396471) compares it with its previous realtime voice model. Turn-taking is about 43% faster, and the share of benchmark tasks completed on the first try nearly doubled.

## A voice model that acts for your business

ChatGPT Voice answers questions. A receptionist has to get things done: check the calendar, book the slot, write down the message, and pass the call to a person when it matters.

GPT-Live handles this with what OpenAI calls delegation. When a caller asks for something that needs your business data, GPT-Live hands the task to software you control and [keeps speaking while that work runs](https://developers.openai.com/api/docs/guides/live-delegation). The caller hears a receptionist who stays on the line with them.

In LobbyStack, those tasks go to one agent with tools for:

- your hours, services, and answers from the knowledge you've added
- finding openings and booking, or taking a request for your team to confirm
- looking up, moving, or cancelling an appointment after verifying the caller
- taking a message for your team
- transferring the call to a person

A reasoning model picks the right tool and follows your rules, such as your booking mode, your transfer number, and when a caller needs verifying. The voice model does the talking.

Your website chat uses the same agent. A visitor typing on your site gets the same answers, the same openings, and the same booking rules as someone calling.

## How our architecture changed

Before the switch, phone audio took a longer path. Twilio streamed each call to a voice gateway we ran ourselves, and the gateway relayed the audio to OpenAI's Realtime API and back. Every word crossed our servers twice.

Now OpenAI hosts the audio. Phone calls reach it through a Twilio SIP trunk, and browser calls connect over WebRTC. Our app starts each call, and a background worker answers the agent's requests, saves the transcript, and stores the recording.

That removes a service from the call path and from the list of things we operate. With every number moved, we're retiring the gateway, which also makes LobbyStack simpler for teams who [self-host it](/solutions/self-hosted-ai-receptionist/).

## What we learned switching

We ran GPT-Live in staging, then on real browser calls, and then moved our own phone number before any customer's. A few lessons stood out.

**Calls feel faster.** With our relay gone and a model built for turn-taking, the receptionist answers sooner and talks over callers less. We noticed it on the first test call.

**Answers got better when talking and thinking split up.** Our old setup asked one model to hold the conversation and run the business logic at once. Now the voice model keeps the caller company while a reasoning model with real tools works out the answer. In our testing it picked the right tool and the right time more reliably, and it checks each answer against what the business told us.

**The receptionist should speak first.** GPT-Live waits for the caller to speak by default. A front desk greets the caller, so we send the greeting the moment the session starts and callers hear your business name right away. If you build on GPT-Live, test the first three seconds of every call.

**Phone numbers arrive in an unexpected header.** With a Twilio SIP trunk, the number the caller dialed comes in the SIP `Diversion` header, not `To`. Our first staging calls failed until we read it from there.

**Short calls still cost something.** OpenAI bills a short minimum when it creates a browser session. We kept our rule that calls under 10 seconds are free for customers, and we now track what those calls cost us so wrong numbers never show up on a bill.

**One agent pays off.** Because chat and calls share the same tools, every fix and every new capability reaches both at once.

## What this means for your business

Callers judge an AI voice agent by whether they get what they called for. With GPT-Live, LobbyStack sounds more like a good front desk:

- Callers get answers and bookings without hold music or long silences.
- You choose whether the agent books directly, takes requests for your team to confirm, or doesn't book at all.
- Your phone line and your website give the same answers.
- Every call comes with a transcript, a recording, and a summary in your dashboard.

LobbyStack is open source under the MIT license. You can run it yourself or let us host it. Either way you get the same AI phone receptionist.

## Questions about GPT-Live and LobbyStack

### Is this the same model as ChatGPT Voice?

GPT-Live-1 is the model ChatGPT Voice uses by default for paid users. LobbyStack connects it to your business through delegation, so it can check your calendar and book appointments, which ChatGPT on its own can't do for your customers.

### What is an AI voice agent?

An AI voice agent is software that answers calls in natural speech and completes tasks during the call, such as booking an appointment or taking a message. LobbyStack's AI voice agent works as a receptionist for small businesses that miss calls while they're busy with customers.

### Do I need to change my phone number?

No. Starter and Pro include a dedicated LobbyStack number. Forward your current number to it, or send only after-hours and overflow calls its way.

## Hear it for yourself

The fastest way to judge a voice model is to talk to one. Try the call button on [our homepage](/) and ask it about LobbyStack, or [create a free account](https://app.lobbystack.com/signup) and test your own receptionist from the browser in a few minutes. See [pricing](/pricing/) when you're ready to put it on your phone line.
