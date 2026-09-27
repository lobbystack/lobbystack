import { describe, expect, it, vi } from "vitest";

const domain = vi.hoisted(() => ({ resendWebhookDelivery: vi.fn(), revokeApiKey: vi.fn(), listWebhookDeliveries: vi.fn() }));

vi.mock("@/lib/api-helpers", () => ({
  requireOperatorBusiness: async () => ({ session: { user: { id: "u1" } }, businessId: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f" }),
  asApiResponse: (error: unknown) => { throw error; },
}));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({ db: {} }) }));
vi.mock("@lobbystack/domain", () => domain);

describe("dashboard API key and webhook routes", () => {
  it.each([
    ["resend", async () => (await import("../../../app/api/webhook-deliveries/[deliveryId]/resend/route")).POST(new Request("https://app.example.com/x", { method: "POST" }), { params: Promise.resolve({ deliveryId: "not-a-uuid" }) }), domain.resendWebhookDelivery],
    ["revoke", async () => (await import("../../../app/api/api-keys/[apiKeyId]/route")).DELETE(new Request("https://app.example.com/x", { method: "DELETE" }), { params: Promise.resolve({ apiKeyId: "------------------------------------" }) }), domain.revokeApiKey],
    ["deliveries", async () => (await import("../../../app/api/webhook-endpoints/[endpointId]/deliveries/route")).GET(new Request("https://app.example.com/x"), { params: Promise.resolve({ endpointId: "1" }) }), domain.listWebhookDeliveries],
  ] as const)("rejects a malformed id on %s with 400", async (_name, run, handler) => {
    const response = await run();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_request" });
    expect(handler).not.toHaveBeenCalled();
  });
});
