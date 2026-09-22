import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { submitToIndexNow } from "@jdevalk/astro-seo-graph"
import type { AstroIntegration, AstroIntegrationLogger } from "astro"
import { parse, type DefaultTreeAdapterMap } from "parse5"

type FetchLike = (
  url: string
) => Promise<{ ok: boolean; text(): Promise<string> }>

const FETCH_CONCURRENCY = 8

type HtmlNode = DefaultTreeAdapterMap["node"]
type HtmlElement = DefaultTreeAdapterMap["element"]

const SKIPPED_ELEMENTS = new Set(["script", "style", "noscript", "template"])

const isElement = (node: HtmlNode): node is HtmlElement => "tagName" in node

const attribute = (element: HtmlElement, name: string) =>
  element.attrs.find((attr) => attr.name === name)?.value.trim() ?? ""

const walk = (node: HtmlNode, visit: (node: HtmlNode) => boolean | void) => {
  if (visit(node) === false) return
  if ("childNodes" in node) {
    for (const child of node.childNodes) walk(child, visit)
  }
}

const findElements = (
  root: HtmlNode,
  match: (element: HtmlElement) => boolean
) => {
  const found: HtmlElement[] = []
  walk(root, (node) => {
    if (isElement(node) && match(node)) found.push(node)
  })
  return found
}

const textContent = (root: HtmlNode) => {
  const parts: string[] = []
  walk(root, (node) => {
    if (isElement(node) && SKIPPED_ELEMENTS.has(node.tagName)) return false
    if (node.nodeName === "#text" && "value" in node) parts.push(node.value)
  })
  return parts.join(" ").replace(/\s+/g, " ").trim()
}

const metaContent = (
  document: HtmlNode,
  key: "name" | "property",
  value: string
) => {
  const [meta] = findElements(
    document,
    (element) => element.tagName === "meta" && attribute(element, key) === value
  )
  return meta ? attribute(meta, "content") : ""
}

// Reduces a rendered page to the parts search engines index: title,
// description, canonical, social image, visible main text, and the images and
// links inside <main>. Scripts, styles, and query strings on image URLs are
// left out so two builds of an unchanged page produce the same signature.
export const pageSignature = (html: string) => {
  const document = parse(html)
  const [title] = findElements(
    document,
    (element) => element.tagName === "title"
  )
  const [canonical] = findElements(
    document,
    (element) =>
      element.tagName === "link" && attribute(element, "rel") === "canonical"
  )
  const [main] = findElements(document, (element) => element.tagName === "main")
  const content = main ?? document

  return JSON.stringify({
    title: title ? textContent(title) : "",
    description: metaContent(document, "name", "description"),
    canonical: canonical ? attribute(canonical, "href") : "",
    socialImage: metaContent(document, "property", "og:image"),
    text: textContent(content),
    images: findElements(content, (element) => element.tagName === "img").map(
      (image) =>
        [attribute(image, "src").split("?")[0], attribute(image, "alt")].join(
          "|"
        )
    ),
    links: findElements(content, (element) => element.tagName === "a").map(
      (link) => attribute(link, "href")
    ),
  })
}

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>
) => {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await run(items[index])
      }
    }
  )
  await Promise.all(workers)
  return results
}

// Returns the URLs whose built page differs from the live page. A live page
// that fails to load (404 for a new page) counts as changed; a network error
// throws so the caller submits nothing rather than guessing.
export const findChangedPages = async (
  pages: Array<{ url: string; html: string }>,
  fetchPage: FetchLike
) => {
  const changed = await mapWithConcurrency(
    pages,
    FETCH_CONCURRENCY,
    async (page) => {
      const response = await fetchPage(page.url)
      if (!response.ok) return true
      return pageSignature(await response.text()) !== pageSignature(page.html)
    }
  )

  return pages.filter((_, index) => changed[index]).map((page) => page.url)
}

export const isKeyFileLive = async (
  siteUrl: string,
  key: string,
  fetchPage: FetchLike
) => {
  try {
    const response = await fetchPage(new URL(`/${key}.txt`, siteUrl).toString())
    return response.ok && (await response.text()).trim() === key
  } catch {
    return false
  }
}

const fetchWithTimeout: FetchLike = (url) =>
  fetch(url, {
    headers: { "User-Agent": "LobbyStack IndexNow build check" },
    signal: AbortSignal.timeout(10_000),
  })

const builtHtmlPath = (dir: URL, pathname: string) => {
  const clean = pathname.replace(/^\/+|\/+$/g, "")
  return fileURLToPath(
    new URL(clean ? `${clean}/index.html` : "index.html", dir)
  )
}

const hasFileExtension = (pathname: string) => /\.[a-z0-9]+\/?$/i.test(pathname)

type IndexNowOptions = {
  key: string | undefined
  siteUrl: string
  host: string
  include: (url: string) => boolean
}

const run = async (
  options: Required<Pick<IndexNowOptions, "siteUrl" | "host" | "include">> & {
    key: string
  },
  dir: URL,
  pathnames: string[],
  logger: AstroIntegrationLogger
) => {
  if (!(await isKeyFileLive(options.siteUrl, options.key, fetchWithTimeout))) {
    logger.info(
      "IndexNow: key file is not live on production yet, skipping this deploy."
    )
    return
  }

  const candidates = pathnames
    .filter((pathname) => !hasFileExtension(pathname))
    .map((pathname) =>
      new URL(`/${pathname.replace(/^\/+/, "")}`, options.siteUrl).toString()
    )
    .filter(options.include)

  const pages = await Promise.all(
    candidates.map(async (url) => ({
      url,
      html: await readFile(builtHtmlPath(dir, new URL(url).pathname), "utf8"),
    }))
  )

  let changed: string[]
  try {
    changed = await findChangedPages(pages, fetchWithTimeout)
  } catch (error) {
    logger.warn(
      `IndexNow: could not compare with production, skipping. ${error}`
    )
    return
  }

  if (changed.length === 0) {
    logger.info("IndexNow: no changed pages to submit.")
    return
  }

  const results = await submitToIndexNow({
    host: options.host,
    key: options.key,
    urls: changed,
  })
  for (const result of results) {
    if (result.ok) {
      logger.info(`IndexNow: submitted ${result.submitted} changed pages.`)
    } else {
      logger.warn(
        `IndexNow: submission failed (status ${result.status}): ${result.message}`
      )
    }
  }
}

// Submits only pages whose rendered content differs from production.
// Submitting unchanged URLs on every deploy reads as IndexNow spam.
export const indexNowChangedPages = (
  options: IndexNowOptions
): AstroIntegration => ({
  name: "lobbystack-indexnow-changed-pages",
  hooks: {
    "astro:build:done": async ({ dir, pages, logger }) => {
      if (!options.key) return
      await run(
        { ...options, key: options.key },
        dir,
        pages.map((page) => page.pathname),
        logger
      )
    },
  },
})
