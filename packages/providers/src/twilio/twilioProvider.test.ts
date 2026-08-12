import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const numberResource = { remove: vi.fn(), update: vi.fn(), fetch: vi.fn() };
  const incomingPhoneNumbers = Object.assign(vi.fn(() => numberResource), { create: vi.fn(), list: vi.fn() });
  const localList = vi.fn();
  const tollFreeList = vi.fn();
  const verificationCreate = vi.fn();
  const verificationCheckCreate = vi.fn();
  const lookupFetch = vi.fn();
  const client = {
    incomingPhoneNumbers,
    availablePhoneNumbers: vi.fn(() => ({ local: { list: localList }, tollFree: { list: tollFreeList } })),
    verify: { v2: { services: vi.fn(() => ({ verifications: { create: verificationCreate }, verificationChecks: { create: verificationCheckCreate } })) } },
    lookups: { v2: { phoneNumbers: vi.fn(() => ({ fetch: lookupFetch })) } },
    messages: Object.assign(vi.fn(), { create: vi.fn() }),
    calls: vi.fn(),
  };
  return { client, incomingPhoneNumbers, numberResource, localList, tollFreeList, verificationCreate, verificationCheckCreate, lookupFetch };
});

vi.mock("twilio", () => ({ default: vi.fn(() => mocks.client) }));

import { getTwilioProviderErrorCode, TwilioProvider } from "./twilioProvider";

describe("TwilioProvider phone provisioning", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes Lookup line type results", async () => {
    mocks.lookupFetch.mockResolvedValue({ phoneNumber: "+14165550100", countryCode: "CA", valid: true, validationErrors: [], lineTypeIntelligence: { type: "mobile", errorCode: null } });
    const result = await provider().lookupPhoneNumber({ phoneNumber: "4165550100" });
    expect(result).toEqual({ phoneE164: "+14165550100", countryCode: "CA", valid: true, lineType: "mobile" });
    expect(mocks.lookupFetch).toHaveBeenCalledWith({ fields: "line_type_intelligence" });
  });

  it("requests voice-and-SMS inventory and filters incomplete numbers", async () => {
    mocks.localList.mockResolvedValue([{ phoneNumber: "+14165550100", locality: "Toronto", region: "ON", capabilities: { sms: true, voice: true } }, { phoneNumber: "+14165550101", capabilities: { sms: false, voice: true } }]);
    const result = await provider().listAvailablePhoneNumbers({ countryCode: "ca", kind: "local", areaCode: "416", limit: 50 });
    expect(mocks.localList).toHaveBeenCalledWith(expect.objectContaining({ areaCode: 416, smsEnabled: true, voiceEnabled: true, limit: 20 }));
    expect(result).toEqual([{ phoneE164: "+14165550100", locality: "Toronto", region: "ON", countryCode: "CA", capabilities: { sms: true, voice: true } }]);
  });

  it("purchases and can reconcile an already-owned number", async () => {
    mocks.incomingPhoneNumbers.create.mockResolvedValue({ sid: "PN123", phoneNumber: "+14165550100", smsUrl: "https://app.test/sms", voiceUrl: "https://app.test/voice" });
    mocks.incomingPhoneNumbers.list.mockResolvedValue([{ sid: "PN123", phoneNumber: "+14165550100", friendlyName: "LobbyStack" }]);
    const twilio = provider();
    expect(await twilio.purchasePhoneNumber({ e164: "+14165550100", friendlyName: "LobbyStack", smsUrl: "https://app.test/sms", voiceUrl: "https://app.test/voice", statusCallbackUrl: "https://app.test/status" })).toEqual({ providerPhoneId: "PN123", e164: "+14165550100", smsUrl: "https://app.test/sms", voiceUrl: "https://app.test/voice" });
    expect(await twilio.findOwnedPhoneNumber({ e164: "+14165550100" })).toEqual({ providerPhoneId: "PN123", e164: "+14165550100", friendlyName: "LobbyStack" });
  });

  it("checks Verify using the durable verification SID", async () => {
    mocks.verificationCreate.mockResolvedValue({ sid: "VE123", status: "pending" });
    mocks.verificationCheckCreate.mockResolvedValue({ status: "approved" });
    const twilio = provider();
    expect(await twilio.verifyPhone({ to: "+14165550100", serviceSid: "VA123" })).toEqual({ verificationSid: "VE123", status: "pending" });
    expect(await twilio.checkPhone({ serviceSid: "VA123", verificationSid: "VE123", code: "123456" })).toEqual({ status: "approved", approved: true });
    expect(mocks.verificationCheckCreate).toHaveBeenCalledWith({ verificationSid: "VE123", code: "123456" });
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
