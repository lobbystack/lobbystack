import { describe, expect, it } from "vitest";

import { createInstance } from "i18next";

import enCommon from "../../public/locales/en/common.json";
import frCommon from "../../public/locales/fr/common.json";
import { getChannelLabel, getContactChannels, getContactDisplayName, getContactSecondaryDetails, hasDisplayablePhone, normalizeChannel } from "./contact-display";

async function translator(locale: "en" | "fr") {
  const i18n = createInstance();
  await i18n.init({ lng: locale, defaultNS: "contacts", resources: { en: { common: enCommon }, fr: { common: frCommon } } });
  return (key: string) => i18n.t(key);
}

describe("channel labels", () => {
  it.each([
    ["voice", "Phone call"],
    ["pstn", "Phone call"],
    ["web_voice", "Web call"],
    ["sms", "SMS"],
    ["web_chat", "Website chat"],
    ["dashboard", "Dashboard"],
    ["operator", "Dashboard"],
    ["api", "API"],
  ])("labels %s as %s", async (value, label) => {
    expect(getChannelLabel(value, await translator("en"))).toBe(label);
  });

  it("translates labels with the active language", async () => {
    expect(getChannelLabel("web_voice", await translator("fr"))).toBe("Appel web");
  });

  it("humanizes values it does not know instead of showing the raw slug", async () => {
    expect(getChannelLabel("partner_import", await translator("en"))).toBe("Partner import");
    expect(getChannelLabel(null, await translator("en"))).toBe("");
  });

  it("returns each contact channel once, in display order, and skips staff sources", () => {
    expect(getContactChannels(["web_chat", "voice", "dashboard", "web_voice", "voice", null])).toEqual(["phone_call", "web_call", "web_chat"]);
    expect(normalizeChannel(" WEB_VOICE ")).toBe("web_call");
    expect(normalizeChannel("unknown")).toBeNull();
  });

  it("treats older plain web transports as web calls, without catching website chat", async () => {
    expect(normalizeChannel("web")).toBe("web_call");
    expect(normalizeChannel("webrtc_browser")).toBe("web_call");
    expect(normalizeChannel("web_chat")).toBe("web_chat");
    expect(getContactChannels(["web"])).toEqual(["web_call"]);
    expect(getContactDisplayName({ name: null, phone: null, channels: ["web"] }, "en", await translator("en"))).toBe("Web caller");
  });
});

describe("contact display names", () => {
  it("prefers the saved name", async () => {
    expect(getContactDisplayName({ name: "  Marie Tremblay ", phone: "+14155550100", email: "marie@example.com", channels: ["voice"] }, "en", await translator("en"))).toBe("Marie Tremblay");
  });

  it("falls back to the formatted phone number for the active language", async () => {
    const t = await translator("en");
    expect(getContactDisplayName({ name: null, phone: "+14155550100", email: "a@example.com" }, "en", t)).toBe("(415) 555-0100");
    expect(getContactDisplayName({ name: "", phone: "+33612345678" }, "en", t)).toBe("+33 6 12 34 56 78");
  });

  it("falls back to the email when there is no usable phone number", async () => {
    expect(getContactDisplayName({ name: null, phone: "unknown", email: "visitor@example.com", channels: ["web_chat"] }, "en", await translator("en"))).toBe("visitor@example.com");
  });

  it("describes web-only contacts by how they reached the business", async () => {
    const t = await translator("en");
    expect(getContactDisplayName({ name: null, phone: null, email: null, channels: ["web_voice"] }, "en", t)).toBe("Web caller");
    expect(getContactDisplayName({ channels: ["web_chat"] }, "en", t)).toBe("Website visitor");
    expect(getContactDisplayName({ channels: ["web_voice", "web_chat"] }, "en", t)).toBe("Website visitor");
    expect(getContactDisplayName({ phone: "anonymous", channels: ["voice"] }, "en", t)).toBe("Phone caller");
    expect(getContactDisplayName({ channels: ["web_voice"] }, "fr", await translator("fr"))).toBe("Appelant web");
  });

  it("only says unknown when there is nothing better to show", async () => {
    expect(getContactDisplayName({ name: null, phone: null, email: null, channels: [] }, "en", await translator("en"))).toBe("Unknown contact");
  });

  it("rejects placeholders that are not phone numbers", () => {
    expect(hasDisplayablePhone("+14155550100")).toBe(true);
    expect(hasDisplayablePhone("unknown")).toBe(false);
    expect(hasDisplayablePhone("deleted-0123456789abcdef")).toBe(false);
    expect(hasDisplayablePhone(null)).toBe(false);
  });

  it("lists the phone and email the display name does not already show", () => {
    expect(getContactSecondaryDetails({ name: "Marie", phone: "+14155550100", email: "marie@example.com" }, "en")).toEqual(["(415) 555-0100", "marie@example.com"]);
    expect(getContactSecondaryDetails({ name: null, phone: "+14155550100", email: "marie@example.com" }, "en")).toEqual(["marie@example.com"]);
    expect(getContactSecondaryDetails({ name: null, phone: null, email: "marie@example.com" }, "en")).toEqual([]);
    expect(getContactSecondaryDetails({ name: null, phone: null, email: null, channels: ["web_voice"] }, "en")).toEqual([]);
  });
});
