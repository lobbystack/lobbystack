import {
  changelogAnchorId,
  changelogPath,
  getChangelogEntries,
} from "@/marketing/content/changelog"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

export const GET = async () => {
  const entries = await getChangelogEntries("fr")

  const markdown = `# Quoi de neuf avec LobbyStack?

Mises à jour produit, intégrations et améliorations de l'équipe LobbyStack.

## Mises à jour

${entries
  .map(
    (entry) =>
      `- [${entry.data.title}](${absoluteUrl(changelogPath("fr", changelogAnchorId(entry)))}) - ${entry.data.description}`
  )
  .join("\n")}
`

  return markdownResponse({
    markdown,
    canonical: absoluteUrl("/fr/changelog/"),
    title: "Journal des changements LobbyStack",
    description:
      "Suivez les mises à jour produit, améliorations, intégrations et nouveautés de LobbyStack.",
  })
}
