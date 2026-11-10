import { Document, Packer, Paragraph, TextRun } from "docx";
import { describe, expect, it } from "vitest";

import { extractDocumentText } from "../apps/worker/src/documentExtraction";
import { buildKnowledgeTemplate, HINT_STYLE, PROMPT_STYLE, SECTIONS } from "./knowledge-template.mjs";

const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const read = async (body: Uint8Array) => extractDocumentText({ body, contentType: docxType });

describe("knowledge template", () => {
  it("reads back as only its section titles when nothing is filled in", async () => {
    const text = await read(await buildKnowledgeTemplate());
    expect(text.split("\n").map((line) => line.trim()).filter(Boolean)).toEqual(["Knowledge template", ...SECTIONS.map((section) => section.title)]);
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

  it("leaves other documents untouched", async () => {
    const body = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("Open 9 to 5.")] })] }] }));
    expect((await read(body)).trim()).toBe("Open 9 to 5.");
  });

  it("uses the style names the reader looks for", () => {
    expect([HINT_STYLE, PROMPT_STYLE]).toEqual(["LobbyStack Hint", "LobbyStack Prompt"]);
  });
});
