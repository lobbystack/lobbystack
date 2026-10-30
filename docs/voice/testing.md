# Test a voice change before you ship it

Unit tests replace GPT-Live with a fake, so they can't tell you how the model reacts to a new prompt or a new call flow. Two scripts play scripted callers against the real model: `pnpm voice:eval` talks to GPT-Live through the API, and `pnpm voice:call` places real phone calls through Twilio. Run the eval while you change the code, then confirm on staging with real calls.

## When to run them

Run `pnpm voice:eval` after any change that can alter what GPT-Live says or when it hands a request to the backend:

- The GPT-Live instructions in `packages/agent-core/src/instructions.ts` (`buildLiveInstructions`), or the backend tools they list, which come from `packages/agent-core/src/capabilities.ts`
- The call controller in `packages/agent-core/src/live/callController.ts`
- The end-call flow: the `endCall` tool, the caller check in `packages/agent-core/src/live/callerDone.ts`, or the backend prompt
- What the worker sends GPT-Live as delegation results

Run `pnpm voice:call` once the change is deployed to staging, before you merge. It covers what the eval skips: Twilio, the SIP trunk, the admin webhook, and the worker attaching to the call.

GPT-Live doesn't answer the same way twice. Run each scenario at least 3 times, and compare pass counts before and after your change on the same scenarios. A scenario that expects the call to end must pass on every run, even when main fails it too. Look into any run that stays open before you merge.

## Run the API eval

The eval opens one GPT-Live session per run over a WebSocket, with the same instructions and greeting as a phone call. It drives the session with the production call controller, receptionist agent and caller check, and plays the caller's lines as speech. OpenAI's `gpt-4o-mini-tts` voices the caller, and the script passes that audio through 8 kHz μ-law first, so GPT-Live gets phone-quality audio.

Run it with an OpenAI API key:

```bash
OPENAI_API_KEY=your_openai_api_key pnpm voice:eval
```

These options change what runs:

- **`--scenario <name>`**: runs one scenario. Repeat it to run several. Without it, every scenario runs.
- **`--runs <n>`**: runs each scenario this many times. The default is 3.
- **`--concurrency <n>`**: how many sessions run at once. The default is 4. With 22 sessions at once, many runs lost their transcripts.
- **`--snapshot <file>`**: uses a real business's snapshot instead of the demo business.
- **`--locale <code>`**: sets the business's caller language to `en`, `fr`, `es`, `sr`, `de`, `pt`, `it` or `nl` and gives it that language's default greeting. The scripted caller speaks the same language. Without it, the caller speaks English and the business keeps its own language and greeting.
- **`--browser`**: plays a browser call, like one from the website widget, instead of a phone call. GPT-Live gets the browser call's instructions, the agent runs on the `web_voice` channel, and the caller's audio skips the phone-line filter. Use it after you change what browser calls hear, such as how they answer a caller who asks for a person.

Each run uses under a minute of GPT-Live audio, plus a delegation model call for each hand-over. The default 18 runs take about 5 minutes.

Agent tools that read the database fail in the eval, as they would with the database down. A hand-over that needs one, such as booking, gets the agent's failure answer. Use the eval for how calls flow and end, not for booking results.

### Read the results

The eval prints one line per run, then a summary per scenario. A run line looks like this:

```text
PASS trailing-goodbye  greeted at 1.6 s | ended 4.1 s after the caller | hand-overs: endCall | checks: done | goodbyes: 1 | opened: "Thank you for calling Maple Family Clinic." / "We're closed on Saturdays. Anything else?" | receptionist: "Okay." / "Good bye."
```

Each field answers one question:

- **`PASS` or `FAIL`**: whether the call ended or went on, as the scenario expects
- **`greeted at … s`**: when the receptionist first spoke, before the caller did, and how many greeting commands the worker sent. The caller waits 15 seconds for it.
- **`ended … after the caller`**: how long after the caller's last line the controller closed the session, or `still open` after 15 seconds
- **`hand-overs`**: each request GPT-Live handed to the backend after the opening question, by the tools the agent used. `reply` means the agent answered without a tool.
- **`checks`**: each answer from the caller check, which runs when the caller speaks after the agent ended the call
- **`goodbyes`**: how many of the receptionist's lines said goodbye. More than 1 means the caller heard a double goodbye.
- **`opened`**: the greeting, then the answer to the opening question. With `--locale`, check that both are in that language.
- **`receptionist`**: what the receptionist said after the opening question

The script exits with code 1 when any run fails.

Over the API, GPT-Live greeted on its own in 12 runs out of 12, while on real calls it often waited for the caller. Check greeting changes with real calls.

### Use a real business

Without `--snapshot`, the eval uses the demo business, Maple Family Clinic. To test a real business with its own greeting, rules and knowledge, save its latest snapshot as JSON and pass the file:

```bash
psql "$DATABASE_URL" -At -c "select snapshot \
  from business_context_snapshots \
  where business_id = 'your_business_id' \
  order by generated_at desc limit 1" > snapshot.json
pnpm voice:eval --snapshot snapshot.json
```

## Place real test calls

`pnpm voice:call` calls a receptionist's number with Twilio and plays the same scenarios with Amazon Polly's voice. After the scripted lines, the caller stays silent for 40 seconds. If the call ends before the script's silences add up, the receptionist hung up.

You need a Twilio number to call from and the auth token of the account that owns it. To test staging, call the staging number from a number on another account, such as the production toll-free number:

```bash
TWILIO_ACCOUNT_SID=your_account_sid TWILIO_AUTH_TOKEN=your_auth_token \
  pnpm voice:call --from +12345678901 --to +12345678902 \
  --scenario trailing-goodbye
```

The script places one call per scenario, one after another, and prints the call's SID, status and duration:

```text
PASS trailing-goodbye  CA9f964def1626388da1a76203fefa95e5 completed 28 s, the receptionist hung up
```

To see why a call failed, read its transcript on the call's page in the dashboard, and the worker's `live.delegation`, `live.caller_done_check` and `live.closed` log lines for its session.

Twilio bills each call on both accounts, and the business's plan counts its minutes. The receptionist also saves the calling number as a contact on that business.

### Check a booking call

The `book-no-texts` scenario books a real appointment, so it runs only when you name it with `--scenario`. Its caller asks for staging's Initial consultation on Tuesday at 10 AM, accepts the time, then turns down texts. After the call, check the business's records:

- The calling number's contact shows `declined`, with the source `voice_call`
- The booking confirmation and the reminder are `skipped`
- No outbound text went to the calling number

Then cancel the appointment in the dashboard. That removes its calendar event and frees the time for the next run.

### Check a keypad PIN call

The `cancel-with-pin` scenario cancels a real appointment after the caller types a PIN on the phone's keypad. Only the phone script can press keys, so run it with `pnpm voice:call` and name it with `--scenario`. The eval stops with an error if you name it there.

Before the call, set up the staging business:

1. On **Agent** > **AI settings**, under **Appointment changes**, turn on **Allow AI cancellations** and set **Caller verification** to **Keypad PIN**.
2. Book an appointment for the number you call from (`--from`) on the coming Tuesday at 10 AM. The `book-no-texts` scenario books one and saves that number as a contact.
3. Open that contact and set its keypad PIN to `5829` on the **Details** tab.

Then place the call:

```bash
TWILIO_ACCOUNT_SID=your_account_sid TWILIO_AUTH_TOKEN=your_auth_token \
  pnpm voice:call --from +12345678901 --to +12345678902 \
  --scenario cancel-with-pin
```

The caller asks to cancel the Tuesday appointment and waits 20 seconds for the receptionist to ask for the PIN. It types `5829#`, confirms the cancellation 15 seconds later, and says goodbye. After the call, check the business's records:

- The call's transcript shows `[typed a PIN]` and none of the PIN's digits. If it shows `[pressed a key]` instead, the caller typed before the receptionist asked, and the receptionist never checked the PIN.
- The Tuesday appointment shows as cancelled in the dashboard.

Book a new Tuesday appointment before the next run. The contact keeps its PIN.

## Add a scenario

Both scripts read their callers from `scripts/voice/scenarios.ts`. Every call first asks "Hi, are you open on Saturday?" and waits for the answer. A scenario then lists the caller's lines and what should happen:

- **`name`**: what you pass to `--scenario`
- **`expect`**: `ends` when the receptionist should hang up after the last line, `continues` when the call should go on
- **`lines`**: the caller's lines, each with an optional `pauseMs` of silence before it. A line has `text` for words or `digits` for keys, such as `"5829#"`. The phone script rounds pauses to whole seconds and presses keys with Twilio's `<Play digits>`.
- **`mustNotSay`**: optional. The eval fails a run when any of the receptionist's lines matches this pattern. The phone script can't check it.

Add a scenario when you fix a call that went wrong, so the eval catches the same failure next time. Put a scenario that books or changes an appointment in `BOOKING_SCENARIOS`, so it runs only when you name it. Add each new line in `SCENARIOS` to `TRANSLATED_LINES` in every caller language, or `--locale` stops with an error naming the missing line. The eval can't press keys and stops with an error on a scenario with `digits`, so keep those out of `SCENARIOS`.

The `ask-for-person` scenario asks for a real person. It's in `PERSON_SCENARIOS` and runs only when you name it, because on a real phone call the receptionist can put it through to the business's team. A browser call can't be transferred, so run it with `--browser`. A run fails when the receptionist announces a transfer. Read its lines to confirm it gave the business's number or offered a callback instead. The scenario has English lines only, so leave out `--locale`:

```bash
OPENAI_API_KEY=your_openai_api_key pnpm voice:eval --browser --scenario ask-for-person
```

The `off-topic` scenario asks for a two-line poem about the ocean, then says goodbye. The receptionist should decline and hang up. A run fails when a reply mentions waves, tides, shores or the sea, a sign that the receptionist wrote the poem. It's in `OFF_TOPIC_SCENARIOS` with English lines only, so name it and leave out `--locale`:

```bash
OPENAI_API_KEY=your_openai_api_key pnpm voice:eval --scenario off-topic
```

The phone script runs it too, but it can't check the replies, so read the call's transcript afterwards.
