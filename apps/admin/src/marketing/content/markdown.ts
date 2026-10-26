import GithubSlugger from "github-slugger"
import type { Element, ElementContent, Root } from "hast"
import rehypeStringify from "rehype-stringify"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import remarkSmartypants from "remark-smartypants"
import { unified } from "unified"

function textOf(node: ElementContent | Root): string {
  if (node.type === "text") return node.value
  if ("children" in node) return node.children.map((child) => textOf(child as ElementContent)).join("")
  return ""
}

function visitElements(node: Root | Element, visit: (element: Element) => void) {
  for (const child of node.children) {
    if (child.type !== "element") continue
    visit(child)
    visitElements(child, visit)
  }
}

// Heading ids from github-slugger over the heading's text, so links to
// #anchors in posts keep working.
function rehypeHeadingIds() {
  return (tree: Root) => {
    const slugger = new GithubSlugger()
    visitElements(tree, (element) => {
      if (!/^h[1-6]$/.test(element.tagName) || element.properties.id) return
      element.properties.id = slugger.slug(textOf(element))
    })
  }
}

// Marks the <pre> with the fence's language too, and drops the newline before
// </code>, which the stylesheet expects.
function rehypeCodeLanguage() {
  return (tree: Root) => {
    visitElements(tree, (element) => {
      if (element.tagName !== "pre") return
      const code = element.children.find((child): child is Element => child.type === "element" && child.tagName === "code")
      const className = Array.isArray(code?.properties.className) ? code.properties.className : []
      const language = className.map(String).find((name) => name.startsWith("language-"))
      const last = code?.children.at(-1)
      if (last?.type === "text") last.value = last.value.replace(/\n$/, "")
      if (!language) return
      element.properties.className = [language]
      element.properties.dataLanguage = language.slice("language-".length)
    })
  }
}

// Aligns table columns with an inline style. mdast-util-to-hast uses the
// align attribute, which the stylesheet's text-align rules would override.
function rehypeTableAlignStyle() {
  return (tree: Root) => {
    visitElements(tree, (element) => {
      if ((element.tagName !== "td" && element.tagName !== "th") || typeof element.properties.align !== "string") return
      element.properties.style = `text-align: ${element.properties.align}`
      delete element.properties.align
    })
  }
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSmartypants)
  .use(remarkRehype)
  .use(rehypeHeadingIds)
  .use(rehypeCodeLanguage)
  .use(rehypeTableAlignStyle)
  .use(rehypeStringify, { characterReferences: { useNamedReferences: true } })

/** Renders a post's Markdown to HTML. */
export async function renderMarkdown(markdown: string): Promise<string> {
  return String(await processor.process(markdown))
}
