import { describe, expect, it, vi, beforeEach } from "vitest";

import { demoSnapshot } from "@ai-receptionist/shared";

const { searchVoiceKnowledgeMock } = vi.hoisted(() => ({
  searchVoiceKnowledgeMock: vi.fn(),
}));

vi.mock("../convex/runtimeClient", () => ({
  bookVoiceAppointment: vi.fn(),
  checkVoiceAvailability: vi.fn(),
  findVoiceAvailability: vi.fn(),
  searchVoiceKnowledge: searchVoiceKnowledgeMock,
  takeVoiceMessage: vi.fn(),
  updateVoiceTransferState: vi.fn(),
}));

import { executeVoiceTool } from "./toolExecutor";

describe("executeVoiceTool searchKnowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns RAG matches when indexed knowledge search succeeds", async () => {
    searchVoiceKnowledgeMock.mockResolvedValue([
      { title: "Handbook", text: "The handbook says to bring ID." },
    ]);

    const result = await executeVoiceTool({
      toolName: "searchKnowledge",
      rawArguments: JSON.stringify({ query: "What should I bring?" }),
      snapshot: demoSnapshot,
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(searchVoiceKnowledgeMock).toHaveBeenCalledWith({
      businessId: "business_123",
      query: "What should I bring?",
    });
    expect(result.result).toEqual({
      matches: [{ title: "Handbook", text: "The handbook says to bring ID." }],
      source: "rag",
      fallbackUsed: false,
    });
  });

  it("falls back to snapshot knowledge when RAG returns no matches", async () => {
    searchVoiceKnowledgeMock.mockResolvedValue([]);

    const result = await executeVoiceTool({
      toolName: "searchKnowledge",
      rawArguments: JSON.stringify({ query: "Do I need an appointment?" }),
      snapshot: {
        ...demoSnapshot,
        knowledgeDigest: "Appointments are recommended before walking in.",
      },
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result.result).toEqual({
      matches: [
        {
          title: "Knowledge digest",
          text: "Appointments are recommended before walking in.",
        },
      ],
      source: "snapshot_fallback",
      fallbackUsed: true,
      fallbackReason: "no_matches",
    });
  });

  it("falls back to snapshot knowledge when RAG retrieval fails", async () => {
    searchVoiceKnowledgeMock.mockRejectedValue(new Error("quota exceeded"));

    const result = await executeVoiceTool({
      toolName: "searchKnowledge",
      rawArguments: JSON.stringify({ query: "parking" }),
      snapshot: {
        ...demoSnapshot,
        knowledgeDigest: "",
        priorityFaqs: [
          {
            id: "faq-1",
            title: "Parking",
            content: "Parking is available behind the building.",
            tags: ["parking"],
            priority: 1,
          },
        ],
      },
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result.result).toEqual({
      matches: [
        {
          title: "Parking",
          text: "Parking is available behind the building.",
        },
      ],
      source: "snapshot_fallback",
      fallbackUsed: true,
      fallbackReason: "rag_error",
    });
  });

  it("returns an empty result when neither RAG nor snapshot fallback has content", async () => {
    searchVoiceKnowledgeMock.mockResolvedValue([]);

    const result = await executeVoiceTool({
      toolName: "searchKnowledge",
      rawArguments: JSON.stringify({ query: "refunds" }),
      snapshot: {
        ...demoSnapshot,
        knowledgeDigest: "",
        priorityFaqs: [],
      },
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result.result).toEqual({
      matches: [],
      source: "none",
      fallbackUsed: false,
    });
  });
});
