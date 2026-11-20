import { afterEach, describe, expect, it, vi } from "vitest";

import { createTelephony, guardedNumberSearch } from "./registry";
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

/** A carrier whose number search answers as the test says: with numbers, with none, or with an error. */
function searching(id: CarrierId, answer: "numbers" | "none" | Error): CarrierAdapters {
  const adapters = carrier(id);
  adapters.inventory!.listAvailablePhoneNumbers = vi.fn(async (input) => {
    if (answer instanceof Error) throw answer;
    return answer === "none" ? [] : [{ phoneE164: `+3818${id === "twilio" ? "1" : "2"}0000000`, countryCode: input.countryCode, capabilities: { sms: false, voice: true } }];
  });
  return adapters;
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
    // A carrier a newer build wrote isn't sent to Twilio.
    expect(telephony.forNumber("vonage")).toBeUndefined();
  });

  it("runs the search limit once, and only when the country's carrier can search", async () => {
    const telephony = createTelephony({ TELEPHONY_NUMBERS: "US:telnyx,*:twilio" }, { twilio: () => carrier("twilio"), telnyx: () => undefined });
    const limit = vi.fn(async () => undefined);
    const guarded = guardedNumberSearch(telephony.numbers, limit);
    await expect(guarded.listAvailablePhoneNumbers({ countryCode: "US", kind: "local", limit: 1 })).rejects.toMatchObject({ code: "phone_numbers_unavailable" });
    expect(limit).not.toHaveBeenCalled();
    await guarded.listAvailablePhoneNumbers({ countryCode: "CA", kind: "local", limit: 1 });
    await guarded.listAvailablePhoneNumbers({ countryCode: "CA", kind: "mobile", limit: 1 });
    expect(limit).toHaveBeenCalledOnce();
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

  describe("trying the carriers in order", () => {
    const search = { countryCode: "RS", kind: "local" as const, limit: 5 };
    afterEach(() => vi.restoreAllMocks());
    const logged = () => vi.spyOn(console, "warn").mockImplementation(() => undefined);

    it("asks the first carrier and stops there when it has numbers", async () => {
      const twilio = searching("twilio", "numbers"); const telnyx = searching("telnyx", "numbers");
      const telephony = createTelephony({}, { twilio: () => twilio, telnyx: () => telnyx });
      expect(await telephony.numbers.listAvailablePhoneNumbers(search)).toEqual([expect.objectContaining({ carrier: "twilio" })]);
      expect(telnyx.inventory!.listAvailablePhoneNumbers).not.toHaveBeenCalled();
    });

    it("moves to the next carrier when the first has no numbers, and tags them with the one that has", async () => {
      const warn = logged();
      const telephony = createTelephony({}, { twilio: () => searching("twilio", "none"), telnyx: () => searching("telnyx", "numbers") });
      expect(await telephony.numbers.listAvailablePhoneNumbers(search)).toEqual([expect.objectContaining({ phoneE164: "+381820000000", carrier: "telnyx" })]);
      expect(JSON.parse(warn.mock.calls[0]![0] as string)).toEqual({ event: "telephony.number_search_fallback", country: "RS", carrier: "twilio", reason: "no numbers", next: "telnyx" });
    });

    it("moves to the next carrier when the first fails", async () => {
      const warn = logged();
      const telephony = createTelephony({}, { twilio: () => searching("twilio", new Error("country not supported")), telnyx: () => searching("telnyx", "numbers") });
      expect(await telephony.numbers.listAvailablePhoneNumbers(search)).toEqual([expect.objectContaining({ carrier: "telnyx" })]);
      expect(JSON.parse(warn.mock.calls[0]![0] as string)).toMatchObject({ carrier: "twilio", reason: "search failed", next: "telnyx" });
    });

    it("skips a carrier that has no credentials without asking it", async () => {
      const telnyx = searching("telnyx", "numbers");
      const telephony = createTelephony({}, { twilio: () => undefined, telnyx: () => telnyx });
      expect(await telephony.numbers.listAvailablePhoneNumbers(search)).toEqual([expect.objectContaining({ carrier: "telnyx" })]);
    });

    it("skips a carrier whose papers for the country aren't set up", async () => {
      const twilio = searching("twilio", "numbers"); const telnyx = searching("telnyx", "numbers");
      // Twilio sells UK numbers only under an approved bundle, which this deployment hasn't set.
      const telephony = createTelephony({ TELNYX_GB_REQUIREMENT_GROUP_ID: "rg_1" }, { twilio: () => twilio, telnyx: () => telnyx });
      expect(await telephony.numbers.listAvailablePhoneNumbers({ ...search, countryCode: "GB" })).toEqual([expect.objectContaining({ carrier: "telnyx" })]);
      expect(twilio.inventory!.listAvailablePhoneNumbers).not.toHaveBeenCalled();
      const unprepared = createTelephony({}, { twilio: () => twilio, telnyx: () => telnyx });
      await expect(unprepared.numbers.listAvailablePhoneNumbers({ ...search, countryCode: "GB" })).rejects.toMatchObject({ code: "phone_numbers_unavailable" });
    });

    it("answers with none when a carrier had none and the others failed", async () => {
      logged();
      const telephony = createTelephony({}, { twilio: () => searching("twilio", "none"), telnyx: () => searching("telnyx", new Error("boom")) });
      expect(await telephony.numbers.listAvailablePhoneNumbers(search)).toEqual([]);
    });

    it("throws the first failure when every carrier asked failed, so a dead country isn't read as having no numbers", async () => {
      logged();
      const telephony = createTelephony({}, { twilio: () => searching("twilio", new Error("twilio down")), telnyx: () => searching("telnyx", new Error("telnyx down")) });
      await expect(telephony.numbers.listAvailablePhoneNumbers(search)).rejects.toThrow("twilio down");
    });

    it("tries only the carriers a country lists, in the order written", async () => {
      const twilio = searching("twilio", "numbers"); const telnyx = searching("telnyx", "none");
      const telephony = createTelephony({ TELEPHONY_NUMBERS: "RS:telnyx>twilio,*:telnyx" }, { twilio: () => twilio, telnyx: () => telnyx });
      expect(telephony.numbersCarriers("RS")).toEqual(["telnyx", "twilio"]);
      logged();
      expect(await telephony.numbers.listAvailablePhoneNumbers(search)).toEqual([expect.objectContaining({ carrier: "twilio" })]);
      expect(telnyx.inventory!.listAvailablePhoneNumbers).toHaveBeenCalledBefore(twilio.inventory!.listAvailablePhoneNumbers as never);
    });

    it("doesn't fall back from a country that lists one carrier", async () => {
      const twilio = searching("twilio", "numbers"); const telnyx = searching("telnyx", "none");
      const telephony = createTelephony({ TELEPHONY_NUMBERS: "RS:telnyx" }, { twilio: () => twilio, telnyx: () => telnyx });
      logged();
      expect(await telephony.numbers.listAvailablePhoneNumbers(search)).toEqual([]);
      expect(twilio.inventory!.listAvailablePhoneNumbers).not.toHaveBeenCalled();
    });

    it("runs the search limit once however many carriers are asked", async () => {
      logged();
      const telephony = createTelephony({}, { twilio: () => searching("twilio", "none"), telnyx: () => searching("telnyx", "numbers") });
      const limit = vi.fn(async () => undefined);
      await guardedNumberSearch(telephony.numbers, limit).listAvailablePhoneNumbers(search);
      expect(limit).toHaveBeenCalledOnce();
    });
  });
});

