import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { acquireVoiceLease, initializeVoiceLifecycle, MAX_ACTIVE_VOICE_SESSIONS, MAX_TENANT_VOICE_SESSIONS } from "./lifecycle";

it("bounds pending and active calls with tenant fairness under concurrent claims", async () => {
  const server = Fastify();
  initializeVoiceLifecycle(server);
  const stop = vi.fn(async () => undefined);
  const claims = await Promise.all(Array.from({ length: MAX_TENANT_VOICE_SESSIONS + 1 }, async () => {
    const lease = acquireVoiceLease(server, stop)!;
    const allowed = lease.claimTenant("tenant-a");
    if (!allowed) lease.release();
    return allowed;
  }));
  expect(claims.filter(Boolean)).toHaveLength(MAX_TENANT_VOICE_SESSIONS);
  expect(acquireVoiceLease(server, stop)!.claimTenant("tenant-b")).toBe(true);
  for (let index = MAX_TENANT_VOICE_SESSIONS + 1; index < MAX_ACTIVE_VOICE_SESSIONS; index++) expect(acquireVoiceLease(server, stop)).not.toBeNull();
  expect(acquireVoiceLease(server, stop)).toBeNull();
  await server.close();
  expect(stop).toHaveBeenCalledTimes(MAX_ACTIVE_VOICE_SESSIONS);
  expect(acquireVoiceLease(server, stop)).toBeNull();
});
