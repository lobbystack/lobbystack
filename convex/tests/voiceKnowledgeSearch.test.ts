import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import schema from "../schema";
import { modules } from "../test.setup";

const { searchKnowledgeForVoiceInternalMock } = vi.hoisted(() => ({
  searchKnowledgeForVoiceInternalMock: vi.fn(),
}));

vi.mock("../ai/context/knowledge.ts", async () => {
  const actual = await vi.importActual<typeof import("../ai/context/knowledge")>(
    "../ai/context/knowledge.ts",
  );
  const { internalAction } = await import("../_generated/server");
  const { v } = await import("convex/values");

  return {
    ...actual,
    searchKnowledgeForVoiceInternal: internalAction({
      args: {
        businessId: v.id("businesses"),
        query: v.string(),
        limit: v.optional(v.number()),
      },
      handler: async (_ctx, args) => {
        return await searchKnowledgeForVoiceInternalMock(args);
      },
    }),
  };
});

type TestRunFunction = Parameters<TestConvex<typeof schema>["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

const convexModules = modules;
const originalInternalServiceToken = process.env.INTERNAL_SERVICE_TOKEN;

function createConvexHarness(): TestConvex<typeof schema> {
  return convexTest(schema, convexModules);
}

async function insertBusiness(ctx: TestContext): Promise<string> {
  return await ctx.db.insert("businesses", {
    slug: "voice-rag-search",
    name: "Voice RAG Search",
    timezone: "America/Toronto",
    businessType: "clinic",
    defaultLocale: "en",
    deploymentMode: "manual",
    status: "active",
  });
}

async function postSearchKnowledge(
  t: TestConvex<typeof schema>,
  body: { businessId: string; query: string },
  includeToken = true,
): Promise<Response> {
  return await t.fetch("/voice/tool/search-knowledge", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(includeToken
        ? { "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN ?? "" }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.INTERNAL_SERVICE_TOKEN = "test-service-token";
  vi.clearAllMocks();
});

afterEach(() => {
  process.env.INTERNAL_SERVICE_TOKEN = originalInternalServiceToken;
});

describe("voice knowledge search route", () => {
  it("rejects requests without the internal service token", async () => {
    const t = createConvexHarness();
    const businessId = await t.run(async (ctx) => await insertBusiness(ctx));

    const response = await postSearchKnowledge(t, { businessId, query: "policy" }, false);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
    expect(searchKnowledgeForVoiceInternalMock).not.toHaveBeenCalled();
  });

  it("routes voice knowledge searches through the internal RAG action with a fixed limit", async () => {
    const t = createConvexHarness();
    const businessId = await t.run(async (ctx) => await insertBusiness(ctx));
    searchKnowledgeForVoiceInternalMock.mockResolvedValue([
      { title: "Policy", text: "Detailed policy text" },
    ]);

    const response = await postSearchKnowledge(t, { businessId, query: "refund policy" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { title: "Policy", text: "Detailed policy text" },
    ]);
    expect(searchKnowledgeForVoiceInternalMock).toHaveBeenCalledWith({
      businessId,
      query: "refund policy",
      limit: 4,
    });
  });
});
