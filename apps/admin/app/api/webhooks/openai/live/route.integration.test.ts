import { createHmac, randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A call to a business whose partner's tier ended over 30 days ago, through
// the live webhook and Twilio's fallback against PostgreSQL. Only OpenAI's
// client is a fake. The business gets no minutes, so the webhook rejects the
// session with 503, which makes the SIP trunk fail the call over to
// /api/webhooks/twilio/voice, and that forwards it to the business's
// transfer number.

const setup = vi.hoisted(() => {
  const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
  if (testUrl) {
    const url = new URL(testUrl);
    if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
      throw new Error("Live webhook integration tests require a dedicated local test database.");
    }
    const roleUrl = (role: string) => {
      const withRole = new URL(testUrl);
      withRole.searchParams.set("options", `-c role=${role}`);
      return withRole.toString();
    };
    process.env.DATABASE_URL = testUrl;
    process.env.LOBBYSTACK_APP_DATABASE_URL = roleUrl("lobbystack_app");
    process.env.LOBBYSTACK_WORKER_DATABASE_URL = roleUrl("lobbystack_worker");
    process.env.APP_BASE_URL = "https://desk.example.test";
    process.env.LIVE_PROTOTYPE_ENABLED = "true";
    process.env.TWILIO_AUTH_TOKEN = "twilio-test-token";
    // Billed outside LobbyStack, whatever the developer's environment says.
    delete process.env.STRIPE_CONNECT_SECRET_KEY;
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  }
  return { testUrl, unwrap: vi.fn(), reject: vi.fn(async () => undefined), accept: vi.fn(async () => undefined), attach: vi.fn(async () => undefined) };
});

vi.mock("server-only", () => ({}));
vi.mock("@lobbystack/agent-core/live/session", () => ({ buildPhoneSessionConfig: vi.fn() }));
vi.mock("@/lib/live-prototype", () => ({
  attachWorkerToLiveSession: setup.attach,
  getLiveClient: () => ({ webhooks: { unwrap: setup.unwrap }, live: { sessions: { reject: setup.reject, accept: setup.accept } } }),
}));
// The worker's database, without the Redis snapshot cache.
vi.mock("@/lib/domain-context", async () => {
  const { getWorkerDatabase } = await import("@/lib/api-helpers");
  return { createWorkerDomainContext: () => ({ db: getWorkerDatabase().db }) };
});

import { businessContextSnapshots, businesses, calls, createDatabaseClient, partnerLifecycles, partners, phoneNumbers, receptionistProfiles } from "@lobbystack/db";

import { POST as forwardCall } from "../../twilio/voice/route";
import { POST as incomingCall } from "./route";

const admin = setup.testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: setup.testUrl }) : undefined;
const partnerId = randomUUID();
const businessId = randomUUID();
const line = `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
const transfer = "+14165550188";
const DAY = 24 * 60 * 60_000;

/** OpenAI telling the deployment a call to the business's number is ringing. */
async function ring(): Promise<string> {
  const sessionId = `rtc_${randomUUID()}`;
  setup.unwrap.mockResolvedValueOnce({ type: "live.transport.incoming", created_at: Math.floor(Date.now() / 1000), data: { session_id: sessionId, sip_headers: [{ name: "Diversion", value: `<sip:${line}@twilio.example>` }, { name: "From", value: "<sip:+14165550134@example.com>" }] } });
  const response = await incomingCall(new Request("https://desk.example.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));
  expect(response.status).toBe(200);
  return sessionId;
}

/** Twilio asking where the call the trunk failed over goes, signed as Twilio signs it. */
async function failOver(): Promise<string> {
  const params = { CallSid: `CA${randomUUID().replaceAll("-", "")}`, From: "+14165550134", To: line };
  const url = "https://desk.example.test/api/webhooks/twilio/voice";
  const signed = url + Object.keys(params).sort().map((key) => key + params[key as keyof typeof params]).join("");
  const signature = createHmac("sha1", "twilio-test-token").update(signed).digest("base64");
  const response = await forwardCall(new Request(url, { method: "POST", headers: { "x-twilio-signature": signature, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) }));
  return await response.text();
}

beforeAll(async () => {
  if (!admin) return;
  await admin.db.insert(partners).values({ id: partnerId, name: "Acme Reception", slug: `acme-${partnerId.slice(0, 8)}` });
  await admin.db.insert(businesses).values({ id: businessId, slug: `harbor-${businessId.slice(0, 8)}`, name: "Harbor Dental", timezone: "America/Toronto", businessType: "dental", partnerId });
  await admin.db.insert(phoneNumbers).values({ businessId, e164: line, providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, status: "active" });
  await admin.db.insert(receptionistProfiles).values({ businessId, greeting: "Hi", tone: "warm", summary: "Harbor Dental", bookingPolicy: "Book", transferMode: "never", transferNumber: transfer })
    .onConflictDoUpdate({ target: receptionistProfiles.businessId, set: { transferNumber: transfer } });
  await admin.db.insert(businessContextSnapshots).values({ businessId, version: "v1", snapshot: { businessId, greeting: "Hi" } });
  // The partner's tier ended 31 days ago, so the hourly job paused its businesses a day ago.
  await admin.db.insert(partnerLifecycles).values({ partnerId, state: "paused", since: new Date(Date.now() - DAY) });
});

afterAll(async () => {
  if (!admin) return;
  await admin.db.delete(businesses).where(inArray(businesses.id, [businessId]));
  await admin.db.delete(partners).where(eq(partners.id, partnerId));
  await admin.pool.end();
  const { getDatabase } = await import("@/lib/databases");
  await Promise.all(["lobbystack_app", "lobbystack_worker"].map(async (role) => await getDatabase(role as "lobbystack_app" | "lobbystack_worker").pool.end()));
});

describe.skipIf(!admin)("a call to a paused partner's business", () => {
  it("is rejected with 503 before it's answered, and Twilio's fallback forwards it to the transfer number", async () => {
    const sessionId = await ring();
    // Twilio fails a call over on 503, never on 486, which would leave the caller a busy signal.
    expect(setup.reject).toHaveBeenCalledWith(sessionId, { status_code: 503 });
    expect(setup.accept).not.toHaveBeenCalled();
    expect(await admin!.db.select({ id: calls.id }).from(calls).where(eq(calls.businessId, businessId))).toEqual([]);
    expect(await failOver()).toBe(`<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${transfer}</Dial></Response>`);
  });

  it("is answered again once the partner pays for a tier", async () => {
    await admin!.db.update(partnerLifecycles).set({ state: "active", since: new Date() }).where(eq(partnerLifecycles.partnerId, partnerId));
    setup.reject.mockClear();
    const sessionId = await ring();
    expect(setup.reject).not.toHaveBeenCalled();
    expect(setup.accept).toHaveBeenCalledWith(sessionId, expect.anything());
    expect(setup.attach).toHaveBeenCalledWith(expect.objectContaining({ sessionId, businessId, channel: "voice" }));
    expect(await admin!.db.select({ id: calls.id }).from(calls).where(eq(calls.businessId, businessId))).toHaveLength(1);
  });
});
