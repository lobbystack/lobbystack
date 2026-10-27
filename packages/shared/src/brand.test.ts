import { describe, expect, it } from "vitest";

import { HOST_EMAIL_BRAND, customDomainOrigin, emailBrandReferenceFor, emailSender, hostBrand, parseEmailBrandReference, parseEmailSender, partnerBrand, partnerBrandOrigin, partnerOrigin, type Brand, type PartnerBrandRecord } from "./brand";
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
    expect(parseEmailSender("<a@example.test>")).toEqual({ name: "", address: "a@example.test" });
    expect(parseEmailSender("Acme <a b@example.test>")).toEqual({ name: "", address: "Acme <a b@example.test>" });
    // Long runs of spaces parse at once, with no regex backtracking.
    const started = performance.now();
    expect(parseEmailSender(`Acme${" ".repeat(50_000)}x`).name).toBe("");
    expect(performance.now() - started).toBeLessThan(100);
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

describe("a partner's brand", () => {
  const record: PartnerBrandRecord = {
    partnerId: "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11",
    name: "Bright Desk",
    subdomain: "bright.portal.example.test",
    logoVersion: "abc",
    faviconVersion: null,
    color: "#0f766e",
    termsUrl: "https://bright.example.test/terms",
    privacyUrl: null,
    supportUrl: null,
    supportEmail: "help@bright.example.test",
  };
  const environment = { APP_BASE_URL: "https://desk.example.test", PARTNER_BASE_DOMAIN: "portal.example.test", EMAIL_FROM: "Desk <no-reply@desk.example.test>" };

  it("lives on its subdomain, sends from the partner base domain and takes replies at its support email", () => {
    expect(partnerBrand({ environment, partner: record })).toEqual({
      kind: "partner",
      partnerId: record.partnerId,
      name: "Bright Desk",
      logoUrl: `/api/branding/logo?partner=${record.partnerId}&v=abc`,
      // With no favicon of its own, the tab shows the logo.
      faviconUrl: `/api/branding/logo?partner=${record.partnerId}&v=abc`,
      color: "#0f766e",
      origin: "https://bright.portal.example.test",
      links: { website: null, terms: "https://bright.example.test/terms", privacy: null, support: "mailto:help@bright.example.test" },
      email: { fromName: "Bright Desk", fromAddress: "no-reply@portal.example.test", replyTo: "help@bright.example.test" },
    });
  });

  it("leaves what the partner didn't set empty, never the host's", () => {
    const bare = partnerBrand({ environment, partner: { ...record, logoVersion: null, color: null, termsUrl: null, supportEmail: null } });
    expect(bare).toMatchObject({ logoUrl: null, faviconUrl: null, color: null, links: { website: null, terms: null, privacy: null, support: null }, email: { replyTo: null } });
    expect(partnerBrand({ environment, partner: { ...record, supportUrl: "https://help.bright.example.test/" } }).links.support).toBe("https://help.bright.example.test/");
    // Mail clients don't show an SVG logo, so emails head with the name instead; pages still show it.
    const svg = partnerBrand({ environment, partner: { ...record, logoContentType: "image/svg+xml" } });
    expect(svg.logoUrl).toBeTruthy();
    expect(svg.emailLogoUrl).toBeNull();
    expect(partnerBrand({ environment, partner: { ...record, logoContentType: "image/png" } })).not.toHaveProperty("emailLogoUrl");
  });

  it("takes APP_BASE_URL's scheme and port, and the host's origin and sender without a current subdomain", () => {
    expect(partnerOrigin("bright.partners.localhost", { APP_BASE_URL: "http://localhost:13000", PARTNER_BASE_DOMAIN: "partners.localhost" })).toBe("http://bright.partners.localhost:13000");
    const elsewhere = partnerBrand({ environment: { ...environment, PARTNER_BASE_DOMAIN: "" }, partner: record });
    expect(elsewhere).toMatchObject({ origin: "https://desk.example.test", email: { fromAddress: "no-reply@desk.example.test" } });
    expect(partnerOrigin("bright.old.example.test", environment)).toBe("https://desk.example.test");
    expect(partnerOrigin(null, environment)).toBe("https://desk.example.test");
  });

  it("keeps its subdomain as its origin beside its own domain, and moves to its own domain only without a subdomain, while the deployment serves partners' domains", () => {
    const cloudflare = { CLOUDFLARE_SAAS_API_TOKEN: "test-token", CLOUDFLARE_SAAS_ZONE_ID: "test-zone" };
    // Sign-up and invitations keep working on the subdomain, which every Turnstile hostname list covers.
    expect(partnerBrand({ environment: { ...environment, ...cloudflare }, partner: { ...record, customDomain: "app.bright.example.com" } }).origin).toBe("https://bright.portal.example.test");
    expect(partnerBrand({ environment: { ...environment, ...cloudflare, PARTNER_BASE_DOMAIN: "" }, partner: { ...record, subdomain: null, customDomain: "app.bright.example.com" } }).origin).toBe("https://app.bright.example.com");
    // A subdomain left under an earlier base domain doesn't count.
    expect(partnerBrandOrigin({ subdomain: "bright.old.example.test", customDomain: "app.bright.example.com" }, { ...environment, ...cloudflare })).toBe("https://app.bright.example.com");
    expect(partnerBrandOrigin({ subdomain: null, customDomain: "app.bright.example.com" }, { APP_BASE_URL: "http://localhost:13000", CADDY_ON_DEMAND_TLS: "true" })).toBe("http://app.bright.example.com:13000");
    // A deployment that stopped serving partners' own domains sends nobody to one.
    expect(partnerBrandOrigin({ subdomain: null, customDomain: "app.bright.example.com" }, { ...environment, PARTNER_BASE_DOMAIN: "" })).toBe("https://desk.example.test");
    expect(partnerBrandOrigin({ subdomain: record.subdomain, customDomain: null }, environment)).toBe("https://bright.portal.example.test");
    expect(customDomainOrigin("app.bright.example.com", { APP_BASE_URL: "http://localhost:13000" })).toBe("http://app.bright.example.com:13000");
  });
});
