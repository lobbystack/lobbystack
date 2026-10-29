import { describe, expect, it } from "vitest";

import { alertSmsFrom, countryRegistration, numberCarriersConfigured, numberCountryReady, numbersCarrierFor, parseCountryRoutes, telephonyRoutes } from "./config";

describe("telephony routing settings", () => {
  it("sends everything to Twilio when nothing is set", () => {
    const routes = telephonyRoutes({});
    expect(routes).toEqual({ numbers: { byCountry: {}, fallback: "twilio" }, verify: "twilio", lookup: "twilio", alertSms: "twilio" });
    expect(numbersCarrierFor(routes, "US")).toBe("twilio");
  });

  it("routes number search and purchase by country, with * for the rest", () => {
    const routes = telephonyRoutes({ TELEPHONY_NUMBERS: " us:Telnyx, AU:twilio ,*:telnyx", TELEPHONY_VERIFY: "telnyx", TELEPHONY_LOOKUP: "TWILIO", TELEPHONY_ALERT_SMS: "" });
    expect(routes.numbers).toEqual({ byCountry: { US: "telnyx", AU: "twilio" }, fallback: "telnyx" });
    expect(numbersCarrierFor(routes, "us")).toBe("telnyx");
    expect(numbersCarrierFor(routes, "AU")).toBe("twilio");
    expect(numbersCarrierFor(routes, "GB")).toBe("telnyx");
    expect([routes.verify, routes.lookup, routes.alertSms]).toEqual(["telnyx", "twilio", "twilio"]);
  });

  it("refuses an unknown carrier, a malformed entry and a country listed twice", () => {
    expect(() => parseCountryRoutes("US:vonage")).toThrow('TELEPHONY_NUMBERS must be one of twilio, telnyx, not "vonage".');
    expect(() => parseCountryRoutes("USA:telnyx")).toThrow("malformed entry");
    expect(() => parseCountryRoutes("telnyx")).toThrow("malformed entry");
    expect(() => parseCountryRoutes("US:telnyx,us:twilio")).toThrow("lists US twice");
    expect(() => parseCountryRoutes("*:telnyx,*:twilio")).toThrow("lists * twice");
    expect(() => telephonyRoutes({ TELEPHONY_VERIFY: "plivo" })).toThrow("TELEPHONY_VERIFY");
  });

  it("asks each country's carrier for its own registration", () => {
    expect(countryRegistration("twilio", "US", {})).toBeNull();
    expect(countryRegistration("twilio", "AU", { TWILIO_AU_BUNDLE_SID: "BU1" })).toEqual({ missing: ["TWILIO_AU_ADDRESS_SID"] });
    expect(countryRegistration("telnyx", "GB", {})).toEqual({ missing: ["TELNYX_GB_REQUIREMENT_GROUP_ID"] });
    expect(countryRegistration("telnyx", "GB", { TELNYX_GB_REQUIREMENT_GROUP_ID: "rg_1" })).toEqual({ missing: [] });
    // A UK number from Telnyx needs Telnyx's requirement group, not Twilio's bundle.
    expect(numberCountryReady("GB", { TWILIO_GB_BUNDLE_SID: "BU1", TELEPHONY_NUMBERS: "GB:telnyx" })).toBe(false);
    expect(numberCountryReady("GB", { TELNYX_GB_REQUIREMENT_GROUP_ID: "rg_1", TELEPHONY_NUMBERS: "GB:telnyx" })).toBe(true);
    expect(numberCountryReady("GB", { TWILIO_GB_BUNDLE_SID: "BU1" })).toBe(true);
  });

  it("can search numbers when any carrier the routes name has credentials", () => {
    expect(numberCarriersConfigured({})).toBe(false);
    expect(numberCarriersConfigured({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" })).toBe(true);
    expect(numberCarriersConfigured({ TELNYX_API_KEY: "KEY" })).toBe(false);
    expect(numberCarriersConfigured({ TELNYX_API_KEY: "KEY", TELEPHONY_NUMBERS: "US:telnyx" })).toBe(true);
  });

  it("reads the shared sender from TELEPHONY_ALERT_SMS_FROM, then the older Twilio name", () => {
    expect(alertSmsFrom({ TWILIO_ALERT_SMS_FROM: "+18885550100" })).toBe("+18885550100");
    expect(alertSmsFrom({ TELEPHONY_ALERT_SMS_FROM: "+18885550199", TWILIO_ALERT_SMS_FROM: "+18885550100" })).toBe("+18885550199");
    expect(alertSmsFrom({})).toBeNull();
  });
});
