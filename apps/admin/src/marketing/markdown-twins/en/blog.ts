import { blogCanonicalSlug, getBlogPosts } from "@/marketing/content/blog"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

export const GET = async () => {
  const posts = await getBlogPosts("en")

  const markdown = `# AI Receptionist Blog and Product Updates

Product updates and practical notes on AI phone answering, missed calls, appointment scheduling, call routing, lead follow-up, and open-source receptionist infrastructure.

## Posts

${posts
  .map(
    (post) =>
      `- [${post.data.title}](${absoluteUrl(`/blog/${blogCanonicalSlug(post)}/`)}) - ${post.data.description}`
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
