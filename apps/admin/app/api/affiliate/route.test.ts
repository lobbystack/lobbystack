import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/db", async (original) => ({ ...await original<typeof import("@lobbystack/db")>(), withBusinessTransaction: fixture.transaction }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { setBrandHeaders } from "@/lib/request-brand";
import { GET, PATCH } from "./route";

const partnerHost = () => setBrandHeaders(new Headers(), { kind: "partner", partnerId: "5a0f6c7e-1d2b-4c3a-9e8f-7a6b5c4d3e2f", origin: "https://acme.portal.example.test" });

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
});

describe("the host's affiliate program on a partner's host", () => {
  it("enrolls no one and answers nothing there, even when a request gets past the proxy", async () => {
    const read = await GET(new Request("https://acme.portal.example.test/api/affiliate", { headers: partnerHost() }));
    expect(read.status).toBe(404);
    const write = await PATCH(new Request("https://acme.portal.example.test/api/affiliate", { method: "PATCH", headers: partnerHost(), body: JSON.stringify({ payoutEmail: "payouts@example.com" }) }));
    expect(write.status).toBe(404);
    expect(fixture.transaction).not.toHaveBeenCalled();
  });

  it("still answers on the host's domain", async () => {
    fixture.transaction.mockResolvedValue({ profile: { id: "profile", payoutEmail: "payouts@example.com" } });
    const write = await PATCH(new Request("https://desk.example.test/api/affiliate", { method: "PATCH", headers: setBrandHeaders(new Headers(), { kind: "host" }), body: JSON.stringify({ payoutEmail: "payouts@example.com" }) }));
    expect(write.status).toBe(200);
    expect(fixture.transaction).toHaveBeenCalledOnce();
  });
});
