import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { acquireVoiceLease, initializeVoiceLifecycle, MAX_ACTIVE_VOICE_SESSIONS } from "./lifecycle";

it("admits more than four calls for one business while bounding gateway-wide capacity", async () => {
  const server = Fastify();
  initializeVoiceLifecycle(server);
  const stop = vi.fn(async () => undefined);
  const leases = Array.from({ length: MAX_ACTIVE_VOICE_SESSIONS }, () => acquireVoiceLease(server, stop));
  expect(leases.every(Boolean)).toBe(true);
  expect(leases[4]).not.toBeNull();
  expect(acquireVoiceLease(server, stop)).toBeNull();
  await server.close();
  expect(stop).toHaveBeenCalledTimes(MAX_ACTIVE_VOICE_SESSIONS);
  expect(acquireVoiceLease(server, stop)).toBeNull();
});
