import { afterEach, expect, it, vi } from "vitest";

const update = vi.hoisted(() => vi.fn());
vi.mock("../backend/runtimeClient", () => ({ updateVoiceCallPresence: update }));

import { beginVoicePresence } from "./voicePresence";

afterEach(() => {
  vi.useRealTimers();
  update.mockReset();
});

it("renews live presence and removes it once when a session ends", async () => {
  vi.useFakeTimers();
  const onError = vi.fn();
  const stop = await beginVoicePresence({ businessId: "business", callId: "call" }, onError);
  expect(update).toHaveBeenCalledWith({ businessId: "business", callId: "call", active: true });

  await vi.advanceTimersByTimeAsync(10_000);
  expect(update).toHaveBeenCalledTimes(2);
  await stop();
  await stop();
  await vi.advanceTimersByTimeAsync(40_000);
  expect(update).toHaveBeenCalledTimes(3);
  expect(update).toHaveBeenLastCalledWith({ businessId: "business", callId: "call", active: false });
  expect(onError).not.toHaveBeenCalled();
});

it("removes presence even after a heartbeat fails", async () => {
  vi.useFakeTimers();
  update.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("backend unavailable"));
  const onError = vi.fn();
  const stop = await beginVoicePresence({ businessId: "business", callId: "call" }, onError);
  await vi.advanceTimersByTimeAsync(10_000);
  await stop();
  expect(onError).toHaveBeenCalledOnce();
  expect(update).toHaveBeenLastCalledWith({ businessId: "business", callId: "call", active: false });
});
