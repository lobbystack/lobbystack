import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { postNumberReleasedInTransaction, postProductUpdates } from "@lobbystack/domain";
import type { ProductUpdateEntry } from "@lobbystack/shared";

const mocks = vi.hoisted(() => ({ reason: "trial" as string | null }));

/** Each update answers with the claimed number: the first marks it reclaiming, the second reclaimed. */
const tx = {
  update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: "number-1", providerPhoneId: null, carrier: "twilio", e164: "+15145550100", reclaimReason: mocks.reason }] }) }) }),
};

vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/db")>(),
  withBusinessTransaction: async (_db: unknown, _scope: unknown, callback: (inner: unknown) => unknown) => await callback(tx),
}));
vi.mock("@lobbystack/domain", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/domain")>(),
  postNumberReleasedInTransaction: vi.fn(async () => undefined),
  postProductUpdates: vi.fn(async () => ["multiple-agents"]),
}));

import { handleJob } from "./handlers";

afterEach(() => { vi.clearAllMocks(); });

const job = (type: JobEnvelope["type"], businessId: string, payload: Record<string, unknown> = {}): JobEnvelope => ({ jobId: randomUUID(), type, queue: "maintenance", businessId, payload, trace: {}, idempotencyKey: `${type}:${businessId}`, scheduled: true });

describe("phoneNumber.reclaim release", () => {
  it.each([["trial", true], ["subscription_ended", false]])("tells the bell when a number a %s gave up is released", async (reason, trial) => {
    mocks.reason = reason;
    const businessId = randomUUID();
    await expect(handleJob(job("phoneNumber.reclaim", businessId, { phoneNumberId: "number-1" }), { domain: { db: {} as never } })).resolves.toMatchObject({ status: "completed" });
    expect(postNumberReleasedInTransaction).toHaveBeenCalledWith(tx, { businessId, phoneNumberId: "number-1", e164: "+15145550100", trial });
  });

  it("releases a replaced number quietly", async () => {
    mocks.reason = "replacement";
    await expect(handleJob(job("phoneNumber.reclaim", randomUUID(), { phoneNumberId: "number-1" }), { domain: { db: {} as never } })).resolves.toMatchObject({ status: "completed" });
    expect(postNumberReleasedInTransaction).not.toHaveBeenCalled();
  });
});

describe("notification.productUpdates", () => {
  it("posts the changelog entries the worker was given to the business's bell", async () => {
    const businessId = randomUUID();
    const entries: ProductUpdateEntry[] = [{ slug: "multiple-agents", pubDate: "2026-11-11T00:00:00.000Z", dashboardHref: "/agents", copy: { en: { title: "T", description: "D", href: "https://lobbystack.com/changelog/" } } }];
    const domain = { db: {} as never };
    await expect(handleJob(job("notification.productUpdates", businessId), { domain, productUpdates: entries })).resolves.toEqual({ status: "completed", entityId: `${businessId}:1` });
    expect(postProductUpdates).toHaveBeenCalledWith(domain, { businessId, entries });
  });

  it("falls back to the entries bundled from the changelog", async () => {
    vi.mocked(postProductUpdates).mockResolvedValueOnce([]);
    const businessId = randomUUID();
    await expect(handleJob(job("notification.productUpdates", businessId), { domain: { db: {} as never } })).resolves.toMatchObject({ status: "skipped" });
    const [, input] = vi.mocked(postProductUpdates).mock.calls[0]!;
    expect(input.entries.map((entry) => entry.slug)).toEqual(expect.arrayContaining(["multiple-agents", "calendar-booking-time-off", "channel-rules"]));
  });
});
