import { describe, expect, it } from "vitest";

import { createHistoryReloadBudget, HISTORY_RELOAD_BURST, HISTORY_RELOAD_EVERY_MS } from "./history-reload-budget";

describe("history reload budget", () => {
  it("lets a chat reload a few times in a row, then once every 40 seconds", () => {
    let time = 0;
    const budget = createHistoryReloadBudget({ now: () => time });

    expect(Array.from({ length: HISTORY_RELOAD_BURST }, () => budget.take())).toEqual(Array.from({ length: HISTORY_RELOAD_BURST }, () => 0));
    expect(budget.take()).toBe(HISTORY_RELOAD_EVERY_MS);
    // Asking again doesn't spend anything.
    time = 10_000;
    expect(budget.take()).toBe(HISTORY_RELOAD_EVERY_MS - 10_000);
    time = HISTORY_RELOAD_EVERY_MS;
    expect(budget.take()).toBe(0);
    expect(budget.take()).toBe(HISTORY_RELOAD_EVERY_MS);
  });

  it("keeps a chat that reloads whenever it may under the history endpoint's 120 loads an hour", () => {
    let time = 0;
    const budget = createHistoryReloadBudget({ now: () => time });
    let reloads = 0;
    while (time < 60 * 60_000) {
      const wait = budget.take();
      if (wait === 0) reloads += 1;
      else time += wait;
    }
    // The chat's first load on the page comes on top, and a second tab has room too.
    expect(reloads).toBeLessThanOrEqual(95);
  });
});
