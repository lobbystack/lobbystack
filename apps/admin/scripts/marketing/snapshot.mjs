#!/usr/bin/env node
// Copies the marketing site's prerendered output from .next/server/app/site
// into .marketing-dist/ under its public URLs: /fr/pricing/ becomes
// fr/pricing/index.html and the /pricing.md
// twin becomes pricing.md. Pagefind indexes it, and the SEO validator and the
// link checker read it.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const adminRoot = fileURLToPath(new URL("../../", import.meta.url))
const source = join(adminRoot, ".next/server/app/site")
const output = join(adminRoot, ".marketing-dist")

if (!existsSync(source)) {
  console.error("No prerendered marketing pages in .next/server/app/site. Run the admin build first.")
  process.exit(1)
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name.endsWith(".segments") ? [] : walk(path)
    return [path]
  })

// "en/blog/x" -> ["", "blog/x"]; "fr" -> ["/fr", ""]
function publicParts(rel) {
  const [locale, ...rest] = rel.split("/")
  return [locale === "en" ? "" : `/${locale}`, rest.join("/")]
}

rmSync(output, { recursive: true, force: true })
let pages = 0
let files = 0
for (const file of walk(source)) {
  const rel = relative(source, file).split(sep).join("/")
  let target
  if (rel.endsWith(".html")) {
    const [prefix, rest] = publicParts(rel.slice(0, -".html".length))
    target = `${prefix}${rest ? `/${rest}` : ""}/index.html`
    pages++
  } else if (rel.endsWith(".body")) {
    const [prefix, rest] = publicParts(rel.slice(0, -".body".length))
    target = rest.startsWith("md/") ? `${prefix}/${rest.slice("md/".length)}.md` : `${prefix}/${rest}`
    files++
  } else {
    continue
  }
  const destination = join(output, target)
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(file, destination)
}

// Static files the pages reference, so links and images resolve.
for (const entry of ["illustrations", "screenshots", "og", "favicon.svg", "logo-icon.svg", "logo-icon.png", "lobbystack-logo.svg", "lobbystack-logo-long.webp", "webmcp.js"]) {
  const path = join(adminRoot, "public", entry)
  if (existsSync(path)) cpSync(path, join(output, entry), { recursive: true })
}

console.log(`[marketing] Snapshot of ${pages} pages and ${files} files in ${relative(process.cwd(), output) || "."}.`)
