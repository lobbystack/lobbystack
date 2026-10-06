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
- GPT-Live gets the business summary, opening hours, upcoming closures, services, the answers the business wrote for common questions, its rules, and the titles of its knowledge sources when the call starts. It answers from those facts and doesn't delegate them. The worker writes the business summary with AI from the knowledge sources (`business.generateSummary`) a few minutes after they change, unless an operator wrote it. A sibling job (`business.extractHours`) fills the opening hours from the passages that state them, unless an operator set the hours. `businesses.hours_source` records who set them: `none`, `generated` or `operator`.
- Booking tools say why a time isn't bookable: no opening hours, closed that day, outside opening hours, a planned closure, no staff for the service, a calendar that hasn't synced, or taken. Only a taken time is reported as booked. With instant booking and no opening hours, the agent and GPT-Live take the caller's request as a message instead of offering times.
- The agent runs on the `AI_CHAT_*` endpoint and model, with `low` reasoning and OpenAI's `priority` processing tier. Set `AI_DELEGATION_MODEL`, `AI_DELEGATION_REASONING_EFFORT` and `AI_DELEGATION_SERVICE_TIER` to change that.
- When a step only calls tools whose result GPT-Live can say as is, the agent returns that result without a second model call. Those tools are hours, services, knowledge search, taking a message, an appointment request, and ending the call. A knowledge search sends GPT-Live the strongest passages as reference facts, and GPT-Live answers from them. Openings and bookings still go through the model.
- Every answer holds facts and the request's status, never instructions. GPT-Live's own instructions say what to do with each kind of result. The worker trims each answer to OpenAI's 500-token limit for an append.
- An answer that takes over 4 seconds gets a spoken "still checking" update. A step that needs another one sends quiet progress with `session.thinking.append`, such as "looked up open times. Nothing has been booked yet."
- The worker answers requests one at a time, in order. When the caller makes a new request before an older one finishes, the older result goes to GPT-Live as background facts instead of being spoken, and the newer request's agent sees it. Each request's agent also sees the actions earlier requests took and the latest lookup, so a changed request reschedules instead of booking twice.
- If OpenAI rejects an answer, the worker sends a short failure in its place, so the caller doesn't wait in silence.
- A booking repeated for the same caller, service and time returns the existing appointment instead of reporting the slot as taken.

GPT-Live waits for the caller by default. To make it greet first, the admin starts every session with the greeting command in its starting history (`input`), as OpenAI's guide suggests for context the model needs from the start. GPT-Live then says the greeting about 2 seconds into the session. In tests against the API, a greeting command appended after `session.started` was often ignored, and on phone calls the worker can only connect after the session has started.

If the worker hears no voice 4 seconds after its connection opens and the caller hasn't spoken, it sends the greeting command once more. It logs each step as `live.greeting` with `step`, `attempt`, `trigger` and `sinceAttachMs`. A `spoken` step with `attempt` 0 means the starting history did it.

The sideband also reflects `session.output_audio.delta` events, which OpenAI doesn't document for sidebands. They carry the receptionist's audio as 16-bit PCM at 24 kHz, silence included, because GPT-Live is full duplex. The worker counts a chunk as speech only when it's loud, for the greeting, the goodbye and the silence timeout. Words in the output transcript count as speech too. `live.closed` logs the events in `outputAudio`. Latency telemetry measures the receptionist's speech from the output transcript.

The worker logs each answer as `live.delegation` with `agentMs`, `totalMs`, `queueMs` (time waiting for an earlier request), `tools`, `modelSteps`, `directAnswer`, `stepMs` (each model step with the tools it called), `toolMs` (time in tools), `failed` and `superseded`. It also records each answer's tokens and cost as an AI generation with the operation `voice.delegation`.

## Follow a phone call

A Twilio Elastic SIP trunk sends calls for its numbers to your OpenAI project's SIP address. The call then goes through these steps:

1. OpenAI sends a `live.transport.incoming` webhook to `/api/webhooks/openai/live` on the admin app.
2. The admin reads the dialled number from the SIP `Diversion` header, then falls back to `To`, and finds the business.
3. The admin records the call and checks the plan's minutes while it loads the business snapshot. It rejects the call with SIP 486 (busy) when the plan is out of minutes, and 603 when the caller is blocked.
4. The admin accepts the call with the business's instructions, then asks the worker to attach.
5. The worker opens the sideband, then loads the business, speaks the greeting, and handles the call until it ends.

The caller hears ringing until step 4. The admin logs `live.incoming` with the milliseconds from the webhook's arrival to each step (`lookupMs`, `recordMs`, `acceptMs`, `attachMs`) and `eventAgeMs`, a rough delivery delay with one-second precision.

## Follow a browser call

Dashboard test calls, the website widget, prospect demos, and the landing site demo all start at `/api/voice/live/session`. The browser sends its WebRTC offer, and the admin:

1. checks who is calling: an operator from the dashboard, a widget session token from its allowed site, a prospect demo token, or the landing site's public demo business
2. applies rate limits, checks the plan's minutes, and loads the business snapshot
3. creates the GPT-Live session, records the call, and asks the worker to attach
4. returns OpenAI's answer so the browser connects its audio

The browser can only close the session. It can't change instructions or answer delegations. Before it sends its WebRTC offer, the browser waits for ICE candidate gathering to finish, for up to 10 seconds. When the caller hangs up, it sends `session.close` and mutes the microphone. It keeps the connection open until `session.closed` arrives, for up to 15 seconds. Prospect demos don't count against minutes, and their agent can only answer questions and take messages.

## What the worker does during a call

Once attached, the worker owns the call until OpenAI closes the session. It:

- speaks the business greeting as soon as the session starts
- saves each caller and receptionist turn to the transcript
- transfers phone calls with a SIP REFER to the destination number
- hangs up after the receptionist's goodbye has played, when the agent ends the call
- ends the call after 75 seconds without speech or audio from either side, or at the duration limit: 30 minutes for phone calls, and the plan's remaining minutes for browser calls. A request still being answered pauses the silence timer.
- records the final call state, billed seconds, and estimated cost
- copies OpenAI's stored recording into LobbyStack storage, where it follows the plan's retention
- reports the call to the dashboard's live-call count

The worker ends phone calls with OpenAI's SIP hangup and browser calls with `session.close`. Either way it keeps the sideband open until `session.closed` brings the final usage, for up to 15 seconds. If the connection drops first, it records the latest `session.usage.updated` seconds, or its own measurement when that's larger, and logs `usageConfirmed: false` on `live.closed`.

If the sideband connection fails before the session has sent anything, for example when OpenAI answers it with a 504, the worker reconnects up to 3 times, after about 250 ms, 500 ms and 1 second. Once the session has sent an event, a dropped sideband ends the call, because a new connection replays the last 3 seconds of events and could answer a request twice.

If the worker can't attach, the admin ends the session and records the call as `setup_failed`, so nothing talks or bills without the worker. A browser session that never started still costs OpenAI's 15-second setup charge, so the admin records those 15 seconds. The admin has no sideband, so it asks the worker to close browser sessions at `/internal/live/end`.

Only one worker answers each session. The worker takes a lock in Redis, `live-attach:<session id>`, when it attaches and renews it while the call runs.

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
