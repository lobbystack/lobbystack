#!/usr/bin/env node
// Runs after next build: the snapshot, the sitemaps, the Pagefind index and the
// IndexNow submission. A build with MARKETING_SITE=false has no marketing pages,
// so it skips them all.
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const adminRoot = fileURLToPath(new URL("../../", import.meta.url))
const run = (command, args) => execFileSync(command, args, { cwd: adminRoot, stdio: "inherit" })

if (process.env.MARKETING_SITE === "false") {
  console.log("[marketing] MARKETING_SITE=false: this build leaves the marketing site out.")
  process.exit(0)
}
if (!existsSync(new URL("../../.next/server/app/site", import.meta.url))) {
  console.error("[marketing] No prerendered marketing pages in .next/server/app/site.")
  process.exit(1)
}

run(process.execPath, ["scripts/marketing/snapshot.mjs"])
run(process.execPath, ["scripts/marketing/sitemap.mjs"])
run("pnpm", ["exec", "pagefind", "--site", ".marketing-dist", "--output-path", "public/pagefind"])
run(process.execPath, ["scripts/marketing/indexnow.mjs"])
