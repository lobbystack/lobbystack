import { describe, expect, it } from "vitest";

import { runtimeLocales } from "../../packages/shared/src/locales";
import { callerLine, OPENING, SCENARIOS, SILENCE_CHECK_IN } from "./scenarios";

describe("callerLine", () => {
  it("has the opening and every core scenario line in each caller language", () => {
    const english = [OPENING, ...new Set(SCENARIOS.flatMap((scenario) => scenario.lines.flatMap((line) => ("text" in line ? [line.text] : []))))];
    for (const locale of runtimeLocales) {
      const lines = english.map((text) => callerLine(text, locale));
      expect(new Set(lines).size).toBe(english.length);
      if (locale !== "en") expect(lines.filter((line) => english.includes(line))).toEqual([]);
    }
  });
});

describe("SCENARIOS", () => {
  it("has no keypad steps, because the eval runs every one of them by default and can't press keys", () => {
    expect(SCENARIOS.flatMap((scenario) => scenario.lines).filter((line) => "digits" in line)).toEqual([]);
  });
});

describe("SILENCE_CHECK_IN", () => {
  it.each(["Are you still there?", "Are you still with me?", "Hello, are you still on the line?", "Can you hear me?", "Hello?", "Hello? Do you need anything else?", "Are you there?"])("accepts the check-in %j", (line) => {
    expect(SILENCE_CHECK_IN.test(line)).toBe(true);
  });

  it.each(["We're closed on Saturdays. Would you like to book a weekday?", "I haven't heard back, so I'll let you go. Goodbye.", "Hello, thanks for calling Maple Family Clinic.", "Is there anything else I can help with?", "Thank you for calling. Take care."])("rejects %j, which isn't a check-in", (line) => {
    expect(SILENCE_CHECK_IN.test(line)).toBe(false);
  });

  it("is what the silent scenario has to hear", () => {
    expect(SCENARIOS.find((scenario) => scenario.name === "silent")?.mustSay).toBe(SILENCE_CHECK_IN);
  });
});
