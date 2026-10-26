import { createHash } from "node:crypto";

import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ start: vi.fn(), limit: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ startInvitationCheckout: fixture.start }));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({ db: "app" }) }));
vi.mock("@/lib/stripe-connect", () => ({ withStripeConnect: (context: object) => ({ ...context, stripeConnect: "stripe" }) }));
vi.mock("@/lib/fixed-window-limit", () => ({ enforceFixedWindow: fixture.limit, fixedWindowLimit: (_namespace: string, name: string, key: string) => ({ name, key }) }));

import { POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const onPartnerHost = { "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://acme.portal.example.test" };
const post = (body: unknown, headers: Record<string, string> = onPartnerHost) => POST(new Request("https://acme.portal.example.test/api/team/accept/checkout", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  fixture.limit.mockResolvedValue({ allowed: true });
  fixture.start.mockResolvedValue({ url: "https://checkout.stripe.test/c/pay/cs_1" });
});

it("opens the invitation's checkout on the partner's host, with Stripe sending the owner back to the invitation there", async () => {
  const response = await post({ token: " invite-token " });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/c/pay/cs_1" });
  expect(fixture.start).toHaveBeenCalledWith({ db: "app", stripeConnect: "stripe" }, {
    // Only the token's hash reaches the domain, as when the invitation is accepted.
    tokenHash: createHash("sha256").update("invite-token").digest("hex"),
    partnerId,
    successUrl: "https://acme.portal.example.test/accept-invite?token=invite-token&checkout=complete",
    cancelUrl: "https://acme.portal.example.test/accept-invite?token=invite-token&checkout=canceled",
  });
});

it("names no partner on the host's own domain, which the domain refuses", async () => {
  await post({ token: "invite-token" }, { "x-lobbystack-brand": "host" });
  expect(fixture.start).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ partnerId: null }));
});

it("answers a missing token with 400, and too many tries with 429, before asking Stripe", async () => {
  expect((await post({})).status).toBe(400);
  fixture.limit.mockResolvedValue({ allowed: false, status: 429, reason: "rate_limit_token_hour" });
  const limited = await post({ token: "invite-token" });
  expect(limited.status).toBe(429);
  expect(await limited.json()).toMatchObject({ code: "rate_limited" });
  expect(fixture.start).not.toHaveBeenCalled();
});

it("passes the domain's refusals on", async () => {
  fixture.start.mockRejectedValue(Object.assign(new Error("This business's partner can't take payments right now."), { status: 409, code: "payments_unavailable" }));
  const response = await post({ token: "invite-token" });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "payments_unavailable" });
});
