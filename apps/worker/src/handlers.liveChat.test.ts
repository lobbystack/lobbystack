import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { expireTeamRequest } from "@lobbystack/domain";

vi.mock("@lobbystack/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lobbystack/domain")>()),
  expireTeamRequest: vi.fn(),
}));

import { handleJob } from "./handlers";

afterEach(() => {
  vi.clearAllMocks();
});

const domain = { db: undefined as never };

function expiryJob(businessId: string, payload: Record<string, unknown>): JobEnvelope {
  return { jobId: randomUUID(), type: "conversation.expireTeamRequest", queue: "default", businessId, payload, trace: {}, idempotencyKey: randomUUID(), scheduled: false };
}

describe("conversation.expireTeamRequest", () => {
  it("hands the chat back to the receptionist in the chat's language when nobody joined", async () => {
    const businessId = randomUUID();
    const conversationId = randomUUID();
    vi.mocked(expireTeamRequest).mockResolvedValue({ expired: true });

    await expect(handleJob(expiryJob(businessId, { conversationId, requestedAt: "2026-10-14T21:00:00.000Z", locale: "fr" }), { domain })).resolves.toEqual({ status: "completed", entityId: conversationId });

    expect(expireTeamRequest).toHaveBeenCalledWith(domain, { businessId, conversationId, requestedAt: new Date("2026-10-14T21:00:00.000Z"), locale: "fr" });
  });

  it("skips a request someone answered, and falls back to English for a language it can't say", async () => {
    const conversationId = randomUUID();
    vi.mocked(expireTeamRequest).mockResolvedValue({ expired: false });

    await expect(handleJob(expiryJob(randomUUID(), { conversationId, requestedAt: "2026-10-14T21:00:00.000Z", locale: "ja" }), { domain })).resolves.toEqual({ status: "skipped", entityId: conversationId });
    await handleJob(expiryJob(randomUUID(), { conversationId, requestedAt: "2026-10-14T21:00:00.000Z", locale: "nl" }), { domain });

    expect(vi.mocked(expireTeamRequest).mock.calls.map(([, input]) => input.locale)).toEqual(["en", "nl"]);
  });

  it("skips a job without a conversation or a readable request time", async () => {
    await expect(handleJob(expiryJob(randomUUID(), { requestedAt: "2026-10-14T21:00:00.000Z" }), { domain })).resolves.toEqual({ status: "skipped" });
    await expect(handleJob(expiryJob(randomUUID(), { conversationId: randomUUID(), requestedAt: "soon" }), { domain })).resolves.toEqual({ status: "skipped" });

    expect(expireTeamRequest).not.toHaveBeenCalled();
  });
});
