import { describe, expect, it } from "vitest";

import {
  isSelfHostedSupportProduct,
  selfHostedSupportAudiences,
  selfHostedSupportCatalog,
  selfHostedSupportProduct,
  selfHostedSupportTiers,
} from "./selfHostedSupport";

const plans = selfHostedSupportAudiences.flatMap((audience) =>
  selfHostedSupportTiers.map((tier) => ({ audience, tier, plan: selfHostedSupportCatalog[audience][tier] })),
);

describe("self-hosted support catalog", () => {
  it.each(plans)("bills $audience $tier annually at twelve times its effective monthly price", ({ plan }) => {
    expect(plan.annualChargeCents).toBe(plan.annualEffectiveMonthlyChargeCents * 12);
    expect(plan.annualEffectiveMonthlyChargeCents).toBe(Math.round(plan.monthlyChargeCents * 0.8 / 100) * 100);
  });

  it("charges plain self-hosters per business and agencies one price", () => {
    expect(plans.filter(({ plan }) => plan.perBusiness).map(({ audience }) => audience)).toEqual(["business", "business"]);
  });

  it("sends every plan to a distinct Polar checkout link and product", () => {
    const urls = plans.flatMap(({ plan }) => Object.values(plan.checkoutUrls));
    const ids = plans.flatMap(({ plan }) => Object.values(plan.productIds));
    expect(new Set(urls).size).toBe(8);
    expect(new Set(ids).size).toBe(8);
    for (const url of urls) expect(url).toMatch(/^https:\/\/buy\.polar\.sh\/polar_cl_\w+$/);
  });

  it("recognizes its own products and nothing else", () => {
    expect(isSelfHostedSupportProduct(selfHostedSupportCatalog.white_label.enterprise.productIds.annual)).toBe(true);
    expect(isSelfHostedSupportProduct("fc07b74d-3dc7-4efb-9270-be74de48e187")).toBe(false);
    expect(isSelfHostedSupportProduct(undefined)).toBe(false);
  });

  it("names the plan and interval a product sells", () => {
    expect(selfHostedSupportProduct(selfHostedSupportCatalog.business.enterprise.productIds.monthly)).toEqual({ audience: "business", tier: "enterprise", billingInterval: "monthly" });
    expect(selfHostedSupportProduct("prod_pro_monthly")).toBeNull();
  });
});
