#!/usr/bin/env node
// Builds the Word template customers download from Knowledge > Upload a document.
// The worker (apps/worker/src/documentExtraction.ts) reads it back as plain text, which drops
// headings and flattens tables. So the template uses no tables, every prompt keeps its subject in
// the text, and two paragraph styles are scaffolding the reader removes: "LobbyStack Hint" (grey
// guidance) and "LobbyStack Prompt" (kept only when the customer answered it).
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, TextRun } from "docx";

export const HINT_STYLE = "LobbyStack Hint";
export const PROMPT_STYLE = "LobbyStack Prompt";
export const TEMPLATE_FILE = "lobbystack-knowledge-template.docx";

const SERVICE_PROMPTS = [
  "Service name",
  "What it includes",
  "How long it takes",
  "Price, or price range",
  "Who it suits, and who it does not",
  "What to prepare or bring",
  "What happens afterward",
];

const FAQ_COUNT = 10;

export const SECTIONS = [
  {
    title: "About the business",
    hint: "Say who you are in plain words. Callers hear this when they ask what you do.",
    prompts: [
      "Business name",
      "What does your business do, and who is it for?",
      "Which cities or areas do you serve?",
      "How long have you been in business, and what do customers say sets you apart?",
      "Which languages does your team speak?",
      "How can customers reach you besides calling (email, website, social media)?",
    ],
  },
  {
    title: "Location and access",
    hint: "Hours and closures live in your dashboard. Add the details callers ask about on top of them.",
    prompts: [
      "What is your full address, and which landmarks or cross streets help people find you?",
      "Where can customers park, and what does it cost?",
      "Is the location accessible (step-free entry, elevator, accessible restroom)?",
      "Do you have more than one location? Give the address of each.",
      "Do you travel to customers? Name the areas and any travel fee.",
    ],
  },
  {
    title: "Services in detail",
    hint: "Your service list lives in your dashboard. Describe each service here. Start every answer with the service name so it still makes sense on its own. Copy the block for each extra service.",
    blocks: 3,
    blockPrompts: SERVICE_PROMPTS,
  },
  {
    title: "Pricing and payment",
    prompts: [
      "Which payment methods do you accept?",
      "Do you charge deposits or booking fees? State the amount and when it is due.",
      "Do you give quotes or free estimates? How does a customer get one?",
      "Which insurance plans, memberships or financing options do you accept?",
      "Which discounts, packages or promotions are running? Include end dates.",
    ],
  },
  {
    title: "Booking and scheduling",
    prompts: [
      "How do new customers book, and what should they have ready?",
      "How far ahead should customers book, and how soon is the next opening usually?",
      "Do you accept walk-ins or same-day requests?",
      "What is your cancellation and rescheduling policy? State the notice you need and any fee.",
      "What happens when a customer arrives late or does not show up?",
      "Can customers bring children, guests or pets?",
      "Do you take group, recurring or after-hours bookings?",
    ],
  },
  {
    title: "Policies",
    prompts: [
      "What is your refund, return or guarantee policy?",
      "Which ID, age or eligibility requirements apply?",
      "Which health, safety or conduct rules do customers need to know?",
    ],
  },
  {
    title: "Team",
    hint: "Your team members live in your dashboard. Add what callers ask for by name or by need.",
    prompts: [
      "Who should callers ask for in specific situations? Example: for bridal bookings, ask for Maria.",
      "Which team members have specialties or certifications customers ask about?",
    ],
  },
  {
    title: "Urgent and after-hours situations",
    prompts: [
      "What counts as urgent or an emergency, and what should callers do first?",
      "What should the receptionist tell callers who ring after hours?",
    ],
  },
  {
    title: "Limits and hand-offs",
    hint: "Tell the receptionist where to stop. Name the topic and the reason.",
    prompts: [
      "Which requests must go to a person? Example: complaints, billing disputes, legal or medical questions.",
      "What must the receptionist never promise or quote? Example: exact prices over the phone, guaranteed results.",
      "What do you need to know from a caller before you can help (name, address, vehicle, order number)?",
      "How should the receptionist treat sales and vendor calls?",
    ],
  },
  {
    title: "Names, terms and pronunciations",
    prompts: [
      "Which business, team or product names are hard to pronounce? Spell out how to say each one.",
      "Which industry terms or abbreviations do customers use, and what do they mean?",
      "Which other businesses or brands do customers mix up with yours?",
    ],
  },
  {
    title: "Current news",
    hint: "Remove each item once it is out of date.",
    prompts: [
      "What has changed lately or is about to change (new services, construction, seasonal changes, wait times)? Include dates.",
    ],
  },
  {
    title: "Frequently asked questions",
    hint: `Write the ${FAQ_COUNT} questions callers ask most, then answer each in full sentences. Delete the pairs you do not use.`,
    faq: FAQ_COUNT,
  },
];

const text = (value, options = {}) => new TextRun({ text: value, ...options });
const hint = (value) => new Paragraph({ style: "LobbyStackHint", children: [text(value)] });
const prompt = (value) => new Paragraph({ style: "LobbyStackPrompt", children: [text(value)] });
const answer = (value) => new Paragraph({ style: "LobbyStackAnswer", children: value ? [text(value)] : [] });

// `answers` maps a prompt to a filled-in answer. Tests use it to stand in for a customer.
function section(entry, answers) {
  const out = [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [text(entry.title)] })];
  if (entry.hint) out.push(hint(entry.hint));
  for (const value of entry.prompts ?? []) out.push(prompt(value), answer(answers[value]));
  for (let block = 0; block < (entry.blocks ?? 0); block += 1) {
    for (const value of entry.blockPrompts) out.push(prompt(value), answer(block === 0 ? answers[value] : undefined));
  }
  for (let item = 0; item < (entry.faq ?? 0); item += 1) out.push(answer("Q: "), answer("A: "));
  return out;
}

export function buildKnowledgeTemplate(answers = {}) {
  const font = "Calibri";
  const document = new Document({
    creator: "LobbyStack",
    title: "LobbyStack knowledge template",
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
          new Paragraph({ style: "Title", children: [text("Knowledge template")] }),
          hint("Fill in what applies to your business and leave the rest blank. Upload this file in Knowledge, under Add knowledge. Your receptionist reads your answers and ignores grey notes like this one."),
          hint("Write full sentences that name the subject: \"A 60-minute massage costs $90\", not \"$90\". Give numbers with units, and dates for anything that expires. Skip tables, images and \"see our website\". Type the content here."),
          new Paragraph({ alignment: AlignmentType.LEFT, children: [] }),
          ...SECTIONS.flatMap((entry) => section(entry, answers)),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const target = resolve(root, "apps/admin/public/templates", TEMPLATE_FILE);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, await buildKnowledgeTemplate());
  console.log(`Wrote ${target}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main();
