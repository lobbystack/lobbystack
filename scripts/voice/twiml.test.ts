import { describe, expect, it } from "vitest";

import { findScenarios } from "./scenarios";
import { callTwiml } from "./twiml";

describe("callTwiml", () => {
  it("presses a keypad step's keys with <Play digits> after its pause", () => {
    const { twiml, silenceS } = callTwiml(findScenarios(["cancel-with-pin"])[0]!);
    expect(twiml).toContain('<Pause length="20"/><Play digits="5829#"/><Pause length="15"/><Say voice="Polly.Joanna-Neural">Yes, please cancel it.</Say>');
    expect(silenceS).toBe(6 + 12 + 20 + 15 + 15 + 15);
  });

  // A call that goes on mustn't outlast the check-ins, or their goodbye would end it.
  it("waits 15 seconds after the last line, or the scenario's own wait", () => {
    expect(callTwiml(findScenarios(["one-more-thing"])[0]!).twiml).toMatch(/<Pause length="15"\/><\/Response>$/);
    expect(callTwiml(findScenarios(["silent"])[0]!).twiml).toMatch(/<Pause length="50"\/><\/Response>$/);
  });
});
