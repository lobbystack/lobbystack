import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ limit: vi.fn(), order: vi.fn(), secret: vi.fn(() => "x".repeat(32)) }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/phone-number-search-limit", () => ({ assertPhoneNumberSearchAllowed: fixture.limit }));
vi.mock("@lobbystack/domain", () => ({ orderExtraNumberClaim: fixture.order }));
vi.mock("@/lib/assigned-number-provider", () => ({ assignedNumberProvider: () => ({ marker: "provider" }) }));
vi.mock("@/lib/telephony", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/telephony")>(), getNumberClaimTokenSecret: fixture.secret, requireNumberSearch: () => undefined }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
});

const request = (body: unknown) => new Request("http://localhost:3000/api/phone-numbers/extra/order?businessId=business", { method: "POST", body: JSON.stringify(body) });

it("counts the order against the search limit, then reserves the extra number for the agent, answering 202", async () => {
  fixture.order.mockResolvedValue("claim-1");
  const response = await POST(request({ selection: { countryCode: "RS", kind: "local", city: "Belgrade" }, agentId: "agent-1", idempotencyKey: "key-1" }));
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ claimId: "claim-1" });
  expect(fixture.limit).toHaveBeenCalledWith(expect.objectContaining({ initial: false }));
  expect(fixture.order).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ agentId: "agent-1", selection: { countryCode: "RS", kind: "local", city: "Belgrade" }, idempotencyKey: "key-1" }), { marker: "provider" });
});

it("needs an agent, and orders nothing when the search limit refuses", async () => {
  expect((await POST(request({ selection: { countryCode: "RS", city: "Nis" } }))).status).toBe(400);
  fixture.limit.mockRejectedValue(Object.assign(new Error("Too many number searches."), { status: 429 }));
  expect((await POST(request({ selection: { countryCode: "RS", city: "Nis" }, agentId: "agent-1" }))).status).toBe(429);
  expect(fixture.order).not.toHaveBeenCalled();
});
