import { randomUUID } from "node:crypto";

import Redis from "ioredis";

export const VOICE_PRESENCE_TTL_MS = 30_000;
const GATEWAY_TTL_MS = 30_000;
const PRESENCE_EVENT = "call.updated";
const ACTIVATE = `
local previous = redis.call('ZSCORE', KEYS[1], ARGV[1])
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('HSET', KEYS[3], ARGV[1], ARGV[5])
if not previous or tonumber(previous) <= tonumber(ARGV[3]) then
  redis.call('PUBLISH', KEYS[2], ARGV[4])
end
return 1`;
const DEACTIVATE = `
local removed = redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('HDEL', KEYS[3], ARGV[1])
if removed == 1 then redis.call('PUBLISH', KEYS[2], ARGV[2]) end
return removed`;

let redis: Redis | undefined;

function store(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("Voice presence requires REDIS_URL.");
  redis ??= new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    connectionName: "lobbystack-admin:voice-presence",
  });
  return redis;
}

function key(businessId: string): string {
  return `${process.env.REDIS_PREFIX ?? "lobbystack"}:voice-presence:${businessId}`;
}

function realtimeChannel(businessId: string): string {
  return `${process.env.REDIS_PREFIX ?? "lobbystack"}:realtime:${businessId}`;
}

function gatewayKey(): string {
  return `${process.env.REDIS_PREFIX ?? "lobbystack"}:voice-presence:gateways`;
}

export async function renewVoicePresenceGateway(gatewayId: string): Promise<void> {
  const now = Date.now();
  await store().eval(`
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
    return redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
  `, 1, gatewayKey(), now, now + GATEWAY_TTL_MS, gatewayId);
}

export async function updateVoicePresence(input: {
  businessId: string;
  callId: string;
  active: boolean;
  gatewayId: string;
}): Promise<void> {
  const client = store();
  const now = Date.now();
  const presenceKey = key(input.businessId);
  const event = JSON.stringify({
    id: randomUUID(),
    type: PRESENCE_EVENT,
    businessId: input.businessId,
    entityId: input.callId,
    occurredAt: new Date(now).toISOString(),
    payload: { presence: input.active ? "active" : "ended" },
    trace: {},
  });
  if (input.active) {
    // Heartbeats update the expiry without causing a browser refetch each time.
    await client.eval(ACTIVATE, 3, presenceKey, realtimeChannel(input.businessId), `${presenceKey}:owners`, input.callId, now + VOICE_PRESENCE_TTL_MS, now, event, input.gatewayId);
  } else {
    await client.eval(DEACTIVATE, 3, presenceKey, realtimeChannel(input.businessId), `${presenceKey}:owners`, input.callId, event);
  }
}

export async function countActiveVoiceCalls(businessId: string): Promise<number> {
  const client = store();
  const presenceKey = key(businessId);
  const now = Date.now();
  // Retain expired evidence: losing a heartbeat does not prove that media ended.
  const count = await client.eval(`
    if redis.call('ZCOUNT', KEYS[2], '(' .. ARGV[1], '+inf') == 0 then return -1 end
    local calls = redis.call('ZRANGE', KEYS[1], 0, -1, 'WITHSCORES')
    for i = 1, #calls, 2 do
      if tonumber(calls[i + 1]) <= tonumber(ARGV[1]) then return -1 end
      local owner = redis.call('HGET', KEYS[3], calls[i])
      if not owner then return -1 end
      local ready = redis.call('ZSCORE', KEYS[2], owner)
      if not ready or tonumber(ready) <= tonumber(ARGV[1]) then return -1 end
    end
    return #calls / 2
  `, 3, presenceKey, gatewayKey(), `${presenceKey}:owners`, now);
  if (typeof count !== "number" || count < 0) {
    throw new Error("Voice presence is unavailable.");
  }
  return count;
}

export async function getVoicePresenceCallIds(businessId: string): Promise<string[]> {
  return store().zrange(key(businessId), 0, -1);
}
