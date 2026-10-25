import { describe, expect, it } from "vitest";

import { HOST_EMAIL_BRAND, emailBrandReferenceFor, emailSender, hostBrand, parseEmailBrandReference, parseEmailSender, type Brand } from "./brand";
import { resolveBrandLinks } from "./brandLinks";

describe("the host brand", () => {
  it("is LobbyStack's on a deployment that sets nothing", () => {
    expect(hostBrand({ environment: {}, saved: null, links: resolveBrandLinks({}) })).toEqual({
      kind: "host",
      partnerId: null,
      name: "LobbyStack",
      logoUrl: null,
      faviconUrl: null,
      color: null,
      origin: "http://localhost:3000",
      links: { website: "https://lobbystack.com", terms: "https://lobbystack.com/terms", privacy: "https://lobbystack.com/privacy", support: "mailto:support@lobbystack.com" },
      email: { fromName: "LobbyStack", fromAddress: "no-reply@localhost", replyTo: null },
    });
  });

  it("takes deployment branding, the outside links, APP_BASE_URL and the email sender", () => {
    const brand = hostBrand({
      environment: { BRAND_APP_NAME: "Front Desk", APP_BASE_URL: "https://desk.example.test/", EMAIL_FROM: '"Front Desk" <hello@desk.example.test>', EMAIL_REPLY_TO: " help@desk.example.test " },
      saved: { appName: "Saved Name", logoVersion: "abc" },
      links: resolveBrandLinks({ NEXT_PUBLIC_LANDING_SITE_URL: "https://desk.example.test", NEXT_PUBLIC_PRIVACY_URL: "https://legal.example.test/privacy", NEXT_PUBLIC_CONTACT_EMAIL: "team@desk.example.test" }),
    });
    expect(brand).toMatchObject({
      name: "Front Desk",
      logoUrl: "/api/branding/logo?v=abc",
      faviconUrl: "/api/branding/logo?v=abc",
      origin: "https://desk.example.test",
      links: { website: "https://desk.example.test", terms: "https://desk.example.test/terms", privacy: "https://legal.example.test/privacy", support: "mailto:team@desk.example.test" },
      email: { fromName: "Front Desk", fromAddress: "hello@desk.example.test", replyTo: "help@desk.example.test" },
    });
  });

  it("reads a sender with or without a display name", () => {
    expect(parseEmailSender("LobbyStack <no-reply@localhost>")).toEqual({ name: "LobbyStack", address: "no-reply@localhost" });
    expect(parseEmailSender('"Acme, Inc." <a@example.test>')).toEqual({ name: "Acme, Inc.", address: "a@example.test" });
    expect(parseEmailSender(" a@example.test ")).toEqual({ name: "", address: "a@example.test" });
    expect(hostBrand({ environment: { EMAIL_FROM: "a@example.test", BRAND_APP_NAME: "Acme" }, saved: null, links: resolveBrandLinks({}) }).email.fromName).toBe("Acme");
  });
});

const partner: Brand = {
  kind: "partner",
  partnerId: "partner-1",
  name: "Acme \"Desk\"",
  logoUrl: "https://cdn.example.test/acme.png",
  faviconUrl: null,
  color: null,
  origin: "https://acme.example.test",
  links: { website: null, terms: null, privacy: null, support: null },
  email: { fromName: "Acme \"Desk\"", fromAddress: "no-reply@acme.example.test", replyTo: "help@acme.example.test" },
};

describe("the brand an email goes out under", () => {
  it("reads the reference a payload carries, and sends a payload without one under the host brand", () => {
    expect(parseEmailBrandReference(undefined)).toEqual(HOST_EMAIL_BRAND);
    expect(parseEmailBrandReference({ kind: "host" })).toEqual(HOST_EMAIL_BRAND);
    expect(parseEmailBrandReference({ kind: "business", businessId: "b-1" })).toEqual({ kind: "business", businessId: "b-1" });
    expect(parseEmailBrandReference({ kind: "partner", partnerId: "p-1" })).toEqual({ kind: "partner", partnerId: "p-1" });
  });

  it("refuses a reference it can't read rather than sending under the host brand", () => {
    for (const value of [null, "host", { kind: "business" }, { kind: "business", businessId: "" }, { kind: "partner" }, { kind: "reseller", resellerId: "r-1" }]) {
      expect(() => parseEmailBrandReference(value), JSON.stringify(value)).toThrow("Unknown email brand");
    }
  });

  it("names the request's brand in an email sent while answering it", () => {
    expect(emailBrandReferenceFor(hostBrand({ environment: {}, saved: null, links: resolveBrandLinks({}) }))).toEqual(HOST_EMAIL_BRAND);
    expect(emailBrandReferenceFor(partner)).toEqual({ kind: "partner", partnerId: "partner-1" });
  });
});

describe("an email's sender and Reply-To", () => {
  const host = hostBrand({ environment: { EMAIL_FROM: "LobbyStack <no-reply@example.test>", EMAIL_REPLY_TO: "support@example.test" }, saved: null, links: resolveBrandLinks({}) });

  it("leaves the host's sender to EMAIL_FROM as written, with the host's Reply-To", () => {
    expect(emailSender(host, {})).toEqual({ replyTo: "support@example.test" });
    expect(emailSender(host, { from: null, replyTo: null })).toEqual({ replyTo: "support@example.test" });
    expect(emailSender(hostBrand({ environment: {}, saved: null, links: resolveBrandLinks({}) }), {})).toEqual({});
  });

  it("sends any other brand as itself, with its own Reply-To", () => {
    expect(emailSender(partner, {})).toEqual({ from: '"Acme \\"Desk\\"" <no-reply@acme.example.test>', replyTo: "help@acme.example.test" });
  });

  it("keeps a payload's own Reply-To, and takes replies at a payload's own sender", () => {
    expect(emailSender(host, { replyTo: "owner@example.test" })).toEqual({ replyTo: "owner@example.test" });
    expect(emailSender(host, { from: "Raphael <raphael@example.test>", replyTo: null })).toEqual({ from: "Raphael <raphael@example.test>" });
    expect(emailSender(partner, { from: "Raphael <raphael@example.test>", replyTo: "raphael@example.test" })).toEqual({ from: "Raphael <raphael@example.test>", replyTo: "raphael@example.test" });
  });
});
