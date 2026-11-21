import { describe, expect, it } from "vitest";

import { alertSmsFrom, carrierSellsIn, countryRegistration, numberCarriersConfigured, numberCountryReady, numbersCarriersFor, parseCountryRoutes, sipAddress, telephonyRoutes } from "./config";

describe("sipAddress", () => {
  it("asks for TLS and SRTP in the URI", () => {
    expect(sipAddress({ OPENAI_PROJECT_ID: " proj_1 " })).toBe("sip:proj_1@sip.api.openai.com;transport=tls;secure=true");
  });

  it("is undefined without the project", () => {
    expect(sipAddress({})).toBeUndefined();
  });
});

describe("telephony routing settings", () => {
  it("tries Twilio, then Telnyx, then Zadarma, when nothing is set", () => {
    const routes = telephonyRoutes({});
    expect(routes).toEqual({ numbers: { byCountry: {}, fallback: ["twilio", "telnyx", "zadarma"] }, verify: "twilio", lookup: "twilio", alertSms: "twilio" });
    expect(numbersCarriersFor(routes, "US")).toEqual(["twilio", "telnyx", "zadarma"]);
  });

  it("routes number search and purchase by country, with * for the rest", () => {
    const routes = telephonyRoutes({ TELEPHONY_NUMBERS: " us:Telnyx, AU:twilio ,*:telnyx", TELEPHONY_VERIFY: "telnyx", TELEPHONY_LOOKUP: "TWILIO", TELEPHONY_ALERT_SMS: "" });
    expect(routes.numbers).toEqual({ byCountry: { US: ["telnyx"], AU: ["twilio"] }, fallback: ["telnyx"] });
    expect(numbersCarriersFor(routes, "us")).toEqual(["telnyx"]);
    expect(numbersCarriersFor(routes, "AU")).toEqual(["twilio"]);
    expect(numbersCarriersFor(routes, "GB")).toEqual(["telnyx"]);
    expect([routes.verify, routes.lookup, routes.alertSms]).toEqual(["telnyx", "twilio", "twilio"]);
  });

  it("reads the carriers to try for a country in the order they are written", () => {
    const routes = telephonyRoutes({ TELEPHONY_NUMBERS: "GB:telnyx > twilio, US:twilio>telnyx,*:twilio" });
    expect(routes.numbers).toEqual({ byCountry: { GB: ["telnyx", "twilio"], US: ["twilio", "telnyx"] }, fallback: ["twilio"] });
    // A country that isn't listed keeps the default order.
    expect(telephonyRoutes({ TELEPHONY_NUMBERS: "GB:telnyx" }).numbers.fallback).toEqual(["twilio", "telnyx", "zadarma"]);
  });

  it("refuses an unknown carrier, a malformed entry, a country listed twice and a carrier repeated in one list", () => {
    expect(() => parseCountryRoutes("US:vonage")).toThrow('TELEPHONY_NUMBERS must be one of twilio, telnyx, zadarma, not "vonage".');
    expect(() => parseCountryRoutes("USA:telnyx")).toThrow("malformed entry");
    expect(() => parseCountryRoutes("telnyx")).toThrow("malformed entry");
    expect(() => parseCountryRoutes("US:twilio>")).toThrow("malformed entry");
    expect(() => parseCountryRoutes("US:>twilio")).toThrow("malformed entry");
    expect(() => parseCountryRoutes("US:telnyx,us:twilio")).toThrow("lists US twice");
    expect(() => parseCountryRoutes("*:telnyx,*:twilio")).toThrow("lists * twice");
    expect(() => parseCountryRoutes("GB:twilio>telnyx>twilio")).toThrow("lists twilio twice for GB");
    expect(() => telephonyRoutes({ TELEPHONY_VERIFY: "plivo" })).toThrow("TELEPHONY_VERIFY");
  });

  it("asks each country's carrier for its own registration", () => {
    expect(countryRegistration("twilio", "US", {})).toBeNull();
    expect(countryRegistration("twilio", "AU", { TWILIO_AU_BUNDLE_SID: "BU1" })).toEqual({ missing: ["TWILIO_AU_ADDRESS_SID"] });
    expect(countryRegistration("telnyx", "GB", {})).toEqual({ missing: ["TELNYX_GB_REQUIREMENT_GROUP_ID"] });
    expect(countryRegistration("telnyx", "GB", { TELNYX_GB_REQUIREMENT_GROUP_ID: "rg_1" })).toEqual({ missing: [] });
    expect(countryRegistration("zadarma", "RS", {})).toEqual({ missing: ["ZADARMA_DOCUMENTS_GROUP_ID"] });
    expect(countryRegistration("zadarma", "RS", { ZADARMA_DOCUMENTS_GROUP_ID: "5" })).toEqual({ missing: [] });
    // A UK number from Telnyx needs Telnyx's requirement group, not Twilio's bundle.
    expect(numberCountryReady("GB", { TWILIO_GB_BUNDLE_SID: "BU1", TELEPHONY_NUMBERS: "GB:telnyx" })).toBe(false);
    expect(numberCountryReady("GB", { TELNYX_GB_REQUIREMENT_GROUP_ID: "rg_1", TELEPHONY_NUMBERS: "GB:telnyx" })).toBe(true);
    expect(numberCountryReady("GB", { TWILIO_GB_BUNDLE_SID: "BU1" })).toBe(true);
  });

  it("is ready for a country when any carrier it tries has the registration", () => {
    // The default order tries Twilio, then Telnyx, so either one's papers are enough.
    expect(numberCountryReady("GB", {})).toBe(false);
    expect(numberCountryReady("GB", { TELNYX_GB_REQUIREMENT_GROUP_ID: "rg_1" })).toBe(true);
    expect(numberCountryReady("GB", { TWILIO_GB_BUNDLE_SID: "BU1" })).toBe(true);
    expect(numberCountryReady("GB", { TELNYX_GB_REQUIREMENT_GROUP_ID: "rg_1", TELEPHONY_NUMBERS: "GB:twilio" })).toBe(false);
  });

  it("knows Twilio has no numbers in Serbia, so Serbia is ready only through another carrier", () => {
    expect(carrierSellsIn("twilio", "RS")).toBe(false);
    expect(carrierSellsIn("twilio", "rs")).toBe(false);
    expect(carrierSellsIn("twilio", "US")).toBe(true);
    expect(carrierSellsIn("telnyx", "RS")).toBe(true);
    expect(carrierSellsIn("zadarma", "RS")).toBe(true);
    // Zadarma is wanted for Serbia only, so its papers don't make the UK or Australia ready.
    expect(carrierSellsIn("zadarma", "GB")).toBe(false);
    expect(numberCountryReady("GB", { ZADARMA_DOCUMENTS_GROUP_ID: "5" })).toBe(false);
    expect(numberCountryReady("US", { ZADARMA_DOCUMENTS_GROUP_ID: "5" })).toBe(true);
    // Twilio asks for no registration in Serbia, but it doesn't make the country ready.
    expect(numberCountryReady("RS", {})).toBe(false);
    expect(numberCountryReady("RS", { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" })).toBe(false);
    expect(numberCountryReady("RS", { ZADARMA_DOCUMENTS_GROUP_ID: "5" })).toBe(true);
    expect(numberCountryReady("RS", { TELNYX_RS_REQUIREMENT_GROUP_ID: "rg_1" })).toBe(true);
    expect(countryRegistration("telnyx", "RS", {})).toEqual({ missing: ["TELNYX_RS_REQUIREMENT_GROUP_ID"] });
    // A route that names only Twilio leaves Serbia unsold.
    expect(numberCountryReady("RS", { ZADARMA_DOCUMENTS_GROUP_ID: "5", TELEPHONY_NUMBERS: "RS:twilio" })).toBe(false);
  });

  it("can search numbers when any carrier the routes name has credentials", () => {
    expect(numberCarriersConfigured({})).toBe(false);
    expect(numberCarriersConfigured({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" })).toBe(true);
    // Telnyx is in the default order, so its credentials alone are enough.
    expect(numberCarriersConfigured({ TELNYX_API_KEY: "KEY" })).toBe(true);
    expect(numberCarriersConfigured({ TELNYX_API_KEY: "KEY", TELEPHONY_NUMBERS: "*:twilio" })).toBe(false);
    expect(numberCarriersConfigured({ ZADARMA_API_KEY: "KEY", ZADARMA_API_SECRET: "SECRET" })).toBe(true);
    expect(numberCarriersConfigured({ ZADARMA_API_KEY: "KEY" })).toBe(false);
    expect(numberCarriersConfigured({ TELNYX_API_KEY: "KEY", TELEPHONY_NUMBERS: "US:telnyx,*:twilio" })).toBe(true);
    expect(numberCarriersConfigured({ TELNYX_API_KEY: "KEY", TELEPHONY_NUMBERS: "US:twilio>telnyx,*:twilio" })).toBe(true);
  });

  it("reads the shared sender from TELEPHONY_ALERT_SMS_FROM, then the older Twilio name", () => {
    expect(alertSmsFrom({ TWILIO_ALERT_SMS_FROM: "+18885550100" })).toBe("+18885550100");
    expect(alertSmsFrom({ TELEPHONY_ALERT_SMS_FROM: "+18885550199", TWILIO_ALERT_SMS_FROM: "+18885550100" })).toBe("+18885550199");
    expect(alertSmsFrom({})).toBeNull();
  });
});
