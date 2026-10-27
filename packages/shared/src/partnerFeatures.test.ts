import { describe, expect, it } from "vitest";

import { partnerFeatures, partnerFeatureWarnings, partnerTierForProduct, partnerTierProductId, partnerTierProducts } from "./partnerFeatures";
import { normalizeCustomDomain } from "./partnerDomains";
import { isPartnerSlug, partnerSlugFromName } from "./partners";

const tierProducts = Object.fromEntries(["STARTER", "GROWTH", "SCALE"].flatMap((tier) => ["MONTHLY", "ANNUAL"].map((interval) => [`POLAR_PARTNER_${tier}_${interval}_PRODUCT_ID`, `prod_${tier}_${interval}`])));

describe("partner features", () => {
  it("turns nothing on but signup when nothing is configured", () => {
    expect(partnerFeatures({})).toEqual({ enabled: true, signup: "open", baseDomain: null, stripeConnect: false, tierBilling: false, customDomains: null, maxSimultaneousCalls: 30 });
  });

  it("keeps signup on invitations on the cloud until it bills tiers and open elsewhere, unless PARTNER_SIGNUP says otherwise", () => {
    expect(partnerFeatures({ DEPLOYMENT_MODE: "cloud" }).signup).toBe("invite");
    expect(partnerFeatures({ DEPLOYMENT_MODE: " cloud " }).signup).toBe("invite");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "cloud", ...tierProducts }).signup).toBe("open");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "cloud", ...tierProducts, POLAR_PARTNER_SCALE_ANNUAL_PRODUCT_ID: " " }).signup).toBe("invite");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "cloud", ...tierProducts, PARTNER_SIGNUP: "invite" }).signup).toBe("invite");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "self_hosted_standard" }).signup).toBe("open");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "development" }).signup).toBe("open");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "cloud", PARTNER_SIGNUP: "open" }).signup).toBe("open");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "self_hosted_standard", PARTNER_SIGNUP: " Invite " }).signup).toBe("invite");
  });

  it("falls back to the default for a PARTNER_SIGNUP it doesn't know", () => {
    expect(partnerFeatures({ DEPLOYMENT_MODE: "cloud", PARTNER_SIGNUP: "anyone" }).signup).toBe("invite");
    expect(partnerFeatures({ DEPLOYMENT_MODE: "cloud", ...tierProducts, PARTNER_SIGNUP: "anyone" }).signup).toBe("open");
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

  it("issues partners' certificates through Caddy's on-demand TLS when the host says Caddy asks first, and through Cloudflare when both are set", () => {
    expect(partnerFeatures({ CADDY_ON_DEMAND_TLS: "true" }).customDomains).toBe("caddy");
    expect(partnerFeatures({ CADDY_ON_DEMAND_TLS: " TRUE " }).customDomains).toBe("caddy");
    for (const value of ["", "false", "yes", "1"]) expect(partnerFeatures({ CADDY_ON_DEMAND_TLS: value }).customDomains, value).toBeNull();
    expect(partnerFeatures({ CADDY_ON_DEMAND_TLS: "true", CLOUDFLARE_SAAS_API_TOKEN: "token", CLOUDFLARE_SAAS_ZONE_ID: "zone" }).customDomains).toBe("cloudflare");
  });
});

describe("a partner's own domain", () => {
  it("takes a subdomain of the partner's domain, lowercased, without a scheme, path or trailing dot", () => {
    expect(normalizeCustomDomain("app.acmeagency.com")).toBe("app.acmeagency.com");
    expect(normalizeCustomDomain(" https://App.AcmeAgency.com/login ")).toBe("app.acmeagency.com");
    expect(normalizeCustomDomain(`app.acmeagency.com${"/".repeat(50_000)}`)).toBe("app.acmeagency.com");
    expect(normalizeCustomDomain("portal.acme.co.uk.")).toBe("portal.acme.co.uk");
    expect(normalizeCustomDomain("app.xn--mnchen-3ya.de")).toBe("app.xn--mnchen-3ya.de");
  });

  it("refuses an apex, an address, a port, a wildcard and anything that isn't a hostname", () => {
    for (const value of ["acmeagency.com", "localhost", "192.168.1.10", "app.acme.com:8443", "*.acme.com", "app_1.acme.com", "app..acme.com", "", "  ", "app.acme.123", "[::1]", 42, null]) {
      expect(normalizeCustomDomain(value), String(value)).toBeNull();
    }
    expect(normalizeCustomDomain(`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(60)}.com`)).toBeNull();
  });
});

describe("partner tier products", () => {
  it("turns tier billing on only when every tier has its own monthly and annual product", () => {
    expect(partnerFeatures(tierProducts).tierBilling).toBe(true);
    const { POLAR_PARTNER_GROWTH_MONTHLY_PRODUCT_ID: _growth, ...missingOne } = tierProducts;
    expect(partnerFeatures(missingOne).tierBilling).toBe(false);
    // Two settings naming one product would leave a subscription's tier ambiguous.
    expect(partnerFeatures({ ...tierProducts, POLAR_PARTNER_SCALE_ANNUAL_PRODUCT_ID: "prod_GROWTH_ANNUAL" }).tierBilling).toBe(false);
    // The direct plans' products don't sell tiers.
    expect(partnerFeatures({ POLAR_STARTER_MONTHLY_PRODUCT_ID: "prod_starter", POLAR_PRO_ANNUAL_PRODUCT_ID: "prod_pro" }).tierBilling).toBe(false);
  });

  it("finds the product for a tier and interval, and the tier and interval a product sells", () => {
    expect(partnerTierProductId(tierProducts, "growth", "annual")).toBe("prod_GROWTH_ANNUAL");
    expect(partnerTierProductId({ POLAR_PARTNER_STARTER_MONTHLY_PRODUCT_ID: " prod_1 " }, "starter", "monthly")).toBe("prod_1");
    expect(partnerTierProductId({}, "starter", "monthly")).toBeNull();
    expect(partnerTierForProduct(tierProducts, "prod_SCALE_MONTHLY")).toEqual({ tier: "scale", billingInterval: "monthly" });
    for (const productId of ["prod_unknown", "", null, undefined]) expect(partnerTierForProduct(tierProducts, productId)).toBeNull();
    expect(partnerTierProducts(tierProducts)).toHaveLength(6);
  });
});

describe("partner feature warnings", () => {
  it("has nothing to say about settings that are unset or valid", () => {
    expect(partnerFeatureWarnings({})).toEqual([]);
    expect(partnerFeatureWarnings({ PARTNER_BASE_DOMAIN: " ", PARTNER_SIGNUP: "" })).toEqual([]);
    // Subdomains without custom domains are a setup of their own, so they warn of nothing; the console says custom domains are off.
    expect(partnerFeatureWarnings({ PARTNER_BASE_DOMAIN: "Portal.Example.Test.", PARTNER_SIGNUP: " Invite " })).toEqual([]);
  });

  it("names a partner base domain or signup setting that partnerFeatures ignores", () => {
    const [domain] = partnerFeatureWarnings({ PARTNER_BASE_DOMAIN: "https://receptionistportal.com" });
    expect(domain).toMatch(/^PARTNER_BASE_DOMAIN is ignored: "https:\/\/receptionistportal\.com"/);
    expect(partnerFeatureWarnings({ PARTNER_BASE_DOMAIN: "*.receptionistportal.com" })).toHaveLength(1);
    expect(partnerFeatureWarnings({ DEPLOYMENT_MODE: "cloud", PARTNER_SIGNUP: "anyone" })).toEqual(["PARTNER_SIGNUP is ignored: it takes open or invite, so signup stays invite."]);
  });

  it("says which custom domain setting is missing, unreadable or overruled", () => {
    expect(partnerFeatureWarnings({ CLOUDFLARE_SAAS_API_TOKEN: "token", CLOUDFLARE_SAAS_ZONE_ID: "zone" })).toEqual([]);
    expect(partnerFeatureWarnings({ CADDY_ON_DEMAND_TLS: "true" })).toEqual([]);
    expect(partnerFeatureWarnings({ CLOUDFLARE_SAAS_API_TOKEN: "token" })).toEqual(["Cloudflare for SaaS is off: CLOUDFLARE_SAAS_ZONE_ID isn't set. Partners can't add their own domains through Cloudflare until both are."]);
    expect(partnerFeatureWarnings({ CADDY_ON_DEMAND_TLS: "yes" })).toEqual(["CADDY_ON_DEMAND_TLS is ignored: it takes true or false, so partners can't add their own domains."]);
    expect(partnerFeatureWarnings({ CADDY_ON_DEMAND_TLS: "true", CLOUDFLARE_SAAS_API_TOKEN: "token", CLOUDFLARE_SAAS_ZONE_ID: "zone" })).toEqual(["CADDY_ON_DEMAND_TLS is ignored: Cloudflare for SaaS is set up too, and it issues partners' certificates instead."]);
  });

  it("says tier billing is off when only some tier products are set, or two share a product", () => {
    expect(partnerFeatureWarnings(tierProducts)).toEqual([]);
    const { POLAR_PARTNER_GROWTH_MONTHLY_PRODUCT_ID: _growth, POLAR_PARTNER_SCALE_ANNUAL_PRODUCT_ID: _scale, ...missingTwo } = tierProducts;
    expect(partnerFeatureWarnings(missingTwo)).toEqual(["Partner tier billing is off: POLAR_PARTNER_GROWTH_MONTHLY_PRODUCT_ID, POLAR_PARTNER_SCALE_ANNUAL_PRODUCT_ID aren't set. Partners can't buy a tier, and nothing limits their pools or phone numbers, until every tier has a monthly and an annual product."]);
    expect(partnerFeatureWarnings({ ...tierProducts, POLAR_PARTNER_SCALE_ANNUAL_PRODUCT_ID: "prod_GROWTH_ANNUAL" })).toEqual(["Partner tier billing is off: two POLAR_PARTNER_*_PRODUCT_ID settings name the same product. Give each tier and interval its own product."]);
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
