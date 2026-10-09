import { readFileSync } from "node:fs"
import { billingPlanCatalog } from "@lobbystack/shared"
import { describe, expect, it } from "vitest"

import {
  featuresMarkdown,
  markdownAlternatePath,
  mcpServerCard,
} from "./agent-discovery"

describe("markdownAlternatePath", () => {
  it("does not advertise missing Markdown alternates for solution pages", () => {
    expect(
      markdownAlternatePath("/solutions/self-hosted-ai-receptionist/")
    ).toBeUndefined()
    expect(
      markdownAlternatePath("/fr/solutions/self-hosted-ai-receptionist/")
    ).toBeUndefined()
  })

  it("keeps Markdown alternates that have generated routes", () => {
    expect(markdownAlternatePath("/about/")).toBe("/about.md")
    expect(markdownAlternatePath("/blog/ai-receptionist-savings/")).toBe(
      "/blog/ai-receptionist-savings.md"
    )
  })
})

describe("featuresMarkdown", () => {
  it("distinguishes Free browser voice from paid telephone features", () => {
    const everyPlan = featuresMarkdown.split("## Every Plan Includes\n\n")[1]
    expect(everyPlan).toContain("Free includes 30 browser voice minutes and no telephone number.")
    expect(everyPlan).toContain("Starter and Pro include a dedicated telephone number for inbound phone calls and call transfers.")
    expect(everyPlan).not.toMatch(/Every plan includes[^\n]*\b(outbound calls|transfers|telephone call answering)\b/)
    expect(everyPlan).toContain("unlimited concurrent calls")
  })
})

describe("webmcp.js", () => {
  const script = readFileSync(
    new URL("../../public/webmcp.js", import.meta.url),
    "utf8"
  )

  it("registers every tool the MCP server card lists", () => {
    const registered = [...script.matchAll(/name: "(get-[a-z-]+)"/g)].map(
      (match) => match[1]
    )
    expect(mcpServerCard.capabilities.tools.map((tool) => tool.name)).toEqual(
      registered
    )
  })

  it("reports the billing catalog's knowledge storage limits", () => {
    const storageMb = [...script.matchAll(/knowledgeStorageMb: (\d+)/g)].map(
      (match) => Number(match[1])
    )
    expect(storageMb).toEqual(
      (["free_cloud", "starter", "pro"] as const).map(
        (plan) => billingPlanCatalog[plan].knowledgeStorageBytes / 1024 / 1024
      )
    )
  })
})
