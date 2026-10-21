import {
  changelogAnchorId,
  changelogPath,
  getChangelogEntries,
} from "@/marketing/content/changelog"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

export const GET = async () => {
  const entries = await getChangelogEntries("en")

  const markdown = `# What's new with LobbyStack?

Product updates, integrations, and improvements from the LobbyStack team.

## Updates

${entries
  .map(
    (entry) =>
      `- [${entry.data.title}](${absoluteUrl(changelogPath("en", changelogAnchorId(entry)))}) - ${entry.data.description}`
  )
  .join("\n")}
`

  return markdownResponse({
    markdown,
    canonical: absoluteUrl("/changelog/"),
    title: "LobbyStack Changelog",
    description:
      "Follow LobbyStack product updates, improvements, integrations, and shipped changes for the open-source AI receptionist platform.",
  })
}
