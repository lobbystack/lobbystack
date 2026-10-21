import { describe, expect, it } from "vitest";

import { findScenarios } from "./scenarios";
import { callTwiml } from "./twiml";

describe("callTwiml", () => {
  it("presses a keypad step's keys with <Play digits> after its pause", () => {
    const { twiml, silenceS } = callTwiml(findScenarios(["cancel-with-pin"])[0]!);
    expect(twiml).toContain('<Pause length="20"/><Play digits="5829#"/><Pause length="15"/><Say voice="Polly.Joanna-Neural">Yes, please cancel it.</Say>');
    expect(silenceS).toBe(6 + 12 + 20 + 15 + 15 + 40);
  });
});
