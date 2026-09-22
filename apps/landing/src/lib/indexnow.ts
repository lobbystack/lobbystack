import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { submitToIndexNow } from "@jdevalk/astro-seo-graph"
import type { AstroIntegration, AstroIntegrationLogger } from "astro"

type FetchLike = (
  url: string
) => Promise<{ ok: boolean; text(): Promise<string> }>

const FETCH_CONCURRENCY = 8

const decode = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

const firstMatch = (html: string, pattern: RegExp) =>
  decode(pattern.exec(html)?.[1]?.trim() ?? "")

// Reduces a rendered page to the parts search engines index: title,
// description, canonical, social image, visible main text, and the images and
// links inside <main>. Asset hashes, scripts, and attribute ordering are left out so two
// builds of an unchanged page produce the same signature.
export const pageSignature = (html: string) => {
  const main = /<main[\s\S]*?<\/main>/i.exec(html)?.[0] ?? html
  const body = main.replace(
    /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,
    ""
  )
  const images = [...body.matchAll(/<img\b[^>]*>/gi)].map(([tag]) =>
    [
      firstMatch(tag, /\bsrc="([^"]*)"/i).replace(/\?.*$/, ""),
      firstMatch(tag, /\balt="([^"]*)"/i),
    ].join("|")
  )
  const links = [...body.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gi)].map(
    ([, href]) => decode(href)
  )
  const text = decode(body.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()

  return JSON.stringify({
    title: firstMatch(html, /<title>([^<]*)<\/title>/i),
    description: firstMatch(
      html,
      /<meta\s+name="description"\s+content="([^"]*)"/i
    ),
    canonical: firstMatch(html, /<link\s+rel="canonical"\s+href="([^"]*)"/i),
    socialImage: firstMatch(
      html,
      /<meta\s+property="og:image"\s+content="([^"]*)"/i
    ),
    text,
    images,
    links,
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
