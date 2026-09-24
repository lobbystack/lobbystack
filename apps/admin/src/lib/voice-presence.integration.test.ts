import { randomUUID } from "node:crypto";

import Redis from "ioredis";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testUrl = process.env.REDIS_TEST_URL;
const businessId = randomUUID();
const otherBusinessId = randomUUID();
const prefix = `lobbystack:voice-presence-test:${randomUUID()}`;
let inspector: Redis;
let subscriber: Redis;

describe.runIf(Boolean(testUrl))("live voice presence in Redis", () => {
  beforeAll(async () => {
    process.env.REDIS_URL = testUrl;
    process.env.REDIS_PREFIX = prefix;
    inspector = new Redis(testUrl!);
    subscriber = new Redis(testUrl!);
    await subscriber.subscribe(`${prefix}:realtime:${businessId}`);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await inspector.del(`${prefix}:voice-presence:${businessId}`, `${prefix}:voice-presence:${businessId}:owners`, `${prefix}:voice-presence:${otherBusinessId}`, `${prefix}:voice-presence:gateways`);
    subscriber.disconnect();
    inspector.disconnect();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    subscriber.removeAllListeners("message");
  });

  it("counts only fresh sessions and publishes transitions instead of every heartbeat", async () => {
    const { countActiveVoiceCalls, renewVoicePresenceGateway, updateVoicePresence, VOICE_PRESENCE_TTL_MS } = await import("./voice-presence");
    const events: Array<{ type: string; entityId: string; businessId: string }> = [];
    subscriber.on("message", (_channel, message) => { events.push(JSON.parse(message)); });
    const callId = randomUUID();
    const secondCallId = randomUUID();
    const gatewayId = randomUUID();
    const secondGatewayId = randomUUID();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);

    await expect(countActiveVoiceCalls(businessId)).rejects.toThrow("Voice presence is unavailable");
    await renewVoicePresenceGateway(gatewayId);
    await renewVoicePresenceGateway(secondGatewayId);
    expect(await countActiveVoiceCalls(businessId)).toBe(0);
    await updateVoicePresence({ businessId, callId, active: true, gatewayId });
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toEqual(expect.objectContaining({ type: "call.updated", entityId: callId, businessId }));
    expect(await countActiveVoiceCalls(businessId)).toBe(1);
    expect(await countActiveVoiceCalls(otherBusinessId)).toBe(0);
    await updateVoicePresence({ businessId, callId: secondCallId, active: true, gatewayId: secondGatewayId });
    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(await countActiveVoiceCalls(businessId)).toBe(2);
    clock.mockReturnValue(now + VOICE_PRESENCE_TTL_MS - 1_000);
    await updateVoicePresence({ businessId, callId, active: true, gatewayId });
    await renewVoicePresenceGateway(gatewayId);
    expect(events).toHaveLength(2);
    clock.mockReturnValue(now + VOICE_PRESENCE_TTL_MS + 1_000);
    await expect(countActiveVoiceCalls(businessId)).rejects.toThrow("Voice presence is unavailable");
    // Fresh gateway A must not conceal stale media evidence from gateway B.
    await updateVoicePresence({ businessId, callId: secondCallId, active: false, gatewayId: secondGatewayId });
    await vi.waitFor(() => expect(events).toHaveLength(3));
    expect(await countActiveVoiceCalls(businessId)).toBe(1);
    clock.mockReturnValue(now + 2 * VOICE_PRESENCE_TTL_MS);
    await expect(countActiveVoiceCalls(businessId)).rejects.toThrow("Voice presence is unavailable");

    await renewVoicePresenceGateway(gatewayId);
    await updateVoicePresence({ businessId, callId, active: true, gatewayId });
    await vi.waitFor(() => expect(events).toHaveLength(4));
    expect(await countActiveVoiceCalls(businessId)).toBe(1);
    await updateVoicePresence({ businessId, callId, active: false, gatewayId });
    await vi.waitFor(() => expect(events).toHaveLength(5));
    expect(await countActiveVoiceCalls(businessId)).toBe(0);
  });

  it("ignores the previous gateway's removal after ownership changes and allows completion reconciliation", async () => {
    const { countActiveVoiceCalls, renewVoicePresenceGateway, removeCompletedVoicePresence, updateVoicePresence } = await import("./voice-presence");
    const callId = randomUUID();
    const firstGateway = randomUUID();
    const nextGateway = randomUUID();
    const events: string[] = [];
    subscriber.on("message", (_channel, message) => { events.push(message); });
    await renewVoicePresenceGateway(firstGateway);
    await renewVoicePresenceGateway(nextGateway);
    await updateVoicePresence({ businessId, callId, active: true, gatewayId: firstGateway });
    await vi.waitFor(() => expect(events).toHaveLength(1));
    await updateVoicePresence({ businessId, callId, active: true, gatewayId: nextGateway });
    await updateVoicePresence({ businessId, callId, active: false, gatewayId: firstGateway });
    await subscriber.ping();
    expect(events).toHaveLength(1);
    expect(await countActiveVoiceCalls(businessId)).toBe(1);
    expect(await inspector.hget(`${prefix}:voice-presence:${businessId}:owners`, callId)).toBe(nextGateway);

    await updateVoicePresence({ businessId, callId, active: false, gatewayId: nextGateway });
    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(await countActiveVoiceCalls(businessId)).toBe(0);

    await updateVoicePresence({ businessId, callId, active: true, gatewayId: nextGateway });
    await removeCompletedVoicePresence({ businessId, callId });
    await vi.waitFor(() => expect(events).toHaveLength(4));
    expect(await countActiveVoiceCalls(businessId)).toBe(0);
    expect(await inspector.hget(`${prefix}:voice-presence:${businessId}:owners`, callId)).toBeNull();
  });
});
