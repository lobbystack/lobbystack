import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const numberResource = { remove: vi.fn(), update: vi.fn(), fetch: vi.fn() };
  const incomingPhoneNumbers = Object.assign(vi.fn(() => numberResource), { create: vi.fn(), list: vi.fn() });
  const localList = vi.fn();
  const tollFreeList = vi.fn();
  const verificationCreate = vi.fn();
  const client = {
    incomingPhoneNumbers,
    availablePhoneNumbers: vi.fn(() => ({ local: { list: localList }, tollFree: { list: tollFreeList } })),
    verify: { v2: { services: vi.fn(() => ({ verifications: { create: verificationCreate } })) } },
    messages: Object.assign(vi.fn(), { create: vi.fn() }),
    calls: vi.fn(),
  };
  return { client, incomingPhoneNumbers, numberResource, localList, tollFreeList, verificationCreate };
});

vi.mock("twilio", () => ({ default: vi.fn(() => mocks.client) }));

import { getTwilioProviderErrorCode, TwilioProvider } from "./twilioProvider";
import twilio from "twilio";

describe("TwilioProvider phone provisioning", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("blocks unapproved sends and inventory mutations during certification", async () => {
    vi.stubEnv("LOBBYSTACK_CERTIFICATION_MODE", "true");
    vi.stubEnv("LOBBYSTACK_CERTIFICATION_PHONES", "+14165550123");
    const client = provider();
    await expect(client.sendSms({ to: "+14165550999", from: "+14165550100", body: "fixture" })).rejects.toThrow("CERTIFICATION_RECIPIENT_BLOCKED");
    await expect(client.verifyPhone({ to: "+14165550999", serviceSid: "fixture" })).rejects.toThrow("CERTIFICATION_RECIPIENT_BLOCKED");
    await expect(client.releasePhoneNumber({ providerPhoneId: "fixture" })).rejects.toThrow("CERTIFICATION_OPERATION_BLOCKED");
    await expect(client.addNumberToSipTrunk({ trunkSid: "fixture", providerPhoneId: "fixture" })).rejects.toThrow("CERTIFICATION_OPERATION_BLOCKED");
    expect(mocks.client.messages.create).not.toHaveBeenCalled();
    expect(mocks.verificationCreate).not.toHaveBeenCalled();
    expect(mocks.incomingPhoneNumbers).not.toHaveBeenCalled();
  });

  it("authenticates a restricted REST key with the owning account", () => {
    new TwilioProvider({ accountSid: "ACowner", apiKeySid: "SKrestricted", apiKeySecret: "restricted-secret" });
    expect(twilio).toHaveBeenCalledWith("SKrestricted", "restricted-secret", { accountSid: "ACowner" });
  });

  it("requests voice-and-SMS inventory and normalizes Twilio's uppercase capability keys", async () => {
    mocks.localList.mockResolvedValue([{ phoneNumber: "+14165550100", locality: "Toronto", region: "ON", capabilities: { SMS: true, voice: true } }, { phoneNumber: "+14165550101", capabilities: { SMS: false, voice: true } }]);
    const result = await provider().listAvailablePhoneNumbers({ countryCode: "ca", kind: "local", areaCode: "416", limit: 50 });
    expect(mocks.localList).toHaveBeenCalledWith(expect.objectContaining({ areaCode: 416, smsEnabled: true, voiceEnabled: true, limit: 20 }));
    expect(result).toEqual([{ phoneE164: "+14165550100", locality: "Toronto", region: "ON", countryCode: "CA", capabilities: { sms: true, voice: true } }]);
  });

  it("purchases and can reconcile an already-owned number", async () => {
    mocks.incomingPhoneNumbers.create.mockResolvedValue({ sid: "PN123", phoneNumber: "+14165550100", smsUrl: "https://app.test/sms", voiceUrl: "https://app.test/voice" });
    mocks.incomingPhoneNumbers.list.mockResolvedValue([{ sid: "PN123", phoneNumber: "+14165550100", friendlyName: "LobbyStack" }]);
    const twilio = provider();
    expect(await twilio.purchasePhoneNumber({ e164: "+14165550100", friendlyName: "LobbyStack", smsUrl: "https://app.test/sms", statusCallbackUrl: "https://app.test/status" })).toEqual({ providerPhoneId: "PN123", e164: "+14165550100", smsUrl: "https://app.test/sms" });
    expect(await twilio.findOwnedPhoneNumber({ e164: "+14165550100" })).toEqual({ providerPhoneId: "PN123", e164: "+14165550100", friendlyName: "LobbyStack" });
  });

  it("starts Verify and returns the durable verification SID", async () => {
    mocks.verificationCreate.mockResolvedValue({ sid: "VE123", status: "pending" });
    expect(await provider().verifyPhone({ to: "+14165550100", serviceSid: "VA123" })).toEqual({ verificationSid: "VE123", status: "pending" });
    expect(mocks.verificationCreate).toHaveBeenCalledWith({ to: "+14165550100", channel: "sms" });
  });

  it("removes emergency configuration before retrying release", async () => {
    mocks.numberResource.remove.mockRejectedValueOnce(new Error("Remove the emergency address before release.")).mockResolvedValueOnce(undefined);
    mocks.numberResource.fetch.mockResolvedValue({ emergencyStatus: "Inactive", emergencyAddressSid: null, emergencyAddressStatus: "unregistered" });
    await provider().releasePhoneNumber({ providerPhoneId: "PN123" });
    expect(mocks.numberResource.update).toHaveBeenNthCalledWith(1, { emergencyStatus: "Inactive" });
    expect(mocks.numberResource.update).toHaveBeenNthCalledWith(2, { emergencyAddressSid: "" });
    expect(mocks.numberResource.remove).toHaveBeenCalledTimes(2);
  });

  it("preserves actionable purchase error codes", () => {
    expect(getTwilioProviderErrorCode({ code: 21422 })).toBe(21422);
    expect(getTwilioProviderErrorCode({ code: 21404 })).toBe(21404);
    expect(getTwilioProviderErrorCode({ code: 500 })).toBeUndefined();
  });
});

function provider(): TwilioProvider {
  return new TwilioProvider({ accountSid: "AC_test", authToken: "secret" });
}
