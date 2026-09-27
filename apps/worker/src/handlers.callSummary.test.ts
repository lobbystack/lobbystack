import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { CallSummarizer } from "@lobbystack/agent-core";
import type { JobEnvelope } from "@lobbystack/contracts";
import { finalizeConversationSession, loadCallSummaryInput, recordAiGenerationEvent, type CallSummaryInput } from "@lobbystack/domain";

vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return {
    ...actual,
    finalizeConversationSession: vi.fn(),
    loadCallSummaryInput: vi.fn(),
    recordAiGenerationEvent: vi.fn(),
  };
});

import { handleJob } from "./handlers";

afterEach(() => {
  vi.clearAllMocks();
});

const domain = { db: undefined as never };

function finalizeJob(businessId: string, callId: string): JobEnvelope {
  return { jobId: randomUUID(), type: "conversation.finalizeSession", queue: "default", businessId, payload: { callId }, trace: {}, idempotencyKey: `call:${callId}:finalize`, scheduled: false };
}

function summaryInput(overrides: Partial<CallSummaryInput> = {}): CallSummaryInput {
  return {
    conversationId: randomUUID(),
    locale: "en",
    disposition: "caller_finished",
    transcript: [
      { speaker: "assistant", text: "Thanks for calling, how can I help?" },
      { speaker: "caller", text: "Hi, this is Marie. Are you open on Friday?" },
      { speaker: "assistant", text: "Yes, from 9 to 5." },
    ],
    needsSummary: true,
    needsCallerName: true,
    ...overrides,
  };
}

function summarizer(summarize: CallSummarizer["summarize"]): CallSummarizer {
  return { modelId: { provider: "openai", model: "gpt-6-luna" }, summarize: vi.fn(summarize) };
}

const usage = { provider: "openai", model: "gpt-6-luna", latencyMs: 900, inputTokens: 420, outputTokens: 30, totalTokens: 450 };

describe("conversation.finalizeSession call summaries", () => {
  it("passes the model summary and caller name into finalization and records the generation", async () => {
    const businessId = randomUUID();
    const callId = randomUUID();
    const input = summaryInput();
    vi.mocked(loadCallSummaryInput).mockResolvedValue(input);
    vi.mocked(finalizeConversationSession).mockResolvedValue({ sessionId: "session", finalized: true });
    vi.mocked(recordAiGenerationEvent).mockResolvedValue("event");
    const callSummarizer = summarizer(async () => ({ summary: "Asked about Friday hours; told the office is open 9 to 5.", callerName: "Marie", usage }));

    await expect(handleJob(finalizeJob(businessId, callId), { domain, callSummarizer })).resolves.toEqual({ status: "completed", entityId: "session" });

    expect(callSummarizer.summarize).toHaveBeenCalledWith({ transcript: input.transcript, locale: "en", disposition: "caller_finished" });
    expect(finalizeConversationSession).toHaveBeenCalledWith(domain, { businessId, callId, generated: { summary: "Asked about Friday hours; told the office is open 9 to 5.", callerName: "Marie" } });
    expect(recordAiGenerationEvent).toHaveBeenCalledWith(domain, expect.objectContaining({ ...usage, businessId, callId, conversationId: input.conversationId, operation: "call.summary" }));
  });

  it("summarizes in the business locale", async () => {
    vi.mocked(loadCallSummaryInput).mockResolvedValue(summaryInput({ locale: "fr", transcript: [{ speaker: "caller", text: "Bonjour, êtes-vous ouverts vendredi?" }] }));
    vi.mocked(finalizeConversationSession).mockResolvedValue({ sessionId: "session", finalized: true });
    const callSummarizer = summarizer(async () => ({ summary: "A demandé les heures du vendredi.", callerName: null, usage }));

    await handleJob(finalizeJob(randomUUID(), randomUUID()), { domain, callSummarizer });

    expect(callSummarizer.summarize).toHaveBeenCalledWith(expect.objectContaining({ locale: "fr" }));
    expect(finalizeConversationSession).toHaveBeenCalledWith(domain, expect.objectContaining({ generated: { summary: "A demandé les heures du vendredi.", callerName: null } }));
  });

  it("falls back to the heuristic and records a redacted error when the model fails", async () => {
    const businessId = randomUUID();
    const callId = randomUUID();
    vi.mocked(loadCallSummaryInput).mockResolvedValue(summaryInput());
    vi.mocked(finalizeConversationSession).mockResolvedValue({ sessionId: "session", finalized: true });
    vi.mocked(recordAiGenerationEvent).mockRejectedValue(new Error("analytics down"));
    const callSummarizer = summarizer(async () => { throw new Error("provider echoed: Hi, this is Marie"); });

    await expect(handleJob(finalizeJob(businessId, callId), { domain, callSummarizer })).resolves.toEqual({ status: "completed", entityId: "session" });

    expect(finalizeConversationSession).toHaveBeenCalledWith(domain, { businessId, callId });
    expect(recordAiGenerationEvent).toHaveBeenCalledWith(domain, expect.objectContaining({ operation: "call.summary", isError: true, error: "generation_failed", model: "gpt-6-luna" }));
  });

  it("labels timeouts separately", async () => {
    vi.mocked(loadCallSummaryInput).mockResolvedValue(summaryInput());
    vi.mocked(finalizeConversationSession).mockResolvedValue({ sessionId: "session", finalized: true });
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const callSummarizer = summarizer(async () => { throw timeout; });

    await handleJob(finalizeJob(randomUUID(), randomUUID()), { domain, callSummarizer });

    expect(recordAiGenerationEvent).toHaveBeenCalledWith(domain, expect.objectContaining({ isError: true, error: "generation_timeout" }));
  });

  it("does not call the model when no summarizer is configured", async () => {
    const businessId = randomUUID();
    const callId = randomUUID();
    vi.mocked(finalizeConversationSession).mockResolvedValue({ sessionId: "session", finalized: true });

    await handleJob(finalizeJob(businessId, callId), { domain });

    expect(loadCallSummaryInput).not.toHaveBeenCalled();
    expect(finalizeConversationSession).toHaveBeenCalledWith(domain, { businessId, callId });
  });

  it("skips the model for finalized calls and near-empty transcripts", async () => {
    vi.mocked(finalizeConversationSession).mockResolvedValue({ sessionId: "session", finalized: false });
    const callSummarizer = summarizer(async () => ({ summary: "unused", callerName: null, usage }));

    vi.mocked(loadCallSummaryInput).mockResolvedValueOnce(undefined);
    await expect(handleJob(finalizeJob(randomUUID(), randomUUID()), { domain, callSummarizer })).resolves.toEqual({ status: "skipped", entityId: "session" });
    vi.mocked(loadCallSummaryInput).mockResolvedValueOnce(summaryInput({ transcript: [{ speaker: "caller", text: "Yeah" }] }));
    await handleJob(finalizeJob(randomUUID(), randomUUID()), { domain, callSummarizer });

    expect(callSummarizer.summarize).not.toHaveBeenCalled();
    expect(recordAiGenerationEvent).not.toHaveBeenCalled();
  });

  it("keeps factual outcomes by passing only the caller name", async () => {
    const businessId = randomUUID();
    const callId = randomUUID();
    vi.mocked(loadCallSummaryInput).mockResolvedValue(summaryInput({ needsSummary: false }));
    vi.mocked(finalizeConversationSession).mockResolvedValue({ sessionId: "session", finalized: true });
    const callSummarizer = summarizer(async () => ({ summary: "Booked a cleaning.", callerName: "Marie", usage }));

    await handleJob(finalizeJob(businessId, callId), { domain, callSummarizer });

    expect(finalizeConversationSession).toHaveBeenCalledWith(domain, { businessId, callId, generated: { callerName: "Marie" } });
  });
});
