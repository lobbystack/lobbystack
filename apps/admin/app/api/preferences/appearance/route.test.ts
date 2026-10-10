import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

beforeEach(() => {
  resetFakeOperator();
  Object.assign(fakeOperator, { role: "business_admin", tx: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ telemetryEnabled: true }] }) }) }) } });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it("tells the browser the deployment mode the server runs with", async () => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  const response = await GET(new Request("https://app.example/api/preferences/appearance?businessId=business"));
  expect(await response.json()).toEqual({ telemetryEnabled: true, canManageTenant: true, deploymentMode: "cloud" });
});
