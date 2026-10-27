/**
 * Paid support for people who run LobbyStack on their own servers. The
 * software is the same MIT-licensed release either way; these plans sell help.
 * Buyers pay through Polar checkout links, with no LobbyStack account, so no
 * business or partner ever owns these subscriptions.
 */

export const selfHostedSupportAudiences = ["business", "white_label"] as const;
export type SelfHostedSupportAudience = (typeof selfHostedSupportAudiences)[number];

export const selfHostedSupportTiers = ["premium", "enterprise"] as const;
export type SelfHostedSupportTier = (typeof selfHostedSupportTiers)[number];

export type SelfHostedSupportPlan = {
  /** A business plan charges for each business the install runs; a white-label plan is one price per agency. */
  perBusiness: boolean;
  monthlyChargeCents: number;
  annualChargeCents: number;
  annualEffectiveMonthlyChargeCents: number;
  /** The Polar products, one per billing interval. */
  productIds: { monthly: string; annual: string };
  /** Polar checkout links. A per-business link asks for the number of businesses. */
  checkoutUrls: { monthly: string; annual: string };
};

export const selfHostedSupportCatalog = {
  business: {
    premium: {
      perBusiness: true,
      monthlyChargeCents: 2_500,
      annualChargeCents: 24_000,
      annualEffectiveMonthlyChargeCents: 2_000,
      productIds: {
        monthly: "2dc10b8c-7288-4c85-a915-c78e69a13af9",
        annual: "799478d8-e5ac-4f0b-ab3b-74593be0c246",
      },
      checkoutUrls: {
        monthly: "https://buy.polar.sh/polar_cl_qdRtz1kLt7zu8bxqBS3IujK8hLO2uVT4blKNd1XqJUL",
        annual: "https://buy.polar.sh/polar_cl_PLaiKu85m0HxJdLibma4ISds3bPJfKRL2TvDC1EgxiH",
      },
    },
    enterprise: {
      perBusiness: true,
      monthlyChargeCents: 10_000,
      annualChargeCents: 96_000,
      annualEffectiveMonthlyChargeCents: 8_000,
      productIds: {
        monthly: "ed726acb-327b-4354-98b4-ed6ed537bfca",
        annual: "32b99616-10d6-4310-b3b5-fba546f3ef9a",
      },
      checkoutUrls: {
        monthly: "https://buy.polar.sh/polar_cl_FGoQguEqEQFykNh8IzWAUaGn3sMcrdwKqohRi2xLdoH",
        annual: "https://buy.polar.sh/polar_cl_u538VrAhjzGEqx9ZpJfBx63qG4J6YS9k35HgB0W08PH",
      },
    },
  },
  white_label: {
    premium: {
      perBusiness: false,
      monthlyChargeCents: 19_900,
      annualChargeCents: 190_800,
      annualEffectiveMonthlyChargeCents: 15_900,
      productIds: {
        monthly: "11ab2d02-a724-4b17-aab5-5ed26808b774",
        annual: "161b76f8-a620-4973-99a3-2d8a0b4c7b40",
      },
      checkoutUrls: {
        monthly: "https://buy.polar.sh/polar_cl_AItYGDVvE357Z8itaT2Rvw2U3n03muWUrLf5E0zJJUy",
        annual: "https://buy.polar.sh/polar_cl_x52Hxsfv9w7ryUmtpk39PE2gwaS2FN3qiR31O129sOA",
      },
    },
    enterprise: {
      perBusiness: false,
      monthlyChargeCents: 49_900,
      annualChargeCents: 478_800,
      annualEffectiveMonthlyChargeCents: 39_900,
      productIds: {
        monthly: "477c31bd-3070-4398-847a-53e9394ff647",
        annual: "bd6b5806-2304-4cc6-913c-95c9c2560ee4",
      },
      checkoutUrls: {
        monthly: "https://buy.polar.sh/polar_cl_wJWjj8LNxtTJY8L3E2tUSPIETp1COT3Ep6Gdz2JwxaP",
        annual: "https://buy.polar.sh/polar_cl_IopldFbePGMaxVujWKySn3n3esofrGMabwXp44TwPY7",
      },
    },
  },
} as const satisfies Record<SelfHostedSupportAudience, Record<SelfHostedSupportTier, SelfHostedSupportPlan>>;

const supportProductIds = new Set<string>(
  selfHostedSupportAudiences.flatMap((audience) =>
    selfHostedSupportTiers.flatMap((tier) => Object.values(selfHostedSupportCatalog[audience][tier].productIds)),
  ),
);

/** Whether a Polar product sells self-hosted support, which no business or partner owns. */
export function isSelfHostedSupportProduct(productId: string | undefined | null): boolean {
  return productId ? supportProductIds.has(productId) : false;
}
