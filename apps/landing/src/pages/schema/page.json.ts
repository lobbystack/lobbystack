import { createSchemaEndpoint } from "@jdevalk/astro-seo-graph"
import type { GraphEntity } from "@jdevalk/seo-graph-core"
import { publicPages } from "@/lib/pages"
import {
  blogJsonLd,
  breadcrumbJsonLd,
  imageObjectJsonLd,
  organizationJsonLd,
  webPageJsonLd,
  webSiteJsonLd,
} from "@/lib/seo"

export const GET = createSchemaEndpoint({
  entries: async () => publicPages,
  mapper: (page) =>
    [
      organizationJsonLd(),
      webSiteJsonLd(),
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
