import { createHash } from "node:crypto";

import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ signUp: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/fixed-window-limit", () => ({ enforceFixedWindow: fixture.limit, fixedWindowLimit: () => ({}) }));
vi.mock("@lobbystack/domain", () => ({ signUpPartner: fixture.signUp, hashPartnerToken: (token: string) => createHash("sha256").update(token).digest("hex") }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost:3000/api/partner/signup", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.limit.mockResolvedValue({ allowed: true });
  fixture.signUp.mockResolvedValue({ partnerId: "partner", slug: "acme", subdomain: null });
});

it("signs the signed-in account up with its email, sending only a hash of the invitation token", async () => {
  fakeOperator.email = "owner@acme.example";
  const response = await post({ name: "Acme Reception", subdomain: "acme", invitation: " token " });
  expect(response.status).toBe(201);
  expect(fixture.signUp).toHaveBeenCalledWith(expect.anything(), { userId: "user", email: "owner@acme.example", emailVerified: true, name: "Acme Reception", subdomain: "acme", invitationTokenHash: createHash("sha256").update("token").digest("hex") });
});

it.each([
  [{}, "name is required."],
  [{ name: " " }, "name is required."],
  [{ name: "Acme", subdomain: 5 }, "subdomain must be a string."],
  [{ name: "Acme", invitation: ["token"] }, "invitation must be a string."],
])("answers bad signup input %j with 400", async (body, error) => {
  const response = await post(body);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error });
  expect(fixture.signUp).not.toHaveBeenCalled();
});

it("passes the domain's refusals through, such as invite-only signup without an invitation", async () => {
  fixture.signUp.mockRejectedValue(Object.assign(new Error("Partner signup is by invitation only."), { status: 403, code: "invitation_required" }));
  const response = await post({ name: "Acme" });
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "invitation_required" });
});

it("caps how many partners one account signs up", async () => {
  fixture.limit.mockResolvedValue({ allowed: false, status: 429, reason: "rate_limit_user_day" });
  expect((await post({ name: "Acme" })).status).toBe(429);
  expect(fixture.signUp).not.toHaveBeenCalled();
});
