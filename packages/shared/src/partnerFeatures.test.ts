import { describe, expect, it } from "vitest";

import { partnerFeatures, partnerFeatureWarnings } from "./partnerFeatures";
import { isPartnerSlug, partnerSlugFromName } from "./partners";

const tierProducts = Object.fromEntries(["STARTER", "GROWTH", "SCALE"].flatMap((tier) => ["MONTHLY", "ANNUAL"].map((interval) => [`POLAR_PARTNER_${tier}_${interval}_PRODUCT_ID`, `prod_${tier}_${interval}`])));

describe("partner features", () => {
  it("turns nothing on but signup when nothing is configured", () => {
    expect(partnerFeatures({})).toEqual({ enabled: true, signup: "open", baseDomain: null, stripeConnect: false, tierBilling: false, customDomains: null });
  });

  it("keeps signup on invitations on the cloud and open elsewhere, unless PARTNER_SIGNUP says otherwise", () => {
    expect(partnerFeatures({ DEPLOYMENT_MODE: "cloud" }).signup).toBe("invite");
    expect(partnerFeatures({ DEPLOYMENT_MODE: " cloud " }).signup).toBe("invite");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "self_hosted_standard" }).signup).toBe("open");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "development" }).signup).toBe("open");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "cloud", PARTNER_SIGNUP: "open" }).signup).toBe("open");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "self_hosted_standard", PARTNER_SIGNUP: " Invite " }).signup).toBe("invite");
  });

  it("falls back to the default for a PARTNER_SIGNUP it doesn't know", () => {
    expect(partnerFeatures({ DEPLOYMENT_MODE: "cloud", PARTNER_SIGNUP: "anyone" }).signup).toBe("invite");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "self_hosted_standard", PARTNER_SIGNUP: "closed" }).signup).toBe("open");
  });

  it("reads the partner base domain as a bare hostname, and ignores anything else", () => {
    expect(partnerFeatures({ PARTNER_BASE_DOMAIN: "receptionistportal.com" }).baseDomain).toBe("receptionistportal.com");
    expect(partnerFeatures({ PARTNER_BASE_DOMAIN: " Partners.Example.TEST. " }).baseDomain).toBe("partners.example.test");
    expect(partnerFeatures({ PARTNER_BASE_DOMAIN: "partners.localhost" }).baseDomain).toBe("partners.localhost");
    for (const value of ["", "   ", "https://receptionistportal.com", "receptionistportal.com/path", "*.receptionistportal.com", "portal.example:8443", "-bad.example", "bad_label.example"]) {
      expect(partnerFeatures({ PARTNER_BASE_DOMAIN: value }).baseDomain, value).toBeNull();
    }
  });

  it("turns on Stripe Connect, tier billing and Cloudflare custom domains only when all their settings are present", () => {
    expect(partnerFeatures({ STRIPE_CONNECT_SECRET_KEY: "sk_test_1" }).stripeConnect).toBe(false);
    expect(partnerFeatures({ STRIPE_CONNECT_SECRET_KEY: "sk_test_1", STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_1" }).stripeConnect).toBe(true);
    expect(partnerFeatures(tierProducts).tierBilling).toBe(true);
    expect(partnerFeatures({ ...tierProducts, POLAR_PARTNER_SCALE_ANNUAL_PRODUCT_ID: " " }).tierBilling).toBe(false);
    expect(partnerFeatures({ CLOUDFLARE_SAAS_API_TOKEN: "token" }).customDomains).toBeNull();
    expect(partnerFeatures({ CLOUDFLARE_SAAS_API_TOKEN: "token", CLOUDFLARE_SAAS_ZONE_ID: "zone" }).customDomains).toBe("cloudflare");
  });
});

describe("partner feature warnings", () => {
  it("has nothing to say about settings that are unset or valid", () => {
    expect(partnerFeatureWarnings({})).toEqual([]);
    expect(partnerFeatureWarnings({ PARTNER_BASE_DOMAIN: " ", PARTNER_SIGNUP: "" })).toEqual([]);
    expect(partnerFeatureWarnings({ PARTNER_BASE_DOMAIN: "Portal.Example.Test.", PARTNER_SIGNUP: " Invite " })).toEqual([]);
  });

  it("names a partner base domain or signup setting that partnerFeatures ignores", () => {
    const [domain] = partnerFeatureWarnings({ PARTNER_BASE_DOMAIN: "https://receptionistportal.com" });
    expect(domain).toMatch(/^PARTNER_BASE_DOMAIN is ignored: "https:\/\/receptionistportal\.com"/);
    expect(partnerFeatureWarnings({ PARTNER_BASE_DOMAIN: "*.receptionistportal.com" })).toHaveLength(1);
    expect(partnerFeatureWarnings({ DEPLOYMENT_MODE: "cloud", PARTNER_SIGNUP: "anyone" })).toEqual(["PARTNER_SIGNUP is ignored: it takes open or invite, so signup stays invite."]);
  });
});

describe("partner slugs", () => {
  it("accepts DNS labels of 3 to 40 characters", () => {
    for (const slug of ["acme", "bright-desk", "a1b", "x".repeat(40)]) expect(isPartnerSlug(slug), slug).toBe(true);
    for (const slug of ["ab", "x".repeat(41), "-acme", "acme-", "Acme", "acme.desk", "acme_desk", "xn--80ak6aa92e"]) expect(isPartnerSlug(slug), slug).toBe(false);
  });

  it("keeps the host's own labels", () => {
    for (const slug of ["www", "app", "api", "admin", "mail", "partners"]) expect(isPartnerSlug(slug), slug).toBe(false);
  });

  it("makes a slug from a name, or none when the name gives no usable one", () => {
    expect(partnerSlugFromName("Bright Desk!")).toBe("bright-desk");
    expect(partnerSlugFromName("  Équipe Réception  ")).toBe("equipe-reception");
    expect(partnerSlugFromName(`${"a".repeat(39)} b`)).toBe("a".repeat(39));
    expect(partnerSlugFromName("Admin")).toBe("");
    expect(partnerSlugFromName("日本")).toBe("");
  });
});
