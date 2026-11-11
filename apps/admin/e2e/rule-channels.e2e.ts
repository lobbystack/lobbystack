import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";

import { agentRules, agents } from "@lobbystack/db";

import agentCopy from "../public/locales/en/agent.json" with { type: "json" };

import { migrator, removeFixtures, signUpOwner } from "./fixtures/full-stack";

// Rules took in an agent's Instructions: a rule can be kept to one channel,
// and the old Instructions address lands on Rules.

const prefix = "rule-channels";
const copy = agentCopy.sections.rules;

test("an owner adds a rule for texts only, and the old Instructions page opens Rules", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    const [agent] = await database.db.select({ id: agents.id }).from(agents).where(and(eq(agents.businessId, owner.businessId), eq(agents.isDefault, true)));

    await page.goto(`/agents/${agent!.id}/instructions`);
    await expect(page).toHaveURL(new RegExp(`/agents/${agent!.id}/rules$`));

    await page.getByRole("button", { name: copy.addKnowledge, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(copy.fields.title.label, { exact: true }).fill("Text replies");
    await dialog.getByLabel(copy.fields.content.label, { exact: true }).fill("Keep replies under 300 characters.");
    await dialog.getByRole("combobox", { name: copy.fields.channel.label }).click();
    await page.getByRole("option", { name: copy.fields.channel.sms, exact: true }).click();
    const saved = page.waitForResponse((response) => response.url().includes("/api/rules") && response.request().method() === "POST");
    await dialog.getByRole("button", { name: agentCopy.actions.add, exact: true }).click();
    expect((await saved).status()).toBe(201);
    await expect(dialog).toBeHidden();

    const row = page.getByRole("row").filter({ hasText: "Text replies" });
    await expect(row).toBeVisible();
    await expect(row.getByText(copy.fields.channel.sms, { exact: true })).toBeVisible();
    expect(await database.db.select({ title: agentRules.title, channel: agentRules.channel }).from(agentRules).where(and(eq(agentRules.agentId, agent!.id), eq(agentRules.title, "Text replies")))).toEqual([{ title: "Text replies", channel: "sms" }]);

    // It stays a text rule after a reload.
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: "Text replies" }).getByText(copy.fields.channel.sms, { exact: true })).toBeVisible();
  } finally {
    await removeFixtures(database, { emails, businessIds });
    await database.pool.end();
  }
});
