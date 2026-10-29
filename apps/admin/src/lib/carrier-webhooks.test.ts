import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), fallback: vi.fn(), inbound: vi.fn(), shared: vi.fn(), smsStatus: vi.fn(), notificationStatus: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@lobbystack/domain", () => ({ resolveNumberFallback: mocks.fallback, receiveInboundSms: mocks.inbound, receiveSharedSenderSms: mocks.shared, isSharedSmsSender: (phone: string) => phone === "+18885550100", updateSmsDeliveryStatus: mocks.smsStatus, updateNotificationDeliveryStatus: mocks.notificationStatus, updateOperatorNotificationDeliveryStatus: vi.fn() }));
vi.mock("./api-helpers", () => ({ getAppDatabase: () => ({ db: { execute: mocks.execute } }) }));
vi.mock("./domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
import { applyCarrierSmsStatus, fallbackForCall, receiveCarrierSms } from "./carrier-webhooks";

beforeEach(() => { vi.clearAllMocks(); mocks.execute.mockResolvedValue({ rows: [{ business_id: "biz_1" }] }); });

it("forwards a refused call, but never back to the dialled number or the line that forwarded it", async () => {
  mocks.fallback.mockResolvedValue({ action: "forward", to: "+14165550111" });
  expect(await fallbackForCall({ dialled: ["+12125550100"] })).toEqual({ action: "forward", to: "+14165550111" });
  expect(await fallbackForCall({ dialled: ["+12125550100"], forwardedFrom: "+14165550111" })).toEqual({ action: "reject" });
  mocks.fallback.mockResolvedValue({ action: "forward", to: "+12125550100" });
  expect(await fallbackForCall({ dialled: ["+12125550100"] })).toEqual({ action: "reject" });
  mocks.execute.mockResolvedValue({ rows: [{ business_id: null }] });
  expect(await fallbackForCall({ dialled: ["+12125550100"] })).toEqual({ action: "reject" });
});

it("records a business's text with its carrier, and answers the shared sender's keywords", async () => {
  await receiveCarrierSms({ kind: "sms.received", providerMessageId: "m1", from: "+14165550134", to: "+12125550100", body: "Hi" }, "telnyx");
  expect(mocks.inbound).toHaveBeenCalledWith({}, expect.objectContaining({ businessId: "biz_1", carrier: "telnyx", providerMessageId: "m1" }));
  mocks.execute.mockResolvedValue({ rows: [{ business_id: null }] });
  mocks.shared.mockResolvedValue({ reply: "Help text" });
  expect(await receiveCarrierSms({ kind: "sms.received", providerMessageId: "m2", from: "+14165550134", to: "+18885550100", body: "HELP" }, "telnyx")).toEqual({ reply: "Help text" });
});

it("prices a notification's text under its carrier", async () => {
  await applyCarrierSmsStatus({ kind: "sms.status", providerMessageId: "m3", status: "delivered", providerCostUsd: 0.004 }, "telnyx", new URLSearchParams({ notificationId: "6f1c2f7e-0000-4000-8000-000000000001" }));
  expect(mocks.notificationStatus).toHaveBeenCalledWith({}, { businessId: "biz_1", providerMessageId: "m3", providerStatus: "delivered", notificationId: "6f1c2f7e-0000-4000-8000-000000000001", carrier: "telnyx", providerCostUsd: 0.004 });
});
