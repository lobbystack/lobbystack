import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { processWebhookDelivery, pruneApiHistory, recordProductEvent } from "@lobbystack/domain";

vi.mock("@lobbystack/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lobbystack/domain")>()),
  processWebhookDelivery: vi.fn(),
  pruneApiHistory: vi.fn(),
  recordProductEvent: vi.fn(),
}));

import { handleJob } from "./handlers";

const businessId = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";

function envelope(type: JobEnvelope["type"], payload: Record<string, unknown>): JobEnvelope {
  return { jobId: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", type, queue: "default", businessId, payload, trace: {}, idempotencyKey: `${type}:1`, scheduled: false };
}

afterEach(() => { vi.clearAllMocks(); });

describe("webhook jobs", () => {
  it("runs one delivery attempt with the injected sender", async () => {
    vi.mocked(processWebhookDelivery).mockResolvedValue({ outcome: "retry_scheduled", endpointDisabled: false });
    vi.mocked(recordProductEvent).mockResolvedValue(null);
    const webhookSender = vi.fn();
    const domain = { db: {} as never };
    const result = await handleJob(envelope("webhook.deliver", { deliveryId: "d1", attempt: 3 }), { domain, webhookSender });
    expect(processWebhookDelivery).toHaveBeenCalledWith(domain, { businessId, deliveryId: "d1", attempt: 3, send: webhookSender });
    expect(result).toEqual({ status: "completed", entityId: "d1:3:retry_scheduled" });
  });

  it("skips malformed delivery jobs", async () => {
    expect(await handleJob(envelope("webhook.deliver", { attempt: 1 }), { domain: { db: {} as never } })).toEqual({ status: "skipped" });
    expect(processWebhookDelivery).not.toHaveBeenCalled();
  });

  it("prunes webhook history and idempotency keys", async () => {
    vi.mocked(pruneApiHistory).mockResolvedValue({ events: 2, idempotencyKeys: 1 });
    expect(await handleJob({ ...envelope("api.retention", {}), recurring: true }, { domain: { db: {} as never } })).toEqual({ status: "completed", entityId: `${businessId}:2:1` });
  });
});
