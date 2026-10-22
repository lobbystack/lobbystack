import { describe, expect, it } from "vitest"

import { faqsFromMarkdown } from "./blog-faqs"

describe("faqsFromMarkdown", () => {
  it("reads an English FAQ section and strips markdown from answers", () => {
    const markdown = [
      "## What is an AI receptionist?",
      "",
      "Intro text.",
      "",
      "## FAQs",
      "",
      "### How do I calculate **ROI**?",
      "",
      "Add the [recovered revenue](/missed-call-revenue-calculator/) to the",
      "costs you cut, then subtract the `plan` price.",
      "",
      "### Does it recover every call?",
      "",
      "No. It helps with:",
      "",
      "- *routine* calls",
      "- after-hours calls",
      "",
      "## The short answer",
      "",
      "Run the numbers.",
    ].join("\n")

    expect(faqsFromMarkdown(markdown)).toEqual([
      {
        question: "How do I calculate ROI?",
        answer:
          "Add the recovered revenue to the costs you cut, then subtract the plan price.",
      },
      {
        question: "Does it recover every call?",
        answer: "No. It helps with: routine calls after-hours calls",
      },
    ])
  })

  it("accepts French spacing before the question mark", () => {
    const markdown = [
      "## FAQ",
      "### Qu'est-ce qu'un « agent vocal » IA ?",
      "Un logiciel qui répond aux appels.",
      "### Dois-je changer de numéro ?",
      "Non.",
    ].join("\n")

    expect(faqsFromMarkdown(markdown)).toEqual([
      {
        // The no-break space collapses to a plain space like other whitespace.
        question: "Qu'est-ce qu'un « agent vocal » IA ?",
        answer: "Un logiciel qui répond aux appels.",
      },
      { question: "Dois-je changer de numéro ?", answer: "Non." },
    ])
  })

  it("accepts Spanish questions", () => {
    const markdown = [
      "## Preguntas frecuentes",
      "### ¿Cuánto puedo ganar?",
      "Depende de sus clientes.",
      "### ¿LobbyStack es de código abierto?",
      "Sí.",
    ].join("\n")

    expect(faqsFromMarkdown(markdown).map((faq) => faq.question)).toEqual([
      "¿Cuánto puedo ganar?",
      "¿LobbyStack es de código abierto?",
    ])
  })

  it("reads Serbian questions and ignores single question headings elsewhere", () => {
    const markdown = [
      "## Kako funkcioniše",
      "### Da li radi noću?",
      "Da.",
      "## Česta pitanja",
      "### Koliko mogu da zaradim?",
      "Zavisi od broja klijenata.",
      "### Da li je LobbyStack open source?",
      "Da.",
      "#### Napomena",
      "Ovo nije deo odgovora.",
    ].join("\n")

    expect(faqsFromMarkdown(markdown)).toEqual([
      {
        question: "Koliko mogu da zaradim?",
        answer: "Zavisi od broja klijenata.",
      },
      { question: "Da li je LobbyStack open source?", answer: "Da." },
    ])
  })

  it("returns nothing for a post without a FAQ section", () => {
    const markdown = [
      "## How much does it cost?",
      "Plans start at $30.",
      "### Starter",
      "150 minutes.",
      "```md",
      "### Is this a question?",
      "### Is this one too?",
      "```",
    ].join("\n")

    expect(faqsFromMarkdown(markdown)).toEqual([])
  })
})
