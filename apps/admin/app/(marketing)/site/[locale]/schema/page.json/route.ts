import { createSchemaEndpoint } from "@/marketing/seo/seo-graph"
import type { GraphEntity } from "@jdevalk/seo-graph-core"
import { publicPages } from "@/marketing/lib/pages"
import {
  blogJsonLd,
  breadcrumbJsonLd,
  imageObjectJsonLd,
  organizationJsonLd,
  productJsonLd,
  softwareApplicationJsonLd,
  webPageJsonLd,
  webSiteJsonLd,
} from "@/marketing/lib/seo"
import { marketingStaticParams } from "@/marketing/build"

// Prerendered once, for the unprefixed English site.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return marketingStaticParams([{ locale: "en" }]);
}

export const GET = createSchemaEndpoint({
  entries: async () => publicPages,
  mapper: (page) =>
    [
      organizationJsonLd(),
      webSiteJsonLd(),
      ...(page.path === "/"
        ? [softwareApplicationJsonLd(), productJsonLd()]
        : []),
      ...(page.path === "/blog/" ? [blogJsonLd()] : []),
      imageObjectJsonLd({
        path: page.path,
        alt: page.title,
      }),
      webPageJsonLd({
        title: page.title,
        description: page.description,
        path: page.path,
        type: page.path === "/blog/" ? "CollectionPage" : "WebPage",
      }),
      breadcrumbJsonLd([
        { name: "Home", path: "/" },
        ...(page.path === "/"
          ? []
          : [
              {
                name: page.title.replace(" - LobbyStack", ""),
                path: page.path,
              },
            ]),
      ]),
    ] as GraphEntity[],
})
