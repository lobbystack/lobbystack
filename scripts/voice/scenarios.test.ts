import { describe, expect, it } from "vitest";

import { runtimeLocales } from "../../packages/shared/src/locales";
import { callerLine, OPENING, SCENARIOS } from "./scenarios";

describe("callerLine", () => {
  it("has the opening and every core scenario line in each caller language", () => {
    const english = [OPENING, ...new Set(SCENARIOS.flatMap((scenario) => scenario.lines.map((line) => line.text)))];
    for (const locale of runtimeLocales) {
      const lines = english.map((text) => callerLine(text, locale));
      expect(new Set(lines).size).toBe(english.length);
      if (locale !== "en") expect(lines.filter((line) => english.includes(line))).toEqual([]);
    }
  });
});
