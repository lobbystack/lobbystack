import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/api-helpers", async (original) => ({
  ...await original<typeof import("@/lib/api-helpers")>(),
  requireOperatorBusiness: async () => ({ session: { user: { id: "user_1" } }, businessId: "business_1" }),
}));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({ db: "app" }) }));
vi.mock("@lobbystack/domain", () => ({ updateKnowledgeSnippet: fixture.update }));

import { PATCH } from "./route";

beforeEach(() => { vi.clearAllMocks(); });

describe("knowledge snippet update API", () => {
  it("acts as the signed-in operator even when the body names another user, business or snippet", async () => {
    const response = await PATCH(
      new Request("http://localhost:3000/api/knowledge/snippets/snippet_1?businessId=business_1", {
        method: "PATCH",
        body: JSON.stringify({ userId: "owner", businessId: "business_2", snippetId: "snippet_2", content: "We are closed" }),
      }),
      { params: Promise.resolve({ snippetId: "snippet_1" }) },
    );
    expect(response.status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", snippetId: "snippet_1", content: "We are closed" });
  });
});
