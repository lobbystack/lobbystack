import { afterAll } from "vitest";

const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647;
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const syntheticLongTimerIds = new Set<number>();
let nextSyntheticLongTimerId = -1;

// Convex can schedule functions years out, but convex-test uses Node timers.
// Leave those long scheduled functions pending in tests instead of overflowing.
globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
  const [, timeout] = args;
  if (typeof timeout === "number" && timeout > MAX_NODE_TIMER_DELAY_MS) {
    const timerId = nextSyntheticLongTimerId;
    nextSyntheticLongTimerId -= 1;
    syntheticLongTimerIds.add(timerId);
    return timerId as unknown as ReturnType<typeof setTimeout>;
  }

  return nativeSetTimeout(...args);
}) as typeof setTimeout;

globalThis.clearTimeout = ((timerId?: Parameters<typeof clearTimeout>[0]) => {
  if (typeof timerId === "number" && syntheticLongTimerIds.delete(timerId)) {
    return;
  }

  return nativeClearTimeout(timerId);
}) as typeof clearTimeout;

afterAll(() => {
  globalThis.setTimeout = nativeSetTimeout;
  globalThis.clearTimeout = nativeClearTimeout;
});
