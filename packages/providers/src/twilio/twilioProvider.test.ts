import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const numberResource = { remove: vi.fn(), update: vi.fn(), fetch: vi.fn() };
  const incomingPhoneNumbers = Object.assign(vi.fn(() => numberResource), { create: vi.fn(), list: vi.fn() });
  const localList = vi.fn();
  const tollFreeList = vi.fn();
  const mobileList = vi.fn();
  const verificationCreate = vi.fn();
  const countryPricing = vi.fn();
  const client = {
    pricing: { v1: { phoneNumbers: { countries: vi.fn(() => ({ fetch: countryPricing })) } } },
    incomingPhoneNumbers,
    availablePhoneNumbers: vi.fn(() => ({ local: { list: localList }, mobile: { list: mobileList }, tollFree: { list: tollFreeList } })),
    verify: { v2: { services: vi.fn(() => ({ verifications: { create: verificationCreate } })) } },
    messages: Object.assign(vi.fn(), { create: vi.fn() }),
    calls: vi.fn(),
  };
  return { client, incomingPhoneNumbers, numberResource, localList, mobileList, tollFreeList, verificationCreate, countryPricing };
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

  it("requests numbers that take calls, texting or not, and normalizes Twilio's uppercase capability keys", async () => {
    mocks.localList.mockResolvedValue([{ phoneNumber: "+14165550100", locality: "Toronto", region: "ON", capabilities: { SMS: true, voice: true } }, { phoneNumber: "+14165550101", capabilities: { SMS: false, voice: true } }, { phoneNumber: "+14165550102", capabilities: { SMS: true, voice: false } }]);
    const result = await provider().listAvailablePhoneNumbers({ countryCode: "ca", kind: "local", areaCode: "416", limit: 50 });
    expect(mocks.localList).toHaveBeenCalledWith(expect.objectContaining({ areaCode: 416, voiceEnabled: true, limit: 20 }));
    expect(mocks.localList.mock.calls[0]![0]).not.toHaveProperty("smsEnabled");
    expect(result).toEqual([
      { phoneE164: "+14165550100", locality: "Toronto", region: "ON", countryCode: "CA", capabilities: { sms: true, voice: true } },
      { phoneE164: "+14165550101", countryCode: "CA", capabilities: { sms: false, voice: true } },
    ]);
  });

  it("purchases and can reconcile an already-owned number", async () => {
    mocks.incomingPhoneNumbers.create.mockResolvedValue({ sid: "PN123", phoneNumber: "+14165550100", smsUrl: "https://app.test/sms", voiceUrl: "https://app.test/voice" });
    mocks.incomingPhoneNumbers.list.mockResolvedValue([{ sid: "PN123", phoneNumber: "+14165550100", friendlyName: "LobbyStack" }]);
    const twilio = provider();
    expect(await twilio.purchasePhoneNumber({ e164: "+14165550100", friendlyName: "LobbyStack", smsUrl: "https://app.test/sms", statusCallbackUrl: "https://app.test/status" })).toEqual({ providerPhoneId: "PN123", e164: "+14165550100", smsUrl: "https://app.test/sms" });
    expect(await twilio.findOwnedPhoneNumber({ e164: "+14165550100" })).toEqual({ providerPhoneId: "PN123", e164: "+14165550100", friendlyName: "LobbyStack" });
  });

  it("lists mobile inventory and buys a number under its regulatory bundle and address", async () => {
    mocks.mobileList.mockResolvedValue([{ phoneNumber: "+61491570006", capabilities: { SMS: true, voice: true } }]);
    mocks.incomingPhoneNumbers.create.mockResolvedValue({ sid: "PN456", phoneNumber: "+61491570006" });
    const twilio = provider();
    expect(await twilio.listAvailablePhoneNumbers({ countryCode: "AU", kind: "mobile", limit: 10 })).toEqual([{ phoneE164: "+61491570006", countryCode: "AU", capabilities: { sms: true, voice: true } }]);
    expect(mocks.localList).not.toHaveBeenCalled();
    await twilio.purchasePhoneNumber({ e164: "+61491570006", friendlyName: "LobbyStack", smsUrl: "https://app.test/sms", statusCallbackUrl: "https://app.test/status", bundleSid: "BU123", addressSid: "AD123" });
    expect(mocks.incomingPhoneNumbers.create).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: "+61491570006", bundleSid: "BU123", addressSid: "AD123" }));
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

describe("TwilioProvider number pricing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the account's current monthly price for the kind of number, in US cents", async () => {
    mocks.countryPricing.mockResolvedValue({ priceUnit: "USD", phoneNumberPrices: [{ numberType: "local", basePrice: "3.40", currentPrice: "3.25" }, { numberType: "toll free", basePrice: "4.50", currentPrice: "4.50" }] });
    await expect(provider().getPhoneNumberMonthlyPrice({ countryCode: "ca", kind: "local" })).resolves.toEqual({ monthlyCents: 325 });
    expect(mocks.client.pricing.v1.phoneNumbers.countries).toHaveBeenCalledWith("CA");
    await expect(provider().getPhoneNumberMonthlyPrice({ countryCode: "CA", kind: "toll_free" })).resolves.toEqual({ monthlyCents: 450 });
  });

  it("refuses a kind Twilio doesn't price there, or a price in another currency", async () => {
    mocks.countryPricing.mockResolvedValue({ priceUnit: "USD", phoneNumberPrices: [{ numberType: "local", basePrice: "3.40", currentPrice: "3.40" }] });
    await expect(provider().getPhoneNumberMonthlyPrice({ countryCode: "GB", kind: "mobile" })).rejects.toThrow("Twilio has no monthly price for mobile numbers in GB.");
    mocks.countryPricing.mockResolvedValue({ priceUnit: "EUR", phoneNumberPrices: [{ numberType: "mobile", basePrice: "3.40", currentPrice: "3.40" }] });
    await expect(provider().getPhoneNumberMonthlyPrice({ countryCode: "GB", kind: "mobile" })).rejects.toThrow("not US dollars");
  });
});

function provider(): TwilioProvider {
  return new TwilioProvider({ accountSid: "AC_test", authToken: "secret" });
}
