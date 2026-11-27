import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ reserve: vi.fn(), secret: vi.fn(() => "x".repeat(32)) }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ reserveExtraNumberClaim: fixture.reserve }));
vi.mock("@/lib/telephony", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/telephony")>(), getNumberClaimTokenSecret: fixture.secret }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

const AGENT = "00000000-0000-4000-8000-0000000000aa";

function request(body: unknown) {
  return new Request("http://localhost:3000/api/phone-numbers/extra/claim?businessId=business", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
});

it("buys the offered number for the agent named", async () => {
  fixture.reserve.mockResolvedValue("claim-1");
  const response = await POST(request({ claimToken: "token", agentId: AGENT, idempotencyKey: "key-1" }));
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ claimId: "claim-1" });
  expect(fixture.reserve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ agentId: AGENT, claimToken: "token", idempotencyKey: "key-1", claimTokenSecret: "x".repeat(32) }));
});

it("needs an agent", async () => {
  const response = await POST(request({ claimToken: "token" }));
  expect(response.status).toBe(400);
  expect(fixture.reserve).not.toHaveBeenCalled();
});

it("passes the trusted country to the claim, which refuses a sanctioned country", async () => {
  vi.stubEnv("TRUSTED_CLIENT_COUNTRY_HEADER", "cf-ipcountry");
  fixture.reserve.mockResolvedValue("claim-1");
  await POST(new Request("http://localhost:3000/api/phone-numbers/extra/claim?businessId=business", { method: "POST", headers: { "content-type": "application/json", "cf-ipcountry": "sy" }, body: JSON.stringify({ claimToken: "token", agentId: AGENT }) }));
  expect(fixture.reserve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ipCountry: "SY" }));
  vi.unstubAllEnvs();
});
