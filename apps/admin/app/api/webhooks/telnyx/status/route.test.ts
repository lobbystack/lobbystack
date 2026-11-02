import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signed: vi.fn(), status: vi.fn() }));
vi.mock("@/lib/telnyx-webhook", () => ({ readSignedTelnyxWebhook: async (request: Request) => ({ rawBody: await request.text(), signed: mocks.signed() }) }));
vi.mock("@/lib/carrier-webhooks", () => ({ applyCarrierSmsStatus: mocks.status }));
import { POST } from "./route";

const request = (eventType: string, payload: Record<string, unknown>) => new Request("https://admin.example.invalid/api/webhooks/telnyx/status?notificationId=6f1c2f7e-0000-4000-8000-000000000001", { method: "POST", body: JSON.stringify({ data: { event_type: eventType, payload } }) });
beforeEach(() => { vi.clearAllMocks(); mocks.signed.mockReturnValue(true); mocks.status.mockResolvedValue(undefined); });

it("applies a final status with its price to the row the URL names", async () => {
  expect((await POST(request("message.finalized", { id: "msg_1", to: [{ status: "delivered" }], parts: 1, cost: { amount: "0.004", currency: "USD" } }))).status).toBe(200);
  const [event, carrier, query] = mocks.status.mock.calls[0]!;
  expect(event).toMatchObject({ providerMessageId: "msg_1", status: "delivered", providerCostUsd: 0.004, providerNumSegments: 1 });
  expect(carrier).toBe("telnyx");
  expect((query as URLSearchParams).get("notificationId")).toBe("6f1c2f7e-0000-4000-8000-000000000001");
});

it("acknowledges events it doesn't apply, refuses unsigned ones and retries failures", async () => {
  expect((await POST(request("message.received", { id: "msg_2" }))).status).toBe(200);
  expect(mocks.status).not.toHaveBeenCalled();
  mocks.signed.mockReturnValue(false);
  expect((await POST(request("message.sent", { id: "msg_3" }))).status).toBe(401);
  mocks.signed.mockReturnValue(true);
  mocks.status.mockRejectedValue(new Error("db down"));
  expect((await POST(request("message.sent", { id: "msg_3", to: [{ status: "sent" }] }))).status).toBe(503);
});
