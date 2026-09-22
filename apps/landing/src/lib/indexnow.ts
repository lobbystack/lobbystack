import { execFileSync } from "node:child_process"

import { sitemapSourceForUrl } from "./sitemap"

type ChangedFilesResolver = () => string[] | null

// Files touched by the commit being deployed, relative to apps/landing.
// Returns null when history is unavailable (e.g. a depth-1 clone) so callers
// submit nothing instead of resubmitting every URL on each deploy.
export const gitChangedFilesInHead: ChangedFilesResolver = () => {
  try {
    const output = execFileSync(
      "git",
      ["diff", "--name-only", "--relative", "HEAD~1", "HEAD"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    )
    return output.split("\n").filter(Boolean)
  } catch {
    return null
  }
}

export const createChangedUrlFilter = (
  resolveChangedFiles: ChangedFilesResolver = gitChangedFilesInHead
) => {
  const changedFiles = resolveChangedFiles()
  const changed = new Set(changedFiles ?? [])

  return (url: string) => {
    const source = sitemapSourceForUrl(url)
    return source !== undefined && changed.has(source)
  }
}
