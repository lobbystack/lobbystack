import { beforeEach, describe, expect, it, vi } from "vitest";

const domain = vi.hoisted(() => ({ listInboxItems: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", async (original) => ({ ...await original<typeof import("@lobbystack/domain")>(), ...domain }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

const AGENT = "00000000-0000-4000-8000-000000000001";
const get = (query = "") => GET(new Request(`http://localhost:3000/api/inbox${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  domain.listInboxItems.mockResolvedValue({ items: [], nextCursor: null, agents: [] });
});

describe("GET /api/inbox", () => {
  it("lists the business's inbox with no filter", async () => {
    expect(await (await get()).json()).toEqual({ items: [], nextCursor: null, agents: [], instagramOffered: false });
    expect(domain.listInboxItems).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business" });
  });

  it("passes the channel, agent, search, cursor and page size on", async () => {
    await get(`?channel=instagram&agentId=${AGENT}&search=late&cursor=abc&limit=20`);
    expect(domain.listInboxItems).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", channel: "instagram", agentId: AGENT, search: "late", cursor: "abc", limit: 20 });
  });

  it("refuses an unknown channel, an agent that isn't a UUID and a page past the limit", async () => {
    for (const query of ["?channel=call", "?agentId=front-desk", "?limit=500"]) {
      expect((await get(query)).status, query).toBe(400);
    }
    expect(domain.listInboxItems).not.toHaveBeenCalled();
  });

  it("passes a bad cursor's refusal on", async () => {
    domain.listInboxItems.mockRejectedValue(Object.assign(new Error("The inbox cursor is invalid."), { status: 400, code: "inbox_cursor_invalid" }));
    const response = await get("?cursor=nope");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "inbox_cursor_invalid" });
  });
});
