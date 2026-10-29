import { normalizeReceptionistVoice, type BusinessContextSnapshot, type ReceptionistVoice } from "@lobbystack/shared";
import type { BuiltInVoice, MediaSessionConfig } from "openai/resources/live/live";
import type { SessionAcceptParams } from "openai/resources/live/sessions";

import { buildLiveInstructions } from "../instructions";
import { greetingCommand } from "./greeting";

export const LIVE_MODEL = "gpt-live-1";

// Fails to compile when the shared list offers a voice GPT-Live doesn't have.
true satisfies (ReceptionistVoice extends BuiltInVoice ? true : never);

/** The business's voice from the snapshot. Snapshots from before the choice, or with a retired voice, speak in marin. */
function sessionVoice(snapshot: BusinessContextSnapshot): ReceptionistVoice {
  return normalizeReceptionistVoice(snapshot.voice);
}

// Events the browser may see. It can watch the conversation and end it, but it
// can't inject instructions or answer delegations: only our sideband does that.
const BROWSER_SERVER_EVENTS = [
  "session.started",
  "session.closed",
  "session.input_transcript.delta",
  "session.output_transcript.delta",
  "session.delegation.created",
  "session.commentary.appended",
  "error",
].map((type) => ({ type }));

// OpenAI's guide: put context the model needs from the start in input. The
// greeting command goes there, so GPT-Live opens the call on its own.
function openingHistory(snapshot: BusinessContextSnapshot): { input?: Array<{ role: "developer"; content: Array<{ type: "input_text"; text: string }> }> } {
  const greeting = snapshot.greeting?.trim();
  return greeting ? { input: [{ role: "developer", content: [{ type: "input_text", text: greetingCommand(greeting) }] }] } : {};
}

export function buildBrowserSessionConfig(snapshot: BusinessContextSnapshot): MediaSessionConfig {
  return {
    model: LIVE_MODEL,
    instructions: buildLiveInstructions(snapshot, "web_voice"),
    ...openingHistory(snapshot),
    audio: { output: { voice: sessionVoice(snapshot) } },
    delegation: { type: "client" },
    client: { data_channel: { allowed_client_events: ["session.close"], allowed_server_events: BROWSER_SERVER_EVENTS } },
    // Keep OpenAI's recording so the worker can copy it into our storage.
    store: true,
  };
}

export function buildPhoneSessionConfig(snapshot: BusinessContextSnapshot): SessionAcceptParams.Session {
  return {
    type: "live",
    model: LIVE_MODEL,
    instructions: buildLiveInstructions(snapshot, "voice"),
    ...openingHistory(snapshot),
    audio: { output: { voice: sessionVoice(snapshot) } },
    delegation: { type: "client" },
    // Keep OpenAI's recording so the worker can copy it into our storage.
    store: true,
  };
}
