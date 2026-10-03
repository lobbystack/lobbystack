import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { BusinessHoursExtractor, ExtractedBusinessHours } from "@lobbystack/agent-core";
import type { JobEnvelope } from "@lobbystack/contracts";
import { loadBusinessHoursInput, markBusinessHoursChecked, recordAiGenerationEvent, saveGeneratedBusinessHours, type BusinessHoursInput } from "@lobbystack/domain";

vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return {
    ...actual,
    loadBusinessHoursInput: vi.fn(),
    saveGeneratedBusinessHours: vi.fn(async () => true),
    markBusinessHoursChecked: vi.fn(async () => undefined),
    recordAiGenerationEvent: vi.fn(async () => "event"),
  };
});

import { handleJob } from "./handlers";

afterEach(() => { vi.clearAllMocks(); });

const domain = { db: undefined as never };
const usage = { provider: "openai", model: "gpt-6-luna", latencyMs: 900, inputTokens: 1_800, outputTokens: 220, totalTokens: 2_020 };
const weekdays = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, openMinutes: 540, closeMinutes: 1200 }));

function job(businessId: string): JobEnvelope {
  return { jobId: randomUUID(), type: "business.extractHours", queue: "bulk", businessId, payload: { businessId, reason: "backfill" }, trace: {}, idempotencyKey: `business-hours-backfill:${businessId}:v1`, scheduled: false };
}

function hoursInput(overrides: Partial<BusinessHoursInput> = {}): BusinessHoursInput {
  return { businessName: "Salon Lepota", hoursSource: "none", existingWindows: 0, fingerprint: "new", currentFingerprint: null, sources: [{ title: "Kontakt", text: "Radno vreme: Pon-Pet 09-20h" }], ...overrides };
}

function extractor(result: ExtractedBusinessHours): BusinessHoursExtractor {
  return { modelId: { provider: "openai", model: "gpt-6-luna" }, extract: vi.fn(async () => ({ result, usage })) };
}

describe("business.extractHours", () => {
  it("saves the hours it finds and records the generation", async () => {
    const businessId = randomUUID();
    vi.mocked(loadBusinessHoursInput).mockResolvedValueOnce(hoursInput());
    const businessHoursExtractor = extractor({ status: "found", hours: weekdays });

    await expect(handleJob(job(businessId), { domain, businessHoursExtractor })).resolves.toEqual({ status: "completed", entityId: businessId });
    expect(businessHoursExtractor.extract).toHaveBeenCalledWith({ businessName: "Salon Lepota", sources: hoursInput().sources });
    expect(saveGeneratedBusinessHours).toHaveBeenCalledWith(domain, { businessId, hours: weekdays, fingerprint: "new" });
    expect(recordAiGenerationEvent).toHaveBeenCalledWith(domain, expect.objectContaining({ businessId, operation: "business.hours", inputTokens: 1_800, outputTokens: 220 }));
  });

  it("replaces hours it generated before when the knowledge changed", async () => {
    vi.mocked(loadBusinessHoursInput).mockResolvedValueOnce(hoursInput({ hoursSource: "generated", existingWindows: 5, fingerprint: "changed", currentFingerprint: "old" }));
    await expect(handleJob(job(randomUUID()), { domain, businessHoursExtractor: extractor({ status: "found", hours: weekdays }) })).resolves.toMatchObject({ status: "completed" });
    expect(saveGeneratedBusinessHours).toHaveBeenCalled();
  });

  it.each([
    ["a person set the hours", hoursInput({ hoursSource: "operator", existingWindows: 5 })],
    ["hours were saved outside the dashboard", hoursInput({ hoursSource: "none", existingWindows: 3 })],
    ["no source mentions hours", hoursInput({ sources: [] })],
    ["it already read these passages", hoursInput({ hoursSource: "generated", fingerprint: "same", currentFingerprint: "same" })],
    ["it already read these passages and found nothing", hoursInput({ fingerprint: "same", currentFingerprint: "same" })],
  ])("skips the model when %s", async (_case, input) => {
    vi.mocked(loadBusinessHoursInput).mockResolvedValueOnce(input);
    const businessHoursExtractor = extractor({ status: "found", hours: weekdays });
    await expect(handleJob(job(randomUUID()), { domain, businessHoursExtractor })).resolves.toMatchObject({ status: "skipped" });
    expect(businessHoursExtractor.extract).not.toHaveBeenCalled();
    expect(saveGeneratedBusinessHours).not.toHaveBeenCalled();
    expect(recordAiGenerationEvent).not.toHaveBeenCalled();
  });

  it("remembers passages that state no hours, so a restart doesn't read them again", async () => {
    const businessId = randomUUID();
    vi.mocked(loadBusinessHoursInput).mockResolvedValueOnce(hoursInput());
    await expect(handleJob(job(businessId), { domain, businessHoursExtractor: extractor({ status: "not_found", reason: "unsupported" }) })).resolves.toMatchObject({ status: "skipped" });
    expect(markBusinessHoursChecked).toHaveBeenCalledWith(domain, { businessId, fingerprint: "new" });
    expect(saveGeneratedBusinessHours).not.toHaveBeenCalled();
    expect(recordAiGenerationEvent).toHaveBeenCalledWith(domain, expect.objectContaining({ operation: "business.hours" }));
  });

  it("records only a stable error category when the model fails, then lets the job retry", async () => {
    const businessId = randomUUID();
    vi.mocked(loadBusinessHoursInput).mockResolvedValueOnce(hoursInput());
    const businessHoursExtractor: BusinessHoursExtractor = { modelId: { provider: "openai", model: "gpt-6-luna" }, extract: vi.fn(async () => { throw new Error("provider echoed: Radno vreme"); }) };
    await expect(handleJob(job(businessId), { domain, businessHoursExtractor })).rejects.toThrow();
    expect(recordAiGenerationEvent).toHaveBeenCalledWith(domain, expect.objectContaining({ businessId, operation: "business.hours", isError: true, error: "generation_failed" }));
    expect(markBusinessHoursChecked).not.toHaveBeenCalled();
  });

  it("skips without a text model", async () => {
    await expect(handleJob(job(randomUUID()), { domain })).resolves.toMatchObject({ status: "skipped" });
    expect(loadBusinessHoursInput).not.toHaveBeenCalled();
  });
});
