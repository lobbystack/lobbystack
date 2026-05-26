import type { APIRoute } from "astro"
import { getCollection } from "astro:content"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

export const GET: APIRoute = async () => {
  const posts = await getCollection("blog")
  posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())

  const markdown = `# AI Receptionist Blog and Product Updates

Product updates and practical notes on AI phone answering, missed-call recovery, appointment scheduling, call routing, lead follow-up, and open-source receptionist infrastructure.

## Posts

${posts
  .map(
    (post) =>
      `- [${post.data.title}](${absoluteUrl(`/blog/${post.id}/`)}) - ${post.data.description}`
  )
  .join("\n")}
`

  return markdownResponse({
    markdown,
    canonical: absoluteUrl("/blog/"),
    title: "AI Receptionist Blog and Product Updates",
    description:
      "Read LobbyStack product updates and practical guides about AI receptionists, phone answering, appointment booking, and small-business call automation.",
  })
}
