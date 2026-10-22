---
title: "OpenAI voices: the full list for GPT-Live, TTS and ChatGPT"
seoTitle: "OpenAI voices list: GPT-Live, TTS and ChatGPT voices"
description: "OpenAI voices as of October 2026: the GPT-Live voice table, the Realtime and text-to-speech lists, ChatGPT's nine app voices, and which ones the API accepts."
pubDate: 2026-10-16T10:00:00-04:00
updatedDate: 2026-10-16T10:00:00-04:00
author: "LobbyStack Team"
category: "Guides"
featured: false
coverImage: "/illustrations/openai-voices-hero.webp"
coverImageAlt: "Light beige card with a small dot pattern and the title OpenAI voices: the full list for GPT-Live, TTS and ChatGPT in black type"
locale: "en"
canonicalSlug: "openai-voices"
---

OpenAI voices come in four lists, one per product. As of October 16, 2026, GPT-Live defaults to `marin` and its voice table lists 21 more voices. The Realtime API has 10 voices, and the text-to-speech endpoint has 13. ChatGPT's app has nine named voices, such as Juniper and Cove, and no API product lists any of them.

We run a phone receptionist on GPT-Live, so we keep track of these lists. The tables below come from OpenAI's documentation and SDK on that date.

## OpenAI voices by product

| Product | Model | Voices | Default or recommended |
| --- | --- | --- | --- |
| GPT-Live | `gpt-live-1` | `marin` plus 21 in the voice table | `marin` is the default |
| Realtime API | `gpt-realtime` models | 10 | OpenAI recommends `marin` or `cedar` |
| Text to speech | `gpt-4o-mini-tts` | 13 | OpenAI recommends `marin` or `cedar` |
| Text to speech, older models | `tts-1`, `tts-1-hd` | 9 | None stated |
| ChatGPT app | GPT-Live-1 and GPT-Live-1 mini | 9 named voices | You pick one in Settings |

A voice name in one list doesn't guarantee it works in another. `fable`, `nova` and `onyx` exist only for text to speech, and the 21 GPT-Live voices in the next table exist only in GPT-Live.

## GPT-Live voices

GPT-Live is OpenAI's full-duplex voice model, the one ChatGPT Voice runs on. You set the voice with `audio.output.voice` when the session starts, and you need a new session to change it. [OpenAI's voice table](https://developers.openai.com/api/docs/guides/live-conversations#voice-options) lists these voices in addition to the default `marin`:

| Voice | API name | Language | Regional influence | Presentation | Source |
| --- | --- | --- | --- | --- | --- |
| Quartz | `quartz` | English | Australian | Feminine | Generated |
| Ripple | `ripple` | English | Australian | Masculine | Natural |
| Vesper | `vesper` | English | British | Masculine | Natural |
| Willow | `willow` | English | Irish | Feminine | Natural |
| Stone | `stone` | English | Irish | Masculine | Natural |
| Gleam | `gleam` | English | North American | Feminine | Natural |
| Meridian | `meridian` | English | North American | Masculine | Natural |
| Bossa | `bossa` | Portuguese | Brazilian | Feminine | Natural |
| Tempo | `tempo` | Portuguese | Brazilian | Masculine | Natural |
| Beacon | `beacon` | English | Filipino | Masculine | Generated |
| Delta | `delta` | English | Southern US | Feminine | Generated |
| Cinder | `cinder` | English | Southern US | Masculine | Generated |
| Nuri | `nuri` | German | Not listed | Feminine | Natural |
| Juni | `juni` | German | Not listed | Feminine | Natural |
| Flitz | `flitz` | German | Not listed | Masculine | Natural |
| Brise | `brise` | French | Not listed | Feminine | Natural |
| Sillage | `sillage` | French | Not listed | Masculine | Natural |
| Nira | `nira` | Hindi | Not listed | Feminine | Natural |
| Harema | `harema` | Japanese | Not listed | Feminine | Natural |
| Shida | `shida` | Japanese | Not listed | Masculine | Natural |
| Noeul | `noeul` | Korean | Not listed | Feminine | Natural |

OpenAI's [GPT-Live announcement](https://community.openai.com/t/introducing-gpt-live-1-in-the-api/1396471) on September 10, 2026 introduced the first 12 rows. OpenAI's Node SDK (version 7.35.0) also accepts the older Realtime names for Live sessions: `alloy`, `ash`, `ballad`, `cedar`, `coral`, `echo`, `sage`, `shimmer` and `verse`.

The table has no Spanish voice. If your callers speak Spanish, test a few voices with your own greeting before you choose. "Regional influence" describes a voice's speaking style, so a voice with an Irish influence still speaks English.

GPT-Live sessions cost [$0.05 a minute, billed per second](https://developers.openai.com/api/docs/models/gpt-live-1), whichever voice you pick.

## Realtime API voices

The [Realtime API](https://developers.openai.com/api/docs/guides/realtime-conversations#voice-options) offers 10 built-in voices:

`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin` and `cedar`

You can set the voice when the session starts or on a response. Once the model has spoken in a session, the voice stays fixed. OpenAI recommends `marin` or `cedar` for the best quality.

## OpenAI text-to-speech voices

The speech endpoint on `gpt-4o-mini-tts` has 13 built-in voices, per OpenAI's [text-to-speech guide](https://developers.openai.com/api/docs/guides/text-to-speech):

`alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer`, `verse`, `marin` and `cedar`

The older `tts-1` and `tts-1-hd` models support 9 of them: `alloy`, `ash`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage` and `shimmer`. OpenAI says these voices are optimized for English. You can hear each one on [OpenAI.fm](https://www.openai.fm/), OpenAI's demo site.

Text to speech reads a script aloud. It can't hold a conversation, so a phone agent built on it needs separate speech recognition and turn-taking. GPT-Live and the Realtime API handle both.

## What are the ChatGPT voice names?

ChatGPT's app has nine voices. [OpenAI's help center](https://help.openai.com/en/articles/20001274-chatgpt-voice) describes them like this:

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

You pick one in ChatGPT under Settings, then Voice. Since July 8, 2026, ChatGPT Voice runs on GPT-Live: [GPT-Live-1 for paid users and GPT-Live-1 mini for free users](https://deploymentsafety.openai.com/gpt-live).

An earlier voice, Sky, left the lineup in May 2024. [Bloomberg reported](https://www.bloomberg.com/news/articles/2024-05-20/openai-to-pull-johansson-soundalike-sky-s-voice-from-chatgpt) that OpenAI paused it after listeners compared it to Scarlett Johansson's voice.

## Can you use ChatGPT's voices in the API?

Not by name. As of October 16, 2026, none of the nine ChatGPT names appears in OpenAI's GPT-Live voice table, the Realtime list, the text-to-speech list or the Node SDK's voice type. Some third-party model directories list Juniper or Breeze as GPT-Live API voices. OpenAI's documentation doesn't.

You can get the same model. GPT-Live-1 in the API is the model that ChatGPT Voice uses by default for paid users. If you want a receptionist that sounds like ChatGPT, start with `gpt-live-1` and try the built-in voices by ear. Our guide on [how to build an AI receptionist with the ChatGPT voice](/blog/how-to-build-an-ai-receptionist/) covers the phone side.

## How do you create a custom OpenAI voice?

OpenAI's [custom voices guide](https://developers.openai.com/api/docs/guides/custom-voices) describes two ways:

- **From a description.** Prompt-to-voice builds a voice from a text prompt. All API customers can use it, creating a voice costs nothing, and the voice works only with GPT-Live. You pay normal session rates when you use it.
- **From a recording.** You upload a consent recording, in which the voice actor reads a fixed consent phrase, plus a sample. This needs custom-voice API access. The voice works with GPT-Live, text to speech, the Realtime API and Chat Completions audio.

OpenAI's guidelines ask you not to impersonate anyone, to use adult voices only, and to tell listeners that the speech comes from AI.

## Which OpenAI voice should a business phone line use?

Pick by listening, with your own script. Some practical checks:

- **Match your callers.** A business in Dublin might try `willow` or `stone`. A clinic in Texas might try `delta` or `cinder`.
- **Test the greeting.** Your business name, street names and service names are where a voice trips. Say them in the test.
- **Test on a phone.** Call audio sounds thinner than a laptop speaker, so judge the voice over a real call.
- **Plan for one voice per call.** GPT-Live fixes the voice for the session, so it can't change mid-call.

LobbyStack, our AI receptionist, runs every call on `gpt-live-1` with the default `marin` voice. If you self-host it, change `DEFAULT_VOICE` in [`packages/agent-core/src/live/session.ts`](https://github.com/lobbystack/lobbystack/blob/main/packages/agent-core/src/live/session.ts) to any GPT-Live voice. The code is [open source under the MIT license](/solutions/open-source-ai-receptionist/). Hosted accounts use `marin`; the dashboard has no voice picker today.

## OpenAI voice questions

### What is OpenAI's default voice?

`marin` is the default voice for GPT-Live sessions. For the Realtime API and text to speech, OpenAI recommends `marin` or `cedar` for the best quality.

### Can you change the voice during a call?

No. GPT-Live needs a new session to change the voice. In the Realtime API, the voice stays fixed once the model has spoken in the session.

### Which OpenAI voices speak French or German?

GPT-Live has two French voices, `brise` and `sillage`, and three German voices, `nuri`, `juni` and `flitz`. OpenAI says the text-to-speech voices are optimized for English.

### Is the ChatGPT voice on TikTok available to developers?

The clips use one of the nine ChatGPT app voices, and the API doesn't offer those names. Developers get the same GPT-Live model and its own voice list. Our [GPT-Live post](/blog/ai-voice-agent-gpt-live/) explains how we connected that model to a receptionist.

## Hear a GPT-Live voice on a call

Press the call button on [our homepage](/) to talk to LobbyStack's receptionist on `gpt-live-1` and `marin`. To hear it answer for your own business, [create a free account](https://app.lobbystack.com/en/signup): the Free plan gives you 30 voice minutes a month with no card, and a US or Canadian number free for 14 days. See [pricing](/pricing/) for paid plans.
