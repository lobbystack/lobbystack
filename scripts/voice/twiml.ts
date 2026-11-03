// The TwiML test-call.ts plays for a scenario: Polly says the caller's lines,
// and <Play digits> presses their keys.

import twilio from "twilio";

import { END_SILENCE_MS, OPENING, type CallScenario } from "./scenarios";

const VOICE = "Polly.Joanna-Neural";
const GREETING_WAIT_S = 6;
const ANSWER_WAIT_S = 12;

/** The call's TwiML, and the seconds of silence in it. A call shorter than that silence ended early. */
export function callTwiml(scenario: CallScenario): { twiml: string; silenceS: number } {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.pause({ length: GREETING_WAIT_S });
  twiml.say({ voice: VOICE }, OPENING);
  twiml.pause({ length: ANSWER_WAIT_S });
  const finalSilenceS = Math.round((scenario.endSilenceMs ?? END_SILENCE_MS) / 1000);
  let silenceS = GREETING_WAIT_S + ANSWER_WAIT_S + finalSilenceS;
  for (const line of scenario.lines) {
    // TwiML pauses are whole seconds.
    const pauseS = Math.round((line.pauseMs ?? 0) / 1000);
    if (pauseS > 0) twiml.pause({ length: pauseS });
    silenceS += pauseS;
    if ("digits" in line) twiml.play({ digits: line.digits });
    else twiml.say({ voice: VOICE }, line.text);
  }
  twiml.pause({ length: finalSilenceS });
  return { twiml: twiml.toString(), silenceS };
}
