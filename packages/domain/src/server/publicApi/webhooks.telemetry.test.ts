import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const metrics = vi.hoisted(() => ({ adds: [] as Array<{ meter: string; name: string; value: number; attributes: Record<string, unknown> | undefined }> }));

// Record every counter the production code creates; other instruments are no-ops.
vi.mock("@lobbystack/telemetry/node", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lobbystack/telemetry/node")>()),
  getMeter: (meter = "lobbystack") => ({
    createCounter: (name: string) => ({ add: (value: number, attributes?: Record<string, unknown>) => metrics.adds.push({ meter, name, value, attributes }) }),
    createHistogram: () => ({ record: () => undefined }),
    createUpDownCounter: () => ({ add: () => undefined }),
    createObservableGauge: () => ({ addCallback: () => undefined }),
  }),
}));

import { businesses, contacts, createDatabaseClient, webhookDeliveries, webhookEndpoints, withBusinessTransaction } from "@lobbystack/db";
import { WEBHOOK_MAX_ATTEMPTS } from "@lobbystack/shared";

import { emitWebhookEvent, emitWebhookEventInTransaction, processWebhookDelivery } from "./webhooks";
import { encryptWebhookSecret, generateWebhookSecret } from "./webhookTransport";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Webhook telemetry tests require a dedicated local test database.");
  }
}

function roleUrl(role: string): string {
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c role=${role}`);
  return url.toString();
}

const admin = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
const worker = testUrl ? createDatabaseClient("lobbystack_worker", { DATABASE_URL: process.env.LOBBYSTACK_PUBLIC_API_TEST_WORKER_DATABASE_URL ?? roleUrl("lobbystack_worker") }) : undefined;
const businessId = randomUUID();
let endpointId: string;
let contactId: string;

const added = (name: string) => metrics.adds.filter((entry) => entry.meter === "lobbystack-webhooks" && entry.name === name);

async function queueDelivery(): Promise<string> {
  const eventId = await emitWebhookEvent({ db: worker!.db }, { businessId, type: "contact.created", resourceId: contactId });
  const [row] = await admin!.db.select({ id: webhookDeliveries.id }).from(webhookDeliveries).where(eq(webhookDeliveries.eventId, eventId!));
  return row!.id;
}

describe.skipIf(!testUrl)("webhook OpenTelemetry counters on the real paths", () => {
  beforeAll(async () => {
    await admin!.db.insert(businesses).values({ id: businessId, slug: `webhook-metrics-${businessId}`, name: "Webhook metrics", timezone: "UTC", businessType: "test" });
    const [endpoint] = await admin!.db.insert(webhookEndpoints).values({ businessId, url: "https://hooks.example.com/in", events: ["contact.created"], encryptedSecret: encryptWebhookSecret(generateWebhookSecret()) }).returning({ id: webhookEndpoints.id });
    endpointId = endpoint!.id;
    const [contact] = await admin!.db.insert(contacts).values({ businessId, phone: "+14165550100", name: "Metrics" }).returning({ id: contacts.id });
    contactId = contact!.id;
  });

  beforeEach(() => { metrics.adds.length = 0; });

  afterAll(async () => {
    await admin?.db.delete(businesses).where(eq(businesses.id, businessId));
    await Promise.all([admin?.pool.end(), worker?.pool.end()]);
  });

  it("counts an emission that fails, without failing the caller's transaction", async () => {
    const result = await withBusinessTransaction(worker!.db, { businessId, actorType: "worker" }, async (tx) => {
      // A resource id that is not a UUID makes the event lookup fail inside the savepoint.
      const eventId = await emitWebhookEventInTransaction(tx, { businessId, type: "contact.created", resourceId: "not-a-uuid" });
      const [row] = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, contactId));
      return { eventId, stillUsable: Boolean(row) };
    });
    expect(result).toEqual({ eventId: null, stillUsable: true });
    expect(added("lobbystack.webhooks.emit_failures")).toEqual([expect.objectContaining({ value: 1, attributes: { type: "contact.created" } })]);
  });

  it("counts each delivery attempt by outcome", async () => {
    const context = { db: worker!.db };
    const succeeding = await queueDelivery();
    await processWebhookDelivery(context, { businessId, deliveryId: succeeding, attempt: 1, send: async () => ({ ok: true, status: 200, error: null, durationMs: 1 }) });
    const failing = await queueDelivery();
    await processWebhookDelivery(context, { businessId, deliveryId: failing, attempt: 1, send: async () => ({ ok: false, status: 500, error: "HTTP 500", durationMs: 1 }) });
    expect(added("lobbystack.webhooks.delivery_attempts").map((entry) => entry.attributes)).toEqual([{ outcome: "success" }, { outcome: "failure" }]);
  });

  it("counts an endpoint that is turned off after sustained failure", async () => {
    const context = { db: worker!.db };
    await admin!.db.update(webhookEndpoints).set({ lastSuccessAt: null }).where(eq(webhookEndpoints.id, endpointId));
    const deliveryId = await queueDelivery();
    const fail = async () => ({ ok: false, status: 503, error: "HTTP 503", durationMs: 1 });
    let last = { outcome: "", endpointDisabled: false };
    for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt += 1) last = await processWebhookDelivery(context, { businessId, deliveryId, attempt, send: fail });
    expect(last.endpointDisabled).toBe(true);
    expect(added("lobbystack.webhooks.endpoints_disabled")).toEqual([expect.objectContaining({ value: 1 })]);
    expect(added("lobbystack.webhooks.delivery_attempts")).toHaveLength(WEBHOOK_MAX_ATTEMPTS);
  });
});
