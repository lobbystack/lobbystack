---
title: "Self-hosted LobbyStack now runs on Telnyx or Twilio"
description: "Self-hosters can use Telnyx for phone numbers, calls and texts, for some countries or all of them."
pubDate: 2026-10-30
locale: "en"
canonicalSlug: "telnyx-self-hosting"
category: "Product"
---

If you self-host LobbyStack, you can now use Telnyx for phone numbers, calls and texts. Set `TELEPHONY_NUMBERS` to pick the countries you buy from Telnyx. You can buy US numbers from Telnyx and keep the rest on Twilio, or move every country.

LobbyStack buys each Telnyx number and connects it to GPT-Live over encrypted SIP. Your receptionist answers calls, transfers callers to your team, and forwards the calls it can't take. Texts go through the same number, and LobbyStack records what each call and text costs.

You can also move Verify and number lookups to Telnyx with their own settings, while your numbers stay on Twilio.

Hosted LobbyStack stays on Twilio, so hosted customers don't need to change anything. To set up Telnyx, follow the [self-hosting guide](https://docs.lobbystack.com/self-hosting/providers).
