import type { APIRoute } from "astro"
import {
  changelogAnchorId,
  changelogPath,
  getChangelogEntries,
} from "@/lib/changelog"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

export const GET: APIRoute = async () => {
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
