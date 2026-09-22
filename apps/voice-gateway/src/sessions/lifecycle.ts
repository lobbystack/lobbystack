import type { FastifyInstance } from "fastify";
import { settleVoiceTasks } from "../realtime/safety";

type Lease = { tenant?: string; stop: () => Promise<void> };
type Registry = { closing: boolean; leases: Set<Lease> };
const registries = new WeakMap<FastifyInstance, Registry>();
export const MAX_ACTIVE_VOICE_SESSIONS = 32;
export const MAX_TENANT_VOICE_SESSIONS = 4;

export function isVoiceClosing(server: FastifyInstance): boolean {
  return registries.get(server)?.closing === true;
}

export function initializeVoiceLifecycle(server: FastifyInstance): void {
  if (registries.has(server)) return;
  const registry: Registry = { closing: false, leases: new Set() };
  registries.set(server, registry);
  server.addHook("preClose", async () => {
    registry.closing = true;
    await settleVoiceTasks([...registry.leases].map((lease) => lease.stop()), 10_000);
  });
}

export function acquireVoiceLease(server: FastifyInstance, stop: () => Promise<void>) {
  const registry = registries.get(server);
  if (!registry || registry.closing || registry.leases.size >= MAX_ACTIVE_VOICE_SESSIONS) return null;
  const lease: Lease = { stop };
  registry.leases.add(lease);
  return {
    get closing() { return registry.closing; },
    claimTenant(tenant: string): boolean {
      if (registry.closing) return false;
      if ([...registry.leases].filter((entry) => entry !== lease && entry.tenant === tenant).length >= MAX_TENANT_VOICE_SESSIONS) return false;
      lease.tenant = tenant;
      return true;
    },
    release() { registry.leases.delete(lease); },
  };
}
