import type { FaqItem } from "@/marketing/lib/seo"

type Question = { question: string; lines: string[] }

const plainText = (markdown: string) =>
  markdown
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*{1,3}|(?<!\w)_{1,3})(\S.*?)\1/g, "$2")
    .replace(/^\s*(?:[-*+]|\d+\.|>)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()

// A FAQ is an H2 section with at least two H3 headings ending in "?", which
// covers "Question ?" (French spacing) and "¿Pregunta?". Each answer is the
// text up to the next heading.
export const faqsFromMarkdown = (markdown = ""): FaqItem[] => {
  const sections: Question[][] = []
  let section: Question[] | undefined
  let current: Question | undefined
  let fenced = false

  for (const line of markdown.split("\n")) {
    const fence = line.trimStart().startsWith("```")
    if (fence) fenced = !fenced
    if (fence || fenced) continue

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (!heading?.[1] || !heading[2]) {
      current?.lines.push(line)
      continue
    }

    const level = heading[1].length
    const text = heading[2].trim()
    current = undefined
    if (level === 2) sections.push((section = []))
    else if (level === 1) section = undefined
    else if (level === 3 && section && text.endsWith("?")) {
      section.push((current = { question: text, lines: [] }))
    }
  }

  return sections
    .map((questions) =>
      questions
        .map(({ question, lines }) => ({
          question: plainText(question),
          answer: plainText(lines.join("\n")),
        }))
        .filter((faq) => faq.answer)
    )
    .filter((faqs) => faqs.length >= 2)
    .flat()
}
