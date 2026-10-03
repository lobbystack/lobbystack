import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { BusinessSummarizer } from "@lobbystack/agent-core";
import type { JobEnvelope } from "@lobbystack/contracts";
import { loadBusinessSummaryInput, recordAiGenerationEvent, resetGeneratedBusinessSummary, saveGeneratedBusinessSummary, type BusinessSummaryInput } from "@lobbystack/domain";

vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return {
    ...actual,
    loadBusinessSummaryInput: vi.fn(),
    saveGeneratedBusinessSummary: vi.fn(async () => true),
    resetGeneratedBusinessSummary: vi.fn(async () => true),
    recordAiGenerationEvent: vi.fn(async () => "event"),
  };
});

import { handleJob } from "./handlers";

afterEach(() => { vi.clearAllMocks(); });

const domain = { db: undefined as never };
const usage = { provider: "openai", model: "gpt-6-luna", latencyMs: 1_200, inputTokens: 2_400, outputTokens: 90, totalTokens: 2_490 };

function job(businessId: string, payload: Record<string, unknown> = {}): JobEnvelope {
  return { jobId: randomUUID(), type: "business.generateSummary", queue: "bulk", businessId, payload: { businessId, ...payload }, trace: {}, idempotencyKey: `business-summary:${businessId}`, scheduled: false };
}

function summaryInput(overrides: Partial<BusinessSummaryInput> = {}): BusinessSummaryInput {
  return { businessName: "Maple Family Clinic", locale: "en", summarySource: "placeholder", fingerprint: "new", currentFingerprint: null, sources: [{ title: "Home", text: "Family practice in Toronto offering checkups." }], ...overrides };
}

function summarizer(summary: string | null): BusinessSummarizer {
  return { modelId: { provider: "openai", model: "gpt-6-luna" }, summarize: vi.fn(async () => ({ summary, usage })) };
}

describe("business.generateSummary", () => {
  it("writes the summary from the knowledge sources and records the generation", async () => {
    const businessId = randomUUID();
    vi.mocked(loadBusinessSummaryInput).mockResolvedValueOnce(summaryInput());
    const businessSummarizer = summarizer("Maple Family Clinic is a family practice in Toronto.");

    await expect(handleJob(job(businessId), { domain, businessSummarizer })).resolves.toEqual({ status: "completed", entityId: businessId });
    expect(businessSummarizer.summarize).toHaveBeenCalledWith({ businessName: "Maple Family Clinic", locale: "en", sources: summaryInput().sources });
    expect(saveGeneratedBusinessSummary).toHaveBeenCalledWith(domain, { businessId, summary: "Maple Family Clinic is a family practice in Toronto.", fingerprint: "new" });
    expect(recordAiGenerationEvent).toHaveBeenCalledWith(domain, expect.objectContaining({ businessId, operation: "business.summary", inputTokens: 2_400 }));
  });

  it.each([
    ["an operator wrote the summary", summaryInput({ summarySource: "operator" })],
    ["the business has no knowledge yet", summaryInput({ sources: [] })],
    ["the knowledge hasn't changed", summaryInput({ summarySource: "generated", fingerprint: "same", currentFingerprint: "same" })],
  ])("skips the model when %s", async (_case, input) => {
    vi.mocked(loadBusinessSummaryInput).mockResolvedValueOnce(input);
    const businessSummarizer = summarizer("unused");
    await expect(handleJob(job(randomUUID()), { domain, businessSummarizer })).resolves.toMatchObject({ status: "skipped" });
    expect(businessSummarizer.summarize).not.toHaveBeenCalled();
    expect(saveGeneratedBusinessSummary).not.toHaveBeenCalled();
  });

  it("puts the placeholder back when every source of a generated summary is gone", async () => {
    const businessId = randomUUID();
    vi.mocked(loadBusinessSummaryInput).mockResolvedValueOnce(summaryInput({ summarySource: "generated", sources: [] }));
    const businessSummarizer = summarizer("unused");
    await expect(handleJob(job(businessId), { domain, businessSummarizer })).resolves.toEqual({ status: "completed", entityId: businessId });
    expect(resetGeneratedBusinessSummary).toHaveBeenCalledWith(domain, { businessId, businessName: "Maple Family Clinic" });
    expect(businessSummarizer.summarize).not.toHaveBeenCalled();
  });

  it("rewrites unchanged knowledge when the operator asks", async () => {
    vi.mocked(loadBusinessSummaryInput).mockResolvedValueOnce(summaryInput({ summarySource: "generated", fingerprint: "same", currentFingerprint: "same" }));
    const businessSummarizer = summarizer("A fresh summary.");
    await expect(handleJob(job(randomUUID(), { force: true }), { domain, businessSummarizer })).resolves.toMatchObject({ status: "completed" });
    expect(saveGeneratedBusinessSummary).toHaveBeenCalled();
  });

  it("keeps the old summary when the sources don't say what the business does", async () => {
    vi.mocked(loadBusinessSummaryInput).mockResolvedValueOnce(summaryInput());
    await expect(handleJob(job(randomUUID()), { domain, businessSummarizer: summarizer(null) })).resolves.toMatchObject({ status: "skipped" });
    expect(saveGeneratedBusinessSummary).not.toHaveBeenCalled();
  });

  it("records only a stable error category when the model fails, then lets the job retry", async () => {
    const businessId = randomUUID();
    vi.mocked(loadBusinessSummaryInput).mockResolvedValueOnce(summaryInput());
    const businessSummarizer: BusinessSummarizer = { modelId: { provider: "openai", model: "gpt-6-luna" }, summarize: vi.fn(async () => { throw new Error("provider echoed: Family practice in Toronto"); }) };
    await expect(handleJob(job(businessId), { domain, businessSummarizer })).rejects.toThrow();
    expect(recordAiGenerationEvent).toHaveBeenCalledWith(domain, expect.objectContaining({ businessId, operation: "business.summary", isError: true, error: "generation_failed" }));
  });

  it("skips without a text model", async () => {
    await expect(handleJob(job(randomUUID()), { domain })).resolves.toMatchObject({ status: "skipped" });
    expect(loadBusinessSummaryInput).not.toHaveBeenCalled();
  });
});
