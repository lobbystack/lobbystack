import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { changelogCollection, type ChangelogEntry } from "./collections"
import { PRODUCT_UPDATES_MODULE, productUpdatesFromChangelog, productUpdatesModuleSource } from "./product-updates"

const entry = (locale: "en" | "fr", data: Partial<ChangelogEntry["data"]>): ChangelogEntry => ({
  id: locale === "en" ? "agents" : `${locale}/agents`,
  body: "",
  filePath: "",
  data: { title: "Run several agents", description: "Each agent gets its own number.", pubDate: new Date("2026-11-11T00:00:00.000Z"), locale, canonicalSlug: "agents", notify: false, ...data },
})

describe("product updates from the changelog", () => {
  it("keeps only entries the English version marks notify, with each language's copy and link", () => {
    const updates = productUpdatesFromChangelog([
      entry("en", { notify: true }),
      entry("fr", { title: "Plusieurs agents", description: "Chaque agent a son numéro." }),
      { ...entry("en", { canonicalSlug: "quiet", notify: false }), id: "quiet" },
    ])
    expect(updates).toEqual([{
      slug: "agents",
      pubDate: "2026-11-11T00:00:00.000Z",
      dashboardHref: null,
      copy: {
        en: { title: "Run several agents", description: "Each agent gets its own number.", href: "https://lobbystack.com/changelog/#agents" },
        fr: { title: "Plusieurs agents", description: "Chaque agent a son numéro.", href: "https://lobbystack.com/fr/changelog/#agents" },
      },
    }])
  })

  it("opens the dashboard page an entry names", () => {
    expect(productUpdatesFromChangelog([entry("en", { notify: true, dashboardHref: "/agents" })])[0]?.dashboardHref).toBe("/agents")
  })

  // The worker posts what this file holds, so it must match the changelog.
  it("match the worker's copy", () => {
    const file = path.join(process.cwd(), PRODUCT_UPDATES_MODULE)
    const expected = productUpdatesModuleSource(productUpdatesFromChangelog(changelogCollection()))
    if (process.env.PRODUCT_UPDATES_WRITE === "1") writeFileSync(file, expected)
    expect(readFileSync(file, "utf8"), "Run `pnpm product-updates:generate` after changing a changelog entry marked notify: true.").toBe(expected)
  })
})
