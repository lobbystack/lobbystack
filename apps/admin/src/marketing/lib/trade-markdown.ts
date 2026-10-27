import type { FaqItem } from "@/marketing/lib/seo"
import {
  callActionTitle,
  exampleCallFootnote,
  routingGroups,
  tradeDetailsFor,
} from "@/marketing/lib/trade-details"

// The Markdown for what the trade pages show beyond their sections: the
// example call with every line, the call rules grouped as on the page, the
// intake questions and the FAQ. landingPageMarkdown places these around the
// page's sections, in the page's order.

const speakers = { caller: "Caller", lobbystack: "LobbyStack" } as const

/** The example call and the call rules, which come before the sections on the page. */
export function tradeMarkdownBeforeSections(slug: string) {
  const details = tradeDetailsFor(slug)
  if (!details) return ""
  const call = details.call
    .map((line) => {
      const note = line.note ? ` (${line.note})` : ""
      return `- ${line.at} **${speakers[line.speaker]}:** ${line.text}${note}`
    })
    .join("\n")
  const rules = routingGroups(details)
    .map(
      ({ action, rows }) => `### ${callActionTitle(action, details)}

${rows.map((row) => `- **${row.call}:** ${row.detail}.`).join("\n")}`
    )
    .join("\n\n")
  return `## ${details.pitch.title}

${details.pitch.intro}

### Example call: ${details.callCard.title}

${details.scenario} ${details.callCard.body}

${call}

${details.outcome}

${exampleCallFootnote(details)}

## ${details.rules.title}

${details.rules.intro}

${rules}

`
}

/** The intake questions and the FAQ, which come after the sections on the page. */
export function tradeMarkdownAfterSections(slug: string, faqs: FaqItem[], faqHeading = "Common questions") {
  const details = tradeDetailsFor(slug)
  if (!details) return ""
  const faq = faqs.length
    ? `

## ${faqHeading}

${faqs.map((item) => `### ${item.question}\n\n${item.answer}`).join("\n\n")}`
    : ""
  return `

## ${details.intakeCopy.title}

${details.intakeCopy.body}

${details.intake.map((question) => `- ${question}`).join("\n")}${faq}`
}
