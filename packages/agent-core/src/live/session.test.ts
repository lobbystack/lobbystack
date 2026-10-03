import { demoSnapshot } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

import { buildBrowserSessionConfig, buildPhoneSessionConfig } from "./session";

const opening = [{ role: "developer", content: [{ type: "input_text", text: `Start the conversation now: say exactly "${demoSnapshot.greeting}" in the language of that greeting, then stop and listen to the caller.` }] }];

describe("GPT-Live session config", () => {
  // OpenAI's guide: context the model needs from the start goes in input.
  // Tested against the API, this made GPT-Live greet about 2 seconds in every time.
  it("starts phone and browser sessions with the greeting command in their history", () => {
    expect(buildPhoneSessionConfig(demoSnapshot).input).toEqual(opening);
    expect(buildBrowserSessionConfig(demoSnapshot).input).toEqual(opening);
  });

  it("leaves the history empty for a business with no greeting", () => {
    expect(buildPhoneSessionConfig({ ...demoSnapshot, greeting: " " })).not.toHaveProperty("input");
  });
});
