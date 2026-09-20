import { describe, expect, it } from "vitest"

import { markdownAlternatePath } from "./agent-discovery"

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
