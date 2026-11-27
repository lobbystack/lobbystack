import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ domain: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ getNumberTrialState: fixture.domain }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

function request(headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/number-trial?businessId=business", { headers: { ...headers } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetFakeOperator();
  fixture.domain.mockResolvedValue({ status: "none" });
});

it("passes the trusted country to the trial state, so Home offers a trial only where the number step would", async () => {
  vi.stubEnv("TRUSTED_CLIENT_COUNTRY_HEADER", "cf-ipcountry");
  const response = await GET(request({ "cf-ipcountry": "bd" }));
  expect(response.status).toBe(200);
  expect(fixture.domain).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ipCountry: "BD" }));
});

it("passes no country when the deployment doesn't trust the header", async () => {
  vi.stubEnv("TRUSTED_CLIENT_COUNTRY_HEADER", "");
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
  await GET(request({ "cf-ipcountry": "BD" }));
  expect(fixture.domain).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ipCountry: undefined }));
});
