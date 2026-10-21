#!/usr/bin/env node
// Tells IndexNow about the marketing pages this build changes, as the Astro
// build did: it compares each built page with the live one on lobbystack.com
// and submits only the ones that differ. It does nothing unless INDEXNOW_KEY
// is set, so only production builds should set it. Run after
// scripts/marketing/snapshot.mjs. Node strips the types from the module it imports.
import { readdirSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { submitChangedPages } from "../../src/marketing/lib/indexnow.ts"

const NOINDEX_PATHS = new Set(["/404/", "/cookie-policy/", "/privacy/", "/terms/", "/search/"])
const PREFIXED = /^\/(?:fr|es|sr)(?=\/)/

const snapshot = fileURLToPath(new URL("../../.marketing-dist/", import.meta.url))
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  )
const pathnames = walk(snapshot)
  .filter((file) => file.endsWith(`${sep}index.html`))
  .map((file) => {
    const dir = relative(snapshot, dirname(file)).split(sep).join("/")
    return dir ? `/${dir}/` : "/"
  })

await submitChangedPages(
  {
    key: process.env.INDEXNOW_KEY,
    host: "lobbystack.com",
    siteUrl: "https://lobbystack.com",
    include: (url) => {
      const pathname = new URL(url).pathname
      return (
        !NOINDEX_PATHS.has(pathname.replace(PREFIXED, "") || "/") &&
        !pathname.startsWith("/api/") &&
        !pathname.startsWith("/schema/") &&
        !pathname.startsWith("/.well-known/")
      )
    },
  },
  pathToFileURL(snapshot),
  pathnames,
  { info: (message) => console.log(message), warn: (message) => console.warn(message) },
)
