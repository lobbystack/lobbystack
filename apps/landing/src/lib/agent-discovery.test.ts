import { describe, expect, it } from "vitest"

import { featuresMarkdown, markdownAlternatePath } from "./agent-discovery"

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
