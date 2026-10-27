import { partnerTierCatalog, partnerTierSlugs } from "@lobbystack/shared"

import { localizePath, type Locale } from "@/marketing/i18n"
import { absoluteUrl, type JsonLd } from "@/marketing/lib/seo"
import { getWhiteLabelCopy } from "@/marketing/lib/white-label-copy"

/** The schema.org id of the partner program's Service node on each language's page. */
export const whiteLabelServiceId = (locale: Locale) =>
  `${absoluteUrl(localizePath(locale, "/white-label/"))}#service`

const dollars = (cents: number) => String(cents / 100)

/** The partner program as a Service, with one offer per tier from partnerTierCatalog. */
export function whiteLabelServiceJsonLd(locale: Locale): JsonLd {
  const copy = getWhiteLabelCopy(locale)
  const url = absoluteUrl(localizePath(locale, "/white-label/"))
  return {
    "@type": "Service",
    "@id": whiteLabelServiceId(locale),
    name: copy.seo.serviceName,
    serviceType: copy.seo.serviceType,
    description: copy.seo.serviceDescription,
    url,
    provider: { "@id": absoluteUrl("/#organization") },
    audience: { "@type": "BusinessAudience", audienceType: copy.seo.audience },
    offers: partnerTierSlugs.map((slug) => {
      const tier = partnerTierCatalog[slug]
      return {
        "@type": "Offer",
        name: copy.tiers[slug].name,
        description: copy.tiers[slug].description,
        price: dollars(tier.monthlyChargeCents),
        priceCurrency: "USD",
        url: `${url}#tiers`,
        availability: "https://schema.org/InStock",
        ...(tier.paid
          ? {
              priceSpecification: [
                {
                  "@type": "UnitPriceSpecification",
                  price: dollars(tier.monthlyChargeCents),
                  priceCurrency: "USD",
                  unitCode: "MON",
                },
                ...(tier.annualChargeCents === null
                  ? []
                  : [
                      {
                        "@type": "UnitPriceSpecification",
                        price: dollars(tier.annualChargeCents),
                        priceCurrency: "USD",
                        unitCode: "ANN",
                      },
                    ]),
              ],
            }
          : {}),
      }
    }),
  }
}
