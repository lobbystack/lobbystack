import { describe, expect, it, vi } from "vitest";

import { createTelephony } from "./registry";
import type { CarrierAdapters, CarrierId, NumberInventory } from "./types";

function inventory(carrier: CarrierId): NumberInventory {
  return {
    carrier,
    listAvailablePhoneNumbers: vi.fn(async (input) => [{ phoneE164: carrier === "twilio" ? "+14165550100" : "+12125550100", countryCode: input.countryCode, capabilities: { sms: true, voice: true } }]),
    getPhoneNumberMonthlyPrice: vi.fn(),
    findOwnedPhoneNumber: vi.fn(),
    purchasePhoneNumber: vi.fn(),
    releasePhoneNumber: vi.fn(),
    isNumberUnavailableError: () => false,
  };
}

function carrier(id: CarrierId): CarrierAdapters {
  return { carrier: id, inventory: inventory(id), verifier: { carrier: id, sendCode: vi.fn(), checkCode: vi.fn() }, lineTypes: { carrier: id, lookupLineType: vi.fn() } };
}

describe("createTelephony", () => {
  it("searches each country at the carrier its route names, and tags the numbers with it", async () => {
    const twilio = carrier("twilio"); const telnyx = carrier("telnyx");
    const telephony = createTelephony({ TELEPHONY_NUMBERS: "US:telnyx,*:twilio" }, { twilio: () => twilio, telnyx: () => telnyx });
    expect(await telephony.numbers.listAvailablePhoneNumbers({ countryCode: "US", kind: "local", limit: 1 })).toEqual([expect.objectContaining({ phoneE164: "+12125550100", carrier: "telnyx" })]);
    expect(await telephony.numbers.listAvailablePhoneNumbers({ countryCode: "CA", kind: "local", limit: 1 })).toEqual([expect.objectContaining({ phoneE164: "+14165550100", carrier: "twilio" })]);
    expect(telnyx.inventory!.listAvailablePhoneNumbers).toHaveBeenCalledOnce();
  });

  it("answers phone_numbers_unavailable for a country whose carrier has no credentials", async () => {
    const telephony = createTelephony({ TELEPHONY_NUMBERS: "US:telnyx" }, { twilio: () => carrier("twilio"), telnyx: () => undefined });
    await expect(telephony.numbers.listAvailablePhoneNumbers({ countryCode: "US", kind: "local", limit: 1 })).rejects.toMatchObject({ status: 503, code: "phone_numbers_unavailable" });
  });

  it("sends operations on a number to its own carrier, and older rows to Twilio", () => {
    const twilio = carrier("twilio"); const telnyx = carrier("telnyx");
    const telephony = createTelephony({}, { twilio: () => twilio, telnyx: () => telnyx });
    expect(telephony.forNumber("telnyx")).toBe(telnyx);
    expect(telephony.forNumber(null)).toBe(twilio);
  });

  it("takes Verify and Lookup from the carriers their settings name", () => {
    const twilio = carrier("twilio"); const telnyx = carrier("telnyx");
    const telephony = createTelephony({ TELEPHONY_VERIFY: "telnyx" }, { twilio: () => twilio, telnyx: () => telnyx });
    expect(telephony.verifier).toBe(telnyx.verifier);
    expect(telephony.lineTypes).toBe(twilio.lineTypes);
  });

  it("builds nothing for a carrier without credentials", () => {
    const telephony = createTelephony({});
    expect(telephony.carriers).toEqual({});
    expect(telephony.alertSms).toBeUndefined();
  });

  it("fails on malformed routing instead of guessing", () => {
    expect(() => createTelephony({ TELEPHONY_NUMBERS: "US=telnyx" })).toThrow("malformed entry");
  });
});
