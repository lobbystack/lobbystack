import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { billingAccounts, businesses, businessMemberships, createDatabaseClient, knowledgeDocuments, users, withBusinessTransaction } from "@lobbystack/db";
import { advanceOnboardingStage, createKnowledgeDocument, getActiveOnboardingState } from "@lobbystack/domain";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function denied(action: () => Promise<unknown>, message: string) {
  let rejected = false;
  try { await action(); } catch { rejected = true; }
  assert(rejected, message);
}
const auth = createDatabaseClient("lobbystack_auth"), worker = createDatabaseClient("lobbystack_worker"), app = createDatabaseClient("lobbystack_app");
const userId = randomUUID(), viewerId = randomUUID(), businessId = randomUUID();
const actor = { userId, businessId };
const context = { db: app.db };
try {
  for (const id of [userId, viewerId]) await auth.db.insert(users).values({ id, email: `${id}@onboarding.invalid`, normalizedEmail: `${id}@onboarding.invalid` });
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
    await tx.insert(businesses).values({ id: businessId, slug: `onboarding-${businessId}`, name: "Onboarding certification", timezone: "UTC", businessType: "service_company", onboardingStage: "website" });
    await tx.insert(businessMemberships).values([{ businessId, userId, role: "business_owner", status: "active" }, { businessId, userId: viewerId, role: "viewer", status: "active" }]);
  });
  const website = { ...actor, sourceType: "website", sourceUrl: "example.com", title: "Example", onboarding: true };
  const ids = await Promise.all(Array.from({ length: 4 }, () => createKnowledgeDocument(context, website)));
  assert(new Set(ids).size === 1, "Concurrent onboarding imports created duplicate documents.");
  let business = await withBusinessTransaction(app.db, { ...actor, actorType: "operator" }, async (tx) => (await tx.select().from(businesses).where(eq(businesses.id, businessId)))[0]);
  assert(business?.websiteUrl === "https://example.com/" && business.onboardingStage === "knowledge", "Website URL and stage were not committed together.");
  await advanceOnboardingStage(context, { ...actor, to: "greeting" });
  // Greeting advances straight to plan; no personal phone verification gate.
  await advanceOnboardingStage(context, { ...actor, to: "plan" });
  assert((await getActiveOnboardingState(app.db, userId)).stage === "plan", "Greeting did not advance to plan without phone verification.");
  await advanceOnboardingStage(context, { ...actor, to: "knowledge" });
  await createKnowledgeDocument(context, website);
  business = await withBusinessTransaction(app.db, { ...actor, actorType: "operator" }, async (tx) => (await tx.select().from(businesses).where(eq(businesses.id, businessId)))[0]);
  assert(business?.onboardingStage === "plan", "Revisiting an earlier form regressed onboarding progress.");
  const documents = await withBusinessTransaction(app.db, { ...actor, actorType: "operator" }, async (tx) => tx.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, businessId)));
  assert(documents.length === 1, "Revisiting a website duplicated its import.");
  await denied(() => advanceOnboardingStage(context, { businessId, userId: viewerId, to: "knowledge" }), "Viewer could mutate a completed onboarding step.");
  await denied(() => createKnowledgeDocument(context, { ...website, userId: viewerId }), "Viewer could update the onboarding website.");
  await denied(() => createKnowledgeDocument(context, { ...website, sourceUrl: "file:///etc/passwd" }), "Invalid website URL was accepted.");
  await auth.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, userId));
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
    await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "free_cloud" });
    await tx.update(businesses).set({ onboardingStage: "phone_number" }).where(eq(businesses.id, businessId));
  });
  assert((await getActiveOnboardingState(app.db, userId)).stage === "plan", "A legacy free-plan number stage skipped plan selection.");
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, tx => tx.update(billingAccounts).set({ plan: "starter" }).where(eq(billingAccounts.businessId, businessId)));
  assert((await getActiveOnboardingState(app.db, userId)).stage === "phone_number", "A paid number stage was incorrectly sent back to plan selection.");
  // Retired verification stages resume forward to plan instead of dead-ending.
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, tx => tx.update(businesses).set({ onboardingStage: "verify_phone_code" }).where(eq(businesses.id, businessId)));
  assert((await getActiveOnboardingState(app.db, userId)).stage === "plan", "A retired verification stage did not resume to plan.");
  await advanceOnboardingStage(context, { ...actor, to: "plan" });
  business = await withBusinessTransaction(app.db, { ...actor, actorType: "operator" }, async (tx) => (await tx.select().from(businesses).where(eq(businesses.id, businessId)))[0]);
  assert(business?.onboardingStage === "plan", "Advancing from a retired verification stage did not normalize to plan.");
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
    await tx.update(billingAccounts).set({ plan: "free_cloud" }).where(eq(billingAccounts.businessId, businessId));
    await tx.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, businessId));
  });
  assert((await getActiveOnboardingState(app.db, userId)).stage === "complete", "Completed free onboarding was regressed.");
  console.log(JSON.stringify({ legacyFreeNumberReturnsToPlan: true, paidNumberStagePreserved: true, completedFreeStagePreserved: true, websiteAndStageAtomic: true, concurrentImportDeduplication: true, greetingAdvancesToPlan: true, legacyVerificationResumesToPlan: true, revisitsPreserveProgress: true, viewerDenied: true, invalidUrlDenied: true }));
} finally {
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => tx.delete(businesses).where(eq(businesses.id, businessId)));
  for (const id of [userId, viewerId]) await auth.db.delete(users).where(eq(users.id, id));
  await Promise.all([auth.pool.end(), worker.pool.end(), app.pool.end()]);
}
