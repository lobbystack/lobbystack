---
title: "How to build an AI receptionist with the ChatGPT voice"
seoTitle: "How to build an AI receptionist that sounds like ChatGPT"
description: "How to build an AI receptionist on GPT-Live, the model behind ChatGPT Voice: which voices the API offers, phone setup, platforms, open-source stacks and costs."
pubDate: 2026-10-16T09:00:00-04:00
updatedDate: 2026-10-16T09:00:00-04:00
author: "LobbyStack Team"
category: "Guides"
featured: false
coverImage: "/illustrations/how-to-build-an-ai-receptionist-hero.webp"
coverImageAlt: "Light beige card with a small dot pattern and the title How to build an AI receptionist with the ChatGPT voice in black type"
locale: "en"
canonicalSlug: "how-to-build-an-ai-receptionist"
---

To build an AI receptionist that sounds like ChatGPT, connect OpenAI's GPT-Live API to a phone line through a SIP trunk or a partner such as Twilio, then give the model tools to book, take messages and transfer calls. You get the model behind ChatGPT Voice, `gpt-live-1`. You don't get the app's voice names: the API has its own voice list, with `marin` as the default.

The rest of the job is choosing how much of the stack you want to own. Below are five ways to start, what each one costs as of October 16, 2026, and the work each one leaves on your desk.

## Which voice is "the ChatGPT voice"?

The voice people hear when they talk to ChatGPT in the app, and in all those TikTok clips of people chatting with it, is one of nine voices. You pick one in ChatGPT under Settings, then Voice. [OpenAI's help center](https://help.openai.com/en/articles/20001274-chatgpt-voice) describes them like this:

| ChatGPT voice | OpenAI's description |
| --- | --- |
| Arbor | Easygoing and versatile |
| Breeze | Animated and earnest |
| Cove | Composed and direct |
| Ember | Confident and optimistic |
| Juniper | Open and upbeat |
| Maple | Cheerful and candid |
| Sol | Savvy and relaxed |
| Spruce | Calm and affirming |
| Vale | Bright and inquisitive |

On July 8, 2026, OpenAI moved ChatGPT Voice to GPT-Live, a model that listens and speaks at the same time, the way two people do on a call. GPT-Live-1 became the [default voice model for paid ChatGPT users](https://deploymentsafety.openai.com/gpt-live), and GPT-Live-1 mini the default for free users. The nine voices carried over. Each TikTok creator picked one from that list, so no single name owns "the ChatGPT voice."

### Can you use a ChatGPT voice through the API?

Not by name. As of October 16, 2026, none of the nine ChatGPT names appear in OpenAI's [GPT-Live voice options](https://developers.openai.com/api/docs/guides/live-conversations#voice-options) or in the voice list of OpenAI's Node SDK (version 7.35.0). A few third-party model directories list Juniper or Breeze as API voices. OpenAI's own documentation doesn't.

The API gives you three things instead:

- **The same model family.** OpenAI's [developer announcement](https://community.openai.com/t/introducing-gpt-live-1-in-the-api/1396471) on September 10, 2026 says GPT-Live-1 brings "ChatGPT's natural, full-duplex voice conversations to the API."
- **Its own voices.** `marin` is the default. OpenAI's voice table adds 21 more, including English voices with Australian, British, Irish, North American, Southern US and Filipino accents, plus voices for Brazilian Portuguese, French, German, Hindi, Japanese and Korean.
- **Custom voices.** [Prompt-to-voice](https://developers.openai.com/api/docs/guides/custom-voices) builds a voice from a text description. Creating one costs nothing, and it works only with GPT-Live. OpenAI's guidelines ask you not to impersonate anyone, so describe the voice your business needs instead of trying to clone a ChatGPT voice.

Our [list of OpenAI voices](/blog/openai-voices/) covers every API voice and which product accepts it.

## Option 1: Build on the GPT-Live API yourself

GPT-Live talks with the caller and hands anything that needs data to a backend you run. OpenAI calls that hand-off [delegation](https://developers.openai.com/api/docs/guides/live-delegation). For a receptionist, your backend holds the business: hours, services, open slots, the booking and the transfer number.

For phone calls, you write:

- a webhook that receives `live.transport.incoming` and accepts or rejects each call, setting the model, instructions and voice when it accepts
- a sideband WebSocket to each session that receives delegated requests, transcripts and keypad presses
- the tools themselves: calendar lookups and bookings, messages, caller verification, transfers through OpenAI's `refer` endpoint, and hang-ups
- storage for transcripts and recordings, plus a screen where the owner can read them

OpenAI's [GPT-Live-1 model page](https://developers.openai.com/api/docs/models/gpt-live-1) prices voice sessions at $0.05 a minute, billed per second. The backend model and its tools cost extra at their normal rates. The API's Free usage tier can't use GPT-Live, and the Build tier allows 50 calls at once.

This path gives you full control, and no platform takes a cut of the per-minute price. It also hands you every edge case. One example from our own logs: GPT-Live waits for the caller to speak first, so we start each call with a greeting command. From October 3 to 8, 2026, it greeted from that command on 24 of 40 calls that connected audio. Our [voice runtime notes](https://github.com/lobbystack/lobbystack/blob/main/docs/voice/runtime.md) explain the retries we added for the other calls.

## Option 2: Connect GPT-Live to a phone number

OpenAI doesn't provide phone numbers, so you need a carrier. OpenAI's [telephony guide](https://developers.openai.com/api/docs/guides/voice-sip) describes two ways to connect one:

- **Direct SIP.** Your carrier sends call audio straight to OpenAI over a SIP trunk, with TLS signaling and SRTP audio. Your server only handles webhooks, session settings and tools. LobbyStack uses this path with a Twilio Elastic SIP trunk. [Bandwidth](https://dev.bandwidth.com/docs/voice/integrations/openai/live/sip/) publishes a guide for inbound calls over SIP.
- **Server audio bridge.** Your server carries the audio between the carrier and GPT-Live over WebRTC or WebSocket. Twilio's [Agent Connect](https://www.twilio.com/en-us/blog/developers/twilio-openai-gpt-live-1-api-resources) includes a `GPTLiveProvider` that links Twilio Media Streams to GPT-Live-1. [Telnyx](https://developers.telnyx.com/docs/voice/sip-trunking/gpt-live-configuration-guide) documents outbound calling with its Voice API.

Direct SIP means less code on your side, because OpenAI hosts the audio. A bridge gives you the audio stream if you want to process it yourself, and your server then manages both connections and the call lifecycle.

Carrier rates come on top of OpenAI's. Check them on the carrier's page, such as [Twilio Voice pricing](https://www.twilio.com/en-us/voice/pricing/us), for your country and number type.

## Option 3: Use a no-code voice agent platform

Hosted voice agent platforms run the audio, the phone numbers and the model, and you set up the agent in their dashboard. [Vapi supports GPT-Live](https://docs.vapi.ai/gpt-live/overview), and its [beta opened to every Vapi customer](https://vapi.ai/blog/gpt-live-beta) on October 2, 2026. Vapi says existing phone numbers, tools and tests carry over.

[Retell AI](https://www.retellai.com/use-cases/receptionists) and other platforms also sell receptionist-style voice agents. If the ChatGPT sound is the reason you're shopping, ask each platform whether it runs `gpt-live-1`. OpenAI's [partner guide](https://developers.openai.com/api/docs/guides/live-partner-integrations) warns that a Realtime integration isn't automatically compatible with GPT-Live.

Platforms get you to a working test call fastest. You pay their rates on top of the model, or bundled with it, and you rebuild booking rules, transfers and follow-ups inside their editor. Leaving later means rebuilding them again.

## Option 4: Start from an open-source voice framework

Open-source frameworks handle audio, turn-taking and the connection to the model, and you host them:

- [LiveKit Agents](https://docs.livekit.io/agents/models/realtime/plugins/gpt-live) includes GPT-Live in its OpenAI plugin as `GPTLiveModel`. Its `voice` setting defaults to `marin`.
- [Pipecat](https://docs.pipecat.ai/api-reference/server/services/s2s/openai-live) has an OpenAI Live service.

You own the code and avoid platform fees. You still write the receptionist on top: the calendar tools, the transfer rules, call history and a dashboard for the business. Our [build or buy guide](/blog/build-or-buy-ai-receptionist/) lists that work in detail.

## Option 5: Start from an open-source AI receptionist

An open-source receptionist ships the parts that options 1 through 4 leave to you. [LobbyStack](/solutions/self-hosted-ai-receptionist/) runs every phone and browser call on `gpt-live-1`, and its agent already has tools for:

- business hours, services and answers from your website, PDFs and FAQs
- finding openings and booking into Google Calendar, or taking a booking request for your team
- moving or cancelling an appointment after verifying the caller
- taking messages and transferring calls to a person

Each call comes with a transcript, a recording and a summary in the dashboard. We wrote up the switch in [our GPT-Live post](/blog/ai-voice-agent-gpt-live/).

## The five options compared

| Path | Voice model | What you still build | Cost you can check |
| --- | --- | --- | --- |
| GPT-Live API | `gpt-live-1`, default `marin` | Call control, tools, storage, dashboard | $0.05 a minute, plus backend model and carrier |
| Carrier plus GPT-Live | `gpt-live-1` | Tools, storage, dashboard | Carrier rates plus OpenAI |
| Vapi | `gpt-live-1` (beta) | Receptionist logic in their editor | Vapi's pricing page |
| LiveKit or Pipecat | `gpt-live-1` through a plugin | Tools, storage, dashboard, hosting | Hosting, OpenAI and carrier |
| LobbyStack, self-hosted | `gpt-live-1`, `marin` | Provider accounts and setup | Hosting, OpenAI and Twilio |
| LobbyStack Cloud | `gpt-live-1`, `marin` | Your business details | Free plan with 30 voice minutes a month; $30 a month for 150 minutes |

Prices checked October 16, 2026.

## How much does it cost to build an AI receptionist?

On the API path, add three lines. OpenAI charges $0.05 per voice minute, so a 3-minute call costs $0.15 before anything else. The backend model that answers delegated requests costs extra and depends on the model you choose and how much it works per call. Your carrier bills the phone number and minutes. OpenAI's [cost guide](https://developers.openai.com/api/docs/guides/voice-latency-cost) gives the formula: voice seconds divided by 60, times the voice rate, plus backend costs.

That bill leaves out engineering time: somebody has to write the tools, test calls and fix the ones that go wrong. A hosted receptionist folds that work into one price. LobbyStack's Starter plan is $30 a month for 150 minutes, then $0.20 a minute, and calls under 10 seconds and spam calls don't count. Our [AI receptionist cost guide](/blog/ai-receptionist-savings/) compares 17 vendors.

## Can you build an AI receptionist for free?

Not on the API path, because OpenAI's Free tier doesn't include GPT-Live and carriers charge for numbers and minutes. Free software helps: LobbyStack is MIT-licensed, so self-hosting it costs nothing beyond your servers and provider bills.

To try one without paying, LobbyStack's Free plan gives you 30 voice minutes a month with no card, and a US or Canadian number free for 14 days. After 14 days the number stops answering unless you upgrade, and you keep testing in the browser. The plan itself doesn't expire.

## Why we recommend LobbyStack

We build LobbyStack, so weigh this section with that in mind. For a receptionist with the ChatGPT sound, it removes the most work:

- **It runs on the model behind ChatGPT Voice.** Every call uses `gpt-live-1` with OpenAI's default voice, `marin`. It doesn't use one of the nine ChatGPT app voices, because the API doesn't offer them.
- **The voice is one line of code.** On your own install, change `DEFAULT_VOICE` in [`packages/agent-core/src/live/session.ts`](https://github.com/lobbystack/lobbystack/blob/main/packages/agent-core/src/live/session.ts) to any GPT-Live voice. Hosted accounts use `marin`; the dashboard has no voice picker today.
- **It's open source under the MIT license.** Read the [license](https://github.com/lobbystack/lobbystack/blob/main/LICENSE), fork the code, change the prompts or resell it.
- **It deploys from one button on Railway.** The [LobbyStack Railway template](https://railway.com/deploy/lobbystack) deploys the admin, the worker, a migration service, PostgreSQL, Redis and a storage bucket. Railway generates every secret and database password. You paste an OpenAI API key and your Twilio credentials.

Browser test calls work as soon as the deploy finishes. Email, phone calls, website import and Google Calendar need more setup. For phone calls, that means an OpenAI webhook, with its secret on the admin, and a Twilio Elastic SIP trunk, with its ID on the worker. The [self-hosting guide](https://docs.lobbystack.com/self-hosting/overview) walks through both, and a [Docker Compose guide](https://docs.lobbystack.com/self-hosting/docker-compose) covers your own servers.

## Questions about building an AI receptionist

### Is GPT-Live the same model as ChatGPT Voice?

GPT-Live-1 is the default voice model for paid ChatGPT users, and the API serves it as `gpt-live-1`. Free ChatGPT users get GPT-Live-1 mini.

### Can I choose a different voice in LobbyStack?

Yes, if you self-host. Set `DEFAULT_VOICE` in `packages/agent-core/src/live/session.ts` to another GPT-Live voice, such as `cedar` or one of the regional voices. OpenAI fixes the voice for a whole session, so the change applies to new calls.

### Do I need Twilio?

For phone calls on LobbyStack, yes: calls reach GPT-Live through a Twilio Elastic SIP trunk. Browser calls need no carrier. If you build your own stack, Telnyx, Bandwidth and other SIP carriers work too.

### Can a receptionist built this way book appointments?

Only if you give it a booking tool. GPT-Live talks, and your backend checks the calendar and writes the booking. LobbyStack books into Google Calendar, or takes requests for your team to confirm.

## Hear the voice before you build

The fastest test is a call. Press the call button on [our homepage](/) and ask the receptionist about LobbyStack. To try it with your own business, [create a free account](https://app.lobbystack.com/en/signup), or deploy the [Railway template](https://railway.com/deploy/lobbystack) and run it yourself. See [pricing](/pricing/) when you want a phone number.
