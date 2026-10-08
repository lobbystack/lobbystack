// Calls a receptionist's number with a scripted caller, to test a real phone
// line end to end. After the scripted lines, the caller stays silent for 40
// seconds, so a call much shorter than its script means the receptionist hung
// up. See docs/voice/testing.md.
//
// TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... pnpm voice:call --from <number> --to <number> [--scenario <name>]...

import { parseArgs } from "node:util";

import twilio from "twilio";

import { findScenarios, OPENING } from "./scenarios";

const VOICE = "Polly.Joanna-Neural";
const GREETING_WAIT_S = 6;
const ANSWER_WAIT_S = 12;
const FINAL_SILENCE_S = 40;
const DONE = new Set(["completed", "busy", "failed", "no-answer", "canceled"]);

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    scenario: { type: "string", multiple: true, default: [] },
  },
});
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
if (!accountSid || !authToken) throw new Error("Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN for the account that owns --from.");
if (!values.from || !values.to) throw new Error("Pass --from (a number on that Twilio account) and --to (the receptionist's number).");
const client = twilio(accountSid, authToken);

for (const scenario of findScenarios(values.scenario)) {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.pause({ length: GREETING_WAIT_S });
  twiml.say({ voice: VOICE }, OPENING);
  twiml.pause({ length: ANSWER_WAIT_S });
  let pausesS = GREETING_WAIT_S + ANSWER_WAIT_S + FINAL_SILENCE_S;
  for (const line of scenario.lines) {
    // TwiML pauses are whole seconds.
    const pauseS = Math.round((line.pauseMs ?? 0) / 1000);
    if (pauseS > 0) twiml.pause({ length: pauseS });
    pausesS += pauseS;
    twiml.say({ voice: VOICE }, line.text);
  }
  twiml.pause({ length: FINAL_SILENCE_S });

  const call = await client.calls.create({ from: values.from, to: values.to, twiml: twiml.toString() });
  let status = call.status as string;
  let duration = 0;
  while (!DONE.has(status)) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const fetched = await client.calls(call.sid).fetch();
    status = fetched.status;
    duration = Number(fetched.duration ?? 0);
  }
  // The script's silences alone outlast a call the receptionist ended.
  const hungUp = status === "completed" && duration < pausesS;
  const passed = scenario.expect === "ends" ? hungUp : status === "completed" && !hungUp;
  console.log(`${passed ? "PASS" : "FAIL"} ${scenario.name.padEnd(17)} ${call.sid} ${status} ${duration} s, ${hungUp ? "the receptionist hung up" : "the script hung up"}`);
}
