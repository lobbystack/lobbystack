"use client"

import { useEffect, useState } from "react"

// Port of FuzzyRedirect.astro from @jdevalk/astro-seo-graph. On a 404 it reads
// the sitemap, finds the closest path to the current URL, and either redirects
// there or suggests it.
type FuzzyRedirectProps = {
  /** Minimum similarity score (0–1) for a suggestion to appear. */
  threshold?: number
  /** Similarity score (0–1) above which the user is redirected. 1 disables it. */
  autoRedirectThreshold?: number
  /** URL of the sitemap index or sitemap file to fetch. */
  sitemapUrl?: string
  /** Text shown before the suggestion link. */
  suggestionText?: string
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  // Single-row DP: prev[j] holds the cost for (i-1, j).
  const prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    let prevDiag = prev[0]!
    prev[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = prev[j]!
      prev[j] =
        a[i - 1] === b[j - 1]
          ? prevDiag
          : 1 + Math.min(prevDiag, prev[j - 1]!, prev[j]!)
      prevDiag = temp
    }
  }
  return prev[n]!
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const response = await fetch(sitemapUrl)
  if (!response.ok) return []

  const text = await response.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, "text/xml")

  // Check if this is a sitemap index.
  const sitemapLocs = doc.querySelectorAll("sitemap > loc")
  if (sitemapLocs.length > 0) {
    // Fetch each child sitemap in parallel.
    const childUrls = await Promise.all(
      Array.from(sitemapLocs).map((loc) => fetchSitemapUrls(loc.textContent?.trim() ?? ""))
    )
    return childUrls.flat()
  }

  // Regular sitemap: extract <url><loc> entries.
  return Array.from(doc.querySelectorAll("url > loc"))
    .map((loc) => loc.textContent?.trim() ?? "")
    .filter(Boolean)
}

export function FuzzyRedirect({
  threshold = 0.6,
  autoRedirectThreshold = 0.85,
  sitemapUrl = "/sitemap-index.xml",
  suggestionText = "Did you mean",
}: FuzzyRedirectProps) {
  const [suggestion, setSuggestion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      const currentPath = window.location.pathname

      // Out-of-bounds pagination: /something/page/N/ → /something/
      const paginationMatch = currentPath.match(/^(.+?)\/page\/\d+\/?$/)
      if (paginationMatch) {
        const basePath = paginationMatch[1]!.replace(/\/$/, "") + "/"
        console.log(`[FuzzyRedirect] Pagination redirect: "${currentPath}" → "${basePath}"`)
        window.location.replace(basePath)
        return
      }

      const urls = await fetchSitemapUrls(sitemapUrl)
      if (cancelled) return

      // Extract paths from full URLs.
      const paths = urls.map((url) => {
        try {
          return new URL(url).pathname
        } catch {
          return url
        }
      })

      // Find the closest match.
      let bestPath = ""
      let bestScore = 0
      for (const path of paths) {
        const score = similarity(currentPath, path)
        if (score > bestScore) {
          bestScore = score
          bestPath = path
        }
      }

      console.log(
        `[FuzzyRedirect] Best match for "${currentPath}": "${bestPath}" (similarity: ${bestScore.toFixed(3)})`
      )

      // Exact match means the 404 is correct: the path exists in the
      // sitemap but returned a 404 (possibly a stale sitemap entry).
      if (bestScore >= 1 || bestScore < threshold) return

      if (bestScore >= autoRedirectThreshold) {
        window.location.replace(bestPath)
        return
      }

      // Show suggestion.
      setSuggestion(bestPath)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [threshold, autoRedirectThreshold, sitemapUrl])

  return (
    <div
      id="fuzzy-redirect"
      data-threshold={threshold}
      data-auto-redirect-threshold={autoRedirectThreshold}
      data-sitemap-url={sitemapUrl}
      data-suggestion-text={suggestionText}
    >
      {suggestion !== null && (
        <>
          {`${suggestionText} `}
          <a href={suggestion}>{suggestion}</a>?
        </>
      )}
    </div>
  )
}
