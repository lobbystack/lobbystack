import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";

import { eq } from "drizzle-orm";

import { businesses, businessMemberships, createDatabaseClient, users } from "@lobbystack/db";

const postgresPort = process.env.POSTGRES_PORT ?? "15433";
const postgresPassword = process.env.POSTGRES_PASSWORD ?? "replace-with-a-long-local-password";
const migrator = createDatabaseClient("lobbystack_migrator", {
  DATABASE_URL: process.env.REPLACEMENT_MIGRATOR_DATABASE_URL ?? `postgres://postgres:${postgresPassword}@127.0.0.1:${postgresPort}/lobbystack`,
});
const adminBaseUrl = process.env.ADMIN_BASE_URL ?? "http://localhost:13000";
const redisHost = process.env.REPLACEMENT_REDIS_HOST ?? "127.0.0.1";
const redisPort = Number(process.env.REDIS_PORT ?? "16380");
const redisPrefix = process.env.REDIS_PREFIX ?? "lobbystack";
const realtimeEventTypes = [
  "call.started",
  "call.updated",
  "call.completed",
  "transcript.upserted",
  "recording.available",
  "message.upserted",
  "message.deliveryUpdated",
  "conversation.updated",
  "appointment.updated",
  "knowledge.progressed",
  "document.progressed",
  "billing.updated",
] as const;

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/((?:__Secure-)?better-auth\.session_token=[^;]+)/);
  if (!match?.[1]) throw new Error("Better Auth signup did not return a session cookie.");
  return match[1];
}

async function publish(channel: string, message: string): Promise<void> {
  const args = ["PUBLISH", channel, message];
  const command = `*${args.length}\r\n${args.map((value) => `$${Buffer.byteLength(value)}\r\n${value}\r\n`).join("")}`;
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: redisHost, port: redisPort });
    socket.setTimeout(2_000);
    socket.once("connect", () => socket.write(command));
    socket.once("data", () => { socket.end(); resolve(); });
    socket.once("timeout", () => { socket.destroy(); reject(new Error("Redis publish timed out.")); });
    socket.once("error", reject);
  });
}

class EventStreamReader {
  private buffer = "";
  private readonly decoder = new TextDecoder();
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;

  constructor(response: Response) {
    if (!response.body) throw new Error("SSE response did not include a body.");
    this.reader = response.body.getReader();
  }

  async nextFrame(timeoutMs = 3_000): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Timed out waiting for an SSE frame.")), timeoutMs);
    });
    try {
      return await Promise.race([this.readFrame(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async close(): Promise<void> {
    await this.reader.cancel().catch(() => undefined);
  }

  private async readFrame(): Promise<string> {
    while (!this.buffer.includes("\n\n")) {
      const chunk = await this.reader.read();
      if (chunk.done) throw new Error("SSE stream closed before the expected frame arrived.");
      this.buffer += this.decoder.decode(chunk.value, { stream: true }).replaceAll("\r\n", "\n");
    }
    const boundary = this.buffer.indexOf("\n\n");
    const frame = this.buffer.slice(0, boundary);
    this.buffer = this.buffer.slice(boundary + 2);
    return frame;
  }
}

async function openStream(businessId: string, cookie: string, signal?: AbortSignal): Promise<{ response: Response; reader?: EventStreamReader }> {
  const response = await fetch(`${adminBaseUrl}/api/realtime?businessId=${businessId}`, { headers: { cookie }, signal });
  return { response, ...(response.ok ? { reader: new EventStreamReader(response) } : {}) };
}

async function main(): Promise<void> {
  const suffix = randomUUID();
  const email = `${suffix}@realtime.invalid`;
  const firstBusinessId = randomUUID();
  const secondBusinessId = randomUUID();

  try {
    const signup = await fetch(`${adminBaseUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: adminBaseUrl },
      body: JSON.stringify({ email, name: "Realtime Check", password: `Realtime-${suffix}!` }),
    });
    if (!signup.ok) throw new Error(`Better Auth signup failed with status ${signup.status}: ${await signup.text()}`);
    const cookie = sessionCookie(signup);
    const user = (await migrator.db.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, email)).limit(1))[0];
    if (!user) throw new Error("Better Auth signup did not persist the certification user.");

    await migrator.db.insert(businesses).values([
      { id: firstBusinessId, slug: `realtime-a-${suffix}`, name: "Realtime A", timezone: "UTC", businessType: "service_company" },
      { id: secondBusinessId, slug: `realtime-b-${suffix}`, name: "Realtime B", timezone: "UTC", businessType: "service_company" },
    ]);
    await migrator.db.insert(businessMemberships).values({ businessId: firstBusinessId, userId: user.id, role: "business_owner" });

    const unauthenticated = await fetch(`${adminBaseUrl}/api/realtime?businessId=${firstBusinessId}`);
    if (unauthenticated.status !== 401) throw new Error(`Unauthenticated SSE returned ${unauthenticated.status} instead of 401.`);
    const unauthorized = await openStream(secondBusinessId, cookie);
    if (unauthorized.response.status !== 403) throw new Error(`Cross-tenant SSE returned ${unauthorized.response.status} instead of 403.`);

    const controller = new AbortController();
    const first = await openStream(firstBusinessId, cookie, controller.signal);
    if (!first.reader) throw new Error(`Authenticated SSE failed with status ${first.response.status}.`);
    const ready = await first.reader.nextFrame();
    if (!ready.includes("event: ready") || !ready.includes(firstBusinessId)) throw new Error("SSE stream did not emit the expected ready frame.");

    const foreignEvent = { id: randomUUID(), type: "call.updated", businessId: secondBusinessId, occurredAt: new Date().toISOString(), payload: {}, trace: {} };
    const ownEvent = { ...foreignEvent, id: randomUUID(), businessId: firstBusinessId };
    await publish(`${redisPrefix}:realtime:${firstBusinessId}`, JSON.stringify(foreignEvent));
    await publish(`${redisPrefix}:realtime:${firstBusinessId}`, JSON.stringify(ownEvent));
    const delivered = await first.reader.nextFrame();
    if (!delivered.includes(ownEvent.id) || delivered.includes(foreignEvent.id)) throw new Error("SSE tenant filtering delivered an invalid event.");

    const latencies: number[] = [];
    for (let index = 0; index < realtimeEventTypes.length * 2; index += 1) {
      const event = { ...ownEvent, id: randomUUID(), type: realtimeEventTypes[index % realtimeEventTypes.length], occurredAt: new Date().toISOString() };
      const startedAt = performance.now();
      await publish(`${redisPrefix}:realtime:${firstBusinessId}`, JSON.stringify(event));
      const frame = await first.reader.nextFrame();
      latencies.push(performance.now() - startedAt);
      if (!frame.includes(event.id) || !frame.includes(`event: ${event.type}`)) throw new Error(`SSE did not deliver ${event.type}.`);
    }
    const sortedLatencies = [...latencies].sort((left, right) => left - right);
    const p95 = sortedLatencies[Math.ceil(sortedLatencies.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    if (p95 >= 500) throw new Error(`Realtime local p95 was ${p95.toFixed(1)} ms, exceeding the 500 ms target.`);
    controller.abort();
    await first.reader.close();

    const reconnect = await openStream(firstBusinessId, cookie);
    if (!reconnect.reader) throw new Error(`SSE reconnect failed with status ${reconnect.response.status}.`);
    const reconnectReady = await reconnect.reader.nextFrame();
    if (!reconnectReady.includes("event: ready")) throw new Error("SSE reconnect did not emit a ready frame for client reconciliation.");
    const reconnectEvent = { ...ownEvent, id: randomUUID(), occurredAt: new Date().toISOString() };
    await publish(`${redisPrefix}:realtime:${firstBusinessId}`, JSON.stringify(reconnectEvent));
    const reconnectDelivered = await reconnect.reader.nextFrame();
    if (!reconnectDelivered.includes(reconnectEvent.id)) throw new Error("SSE reconnect did not resume event delivery.");
    await reconnect.reader.close();

    console.log("realtime-authentication: ok");
    console.log("realtime-cross-tenant: ok");
    console.log("realtime-reconnect: ok");
    console.log(`realtime-events: ok (${realtimeEventTypes.length} types, p95 ${p95.toFixed(1)} ms)`);
  } finally {
    await migrator.db.delete(users).where(eq(users.normalizedEmail, email)).catch(() => undefined);
    await migrator.db.delete(businesses).where(eq(businesses.id, firstBusinessId)).catch(() => undefined);
    await migrator.db.delete(businesses).where(eq(businesses.id, secondBusinessId)).catch(() => undefined);
    await migrator.pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
