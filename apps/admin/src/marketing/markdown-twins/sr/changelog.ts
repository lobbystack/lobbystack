import {
  changelogAnchorId,
  changelogPath,
  getChangelogEntries,
} from "@/marketing/content/changelog"
import { localizedRouteMeta } from "@/marketing/lib/localized-markdown"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

export const GET = async () => {
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
