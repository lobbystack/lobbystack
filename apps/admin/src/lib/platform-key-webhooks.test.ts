import { afterEach, describe, expect, it, vi } from "vitest";

const sweep = vi.hoisted(() => vi.fn(async (_context: unknown, _input: { configuredPlatformKeyIds: readonly string[] }) => 0));
vi.mock("@lobbystack/domain", async () => ({
  ...(await import("../../../../packages/domain/src/server/publicApi/platformKeys")),
  disableRemovedPlatformKeyWebhooks: sweep,
}));
vi.mock("./databases", () => ({ getDatabase: (role: string) => ({ db: role }) }));

import { generatePlatformKey } from "../../../../packages/domain/src/server/publicApi/platformKeys";
import { disableRemovedPlatformKeyWebhooksAtStartup } from "./platform-key-webhooks";

const first = generatePlatformKey({ name: "Alloplace", group: "alloplace", ownerEmail: "ops@alloplace.example" }).entry;
const second = generatePlatformKey({ name: "Operator", group: "lobbystack", ownerEmail: "ops@lobbystack.example", access: "all" }).entry;
const started = (environment: Record<string, string | undefined>, phase?: string) => ({ runtime: "nodejs", phase, environment: { NODE_ENV: "production", ...environment } });

describe("turning off removed platform keys' webhooks at startup", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("keeps the webhooks of every key in PLATFORM_API_KEYS, as the worker role", async () => {
    sweep.mockResolvedValueOnce(3);
    const logged = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(await disableRemovedPlatformKeyWebhooksAtStartup(started({ PLATFORM_API_KEYS: JSON.stringify([first, second]) }))).toBe(3);
    expect(sweep).toHaveBeenCalledWith({ db: "lobbystack_worker" }, { configuredPlatformKeyIds: [first.id, second.id] });
    expect(logged).toHaveBeenCalledWith(JSON.stringify({ event: "platform_key_webhooks.disabled", count: 3 }));
  });

  it("keeps the webhooks of an entry written before the rename, next to new ones", async () => {
    const { group: _group, ...rest } = generatePlatformKey({ name: "Legacy", group: "alloplace", ownerEmail: "ops@alloplace.example" }).entry;
    const legacy = { ...rest, partner: "alloplace", access: "partner" };
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await disableRemovedPlatformKeyWebhooksAtStartup(started({ PLATFORM_API_KEYS: JSON.stringify([legacy, first]) }));
    expect(sweep).toHaveBeenCalledWith(expect.anything(), { configuredPlatformKeyIds: [legacy.id, first.id] });
  });

  it("turns off every platform key's webhooks when none is configured", async () => {
    expect(await disableRemovedPlatformKeyWebhooksAtStartup(started({}))).toBe(0);
    expect(sweep).toHaveBeenCalledWith(expect.anything(), { configuredPlatformKeyIds: [] });
  });

  it("changes nothing when PLATFORM_API_KEYS is malformed, outside production, while building, or in maintenance", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await disableRemovedPlatformKeyWebhooksAtStartup(started({ PLATFORM_API_KEYS: "[{" }))).toBeNull();
    expect(warned).toHaveBeenCalledWith(expect.stringContaining("PLATFORM_API_KEYS is not valid JSON."));
    expect(await disableRemovedPlatformKeyWebhooksAtStartup(started({ NODE_ENV: "development" }))).toBeNull();
    expect(await disableRemovedPlatformKeyWebhooksAtStartup(started({}, "phase-production-build"))).toBeNull();
    expect(await disableRemovedPlatformKeyWebhooksAtStartup(started({ LOBBYSTACK_MAINTENANCE_MODE: "true" }))).toBeNull();
    expect(await disableRemovedPlatformKeyWebhooksAtStartup({ runtime: "edge", phase: undefined, environment: { NODE_ENV: "production" } })).toBeNull();
    expect(sweep).not.toHaveBeenCalled();
  });
});
