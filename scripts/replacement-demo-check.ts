import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { businessContextSnapshots, businessMemberships, businesses, createDatabaseClient, knowledgeDocuments, prospectDemos, users, websiteIngestionJobs, withBusinessTransaction } from "@lobbystack/db";
import { claimProspectDemo, createProspectDemo, expireProspectDemos, getProspectDemoStatus, previewProspectDemo, publishProspectDemo, revokeProspectDemo, rotateProspectDemoToken } from "@lobbystack/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const auth = createDatabaseClient("lobbystack_auth");
  const app = createDatabaseClient("lobbystack_app");
  const worker = createDatabaseClient("lobbystack_worker");
  const businessId = randomUUID();
  const demoId = randomUUID();
  const operatorUserId = randomUUID();
  const claimantUserId = randomUUID();
  const token = `demo-${randomUUID()}`;
  const hash = createHash("sha256").update(token).digest("hex");
  const createdBusinessIds: string[] = [businessId];

  try {
    await auth.db.insert(users).values([
      { id: operatorUserId, email: `operator-${operatorUserId}@example.test`, normalizedEmail: `operator-${operatorUserId}@example.test` },
      { id: claimantUserId, email: `claimant-${claimantUserId}@example.test`, normalizedEmail: `claimant-${claimantUserId}@example.test` },
    ]);
    const prepared = await createProspectDemo({ db: app.db }, { operatorUserId, name: "Lifecycle Demo", websiteUrl: "https://example.com", suggestedPrompts: ["What services do you offer?", "Can I request a quote?"] });
    createdBusinessIds.push(prepared.businessId);
    const preparingStatus = await getProspectDemoStatus({ db: app.db }, { operatorUserId, demoId: prepared.demoId });
    assert(preparingStatus.status === "preparing" && preparingStatus.websiteIngestionStatus === "queued", "Created demo did not start in the preparing state.");
    const rotated = await rotateProspectDemoToken({ db: app.db }, { operatorUserId, demoId: prepared.demoId });
    assert(rotated.token !== prepared.token, "Rotating a demo token did not invalidate the original token.");
    await withBusinessTransaction(worker.db, { businessId: prepared.businessId, actorType: "worker" }, async (tx) => {
      await tx.update(websiteIngestionJobs).set({ status: "completed", importedCount: 1, indexedCount: 1 }).where(eq(websiteIngestionJobs.id, prepared.websiteIngestionJobId));
      await tx.insert(knowledgeDocuments).values({ businessId: prepared.businessId, sourceType: "website", title: "Lifecycle Demo", sourceUrl: "https://example.com", status: "indexed", processingProgress: 100 });
      await tx.insert(businessContextSnapshots).values({ businessId: prepared.businessId, version: "certified", snapshot: {} });
    });
    const published = await publishProspectDemo({ db: app.db }, { operatorUserId, demoId: prepared.demoId, token: rotated.token });
    assert(published.status === "active", "Ready demo could not be published.");
    const publishedPreview = await previewProspectDemo({ db: app.db }, rotated.token);
    assert(publishedPreview.state === "active", "Published demo did not become publicly resolvable.");

    const revoked = await createProspectDemo({ db: app.db }, { operatorUserId, name: "Revoked Demo", websiteUrl: "https://example.org" });
    createdBusinessIds.push(revoked.businessId);
    await revokeProspectDemo({ db: app.db }, { operatorUserId, demoId: revoked.demoId });
    assert((await previewProspectDemo({ db: app.db }, revoked.token)).state === "revoked", "Revoked demo remained publicly active.");

    const expiring = await createProspectDemo({ db: app.db }, { operatorUserId, name: "Expired Demo", websiteUrl: "https://example.net" });
    createdBusinessIds.push(expiring.businessId);
    await withBusinessTransaction(worker.db, { businessId: expiring.businessId, actorType: "worker" }, async (tx) => {
      await tx.update(prospectDemos).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(prospectDemos.id, expiring.demoId));
    });
    assert(await expireProspectDemos({ db: worker.db }) >= 1, "Expiry sweep did not close a due demo.");
    assert((await previewProspectDemo({ db: app.db }, expiring.token)).state === "revoked", "Expired demo remained publicly active after the sweep.");
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
      await tx.insert(businesses).values({ id: businessId, slug: `demo-${businessId.slice(0, 8)}`, name: "Certified Demo", timezone: "UTC", businessType: "service_company", deploymentMode: "cloud" });
      await tx.insert(businessMemberships).values({ businessId, userId: operatorUserId, role: "business_owner", status: "active" });
      await tx.insert(prospectDemos).values({ id: demoId, businessId, tokenHash: hash, status: "active", locale: "en", suggestedPrompts: ["What services do you offer?"], websiteUrl: "https://example.test", businessName: "Certified Demo", operatorUserId, expiresAt: new Date(Date.now() + 60_000) });
    });

    const preview = await previewProspectDemo({ db: app.db }, token);
    assert(preview.state === "active" && preview.businessName === "Certified Demo", "Public demo preview did not resolve the active token.");
    const claimed = await claimProspectDemo({ db: app.db }, { userId: claimantUserId, token });
    assert(claimed.businessId === businessId, "Claim returned the wrong business.");

    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
      const demo = (await tx.select({ status: prospectDemos.status, claimedByUserId: prospectDemos.claimedByUserId }).from(prospectDemos).where(eq(prospectDemos.id, demoId)).limit(1))[0];
      const memberships = await tx.select({ userId: businessMemberships.userId, role: businessMemberships.role }).from(businessMemberships).where(eq(businessMemberships.businessId, businessId));
      assert(demo?.status === "claimed" && demo.claimedByUserId === claimantUserId, "Demo claim state was not persisted.");
      assert(memberships.some((membership) => membership.userId === claimantUserId && membership.role === "business_owner"), "Claimant did not become owner.");
      assert(!memberships.some((membership) => membership.userId === operatorUserId), "Temporary operator retained membership after claim.");
    });
    const claimant = (await auth.db.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, claimantUserId)).limit(1))[0];
    assert(claimant?.activeBusinessId === businessId, "Claimed workspace was not activated for the claimant.");
    const claimedPreview = await previewProspectDemo({ db: app.db }, token);
    assert(claimedPreview.state === "claimed", "Public preview did not transition to claimed state.");
    console.log(JSON.stringify({ createdPreparing: true, tokenRotated: true, readinessPublished: true, revokedClosed: true, expirySwept: true, previewResolved: true, ownershipTransferred: true, operatorRemoved: true, claimedStateVisible: true }));
  } finally {
    for (const createdBusinessId of createdBusinessIds) {
      await withBusinessTransaction(worker.db, { businessId: createdBusinessId, actorType: "worker" }, async (tx) => {
        await tx.delete(businesses).where(eq(businesses.id, createdBusinessId));
      }).catch(() => undefined);
    }
    await auth.db.delete(users).where(and(eq(users.id, operatorUserId), eq(users.normalizedEmail, `operator-${operatorUserId}@example.test`))).catch(() => undefined);
    await auth.db.delete(users).where(and(eq(users.id, claimantUserId), eq(users.normalizedEmail, `claimant-${claimantUserId}@example.test`))).catch(() => undefined);
    await Promise.all([auth.pool.end(), app.pool.end(), worker.pool.end()]);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
