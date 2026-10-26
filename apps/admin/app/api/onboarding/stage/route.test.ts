import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ advance: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ advanceOnboardingStage: fixture.advance, isOnboardingStage: (value: unknown) => ["create_business", "website", "verify_phone", "phone_number", "attribution", "complete"].includes(String(value)) }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

const post = (to: unknown) => POST(new Request("http://localhost:3000/api/onboarding/stage?businessId=business", { method: "POST", body: JSON.stringify({ to }) }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.advance.mockResolvedValue(undefined);
});

it("moves onboarding to the stage the step names", async () => {
  const response = await post("phone_number");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, stage: "phone_number" });
  expect(fixture.advance).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", to: "phone_number" });
});

it("hands complete to the domain, which finishes only a partner's business there", async () => {
  expect((await post("complete")).status).toBe(200);
  expect(fixture.advance).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", to: "complete" });
  fixture.advance.mockRejectedValueOnce(Object.assign(new Error("A valid next onboarding stage is required."), { status: 400, code: "invalid_onboarding_stage" }));
  const refused = await post("complete");
  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({ code: "invalid_onboarding_stage" });
});

it.each(["create_business", "plan", undefined])("refuses %s before reaching the domain", async (to) => {
  expect((await post(to)).status).toBe(400);
  expect(fixture.advance).not.toHaveBeenCalled();
});
