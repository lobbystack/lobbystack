import { Document, Packer, Paragraph, TextRun } from "docx";
import { runtimeLocales } from "../packages/shared/src/locales";
import { describe, expect, it } from "vitest";

import { extractDocumentText } from "../apps/worker/src/documentExtraction";
import { buildKnowledgeTemplate, HINT_STYLE, loadLocale, LOCALES, PROMPT_STYLE, templateFileName } from "./knowledge-template.mjs";

type Copy = { title: string; intro: string[]; sections: Record<string, { title: string; hint?: string; prompts?: string[] }> };

const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const read = async (body: Uint8Array) => extractDocumentText({ body, contentType: docxType });
const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
const strings = (copy: Copy) => [copy.title, ...copy.intro, ...Object.values(copy.sections).flatMap((section) => [section.title, section.hint ?? "", ...(section.prompts ?? [])])];

describe("knowledge template languages", () => {
  it("has one template per runtime language", () => {
    expect([...LOCALES]).toEqual([...runtimeLocales]);
  });

  it.each(LOCALES)("%s has the same sections, hints and prompt counts as English", async (locale) => {
    const english = (loadLocale("en")) as Copy;
    const copy = (loadLocale(locale)) as Copy;
    expect(Object.keys(copy.sections)).toEqual(Object.keys(english.sections));
    expect(copy.intro).toHaveLength(english.intro.length);
    for (const [key, section] of Object.entries(english.sections)) {
      expect(Boolean(copy.sections[key]!.hint), `${locale} ${key} hint`).toBe(Boolean(section.hint));
      expect(copy.sections[key]!.prompts?.length ?? 0, `${locale} ${key} prompts`).toBe(section.prompts?.length ?? 0);
    }
    expect(strings(copy).filter((value, index) => !value && index < 3 + english.intro.length)).toEqual([]);
  });

  it("writes Serbian in Latin script", async () => {
    expect(strings((loadLocale("sr")) as Copy).join(" ")).not.toMatch(/[\u0400-\u04FF]/u);
  });

  it("names each file by language", () => {
    expect(templateFileName("fr")).toBe("lobbystack-knowledge-template-fr.docx");
  });
});

describe("knowledge template", () => {
  it.each(LOCALES)("%s reads back as only its section titles when nothing is filled in", async (locale) => {
    const copy = (loadLocale(locale)) as Copy;
    expect(lines(await read(await buildKnowledgeTemplate({}, locale)))).toEqual([copy.title, ...Object.values(copy.sections).map((section) => section.title)]);
  });

  it("keeps answered prompts with their answers and drops the rest", async () => {
    const text = await read(await buildKnowledgeTemplate({
      "Business name": "Lakeside Dental",
      "Which payment methods do you accept?": "Lakeside Dental accepts Visa, Mastercard and cash.",
    }));
    expect(text).toContain("Business name\n\nLakeside Dental");
    expect(text).toContain("Which payment methods do you accept?\n\nLakeside Dental accepts Visa, Mastercard and cash.");
    expect(text).not.toContain("Do you accept walk-ins");
    expect(text).not.toContain("Fill in what applies");
    expect(text).not.toMatch(/^[QA]:/m);
  });

  it("keeps an answer written in another language with its prompt", async () => {
    const french = (loadLocale("fr")) as Copy;
    const prompt = french.sections.about!.prompts![0]!;
    const text = await read(await buildKnowledgeTemplate({ [prompt]: "Clinique du Lac" }, "fr"));
    expect(text).toContain(`${prompt}\n\nClinique du Lac`);
  });

  it("leaves other documents untouched", async () => {
    const body = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("Open 9 to 5.")] })] }] }));
    expect((await read(body)).trim()).toBe("Open 9 to 5.");
  });

  it("uses the style names the reader looks for", () => {
    expect([HINT_STYLE, PROMPT_STYLE]).toEqual(["LobbyStack Hint", "LobbyStack Prompt"]);
  });
});
