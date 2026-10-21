import { describe, expect, it } from "vitest"

import { blogCollection, changelogCollection } from "./collections"
import { renderMarkdown } from "./markdown"

describe("renderMarkdown", () => {
  it("gives headings the ids the Astro site linked to", async () => {
    const html = await renderMarkdown("## What does it cost?\n\n## What does it cost?\n")
    expect(html).toContain('<h2 id="what-does-it-cost">')
    expect(html).toContain('<h2 id="what-does-it-cost-1">')
  })

  it("marks code blocks with their language and drops the newline before </code>", async () => {
    const html = await renderMarkdown("```text\nHello\n```\n")
    expect(html).toBe('<pre class="language-text" data-language="text"><code class="language-text">Hello</code></pre>')
  })

  it("aligns table columns with an inline style, as Astro did", async () => {
    const html = await renderMarkdown("| Plan | Price |\n| --- | ---: |\n| Free | $0 |\n")
    expect(html).toContain('<td style="text-align: right">$0</td>')
  })

  it("renders tables and typographic quotes", async () => {
    const html = await renderMarkdown('| Plan | Price |\n| --- | --- |\n| Free | $0 |\n\nIt\'s "free".\n')
    expect(html).toContain("<table>")
    expect(html).toContain("It’s “free”.")
  })
})

describe("content collections", () => {
  it("loads every post and changelog entry with valid frontmatter", () => {
    expect(blogCollection().filter((entry) => entry.data.locale === "en").length).toBeGreaterThan(0)
    for (const entry of [...blogCollection(), ...changelogCollection()]) {
      expect(entry.id.startsWith(entry.data.locale === "en" ? "" : `${entry.data.locale}/`), entry.id).toBe(true)
    }
  })
})
