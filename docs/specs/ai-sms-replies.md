# Spec: AI text replies

Status: built behind a per-business flag that is off everywhere. Don't turn it on for any business until the new terms below go live.

## Problem Statement

When a customer texts a business's number, LobbyStack saves the text and alerts the team. The receptionist answers phone calls, website chats and Instagram messages, but it doesn't answer texts.

Two limits shape the feature:

- A customer can't be asked for a Business Number or EIN to start AI texting.
- The live terms and Help Center say LobbyStack doesn't reply to texts with AI.

## Solution

The receptionist answers texts to a business's own number when that business has `businesses.text_replies_enabled` on. Canadian recipients need no paperwork from the customer. Canadian numbers texting Canadian recipients need no US registration, though carrier filtering still applies.

US-bound recipients get no AI reply from a cloud business, because no campaign covers them yet. Their texts reach the team as they do today. [Business SMS registration](business-sms-registration.md) lifts that block later.

Turning the feature on never asks for a Business Number or EIN. `pnpm text-replies:set` is the only way to turn it on, and only the host can run it. A dashboard switch waits for the new terms.

## How a reply works

1. `receiveInboundSms` saves the text in its usual transaction.
2. It queues an `sms.aiReply` job when all of these hold:
   - The text isn't a compliance keyword.
   - The conversation is on `ai_active`.
   - The contact isn't blocked.
   - `textReplyBlockedReason` finds nothing in the way.
3. With no job queued, the team gets the usual alert. With a job queued, the alert is held back, because the customer doesn't need a person yet.
4. `replyToTextMessage` in `apps/worker/src/textReplyJobs.ts` reads the context, reserves the conversation's chat for the day from the plan's allowance, writes the reply with the shared receptionist agent, and saves it.
5. The saved reply goes through `sms.send`, which checks the sending rule again.

A newer text has its own job, which answers both. A compliance keyword isn't a newer text: it has no job, so the question before it keeps its own. `NO_REPLY` works as it does on Instagram: the receptionist stays quiet after "thanks" or a lone emoji, and when the other side is another business's bot.

## What blocks a reply

`textReplyBlockedReason` runs every `smsReplyBlockedReason` check, then adds three:

| Reason | When it applies |
|---|---|
| `text_replies_off` | The business's flag is off. |
| `shared_sender` | The sender is the shared toll-free number. |
| `sms_registration_required` | A cloud business would text a US-bound number, from a +1 number or any other. |

The check runs at three points: when the text arrives, when the job starts, and when `sms.send` takes the message. Turning the flag off stops replies already in the queue.

### Recipient regions

`smsRecipientRegion` in `packages/shared/src/smsReach.ts` returns `us`, `canada` or `other`:

- **`canada`:** an area code on the list of Canadian area codes.
- **`other`:** a +1 number in a Caribbean country, or a number outside +1.
- **`us`:** every other +1 number. That covers Puerto Rico, the US Virgin Islands, Guam, the Northern Mariana Islands and American Samoa. It also covers area codes the lists don't know, so a new Canadian overlay stays blocked until someone adds it.

`isUsCanadaOrPuertoRicoPhone` lumps these together and can't make this decision.

A sender outside +1, such as a UK number, gets the same block for US-bound recipients and can reach everyone else. A cloud business's US number can also reply to a Canadian recipient, because registration covers US-bound traffic. Twilio's guidance on that route needs a check on staging before a US business goes on.

### Inbox replies stay as they are

The rule covers AI replies only. A team member's reply to a US number still goes to Twilio and can fail with error 30034. Blocking those replies changes live behaviour with the flag off, so the registration spec does it along with its per-reason inbox message.

### The shared number

The shared toll-free number can't carry AI replies. Twilio requires a toll-free number to map 1:1 to one business, and error 30478 declines one that doesn't. Inbound texts to it never reach `receiveInboundSms`, and the delivery path texts from the business's own number. `shared_sender` holds that line if a deployment points both at one number.

## Limits

| Limit | Value | What happens past it |
|---|---|---|
| Reply length | 320 characters | The reply is cut at the last full sentence that fits. |
| Replies per conversation | 5 in 5 minutes | Handoff to the team, with an alert. This is the loop guard. |
| Replies per conversation | 20 in 24 hours | Handoff to the team, with an alert. |
| Replies per business | 500 in 24 hours | No reply, with the usual alert. The conversation stays with the receptionist. |
| Plan allowance | One chat per conversation per UTC day | No reply, with the usual alert. |

Instagram's loop guard allows 15 replies in 5 minutes. Texts cost money per segment, so this one trips sooner.

A text thread stays open for good, so the usage key holds the day: `chat:<conversationId>:<date>`. A key without it would pay once and answer forever, because `reserveUsageInTransaction` allows a key it has seen.

## Team handoff

A text conversation works like an Instagram chat once the flag is on:

- A team member who replies in the inbox takes the conversation over.
- **Take over** and **Resume AI** appear on text conversations.
- The receptionist can't transfer anyone. It offers to take a message, and the team replies in the same thread.
- A failed reply alerts the team on the job's final attempt.
- A reply that fails after a tool saved a message or booked alerts the team at once and doesn't retry, because a retry would do it again. A worker killed mid-job can still repeat it.
- On a business with no owner, the unanswered-text alert goes to its partner's owners and admins by email. No webhook event covers an inbound text.

With the flag off, an inbox reply doesn't change `automation_state` and the buttons stay hidden.

`TEXT_CHAT_CHANNELS` stays as it is, so the inbox's SMS filter at `apps/admin/app/api/messages/route.ts:38` keeps working. `isWrittenChannel` in `packages/shared/src/chatChannels.ts` tells the agent that SMS is a written channel.

## Trust

The sender's number isn't verified the way caller ID is, because SMS sender IDs can be spoofed. The job doesn't pass it as `callerPhone`, so a text can't change or cancel an appointment. The receptionist sends those requests to the team. The number goes into the prompt, so the receptionist can use it for bookings and messages.

The first reply in a conversation opens with a fixed line in the business's default language, such as "Automated assistant for Javor. Reply STOP to opt out." The job adds it after the length cut, so neither the model nor the cut can drop it. The whole text still fits in 320 characters. A customer who writes in another language still gets this line in the business's language.

## Compliance keywords

The receptionist never answers these. Each gets its fixed reply, or Twilio's for opt-outs:

| Meaning | Keywords |
|---|---|
| Opt out | `STOP`, `STOPALL`, `UNSUBSCRIBE`, `END`, `QUIT`, `CANCEL`, `OPT OUT`, `REVOKE`, `ARRET` |
| Opt back in | `START`, `UNSTOP`, `SUBSCRIBE` |
| Help | `HELP`, `INFO`, `AIDE` |

Matching ignores case, spaces, punctuation and accents, so `ARRÊT` and `opt-out` count.

`YES` opts a customer back in only when they had opted out. Otherwise it goes to the receptionist, because "Shall I book Tuesday at 9?" gets that answer. That holds when Twilio marks the text `OptOutType=START`, which it does for `YES` as well as `START` and `UNSTOP`. With Advanced Opt-Out on, Twilio sends its own confirmation for an opt-in keyword, which LobbyStack can't stop. The shared number holds no conversations, so `YES` always counts there.

A keyword text and its fixed reply carry `sender_role` `compliance`. The job ignores those rows when it looks for the newest text and leaves them out of the receptionist's history, so `HELP` can't strand a question waiting for its job. `provider_status` can't mark them, because delivery updates overwrite it.

These keywords changed for live traffic too, with the flag off. `OPT OUT`, `REVOKE` and `ARRET` now record an opt-out, and `INFO` and `AIDE` get the `HELP` reply.

## Cost

`recordSmsProviderPricing` now records `sms_provider` cost for AI replies too. It used to skip them, because AI replies didn't exist. AI generation cost arrives through `recordAiGenerationEvent` under the operation `sms.aiReply`.

Text replies draw on the chat allowance and have no add-on. The `billing.ai_sms` parity entry stays excluded for add-on billing, and its patterns still forbid the names `ai_sms`, `sms_ai`, `sms.processInbound` and `sms.reply`.

## Turning it on for a business

1. Publish the new terms and Help Center text.
2. Confirm the business has a Canadian number, or that its customers are Canadian.
3. Run:

```bash
pnpm text-replies:set --business business_id --on
```

`--off` turns it off. The command writes an audit log row.

## Draft copy

Nothing below is live. `apps/admin/src/marketing/lib/legal/terms-en.ts:109` and its translations still promise no AI replies.

### Terms, section 9.1

Each draft replaces the last sentence of 9.1.

- **English:** LobbyStack does not send marketing texts. When a business turns on AI text replies, the Service's AI assistant answers texts sent to that business's number. The assistant says it is automated, and replying STOP ends texts from that number.
- **French:** LobbyStack n’envoie pas de SMS marketing. Lorsqu’une entreprise active les réponses par IA, l’assistant IA du Service répond aux SMS envoyés au numéro de cette entreprise. L’assistant indique qu’il est automatisé, et répondre STOP met fin aux SMS de ce numéro.
- **Spanish:** LobbyStack no envía mensajes de texto publicitarios. Cuando un negocio activa las respuestas con IA, el asistente de IA del Servicio responde los mensajes de texto enviados al número de ese negocio. El asistente indica que es automatizado, y responder STOP pone fin a los mensajes de ese número.
- **Serbian:** LobbyStack ne šalje marketinške SMS poruke. Kada firma uključi AI odgovore na SMS poruke, AI asistent Usluge odgovara na poruke poslate na broj te firme. Asistent navodi da je automatizovan, a odgovor STOP prekida poruke sa tog broja.

### Help Center, `mintlify/integrations/sms.mdx`

Line 16:

> LobbyStack doesn't send marketing, promotions, age-gated content, or manual SMS conversations from its notification number. AI text replies come from your business's own number.

Line 26:

> When a customer texts your business number, LobbyStack saves the message in **Messages**. With AI text replies on, the receptionist answers customers outside the US and alerts your team when it can't. US numbers, including US territories, get no AI reply until your business registers for US texting, so your team gets an alert instead. With AI text replies off, LobbyStack alerts your team and the AI doesn't reply. `STOP`, `START` and `HELP` get fixed replies. The shared toll-free number takes no conversations and answers only `STOP`, `START`, and `HELP`.

French, `mintlify/fr/integrations/sms.mdx`:

> Ligne 16 : LobbyStack n'envoie pas de marketing, de promotions, de contenu soumis à une limite d'âge ni de conversations SMS manuelles depuis son numéro de notifications. Les réponses SMS par IA partent du numéro de votre entreprise.

> Ligne 26 : Quand un client envoie un texto à votre numéro d'entreprise, LobbyStack enregistre le message dans **Messages**. Avec les réponses par IA activées, le réceptionniste répond aux clients hors des États-Unis et alerte votre équipe quand il ne peut pas répondre. Les numéros américains, y compris ceux des territoires américains, ne reçoivent aucune réponse de l'IA tant que votre entreprise n'est pas inscrite pour les textos vers les États-Unis : votre équipe reçoit plutôt une alerte. Avec les réponses par IA désactivées, LobbyStack alerte votre équipe et l'IA ne répond pas. `STOP`, `START` et `HELP` reçoivent des réponses fixes. Le numéro sans frais partagé ne prend aucune conversation et répond seulement à `STOP`, `START` et `HELP`.

Spanish, `mintlify/es/integrations/sms.mdx`:

> Línea 16: LobbyStack no envía marketing, promociones, contenido con restricción de edad ni conversaciones manuales por SMS desde su número de notificaciones. Las respuestas por SMS con IA salen del número de su negocio.

> Línea 26: Cuando un cliente envía un mensaje de texto al número de su negocio, LobbyStack guarda el mensaje en **Mensajes**. Con las respuestas con IA activadas, la recepcionista responde a los clientes fuera de Estados Unidos y avisa a su equipo cuando no puede responder. Los números de Estados Unidos, incluidos sus territorios, no reciben respuesta de la IA hasta que su negocio se registre para enviar SMS a Estados Unidos, así que su equipo recibe un aviso. Con las respuestas con IA desactivadas, LobbyStack avisa a su equipo y la IA no responde. `STOP`, `START` y `HELP` reciben respuestas fijas. El número gratuito compartido no acepta conversaciones y solo responde a `STOP`, `START` y `HELP`.

## Verification

- Unit tests cover the region classifier, each blocked reason, the reply job, the length cut and the provider cost.
- `textReplies.integration.test.ts` covers the flag, the keywords, the limits and the handoff against PostgreSQL.
- `pnpm replacement:parity` lists the feature as `sms.text_replies`.
- Before the first business goes on, send a real text on staging from a Canadian number and from a US number. The Canadian one gets a reply. The US one gets an alert and no reply.

## Open decisions

1. **Do the terms cover more than section 9.1?** Section 3.1 lists what the Service does and leaves out texts. The privacy policy needs to say texts go to the AI provider. Recommendation: change all three together.
2. **Does a heavy text business pay more?** A text conversation uses one chat a day, and can hold 20 replies a day. Recommendation: watch `sms_provider` cost per business for a month before adding a price.
3. **Who sees the dashboard switch?** Recommendation: owners and admins, under the phone number settings, once the terms are live.

## Sources

- [Error 30478](https://www.twilio.com/docs/api/errors/30478)
- [ISV onboarding overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv)
- [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out)
- [Twilio support for opt-out keywords](https://support.twilio.com/hc/en-us/articles/223134027-Twilio-support-for-opt-out-keywords-SMS-STOP-filtering)
