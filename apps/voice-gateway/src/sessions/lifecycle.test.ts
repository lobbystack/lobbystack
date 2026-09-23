import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { acquireVoiceLease, initializeVoiceLifecycle } from "./lifecycle";

it("admits calls beyond the previous per-business and gateway-wide limits, then drains on shutdown", async () => {
  const server = Fastify();
  initializeVoiceLifecycle(server);
  const stop = vi.fn(async () => undefined);
  const leases = Array.from({ length: 40 }, () => acquireVoiceLease(server, stop));
  expect(leases.every(Boolean)).toBe(true);
  expect(leases[4]).not.toBeNull();
  expect(leases[32]).not.toBeNull();
  await server.close();
  expect(stop).toHaveBeenCalledTimes(40);
  expect(acquireVoiceLease(server, stop)).toBeNull();
});
