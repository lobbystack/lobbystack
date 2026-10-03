# Understand the voice runtime

LobbyStack answers calls with OpenAI's GPT-Live model (`gpt-live-1`). OpenAI hosts the audio: phone calls reach it over SIP and browser calls over WebRTC. The admin app starts each call and the worker runs it. This page explains how a call flows, what each runtime does, and how to configure the phone path.

## How a GPT-Live call works

GPT-Live talks with the caller and hands anything that needs business data to LobbyStack. OpenAI calls this client delegation. The worker holds a sideband WebSocket to each session, receives the delegated request, and answers it with the agent core.

The agent core (`packages/agent-core`) is an AI SDK `ToolLoopAgent`. Its tools cover:

- business hours, services, and answers from the business's knowledge
- finding openings and booking, or taking a booking request, depending on the business's booking mode
- looking up, cancelling, and rescheduling a caller's appointment after verifying the caller
- taking a message for the team
- transferring the call (phone only) and ending it

The caller hears silence while the agent works, so calls keep it short:

- GPT-Live's instructions follow the structure in OpenAI's GPT-Live prompting guide: personality, backchannel and interruption policies, then a delegation policy that lists the backend's capabilities for this business.
- GPT-Live gets the business summary, opening hours, upcoming closures, services, the answers the business wrote for common questions, its rules, and the titles of its knowledge sources when the call starts. It answers from those facts and doesn't delegate them. The worker writes the business summary with AI from the knowledge sources (`business.generateSummary`) a few minutes after they change, unless an operator wrote it.
- The agent runs on the `AI_CHAT_*` endpoint and model, with `low` reasoning and OpenAI's `priority` processing tier. Set `AI_DELEGATION_MODEL`, `AI_DELEGATION_REASONING_EFFORT` and `AI_DELEGATION_SERVICE_TIER` to change that.
- When a step only calls tools whose result GPT-Live can say as is, the agent returns that result without a second model call. Those tools are hours, services, knowledge search, taking a message, an appointment request, and ending the call. A knowledge search sends GPT-Live the strongest passages as reference facts, within the 500-token limit for an append, and GPT-Live answers from them. Openings and bookings still go through the model.

The worker greets the caller after GPT-Live reports `session.started`, waits for OpenAI to acknowledge the greeting, and sends it again (up to three times) when it isn't acknowledged, OpenAI rejects it, or the receptionist stays silent. It logs each step as `live.greeting` with `step`, `attempt`, `trigger` and `sinceAttachMs`.

The worker logs each answer as `live.delegation` with `agentMs`, `totalMs`, `tools`, `modelSteps`, `directAnswer`, `stepMs` (each model step with the tools it called), `toolMs` (time in tools), and `failed`. It also records each answer's tokens and cost as an AI generation with the operation `voice.delegation`.

## Follow a phone call

A Twilio Elastic SIP trunk sends calls for its numbers to your OpenAI project's SIP address. The call then goes through these steps:

1. OpenAI sends a `live.transport.incoming` webhook to `/api/webhooks/openai/live` on the admin app.
2. The admin reads the dialled number from the SIP `Diversion` header, then falls back to `To`, and finds the business.
3. The admin records the call and checks the plan's minutes. It rejects the call with SIP 486 (busy) when the plan is out of minutes, and 603 when the caller is blocked.
4. The admin accepts the call with the business's instructions, then asks the worker to attach.
5. The worker opens the sideband, speaks the greeting, and handles the call until it ends.

## Follow a browser call

Dashboard test calls, the website widget, prospect demos, and the landing site demo all start at `/api/voice/live/session`. The browser sends its WebRTC offer, and the admin:

1. checks who is calling: an operator from the dashboard, a widget session token from its allowed site, a prospect demo token, or the landing site's public demo business
2. applies rate limits, checks the plan's minutes, and loads the business snapshot
3. creates the GPT-Live session, records the call, and asks the worker to attach
4. returns OpenAI's answer so the browser connects its audio

The browser can only close the session. It can't change instructions or answer delegations. Prospect demos don't count against minutes, and their agent can only answer questions and take messages.

## What the worker does during a call

Once attached, the worker owns the call until OpenAI closes the session. It:

- speaks the business greeting as soon as the session starts
- saves each caller and receptionist turn to the transcript
- transfers phone calls with a SIP REFER to the destination number
- ends the call after 75 seconds of silence, or at the duration limit: 30 minutes for phone calls, and the plan's remaining minutes for browser calls
- records the final call state, billed seconds, and estimated cost
- copies OpenAI's stored recording into LobbyStack storage, where it follows the plan's retention
- reports the call to the dashboard's live-call count

If the worker can't attach, the admin hangs up the session and records the call as `setup_failed`, so nothing talks or bills without the worker.

## Interruptions and background noise

OpenAI handles turn-taking. GPT-Live listens while it speaks, stops when the caller talks over it, and decides when the caller has finished. The session has no turn-detection or noise-reduction settings to tune. You can only shape this behavior through the live instructions in `packages/agent-core/src/instructions.ts`.

In the browser, the microphone runs with echo cancellation, noise suppression, and automatic gain control turned on. Phone audio arrives at OpenAI as the carrier sends it.

## Configure the runtime

The admin and worker read these variables:

| Variable | Service | Purpose |
| --- | --- | --- |
| `LIVE_PROTOTYPE_ENABLED` | admin, worker | Set to `true` to accept GPT-Live calls. Browser calls fail without it. |
| `OPENAI_API_KEY` | admin, worker | Creates, accepts, and ends sessions, and downloads recordings. |
| `OPENAI_WEBHOOK_SECRET` | admin | Verifies OpenAI's incoming-call webhook. Phone path only. |
| `INTERNAL_SERVICE_TOKEN` | admin, worker | Authenticates the admin's attach request to the worker. |
| `WORKER_INTERNAL_URL` | admin | Private URL of the worker's HTTP port, for example `http://worker:3002`. |
| `TWILIO_SIP_TRUNK_SID` | worker | Adds new phone numbers to the SIP trunk. The worker refuses to provision a number without it. |
| `WEB_CALL_MAX_DURATION_MS` | admin | Optional cap on browser call length. |
| `WEB_CALL_PUBLIC_BUSINESS_SLUG`, `WEB_CALL_ALLOWED_ORIGINS` | admin | The business the landing demo calls, and the sites allowed to start it. |
| `AI_CHAT_MODEL`, `AI_CHAT_REASONING_EFFORT` | admin, worker | The agent's model and, on OpenAI, its reasoning effort. Leave both blank for `gpt-6-luna` on `high`. |
| `AI_DELEGATION_MODEL`, `AI_DELEGATION_REASONING_EFFORT`, `AI_DELEGATION_SERVICE_TIER` | worker | The model, reasoning effort and OpenAI processing tier for answering GPT-Live's delegated requests during a call. Leave them blank to use the agent's model on `low` reasoning and the `priority` tier. |
| `AI_SUMMARY_MODEL`, `AI_SUMMARY_REASONING_EFFORT` | worker | The model and reasoning effort for the one-line summary written after each call. Leave both blank to use the agent's model on `low`. |

The worker listens on its health port for `/internal/live/attach`. Keep that port on the private network.

## Set up the phone path

The phone path needs an OpenAI project with SIP enabled and a Twilio account. To connect them:

1. In the OpenAI dashboard, add a webhook for `live.transport.incoming` that points to `https://your_app_domain/api/webhooks/openai/live`, and set its secret as `OPENAI_WEBHOOK_SECRET` on the admin.
2. In Twilio, create an Elastic SIP trunk with the origination URI `sip:your_openai_project_id@sip.api.openai.com;transport=tls`, and set its transfer mode to allow transfers to any number.
3. Set `TWILIO_SIP_TRUNK_SID` on the worker. New numbers join the trunk when you provision them, and provisioning fails without it.
4. Move each existing number onto the trunk with `scripts/operations/move-number-to-gpt-live.ts`.

The script only prints what it would change until you pass `--apply`:

```sh
pnpm exec tsx scripts/operations/move-number-to-gpt-live.ts \
  --business-id your_business_id --number +15815550123 --apply
```

A number off the trunk has nothing to answer its calls, so keep every number on it.
