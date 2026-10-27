import { localizePath, type Locale } from "@/marketing/i18n"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { getMcpCopy, MCP_SERVER_URL, mcpDocsUrl, mcpToolGroupOrder, mcpToolGroups } from "@/marketing/lib/mcp-page-copy"
import { getMcpFaqs } from "@/marketing/lib/mcp-page-faqs"
import { absoluteUrl } from "@/marketing/lib/seo"

const toolHeadings = {
  en: ["Tool", "Scope"],
  fr: ["Outil", "Portée"],
  es: ["Herramienta", "Permiso"],
  sr: ["Alat", "Ovlašćenje"],
} satisfies Record<Locale, [string, string]>

/** The MCP server page as Markdown, for agents and the /features/mcp.md twin. */
export function mcpMarkdown(locale: Locale) {
  const copy = getMcpCopy(locale)
  const [toolHeading, scopeHeading] = toolHeadings[locale]
  const tools = mcpToolGroupOrder
    .map((key) => {
      const group = copy.tools.groups[key]
      const rows = mcpToolGroups[key].map((tool) => `| \`${tool.name}\` | \`${tool.scope}\` |`).join("\n")
      return `### ${group.title}\n\n${group.body}\n\n| ${toolHeading} | ${scopeHeading} |\n| --- | --- |\n${rows}`
    })
    .join("\n\n")
  const steps = copy.connect.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
  const points = (list: string[]) => list.map((point) => `- ${point}`).join("\n")
  const faqs = getMcpFaqs(locale)
    .map((faq) => `### ${faq.question}\n\n${faq.answer}`)
    .join("\n\n")

  return `# ${copy.hero.title}

${copy.hero.intro}

- ${copy.hero.urlLabel}: ${MCP_SERVER_URL}
- ${copy.hero.primaryCta}: ${appSignupUrl(locale)}
- ${copy.hero.secondaryCta}: ${mcpDocsUrl(locale, "mcp")}

${points(copy.facts)}

## ${copy.ask.titleLines.join(" ")}

${copy.ask.intro}

- **${copy.ask.calls.title}.** ${copy.ask.calls.body}
- **${copy.ask.booking.title}.** ${copy.ask.booking.body}

## ${copy.consent.title}

${copy.consent.body}

${points(copy.consent.points)}

## ${copy.control.title}

${copy.control.body}

${points(copy.control.points)}

## ${copy.tools.title}

${copy.tools.intro}

${tools}

## ${copy.connect.title}

${copy.connect.body}

${steps}

- ${copy.connect.guides.claude}: ${mcpDocsUrl(locale, "connect-claude")}
- ${copy.connect.guides.chatgpt}: ${mcpDocsUrl(locale, "connect-chatgpt")}
- ${copy.connect.guides.other}: ${mcpDocsUrl(locale, "connect-other-clients")}

## ${copy.faqTitle}

${faqs}

## ${copy.closing.titleLines.join(" ")}

${copy.closing.body}

- ${copy.closing.primaryCta}: ${appSignupUrl(locale)}
- ${copy.closing.secondaryCta}: ${mcpDocsUrl(locale, "mcp")}
- ${copy.breadcrumb.page}: ${absoluteUrl(localizePath(locale, "/features/mcp/"))}
`
}
