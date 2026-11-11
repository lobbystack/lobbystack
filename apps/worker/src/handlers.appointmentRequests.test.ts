import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { closePassedAppointmentRequests } from "@lobbystack/domain";

vi.mock("@lobbystack/domain", async (importOriginal) => ({ ...await importOriginal<typeof import("@lobbystack/domain")>(), closePassedAppointmentRequests: vi.fn(async () => ({ closed: 2 })) }));
vi.mock("./calendarJobs", async (importOriginal) => ({ ...await importOriginal<typeof import("./calendarJobs")>(), reconcileBusinessCalendar: vi.fn(async (_dependencies: unknown, businessId: string) => ({ status: "completed", entityId: businessId })) }));

import { reconcileBusinessCalendar } from "./calendarJobs";
import { handleJob } from "./handlers";

afterEach(() => { vi.clearAllMocks(); });

const domain = { db: undefined as never };

function job(businessId: string, payload: Record<string, unknown> = {}): JobEnvelope {
  return { jobId: randomUUID(), type: "calendar.reconcileBusiness", queue: "default", businessId, payload, trace: {}, idempotencyKey: `calendar-reconcile:${businessId}`, scheduled: true };
}

describe("calendar.reconcileBusiness", () => {
  it("closes the business's requests about appointments that have passed, then syncs its calendars", async () => {
    const businessId = randomUUID();
    await expect(handleJob(job(businessId), { domain })).resolves.toEqual({ status: "completed", entityId: businessId });
    expect(closePassedAppointmentRequests).toHaveBeenCalledWith(domain, { businessId });
    expect(reconcileBusinessCalendar).toHaveBeenCalledWith(expect.anything(), businessId, undefined);
  });

  it("does both for a webhook delivery about one connection", async () => {
    const businessId = randomUUID();
    await handleJob(job(businessId, { scope: "connection", connectionId: "connection-1" }), { domain });
    expect(closePassedAppointmentRequests).toHaveBeenCalledWith(domain, { businessId });
    expect(reconcileBusinessCalendar).toHaveBeenCalledWith(expect.anything(), businessId, "connection-1");
  });
});
