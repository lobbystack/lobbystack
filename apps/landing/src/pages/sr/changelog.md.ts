import type { APIRoute } from "astro"
import {
  changelogAnchorId,
  changelogPath,
  getChangelogEntries,
} from "@/lib/changelog"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

export const GET: APIRoute = async () => {
  const entries = await getChangelogEntries("sr")

  const markdown = `# LobbyStack: šta je novo?

Novosti o proizvodu, integracije i poboljšanja od LobbyStack tima.

## Izmene

${entries
  .map(
    (entry) =>
      `- [${entry.data.title}](${absoluteUrl(changelogPath("sr", changelogAnchorId(entry)))}) - ${entry.data.description}`
  )
  .join("\n")}
`

  return markdownResponse({
    markdown,
    canonical: absoluteUrl("/sr/changelog/"),
    ...localizedRouteMeta("sr", "/changelog/"),
  })
}
