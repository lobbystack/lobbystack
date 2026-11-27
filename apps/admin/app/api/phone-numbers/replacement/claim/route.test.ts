import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ domain: vi.fn(), secret: vi.fn(() => "x".repeat(32)) }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ reserveReplacementNumberClaim: fixture.domain }));
vi.mock("@/lib/telephony", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/telephony")>(), getNumberClaimTokenSecret: fixture.secret }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

function request(headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/phone-numbers/replacement/claim?businessId=business", { method: "POST", body: JSON.stringify({ claimToken: "token" }), headers: { "content-type": "application/json", ...headers } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetFakeOperator();
  fixture.domain.mockResolvedValue("claim-1");
});

it("passes the trusted country to the replacement claim, which refuses a sanctioned country", async () => {
  vi.stubEnv("TRUSTED_CLIENT_COUNTRY_HEADER", "cf-ipcountry");
  const response = await POST(request({ "cf-ipcountry": "bd" }));
  expect(response.status).toBe(202);
  expect(fixture.domain).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ipCountry: "BD" }));
});

it("passes no country when the deployment doesn't trust the header", async () => {
  vi.stubEnv("TRUSTED_CLIENT_COUNTRY_HEADER", "");
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
  await POST(request({ "cf-ipcountry": "BD" }));
  expect(fixture.domain).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ipCountry: undefined }));
});
