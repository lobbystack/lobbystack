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
        knowledgeSnippets: [
          {
            id: "snippet-1",
            title: "Appointments",
            content: "Appointments are recommended before walking in.",
            tags: [],
            priority: 10,
          },
        ],
        knowledgeDigest: "Appointments are recommended before walking in.",
      },
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result.result).toEqual({
      matches: [
        {
          title: "Appointments",
          text: "Appointments are recommended before walking in.",
        },
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
        knowledgeSnippets: [
          {
            id: "snippet-1",
            title: "Parking",
            content: "Parking is available behind the building.",
            tags: [],
            priority: 10,
          },
        ],
        knowledgeDigest: "Parking is available behind the building.",
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
        {
          title: "Knowledge digest",
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
        knowledgeSnippets: [],
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

  it("filters unrelated snapshot fallback matches by the caller query", async () => {
    searchVoiceKnowledgeMock.mockResolvedValue([]);

    const result = await executeVoiceTool({
      toolName: "searchKnowledge",
      rawArguments: JSON.stringify({ query: "refund policy" }),
      snapshot: {
        ...demoSnapshot,
        knowledgeSnippets: [
          {
            id: "snippet-1",
            title: "Parking",
            content: "Parking is available behind the building.",
            tags: [],
            priority: 10,
          },
          {
            id: "snippet-2",
            title: "Refund policy",
            content: "Refunds are only available within 30 days of purchase.",
            tags: [],
            priority: 9,
          },
        ],
        knowledgeDigest:
          "Parking is behind the building. Refunds are only available within 30 days of purchase.",
      },
      businessId: "business_123",
      callerPhone: "+14165550000",
    });

    expect(result.result).toEqual({
      matches: [
        {
          title: "Refund policy",
          text: "Refunds are only available within 30 days of purchase.",
        },
        {
          title: "Knowledge digest",
          text: "Parking is behind the building. Refunds are only available within 30 days of purchase.",
        },
      ],
      source: "snapshot_fallback",
      fallbackUsed: true,
      fallbackReason: "no_matches",
    });
  });
});
