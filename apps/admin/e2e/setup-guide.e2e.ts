import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { businesses, businessMemberships, createDatabaseClient, withBusinessTransaction } from "@lobbystack/db";

const state = process.env.PARITY_PORT_OPERATOR_STORAGE_STATE_FR;
const userId = process.env.PARITY_OPERATOR_USER_ID;
test("setup skips persist concurrently and require tenant administration", async ({ browser, baseURL }) => {
  test.skip(!state || !userId, "Requires an authenticated disposable operator fixture.");
  const database = createDatabaseClient("lobbystack_worker");
  const businessId = randomUUID();
  const context = await browser.newContext({ storageState: state! });
  const url = `${baseURL}/api/setup?businessId=${businessId}`;
  const headers = { Origin: baseURL!, "Sec-Fetch-Site": "same-origin" };
  try {
    await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, async (tx) => {
      await tx.insert(businesses).values({ id: businessId, slug: `setup-check-${businessId}`, name: "Setup check", timezone: "UTC", businessType: "clinic" });
      await tx.insert(businessMemberships).values({ businessId, userId: userId!, role: "business_owner", status: "active" });
    });
    const steps = ["website", "sources", "calendar", "services", "rules"];
    const initial = await context.request.get(url);
    expect(initial.status()).toBe(200);
    expect((await initial.json()).steps.every((step: { status: string }) => step.status === "needs setup")).toBe(true);
    const responses = await Promise.all(steps.map(stepId => context.request.patch(url, { headers, data: { stepId, skipped: true } })));
    for (const response of responses) expect(response.status()).toBe(200);
    const reloaded = await context.request.get(url);
    expect((await reloaded.json()).steps.filter((step: { status: string }) => step.status === "skipped")).toHaveLength(5);
    expect((await context.request.patch(url, { headers, data: { stepId: "invalid", skipped: true } })).status()).toBe(400);
    expect((await context.request.patch(url, { headers, data: { stepId: "website", skipped: false } })).status()).toBe(200);
    const unskipped = await context.request.get(url);
    expect((await unskipped.json()).steps.find((step: { id: string }) => step.id === "website").status).toBe("needs setup");
    await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, async (tx) => tx.update(businessMemberships).set({ role: "viewer" }).where(eq(businessMemberships.businessId, businessId)));
    expect((await context.request.get(url)).status()).toBe(403);
    expect((await context.request.patch(url, { headers, data: { stepId: "website", skipped: true } })).status()).toBe(403);
  } finally {
    await context.close();
    await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, async (tx) => tx.delete(businesses).where(eq(businesses.id, businessId)));
    await database.pool.end();
  }
});
