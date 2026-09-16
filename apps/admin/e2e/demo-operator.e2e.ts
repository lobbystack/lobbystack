import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { businessContextSnapshots, businesses, createDatabaseClient, knowledgeDocuments, outboxMessages, websiteIngestionJobs, withBusinessTransaction } from "@lobbystack/db";
import copy from "../public/locales/fr/demos.json" with { type: "json" };

test("authorized demo operator creates, rotates, publishes and revokes a disposable French demo", async ({ browser, baseURL }) => {
  const state = process.env.PARITY_PORT_OPERATOR_STORAGE_STATE_FR;
  const foreignState = process.env.PARITY_PORT_OPERATOR_STORAGE_STATE_EN;
  test.skip(!state || !foreignState || process.env.DEMO_OPERATOR_E2E !== "1", "Requires configured disposable operator/non-operator fixtures and a paused worker.");
  const worker = createDatabaseClient("lobbystack_worker");
  const context = await browser.newContext({ storageState: state!, locale: "fr" });
  const headers = { Origin: baseURL!, "Sec-Fetch-Site": "same-origin" };
  let created: { demoId: string; businessId: string; websiteIngestionJobId: string; token: string } | undefined;
  try {
    const page = await context.newPage();
    await page.goto("/demos");
    await expect(page.getByRole("heading", { name: copy.operator.title })).toBeVisible();
    await expect(page.getByText(copy.operator.empty, { exact: true })).toBeVisible();
    await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
    await page.getByLabel(copy.operator.businessName, { exact: true }).fill(`Démo de certification ${randomUUID()}`);
    await page.getByLabel(copy.operator.websiteUrl, { exact: true }).fill("https://example.invalid");
    await page.getByLabel(copy.operator.greeting, { exact: true }).fill("Bonjour, comment puis-je vous aider ?");
    await page.getByLabel(copy.operator.suggestedPrompts, { exact: true }).fill("Quels sont vos horaires ?\nQuels services proposez-vous ?");
    const creation = page.waitForResponse(response => response.url().endsWith("/api/demos") && response.request().method() === "POST");
    await page.getByRole("button", { name: copy.operator.create }).click();
    const response = await creation; expect(response.status()).toBe(201); created = await response.json();
    await expect(page.getByLabel(copy.operator.businessName, { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: copy.operator.publish, exact: true })).toBeDisabled();
    expect((await (await context.request.get(`${baseURL}/api/demos/${created!.demoId}`)).json()).locale).toBe("fr");
    const rotation = page.waitForResponse(response => response.url().endsWith(`/api/demos/${created!.demoId}`) && response.request().method() === "POST");
    await page.getByRole("button", { name: copy.operator.rotate }).click();
    const rotated = await (await rotation).json() as { token: string };
    expect(rotated.token).not.toBe(created!.token);
    const preview = async (token: string) => (await (await context.request.post(`${baseURL}/api/demo/preview`, { headers, data: { token } })).json()).state;
    expect(await preview(created!.token)).toBe("invalid");
    await withBusinessTransaction(worker.db, { businessId: created!.businessId, actorType: "worker" }, async tx => {
      await tx.update(websiteIngestionJobs).set({ status: "completed", importedCount: 1, indexedCount: 1 }).where(eq(websiteIngestionJobs.id, created!.websiteIngestionJobId));
      await tx.insert(knowledgeDocuments).values({ businessId: created!.businessId, sourceType: "website", title: "Fixture website", sourceUrl: "https://example.invalid", status: "indexed", processingProgress: 100 });
      await tx.insert(businessContextSnapshots).values({ businessId: created!.businessId, version: "browser-certification", snapshot: {} });
    });
    await page.getByRole("button", { name: copy.operator.refresh }).click();
    await expect(page.getByRole("button", { name: copy.operator.publish, exact: true })).toBeEnabled();
    await page.getByRole("button", { name: copy.operator.publish, exact: true }).click();
    await expect.poll(() => preview(rotated.token)).toBe("active");
    await page.getByRole("button", { name: copy.operator.revoke, exact: true }).click();
    await expect.poll(() => preview(rotated.token)).toBe("revoked");
    await expect(page.getByRole("button", { name: copy.operator.rotate })).toBeDisabled();
    const foreign = await browser.newContext({ storageState: foreignState! });
    try { expect((await foreign.request.get(`${baseURL}/api/demos`)).status()).toBe(403); } finally { await foreign.close(); }
  } finally {
    await context.close();
    if (created) await withBusinessTransaction(worker.db, { businessId: created.businessId, actorType: "worker" }, async tx => {
      await tx.delete(outboxMessages).where(eq(outboxMessages.businessId, created!.businessId));
      await tx.delete(businesses).where(eq(businesses.id, created!.businessId));
    });
    await worker.pool.end();
  }
});
