#!/usr/bin/env node
// Builds the Word template customers download from Knowledge > Upload a document.
// The worker (apps/worker/src/documentExtraction.ts) reads it back as plain text, which drops
// headings and flattens tables. So the template uses no tables, every prompt keeps its subject in
// the text, and two paragraph styles are scaffolding the reader removes: "LobbyStack Hint" (grey
// guidance) and "LobbyStack Prompt" (kept only when the customer answered it).
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import enCopy from "./knowledge-template-locales/en.mjs";
import frCopy from "./knowledge-template-locales/fr.mjs";
import esCopy from "./knowledge-template-locales/es.mjs";
import srCopy from "./knowledge-template-locales/sr.mjs";
import deCopy from "./knowledge-template-locales/de.mjs";
import ptCopy from "./knowledge-template-locales/pt.mjs";
import itCopy from "./knowledge-template-locales/it.mjs";
import nlCopy from "./knowledge-template-locales/nl.mjs";
import plCopy from "./knowledge-template-locales/pl.mjs";
import trCopy from "./knowledge-template-locales/tr.mjs";
import viCopy from "./knowledge-template-locales/vi.mjs";
import tlCopy from "./knowledge-template-locales/tl.mjs";
import svCopy from "./knowledge-template-locales/sv.mjs";
import ruCopy from "./knowledge-template-locales/ru.mjs";
import ukCopy from "./knowledge-template-locales/uk.mjs";
import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, TextRun } from "docx";

export const HINT_STYLE = "LobbyStack Hint";
export const PROMPT_STYLE = "LobbyStack Prompt";

const COPY = { en: enCopy, fr: frCopy, es: esCopy, sr: srCopy, de: deCopy, pt: ptCopy, it: itCopy, nl: nlCopy, pl: plCopy, tr: trCopy, vi: viCopy, tl: tlCopy, sv: svCopy, ru: ruCopy, uk: ukCopy };

export const LOCALES = Object.keys(COPY);

// Section order and repeats. The text of each section comes from the locale file.
const LAYOUT = [
  { key: "about" },
  { key: "location" },
  { key: "pricing" },
  { key: "booking" },
  { key: "policies" },
  { key: "team" },
  { key: "urgent" },
  { key: "limits" },
  { key: "terms" },
  { key: "news" },
  { key: "faq", pairs: 10 },
];

export const templateFileName = (locale) => `lobbystack-knowledge-template-${locale}.docx`;

export function loadLocale(locale) {
  const copy = COPY[locale];
  if (!copy) throw new Error(`No knowledge template for ${locale}.`);
  return copy;
}

const text = (value, options = {}) => new TextRun({ text: value, ...options });
const hint = (value) => new Paragraph({ style: "LobbyStackHint", children: [text(value)] });
const prompt = (value) => new Paragraph({ style: "LobbyStackPrompt", children: [text(value)] });
const answer = (value) => new Paragraph({ style: "LobbyStackAnswer", children: value ? [text(value)] : [] });

// `answers` maps a prompt to a filled-in answer. Tests use it to stand in for a customer.
function section(entry, texts, answers) {
  const copy = texts.sections[entry.key];
  const out = [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [text(copy.title)] })];
  if (copy.hint) out.push(hint(copy.hint));
  for (const value of copy.prompts ?? []) out.push(prompt(value), answer(answers[value]));
  for (let item = 0; item < (entry.pairs ?? 0); item += 1) out.push(answer("Q: "), answer("A: "));
  return out;
}

export async function buildKnowledgeTemplate(answers = {}, locale = "en") {
  const texts = loadLocale(locale);
  const font = "Calibri";
  const document = new Document({
    creator: "LobbyStack",
    title: `LobbyStack ${texts.title.toLowerCase()}`,
    styles: {
      default: { document: { run: { font, size: 22 } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { font, size: 48, bold: true }, paragraph: { spacing: { after: 120 } } },
        { id: "Heading1", name: "heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font, size: 30, bold: true, color: "1F2937" }, paragraph: { keepNext: true, spacing: { before: 400, after: 80 }, outlineLevel: 0 } },
        { id: "LobbyStackHint", name: HINT_STYLE, basedOn: "Normal", next: "Normal", run: { font, size: 20, italics: true, color: "6B7280" }, paragraph: { spacing: { after: 120 } } },
        { id: "LobbyStackPrompt", name: PROMPT_STYLE, basedOn: "Normal", next: "LobbyStackAnswer", run: { font, size: 22, bold: true }, paragraph: { keepNext: true, spacing: { before: 200, after: 60 } } },
        {
          id: "LobbyStackAnswer",
          name: "LobbyStack Answer",
          basedOn: "Normal",
          next: "LobbyStackAnswer",
          run: { font, size: 22 },
          paragraph: {
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB", space: 4 } },
            shading: { type: ShadingType.CLEAR, fill: "F9FAFB", color: "auto" },
            spacing: { before: 0, after: 120, line: 320 },
          },
        },
      ],
    },
    sections: [
      {
        children: [
          new Paragraph({ style: "Title", children: [text(texts.title)] }),
          ...texts.intro.map(hint),
          new Paragraph({ alignment: AlignmentType.LEFT, children: [] }),
          ...LAYOUT.flatMap((entry) => section(entry, texts, answers)),
        ],
      },
    ],
  });
  return await Packer.toBuffer(document);
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const directory = resolve(root, "apps/admin/public/templates");
  mkdirSync(directory, { recursive: true });
  for (const locale of LOCALES) writeFileSync(resolve(directory, templateFileName(locale)), await buildKnowledgeTemplate({}, locale));
  console.log(`Wrote ${LOCALES.length} templates to ${directory}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main();
