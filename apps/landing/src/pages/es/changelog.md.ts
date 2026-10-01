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
