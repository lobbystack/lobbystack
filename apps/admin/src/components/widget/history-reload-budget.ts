// The history endpoint lets a visitor, and one network address, load the chat
// 120 times an hour (apps/admin/src/lib/widget-policy.ts). An open chat reloads
// it when the team writes, so a busy live chat could use that up and stop
// showing the team's replies. The chat may reload a few times in a row, then
// once every 40 seconds: at most 95 reloads an hour, which leaves room for the
// chat's first load on each page and for a second tab.

/** Reloads a chat may make in a row. */
export const HISTORY_RELOAD_BURST = 5;
/** How long a chat that used its burst waits for each further reload. */
export const HISTORY_RELOAD_EVERY_MS = 40_000;

export type HistoryReloadBudget = {
  /** Spends one reload. Returns 0 when it may go now, else the milliseconds until it may, without spending it. */
  take(): number;
};

export function createHistoryReloadBudget(options: { burst?: number; everyMs?: number; now?: () => number } = {}): HistoryReloadBudget {
  const burst = options.burst ?? HISTORY_RELOAD_BURST;
  const everyMs = options.everyMs ?? HISTORY_RELOAD_EVERY_MS;
  const now = options.now ?? (() => Date.now());
  let reloads = burst;
  let countedAt = now();
  return {
    take() {
      const time = now();
      reloads = Math.min(burst, reloads + (time - countedAt) / everyMs);
      countedAt = time;
      if (reloads >= 1) {
        reloads -= 1;
        return 0;
      }
      return Math.ceil((1 - reloads) * everyMs);
    },
  };
}
