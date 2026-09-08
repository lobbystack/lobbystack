import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { businesses, businessMemberships, createDatabaseClient, knowledgeDocuments, outboxMessages, users, websiteIngestionJobs, withBusinessTransaction } from "@lobbystack/db";
import agent from "../public/locales/fr/agent.json" with { type: "json" };

test("website imports expose queued progress, cancel, reimport and retry with tenant permissions", async ({ browser, baseURL }) => {
  const state = process.env.PARITY_PORT_OPERATOR_STORAGE_STATE_FR; const userId = process.env.PARITY_OPERATOR_USER_ID;
  test.skip(!state || !userId || process.env.WEBSITE_IMPORT_E2E !== "1", "Requires a disposable operator and an explicitly paused worker.");
  const worker = createDatabaseClient("lobbystack_worker"); const auth = createDatabaseClient("lobbystack_auth");
  const businessId = randomUUID(); const context = await browser.newContext({ storageState: state!, locale: "fr" });
  const original = (await auth.db.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId!)))[0];
  const headers = { Origin: baseURL!, "Sec-Fetch-Site": "same-origin" };
  try {
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
      await tx.insert(businesses).values({ id: businessId, slug: `website-import-${businessId}`, name: "Website import certification", timezone: "UTC", businessType: "clinic", deploymentMode: "self_hosted_standard", onboardingStage: "complete" });
      await tx.insert(businessMemberships).values({ businessId, userId: userId!, role: "business_owner", status: "active" });
    });
    await auth.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, userId!));
    const page = await context.newPage(); await page.goto(`${baseURL}/agent/knowledge`);
    const importWebsite = async () => {
      await page.getByRole("button", { name: agent.sections.knowledge.addKnowledge, exact: true }).click();
      await page.getByRole("menuitem", { name: agent.sections.knowledge.addKnowledgeOptions.website, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel(agent.sections.knowledge.fields.websiteUrl.label, { exact: true }).fill("https://www.example.invalid/help/");
      await dialog.getByRole("button", { name: agent.sections.knowledge.websiteImport.submit, exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText("example.invalid/help", { exact: true })).toBeVisible();
      await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "8");
    };
    const documents = async () => (await (await context.request.get(`${baseURL}/api/knowledge?businessId=${businessId}`)).json()).documents;
    await importWebsite();
    const initial = (await documents())[0]; expect(initial.websiteImport.status).toBe("queued");
    await page.getByRole("button", { name: agent.actions.moreOptions }).click();
    await page.getByRole("menuitem", { name: agent.actions.cancelImport, exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    expect((await documents())[0].websiteImport.status).toBe("queued");
    await page.getByRole("alertdialog").getByRole("button", { name: agent.actions.cancelImport, exact: true }).click();
    await expect(page.getByText("example.invalid/help", { exact: true })).toHaveCount(0);
    expect((await documents())[0].websiteImport.status).toBe("cancelled");
    await importWebsite();
    const retried = (await documents())[0];
    expect(retried.id).toBe(initial.id); expect(retried.websiteImport.id).toBe(initial.websiteImport.id);
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
      await tx.update(knowledgeDocuments).set({ status: "error", error: "Fixture crawl failure", revision: retried.revision + 1 }).where(and(eq(knowledgeDocuments.id, initial.id), eq(knowledgeDocuments.businessId, businessId)));
      await tx.update(websiteIngestionJobs).set({ status: "failed", errorCount: 1, lastError: "Fixture crawl failure" }).where(and(eq(websiteIngestionJobs.id, initial.websiteImport.id), eq(websiteIngestionJobs.businessId, businessId)));
    });
    await page.reload(); await expect(page.getByText(agent.sections.knowledge.websiteImport.previewFailed, { exact: true })).toBeVisible();
    await importWebsite();
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, tx => tx.update(businessMemberships).set({ role: "viewer" }).where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.userId, userId!))));
    await page.reload(); await expect(page.getByRole("button", { name: agent.actions.moreOptions })).toHaveCount(0);
    expect((await context.request.patch(`${baseURL}/api/knowledge/${initial.id}?businessId=${businessId}`, { headers, data: { action: "cancel" } })).status()).toBe(403);
  } finally {
    await context.close(); await auth.db.update(users).set({ activeBusinessId: original?.activeBusinessId ?? null }).where(eq(users.id, userId!));
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => { await tx.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId)); await tx.delete(businesses).where(eq(businesses.id, businessId)); });
    await Promise.all([auth.pool.end(), worker.pool.end()]);
  }
});
