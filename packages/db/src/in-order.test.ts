import { expect, it } from "vitest";

import { inOrder } from "./in-order";

it("starts each step after the one before it finished, and keeps their order", async () => {
  const log: string[] = [];
  const step = (name: string, ms: number) => async () => { log.push(`start ${name}`); await new Promise((resolve) => setTimeout(resolve, ms)); log.push(`end ${name}`); return name; };
  const [first, second] = await inOrder([step("first", 5), step("second", 0)]);
  expect([first, second]).toEqual(["first", "second"]);
  expect(log).toEqual(["start first", "end first", "start second", "end second"]);
});
