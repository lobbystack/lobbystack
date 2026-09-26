import type { BusinessContextSnapshot } from "@lobbystack/shared";
import type { MediaSessionConfig } from "openai/resources/live/live";
import type { SessionAcceptParams } from "openai/resources/live/sessions";

import { buildLiveInstructions } from "../instructions";

export const LIVE_MODEL = "gpt-live-1";
const DEFAULT_VOICE = "marin";

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

export function buildBrowserSessionConfig(snapshot: BusinessContextSnapshot, voice = DEFAULT_VOICE): MediaSessionConfig {
  return {
    model: LIVE_MODEL,
    instructions: buildLiveInstructions(snapshot),
    audio: { output: { voice } },
    delegation: { type: "client" },
    client: { data_channel: { allowed_client_events: ["session.close"], allowed_server_events: BROWSER_SERVER_EVENTS } },
  };
}

export function buildPhoneSessionConfig(snapshot: BusinessContextSnapshot, voice = DEFAULT_VOICE): SessionAcceptParams.Session {
  return {
    type: "live",
    model: LIVE_MODEL,
    instructions: buildLiveInstructions(snapshot),
    audio: { output: { voice } },
    delegation: { type: "client" },
  };
}
