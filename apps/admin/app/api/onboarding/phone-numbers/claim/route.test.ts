import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ reserve: vi.fn(), secret: vi.fn(() => "x".repeat(32)) }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ reserveOnboardingNumberClaim: fixture.reserve }));
vi.mock("@/lib/telephony", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/telephony")>(), getNumberClaimTokenSecret: fixture.secret }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/onboarding/phone-numbers/claim?businessId=business", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ claimToken: "token", idempotencyKey: "key-1" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetFakeOperator();
  fixture.reserve.mockResolvedValue("claim-1");
});

it("passes the trusted country to the claim, so a trial offer is checked again where the owner is now", async () => {
  vi.stubEnv("TRUSTED_CLIENT_COUNTRY_HEADER", "cf-ipcountry");
  const response = await POST(request({ "cf-ipcountry": "us" }));
  expect(response.status).toBe(202);
  expect(fixture.reserve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ claimToken: "token", ipCountry: "US" }));
});

it("passes no country when the deployment doesn't trust the header", async () => {
  vi.stubEnv("TRUSTED_CLIENT_COUNTRY_HEADER", "");
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
  await POST(request({ "cf-ipcountry": "US" }));
  expect(fixture.reserve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ipCountry: undefined }));
});
