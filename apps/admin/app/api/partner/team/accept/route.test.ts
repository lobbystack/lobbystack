import { createHash } from "node:crypto";

import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ accept: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ acceptPartnerInvitation: fixture.accept, hashPartnerToken: (token: string) => createHash("sha256").update(token).digest("hex") }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost:3000/api/partner/team/accept", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => { vi.clearAllMocks(); resetFakeOperator(); });

it("accepts as the signed-in account, with its email and whether it's verified", async () => {
  fixture.accept.mockResolvedValue({ partnerId: "partner", role: "member" });
  fakeOperator.emailVerified = false;
  const response = await post({ token: "token" });
  expect(response.status).toBe(200);
  expect(fixture.accept).toHaveBeenCalledWith(expect.anything(), { userId: "user", tokenHash: createHash("sha256").update("token").digest("hex"), email: "user@example.com", emailVerified: false });
});

it("answers a missing token with 400 and a wrong account with the domain's 403", async () => {
  expect((await post({})).status).toBe(400);
  expect(fixture.accept).not.toHaveBeenCalled();
  fixture.accept.mockRejectedValue(Object.assign(new Error("Sign in with the verified email address this invitation was sent to."), { status: 403, code: "wrong_account" }));
  expect((await post({ token: "token" })).status).toBe(403);
});
