import { createHash, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { businesses, businessMemberships, createDatabaseClient, prospectDemos, users, withBusinessTransaction } from "@lobbystack/db";

test("demo claim transfers ownership automatically and re-entry preserves onboarding", async ({ browser, baseURL }) => {
  const state = process.env.PARITY_PORT_OPERATOR_STORAGE_STATE_FR;
  const userId = process.env.PARITY_OPERATOR_USER_ID;
  test.skip(!state || !userId, "Requires an authenticated disposable operator fixture.");
  const database = createDatabaseClient("lobbystack_worker");
  const auth = createDatabaseClient("lobbystack_auth");
  const businessId = randomUUID();
  const operatorId = randomUUID();
  const token = `demo-cert-${randomUUID()}`;
  const context = await browser.newContext({ storageState: state!, locale: "fr" });
  const original = (await auth.db.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId!)))[0];
  try {
    await auth.db.insert(users).values({ id: operatorId, email: `${operatorId}@example.invalid`, normalizedEmail: `${operatorId}@example.invalid` });
    await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, async tx => {
      await tx.insert(businesses).values({ id: businessId, slug: `demo-claim-${businessId}`, name: "Demo claim certification", timezone: "UTC", businessType: "clinic", onboardingStage: "complete" });
      await tx.insert(businessMemberships).values({ businessId, userId: operatorId, role: "business_owner", status: "active" });
      await tx.insert(prospectDemos).values({ businessId, tokenHash: createHash("sha256").update(token).digest("hex"), operatorUserId: operatorId, status: "active", businessName: "Demo claim certification", websiteUrl: "https://example.invalid", expiresAt: new Date(Date.now() + 60000) });
    });
    const page = await context.newPage();
    const claimed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/demo/claim");
    await page.goto(`${baseURL}/claim-demo#prospect_demo_token=${token}`);
    expect((await claimed).status()).toBe(200);
    await expect(page).toHaveURL(`${baseURL}/onboarding/business`);
    expect(await page.evaluate(() => sessionStorage.getItem("prospect_demo_token"))).toBeNull();
    await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, async tx => {
      const memberships = await tx.select().from(businessMemberships).where(eq(businessMemberships.businessId, businessId));
      expect(memberships.map(member => member.userId)).toEqual([userId]);
      expect(memberships[0]?.role).toBe("business_owner");
      const business = (await tx.select().from(businesses).where(eq(businesses.id, businessId)))[0];
      expect(business?.onboardingStage).toBe("create_business");
      await tx.update(businesses).set({ onboardingStage: "website" }).where(eq(businesses.id, businessId));
    });
    const replay = await context.request.post(`${baseURL}/api/demo/claim`, { headers: { Origin: baseURL!, "Sec-Fetch-Site": "same-origin" }, data: { token } });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).status).toBe("already_claimed");
    await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, async tx => {
      expect((await tx.select().from(businesses).where(eq(businesses.id, businessId)))[0]?.onboardingStage).toBe("website");
    });
  } finally {
    await context.close();
    await auth.db.update(users).set({ activeBusinessId: original?.activeBusinessId ?? null }).where(eq(users.id, userId!));
    await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, async tx => tx.delete(businesses).where(eq(businesses.id, businessId)));
    await auth.db.delete(users).where(eq(users.id, operatorId));
    await Promise.all([database.pool.end(), auth.pool.end()]);
  }
});
