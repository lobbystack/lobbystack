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

The sideband also receives copies of the call's audio, as OpenAI's [server-side controls guide](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live) describes: the receptionist's as `session.output_audio.delta` and the caller's as `session.input_audio.append`. Both carry 16-bit PCM at 24 kHz. The receptionist's audio includes silence, because GPT-Live is full duplex, so the worker counts a chunk as speech only when it's loud, for the greeting, the goodbye and the silence timeout. Words in the output transcript count as speech too, so all three keep working if OpenAI stops sending the audio events. The worker only measures the caller's audio. `live.closed` logs both in `outputAudio` and `inputAudio`. Latency telemetry measures the receptionist's speech from the output transcript.

Keypad presses on phone calls reach the sideband as `transport.dtmf.received`, an event OpenAI sends only to sidebands. The worker adds each press to the caller's turn as `[pressed 1]`. The saved transcript and the next delegated request both show it, and a press resets the silence timeout.

The worker logs each answer as `live.delegation` with `agentMs`, `totalMs`, `queueMs` (time waiting for an earlier request), `tools`, `modelSteps`, `directAnswer`, `stepMs` (each model step with the tools it called), `toolMs` (time in tools), `failed` and `superseded`. It also records each answer's tokens and cost as an AI generation with the operation `voice.delegation`.

## Greet the caller before they speak

GPT-Live waits for the caller by default. To make it greet first, the admin starts every session with the greeting command in its starting history (`input`), as OpenAI's guide suggests for context the model needs from the start. In tests against the API, GPT-Live ignored a command appended after `session.started` more often, and on phone calls the worker can only connect after the session has started.

GPT-Live doesn't always follow the command. From October 3 to 8, it greeted from the starting history on 24 of 40 calls that connected audio: 8 of 15 phone calls and 16 of 25 browser calls. When it did, it spoke 1.9 to 4.2 seconds after the worker attached.

If the worker hears no voice 4 seconds after the session starts and the caller hasn't spoken, it sends the command with `session.instructions.append`. GPT-Live can acknowledge that command and still wait: it ignored 8 of 16 acknowledged commands until the caller spoke, or for the rest of the call. When it followed one, it spoke within 4 seconds of the acknowledgment. So after 4.5 seconds without voice from either side, the worker sends the command again, up to 3 commands in all.

The worker stops sending the command once the receptionist or the caller speaks, or the call starts ending. It doesn't resend a command that OpenAI rejected or never acknowledged. OpenAI's guide says an acknowledgment waits until the session timeline reaches the end of the command, so it stays pending on a call whose audio never connected.

The worker logs each step as `live.greeting` with these fields:

- `step`: `sent`, `acknowledged`, `spoken` or `failed`
- `attempt`: the number of commands sent so far. A `spoken` step with `attempt` 0 means the starting history worked, and with `attempt` 2 that the second command did.
- `trigger`: `fallback` for the first command and `retry` for the others
- `sinceAttachMs`: milliseconds since the worker attached
- `inputAudioMs`: milliseconds of caller audio OpenAI has reflected to the sideband so far

### Why a call goes without a greeting

GPT-Live skips the command on phone and browser calls at similar rates. On the October calls, the session also kept running through the silence before the caller spoke:

- On every phone call that connected audio, the receptionist's reflected audio started 200 ms into the session and ran until 1.3 to 3.9 seconds before the call ended, whether or not anyone spoke. On a call where nobody spoke for 75 seconds, it covered 73.0 of 75.5 seconds.
- OpenAI acknowledged each greeting command on those calls within 0.7 seconds of the send, so the session timeline was moving.
- Twilio's Elastic SIP trunks offer G.711 (PCMU and PCMA) by default. Twilio's [codec page](https://www.twilio.com/docs/sip-trunking/codecs) lists voice activity detection and discontinuous transmission only for AMR-NB, a codec Twilio enables only on request. The trunk API has no silence settings.

The two calls whose greeting command was never acknowledged had no audio at all: the reflected output audio never arrived, and OpenAI closed the command with "The session closed before the estimated context injection completed." No greeting change fixes those calls.

To check whether audio reaches GPT-Live while a phone caller is silent, compare `inputAudioMs` on the call's `live.greeting` steps with `sinceAttachMs`, and `inputAudio.coveredMs` on `live.closed` with `durationMs`. Coverage close to the elapsed time means audio flowed through the silence. Coverage that grows only while the caller talks means the trunk or the carrier stops sending audio in silence. Zero on browser calls too means OpenAI isn't reflecting the caller's audio.

OpenAI's [Live conversations guide](https://developers.openai.com/api/docs/guides/live-conversations) recommends a recorded or rendered clip for exact wording and a known end. On phone calls, Twilio sends the audio straight to OpenAI, so LobbyStack has no way to play one. Twilio would have to play the clip before it connects the call to OpenAI, or LobbyStack would have to relay the call's audio itself. The browser controls its own playback, so a browser call could play a clip while it holds back GPT-Live's audio.

## Follow a phone call

A Twilio Elastic SIP trunk sends calls for its numbers to your OpenAI project's SIP address. The call then goes through these steps:

1. OpenAI sends a `live.transport.incoming` webhook to `/api/webhooks/openai/live` on the admin app.
2. The admin finds the business from the dialled number. It tries each number in the SIP `Diversion` headers in order, then `To` and `P-Called-Party-ID`, and uses the first one that belongs to a business. On a forwarded call, the first `Diversion` can hold the business's old line.
3. The admin records the call and reserves minutes for it while it loads the business snapshot. A call reserves 5 minutes, or what the plan has left when that's less, and the worker adds more as the call runs. Calls share what's left, so the free plan's 30 minutes let six calls start at once. An unlimited plan reserves nothing. The admin rejects the call with SIP 486 (busy) when the plan is out of minutes, and 603 when the caller is blocked.
4. The admin accepts the call with the business's instructions, then asks the worker to attach. It passes the reserved length as the call's limit, or no limit on an unlimited plan.
5. The worker opens the sideband, then loads the business, speaks the greeting, and handles the call until it ends.

OpenAI delivers the webhook again when the admin doesn't answer it, for example after a crash. A repeated delivery keeps the first one's call record, and its limit is what the call has reserved by then. It accepts the session again, which fails harmlessly if the first delivery did it, and asks the worker to attach as a resume. If no worker holds the session yet, the one that takes it reads the call's saved transcript before it saves a turn. New turns follow the saved ones, and a call that already has a transcript gets no greeting fallback. A first delivery's attach skips that read.

The caller hears ringing until step 4. The admin logs `live.incoming` with the milliseconds from the webhook's arrival to each step (`lookupMs`, `recordMs`, `acceptMs`, `attachMs`) and `eventAgeMs`, a rough delivery delay with one-second precision. `routedBy` names the header whose number picked the business.

A caller who withholds their number gets a new contact with no number, the same as a browser caller. The agent can't block that contact. The worker also skips the call's Twilio price lookup. The trunk carries every business's calls, so a match on start time alone could pick another business's call.

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
- transfers phone calls with a SIP REFER to the destination number, once GPT-Live has told the caller
- hangs up after the receptionist's goodbye has played, when the agent ends the call
- ends the call after 75 seconds without speech or keypad presses from either side, or at the duration limit. The limit is the minutes the call has reserved, and at most 30 minutes. When the admin sends no limit, as on an unlimited plan, the call stops at 30 minutes. A request still being answered pauses the silence timer.
- records the final call state, billed seconds, and estimated cost
- queues a copy of OpenAI's stored recording into LobbyStack storage, where the copy follows the plan's retention (see [Recordings](#recordings))
- reports the call to the dashboard's live-call count

When the caller is done, GPT-Live hands the call to the backend and says nothing while it waits. The caller is done when they say goodbye, "that's it" or "nothing else". Only the backend can hang up, so GPT-Live hands it every ending, even one it could answer itself. The agent then calls `endCall` with the reason `caller_finished` and writes no reply.

The worker sends the answer, "The call is ending.", with `session.commentary.append`, and sends no "still checking" update. GPT-Live says one short goodbye when it hears it. Instructions that let GPT-Live say its goodbye before the answer failed: it took the goodbye for its reply and kept the call in 5 of 12 API runs with phone audio, and in 5 of 6 staging calls. With the goodbye after the answer, GPT-Live handed the call over in 24 runs out of 24. In 3 of them, it also said "Bye" or "Take care" while it waited, so the caller heard two goodbyes.

For a caller who is done, the worker hangs up once the request has an answer, GPT-Live's goodbye after it has finished playing, and both sides have been quiet for 2 seconds. When GPT-Live says nothing within 4 seconds of the answer, the worker stops waiting for the goodbye. If GPT-Live keeps talking, the worker hangs up 20 seconds after the agent ended the call or the caller last spoke, whichever is later. If the caller says anything after GPT-Live handed the call over, the worker holds the hangup. Once the caller has paused for 0.8 seconds, it sends the conversation to the delegation model, which answers whether the caller's latest words only close the call, such as "Thanks, bye", or keep it going, such as "oh, one more thing". The worker asks only in this case, never on other turns. On "done", the hangup goes ahead once both sides have been quiet for 2 seconds. On "continue", or when the check fails, the worker cancels the hangup and the call goes on. If the caller says more while the check runs, the worker checks their newest words again. GPT-Live handing over another request also cancels the hangup, and it hands the call over again when the caller is done. `live.caller_done_check` logs each answer and how long it took.

The check exists because GPT-Live answers a caller's "bye" after its own goodbye but rarely hands the call over again. Letting only a new hand-over cancel the hangup didn't work either: GPT-Live answered "Oh wait, one more thing" with "Go ahead" and no hand-over, and the call ended before the caller asked their question. With the check, API runs with phone audio ended the call after a trailing "Goodbye" 6 times out of 6, and never ended one in 14 runs where the caller said "Oh wait, one more thing".

When the caller speaks before the agent has answered, the worker sends the answer as a silent note that the caller spoke again, so GPT-Live replies to them instead of saying goodbye. The check still decides whether the call ends.

To test a change to this flow against GPT-Live, see [Test a voice change before you ship it](./testing.md).

A call that ends this way, or that the caller hangs up while the worker waits, gets the disposition `caller_finished`, and `live.closed` logs `end: "caller_finished"`. The worker ends a spam or abusive call the way it ends a timeout, described below: once GPT-Live has finished speaking, or after 4 seconds of silence, whatever the caller says. If GPT-Live answers a goodbye without handing it over, the call still ends at the 75-second silence timeout, with a goodbye.

Before a timeout ends the call, the worker tells GPT-Live why and asks it for a short goodbye, then hangs up once the goodbye has played. It listens for the goodbye from the moment OpenAI acknowledges the command, so a sentence GPT-Live was already saying doesn't pass for it. Without an acknowledgment within 2 seconds, it listens from the request. GPT-Live can ignore a command appended mid-call, so the worker hangs up anyway after 4 seconds of silence, or 15 seconds in all. The duration limit's goodbye starts 30 seconds early, so it fits inside the reserved minutes. A call that reserved less than a minute gets half its length to talk instead, so a 30-second reservation still gets 15 seconds of conversation.

A phone call on a plan with a minute limit asks for more minutes 60 seconds before the duration limit's goodbye would start. Each top-up adds 5 minutes, or what the plan has left when that's less, and no call goes past 30 minutes. The worker moves the goodbye back by what it got, then asks again a minute before the new goodbye.

When the plan has nothing left, the goodbye starts on time. When the request fails, the worker tries again every 10 seconds until the goodbye starts. A top-up queues no Polar usage sync: the call's finish replaces the reservation with the seconds the call used and syncs those.

When a transfer is already under way or the call is ending, the transfer tool reports that the transfer couldn't start, so GPT-Live doesn't announce one, and no transfer attempt is used. Otherwise the tool reserves one of the plan's transfer attempts, then answers at once so GPT-Live can announce the transfer. The worker sends the REFER after the announcement has played, unless the call started ending in the meantime. From the moment the REFER goes out, the worker counts the call as transferred, so a `session.closed` that arrives before OpenAI answers the REFER still records the transfer. The call record's transfer state shows how far the transfer got:

- `referred`: OpenAI accepted the REFER. Nobody has answered yet.
- `completed`: the sideband reported `transport.answered`, so the destination picked up.
- `failed`: OpenAI refused the REFER, the sideband reported `transport.failed`, or the session was still open 30 seconds after `referred`. The worker tells GPT-Live, which offers to take a message, and the operator gets a transfer alert. The agent can then try another transfer.

OpenAI documents `transport.answered` and `transport.failed` for outbound SIP legs. The worker treats the leg the carrier dials for a REFER as one. An accepted REFER ends OpenAI's leg, so `session.closed` follows soon after. If the session closes without either event, the transfer stays at `referred`. If neither the close nor an event arrives within 30 seconds, the caller is still talking to GPT-Live, and the worker records the transfer as `failed`.

The worker ends phone calls with OpenAI's SIP hangup and browser calls with `session.close`. Either way it keeps the sideband open until `session.closed` brings the final usage, for up to 15 seconds. If the connection drops first, it records the latest `session.usage.updated` seconds, or its own measurement when that's larger, and logs `usageConfirmed: false` on `live.closed`.

If the sideband connection fails before the session has sent anything, for example when OpenAI answers it with a 504, the worker reconnects up to 3 times, after about 250 ms, 500 ms and 1 second. Once the session has sent an event, a dropped sideband ends the call, because a new connection replays the last 3 seconds of events and could answer a request twice.

The replay window also limits how late the worker can attach. The admin gives a cold worker 10 seconds, but an attach more than 3 seconds after a phone call's session started misses `session.started` and the caller's first words. The delegation event carries no request text, so the worker can't recover them. It flags the attach as late when `session.started` never arrives, or when its first event sits more than 3.5 seconds into the session. Each delegated request then tells the agent that the conversation is missing its start, so the agent asks the caller for missing details instead of guessing. `live.closed` logs `lateAttach` and `firstEventMs`, the session time of the first event the worker received.

If the worker can't attach, the admin ends the session and records the call as `setup_failed`, so nothing talks or bills without the worker. A browser session that never started still costs OpenAI's 15-second setup charge, so the admin records those 15 seconds. The admin has no sideband, so it asks the worker to close browser sessions at `/internal/live/end`.

A worker that is shutting down answers the attach with HTTP 503 and closes the connection, so the admin's retry doesn't reach it again over a kept-alive connection. The admin waits 250 ms and retries, then waits 750 ms and retries once more, all within the same 10-second timeout. That gives the deploy's new instance a chance to take the call.

Only one worker answers each session. The worker takes a lock in Redis, `live-attach:<session id>`, when it attaches and renews it every 10 seconds while the call runs. The lock expires 30 seconds after the last renewal. If Redis loses the lock while its worker is alive, for example after a Redis restart, the worker takes it back at its next renewal.

Each renewal checks that the worker still holds the lock. A worker that couldn't reach Redis for longer than 30 seconds can find that a recovery job gave the call to another worker. It then detaches: it closes its sideband without hanging up, leaves the call record and the transcript to the new owner, and logs `live.detached`. When a call ends, the worker keeps the lock until it has finalized the call record, so a recovery job can't take the ending call and finish it with estimated seconds. It then deletes the lock only if it still holds it, so it never frees a lock another worker took over.

## Deploy the worker during calls

When the worker gets SIGTERM or SIGINT, it drains instead of hanging up:

1. `/health/ready` and new attaches return HTTP 503. The admin retries a refused attach, which gives the new deployment a chance to take the call.
2. The worker stops taking background jobs. Calls in progress go on until they end, up to the drain timeout.
3. At the drain timeout, GPT-Live tells each remaining caller that the service is restarting, apologizes and asks them to call back. The worker hangs up once that goodbye has played. The call record gets the disposition `service_restart`, and billing counts the call like any other. An attach that was still taking its lock at the timeout becomes active after it, and gets the same goodbye. The recovery job takes no calls while the worker drains.
4. The worker waits until every call record is finalized, then closes its database pools and exits.

Railway sends SIGKILL `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` after SIGTERM. The default is 0, so every deploy cuts calls off. On the worker service, add `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` as a service variable set to `1860` (31 minutes), so a 30-minute call can finish on its own. Add it as a variable rather than only in the service settings: the worker reads it and drains for that long minus 35 seconds, which leaves time for the goodbyes and finalization. The new deployment takes new calls while the old one drains. `.railway/railway.ts` declares the variable for production, so `railway config apply` sets it there. On a self-hosted Railway deployment, add it to the worker yourself.

On other platforms, set `LIVE_DRAIN_TIMEOUT_MS` to the drain timeout. With neither variable set, the worker wraps up calls as soon as it gets the signal. The worker image starts Node directly, so Node receives the signal. A wrapper such as `npm start` would swallow it.

## Recover calls after a worker crash

If the worker process dies mid-call, nobody answers the call's delegations, and its call record stays open with its minutes reserved. One scheduled job, `live.recoverOrphans`, runs every minute on the critical queue and covers every business. Each run takes those calls over:

1. It lists the open GPT-Live calls, phone and browser, that started between 60 seconds and 2 hours ago. It first finds the businesses with such a call, then reads each one's calls under that business's own access rules, one business at a time. If it can't read a business's calls, it logs the error and moves on to the next business.
2. It leaves alone a call that saved a transcript turn in the last 45 seconds, because a worker is still running it.
3. For each other call, it tries to take the attach lock. A missing lock means the call has no worker. When another worker holds the lock, the job leaves the call alone, and two workers running the job at once can't both take it.
4. A dead worker stops topping up its calls, so a phone call that has run past its reservation asks for one more top-up first. The job hangs up a call still past its reserved length and finishes its record. It stops waiting for the hangup after 5 seconds, so a slow OpenAI can't hold up the job or a drain.
5. It attaches to any other call from this worker, with a request rebuilt from the call record: the channel, the conversation, the caller's number, intake-only mode for prospect demos, and what's left of the reserved length. New transcript turns follow the ones already saved, and the worker doesn't send the greeting again. It tops up a phone call's reservation as the first worker did.

No call runs longer than 30 minutes, so an open record older than 2 hours belongs to no running call. The job leaves those for an operator to close, which keeps old records out of the current period's usage and Polar sync. `scripts/operations/voice-recovery.ts` closes old browser calls. It doesn't cover phone calls.

A live session sends events as soon as a sideband connects: the sideband replays the last 3 seconds, and output audio flows even through silence. If 5 seconds pass after the connection opens with nothing but errors, the worker treats the session as gone. It hangs up, which does nothing to an ended session, and stops waiting for the hangup after 5 seconds. Once the hangup goes through, the worker finishes the call as `connection_lost`. The billed length runs from the call's start to its latest saved sign of activity, its last transcript turn or its media start, and stops at the reserved length.

The wait for the first event starts when the connection opens, so a slow connection doesn't count as silence. If the sideband can't connect at all, or the hangup fails, the worker leaves the session running. It releases the lock, logs `live.recovery_deferred`, and the next run tries again. Once the call passes its reserved length, step 4 hangs it up and finishes it, which ends the retries.

A session that answers carries on with the new worker. Delegations made between the crash and the re-attach went unanswered. The transcript also misses what the caller and GPT-Live said in that gap, apart from the 3 seconds the sideband replays, so the agent works from a conversation without its start, as after a late attach. When the call ends, OpenAI's usage in `session.closed` covers the whole session and decides the billed seconds. Without it, the worker measures from the call's original start.

The worker logs `live.recovered` when a session answers, with `gapMs`, the time since the call's last sign of activity. It logs `live.orphan_finished` when it finishes a call itself, with `reason` (`session_gone` or `past_reservation`) and `measuredSeconds`. The job does nothing when `LIVE_PROTOTYPE_ENABLED` isn't `true` or Redis is down, because without Redis it can't tell a dead worker from a live one.

## Recordings

Sessions run with `store: true` (see `packages/agent-core/src/live/session.ts`), so OpenAI keeps each call's recording and the worker can download it. The database write that finishes a call also queues a `call.saveRecording` outbox job. The job downloads the stereo WAV from OpenAI and saves it in LobbyStack storage, where it follows the plan's retention. As an outbox job, the copy survives a worker restart.

OpenAI finishes the recording after the session closes and answers 404 or 409 until it's ready. The job first runs 5 seconds after the call ends. After each 404 or 409 it queues another attempt with twice the delay: 10, 20, 40, 80 and 160 seconds, about 5 minutes over 6 attempts. Any other error from OpenAI ends the copy. A storage or database error fails the job, and the queue retries it.

OpenAI's copy follows OpenAI's rules, not the plan's retention. Its [GPT-Live data controls](https://developers.openai.com/api/docs/guides/your-data) say:

- OpenAI keeps a stored session's recording for 30 days: "Stored sessions and their index expire after 30 days."
- We can't delete it sooner: "The API does not provide a public stored-session deletion endpoint."
- Abuse monitoring logs for `/v1/live/sessions` have their own 30-day retention.
- With Zero Data Retention, OpenAI treats `store` as `false`, so no recording exists to copy.

The [Live conversations guide](https://developers.openai.com/api/docs/guides/live-conversations) adds that storage must be enabled for the OpenAI project and needs a data policy that permits persistence.

When a business deletes a recording, or its plan's retention runs out, OpenAI's copy stays until its 30 days are up. Tell businesses that OpenAI keeps each call's recording for 30 days and that we can't delete it sooner. OpenAI doesn't say whether the 30 days start when the session starts or when it ends.

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
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | worker | Railway's time between SIGTERM and SIGKILL. Set it to `1860` so calls can finish during a deploy. See [Deploy the worker during calls](#deploy-the-worker-during-calls). |
| `LIVE_DRAIN_TIMEOUT_MS` | worker | Optional. How long a shutdown lets calls finish on their own before it ends them with a goodbye. Overrides the timeout derived from `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`. |
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
