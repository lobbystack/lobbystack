import {
  changelogAnchorId,
  changelogPath,
  getChangelogEntries,
} from "@/marketing/content/changelog"
import { localizedRouteMeta } from "@/marketing/lib/localized-markdown"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

export const GET = async () => {
  const entries = await getChangelogEntries("es")

  const markdown = `# ¿Qué hay de nuevo en LobbyStack?

Novedades del producto, integraciones y mejoras del equipo de LobbyStack.

## Novedades

${entries
  .map(
    (entry) =>
      `- [${entry.data.title}](${absoluteUrl(changelogPath("es", changelogAnchorId(entry)))}) - ${entry.data.description}`
  )
  .join("\n")}
`

  return markdownResponse({
    markdown,
    canonical: absoluteUrl("/es/changelog/"),
    ...localizedRouteMeta("es", "/changelog/"),
  })
}
