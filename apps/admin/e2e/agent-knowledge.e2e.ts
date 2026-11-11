import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";

import { agentKnowledgeExclusions, agents, knowledgeChunks, knowledgeDocuments, knowledgeSnippets, websiteIngestionJobs } from "@lobbystack/db";

import agentCopy from "../public/locales/en/agent.json" with { type: "json" };
import navCopy from "../public/locales/en/nav.json" with { type: "json" };

import { migrator, removeFixtures, setPlan, signUpOwner, type Migrator } from "./fixtures/full-stack";

// Knowledge by source: the business page lists a website as one row and opens
// its pages; an agent's Specific knowledge adds its own entries and turns
// shared ones off for itself; selecting rows acts on several at once.

const prefix = "agent-knowledge";
const knowledge = agentCopy.sections.knowledge;
const plural = (forms: Record<string, string>, count: number) => (count === 1 ? forms.one! : forms.other!).replace("{{count}}", String(count));
const pagesLabel = (count: number) => plural({ one: knowledge.website.pages_one, other: knowledge.website.pages_other }, count);
// Set to a folder to keep light and dark screenshots of each screen.
const screenshots = process.env.AGENT_KNOWLEDGE_SCREENSHOTS_DIR;

async function capture(page: Page, name: string) {
  if (!screenshots) return;
  mkdirSync(screenshots, { recursive: true });
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(screenshots, `${name}-${scheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

async function document(database: Migrator, businessId: string, input: { title: string; text: string; sourceType?: string; sourceUrl?: string; websiteDocumentId?: string }) {
  const [row] = await database.db.insert(knowledgeDocuments).values({ businessId, title: input.title, sourceType: input.sourceType ?? "upload", sourceUrl: input.sourceUrl ?? null, status: "indexed", websiteDocumentId: input.websiteDocumentId ?? null }).returning({ id: knowledgeDocuments.id });
  await database.db.insert(knowledgeChunks).values({ businessId, documentId: row!.id, sequence: 0, content: input.text, contentHash: randomUUID() });
  return row!.id;
}

/** A website its crawl finished reading: the import document and two pages. */
async function website(database: Migrator, businessId: string) {
  const home = await document(database, businessId, { title: "Harbor Dental", text: "Welcome to Harbor Dental.", sourceType: "website", sourceUrl: "https://harbor-dental.example/" });
  await database.db.insert(websiteIngestionJobs).values({ businessId, rootDocumentId: home, websiteUrl: "https://harbor-dental.example/", provider: "firecrawl", status: "completed", importedCount: 3, indexedCount: 3 });
  const team = await document(database, businessId, { title: "Our team", text: "Dr. Lee and Dr. Ortiz.", sourceType: "website", sourceUrl: "https://harbor-dental.example/team", websiteDocumentId: home });
  await document(database, businessId, { title: "Opening hours", text: "Open weekdays from nine.", sourceType: "website", sourceUrl: "https://harbor-dental.example/hours", websiteDocumentId: home });
  return { home, team };
}

test("the business Knowledge page shows a website as one row, and turns one of its pages off", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, `${prefix}-website`);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    const { team } = await website(database, owner.businessId);
    await document(database, owner.businessId, { title: "Price list", text: "A cleaning costs 120 dollars." });

    await page.goto("/business/knowledge");
    const table = page.getByRole("table", { name: knowledge.title });
    await expect(table.getByText("Price list", { exact: true })).toBeVisible();
    // One row for the website, one for the file.
    await expect(table.locator("tbody tr")).toHaveCount(2);
    const row = table.locator("tbody tr", { hasText: "harbor-dental.example" });
    await expect(row.getByText(pagesLabel(3), { exact: true })).toBeVisible();
    await capture(page, "business-knowledge");

    await row.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Our team", { exact: true })).toBeVisible();
    await capture(page, "website-pages-dialog");
    await dialog.getByRole("switch", { name: knowledge.pagesDialog.usePage.replace("{{title}}", "Our team") }).click();
    await expect.poll(async () => (await database.db.select({ active: knowledgeDocuments.active }).from(knowledgeDocuments).where(eq(knowledgeDocuments.id, team)))[0]?.active).toBe(false);
    await page.keyboard.press("Escape");
    await expect(row).toContainText(plural({ one: knowledge.website.pagesOff_one, other: knowledge.website.pagesOff_other }, 1));
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});

test("an agent adds an FAQ of its own and turns a shared source off for itself", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const database = migrator();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, `${prefix}-agent`);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "starter");
    const [evening] = await database.db.insert(agents).values({ businessId: owner.businessId, isDefault: false, name: "Evening line", greeting: "Evening desk", tone: "warm", summary: "", bookingPolicy: "Book", transferMode: "on_request" }).returning({ id: agents.id });
    const prices = await document(database, owner.businessId, { title: "Price list", text: "A cleaning costs 120 dollars." });
    await website(database, owner.businessId);

    await page.goto(`/agents/${evening!.id}`);
    await page.getByRole("link", { name: navCopy.agentPages.knowledge, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${evening!.id}/knowledge$`));
    const own = page.getByRole("region", { name: knowledge.agent.ownTitle });
    const shared = page.getByRole("region", { name: knowledge.agent.sharedTitle });
    await expect(shared.getByText("Price list", { exact: true })).toBeVisible();
    await expect(own.getByText(knowledge.agent.ownEmpty, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: knowledge.addKnowledge, exact: true }).click();
    await page.getByRole("menuitem", { name: knowledge.addKnowledgeOptions.text, exact: true }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel(knowledge.fields.title.label, { exact: true }).fill("Is the side door open at night?");
    await sheet.getByLabel(knowledge.fields.content.label, { exact: true }).fill("Yes. Ring the bell by the side door after 6 pm.");
    await sheet.locator("button[type=submit]").click();
    await expect(sheet).toBeHidden();
    await expect(own.getByText("Is the side door open at night?", { exact: true })).toBeVisible();
    const [faq] = await database.db.select({ agentId: knowledgeSnippets.agentId }).from(knowledgeSnippets).where(eq(knowledgeSnippets.businessId, owner.businessId));
    expect(faq?.agentId).toBe(evening!.id);

    await shared.getByRole("switch", { name: knowledge.agent.useSource.replace("{{title}}", "Price list") }).click();
    await expect.poll(async () => (await database.db.select({ id: agentKnowledgeExclusions.id }).from(agentKnowledgeExclusions).where(and(eq(agentKnowledgeExclusions.agentId, evening!.id), eq(agentKnowledgeExclusions.documentId, prices)))).length).toBe(1);
    await expect(shared.locator("tbody tr", { hasText: "Price list" }).getByText(agentCopy.table.disabled, { exact: true })).toBeVisible();
    await capture(page, "agent-specific-knowledge");

    // The default agent still uses it.
    const [primary] = await database.db.select({ id: agents.id }).from(agents).where(and(eq(agents.businessId, owner.businessId), eq(agents.isDefault, true)));
    await page.goto(`/agents/${primary!.id}/knowledge`);
    await expect(page.getByRole("region", { name: knowledge.agent.sharedTitle }).getByRole("switch", { name: knowledge.agent.useSource.replace("{{title}}", "Price list") })).toBeChecked();
    await expect(page.getByRole("region", { name: knowledge.agent.ownTitle }).getByText("Is the side door open at night?", { exact: true })).toHaveCount(0);

    // The old Shared with every agent page opens Specific knowledge.
    await page.goto(`/agents/${evening!.id}/shared`);
    await expect(page).toHaveURL(new RegExp(`/agents/${evening!.id}/knowledge$`));
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});

test("selecting two rows deletes them together", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, `${prefix}-batch`);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await database.db.insert(knowledgeSnippets).values([
      { businessId: owner.businessId, title: "Parking", content: "Behind the clinic." },
      { businessId: owner.businessId, title: "Payment", content: "Cards and cash." },
      { businessId: owner.businessId, title: "Pets", content: "Service animals only." },
    ]);

    await page.goto("/business/knowledge");
    const table = page.getByRole("table", { name: knowledge.title });
    await expect(table.getByText("Parking", { exact: true })).toBeVisible();
    await expect(table.getByRole("checkbox")).toHaveCount(0);
    await page.getByRole("button", { name: knowledge.selection.select, exact: true }).click();
    await table.getByRole("checkbox", { name: knowledge.selection.selectRow.replace("{{title}}", "Parking") }).click();
    await table.getByRole("checkbox", { name: knowledge.selection.selectRow.replace("{{title}}", "Payment") }).click();
    await expect(page.getByText(knowledge.selection.count_other.replace("{{count}}", "2"), { exact: true })).toBeVisible();
    await capture(page, "selection-mode");
    await page.getByRole("toolbar").getByRole("button", { name: knowledge.batch.delete, exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByText(knowledge.batch.deleteTitle_other.replace("{{count}}", "2"), { exact: true })).toBeVisible();
    await confirm.getByRole("button", { name: agentCopy.actions.delete, exact: true }).click();
    await expect(table.getByText("Parking", { exact: true })).toHaveCount(0);
    await expect(table.getByText("Payment", { exact: true })).toHaveCount(0);
    await expect(table.getByText("Pets", { exact: true })).toBeVisible();
    expect((await database.db.select({ title: knowledgeSnippets.title }).from(knowledgeSnippets).where(eq(knowledgeSnippets.businessId, owner.businessId))).map((row) => row.title)).toEqual(["Pets"]);
    // Escape leaves selection mode.
    await page.keyboard.press("Escape");
    await expect(table.getByRole("checkbox")).toHaveCount(0);
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});
