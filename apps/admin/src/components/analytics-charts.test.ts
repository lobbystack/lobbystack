import { describe, expect, it } from "vitest";

import { evenlySpacedTicks } from "./analytics-charts";

const days = (length: number) => Array.from({ length }, (_, index) => `Sep ${String(index + 1).padStart(2, "0")}`);
const sorted = (set: Set<number>) => [...set].sort((left, right) => left - right);
const steps = (shown: number[]) => shown.slice(1).map((index, position) => index - shown[position]!);
const LABEL = 6 * 7;
const EDGE_ROOM = LABEL * 1.5 + 12;

describe("evenlySpacedTicks", () => {
  it("labels every point when they all fit", () => {
    expect(sorted(evenlySpacedTicks(days(12), 1200))).toEqual([...days(12).keys()]);
  });

  it("always labels the newest date, with every gap the same size", () => {
    for (const length of [24, 29, 30, 31, 52, 90, 365]) {
      for (const span of [300, 600, 900]) {
        const shown = sorted(evenlySpacedTicks(days(length), span));
        expect(shown.at(-1)).toBe(length - 1);
        expect(new Set(steps(shown)).size).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps labels apart, leaving room for the newest label to reach inward", () => {
    for (const length of [24, 30, 31, 90]) {
      const spacing = 600 / (length - 1);
      expect(Math.min(...steps(sorted(evenlySpacedTicks(days(length), 600)))) * spacing).toBeGreaterThanOrEqual(EDGE_ROOM);
    }
  });

  it("keeps only the newest date when the chart is too narrow for both ends", () => {
    expect(sorted(evenlySpacedTicks(days(30), 80))).toEqual([29]);
  });

  it("shows more labels on wider charts", () => {
    expect(evenlySpacedTicks(days(52), 1200).size).toBeGreaterThan(evenlySpacedTicks(days(52), 360).size);
  });

  it("shows everything before the width is known", () => {
    expect(evenlySpacedTicks(days(52), 0).size).toBe(52);
  });
});
