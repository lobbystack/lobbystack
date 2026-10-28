import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billingUsageEvents, businesses, businessMemberships, createDatabaseClient, outboxMessages, partnerUsageMonths, phoneNumbers, platformKeyBusinesses, prospectDemos, receptionistProfiles, storageObjects, users, websiteIngestionJobs, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { PROSPECT_DEMO_WIDGET_ID } from "@lobbystack/shared";

import { forgetCachedBrands } from "./brands";
import { capabilityNames, HOST_BRAND_SCOPE, requireBusinessAccess, type BrandScope } from "./businessAccess";
import { exportBusinessTemplate } from "./businessTemplates";
import { claimProspectDemo, createPartnerDemo, createProspectDemo, deletePartnerDemo, getProspectDemoStatus, listPartnerDemos, listProspectDemos, previewProspectDemo, publishPartnerDemo, revokePartnerDemo, rotatePartnerDemoToken } from "./demos";
import { loadEntitlement } from "./entitlement";
import { finishLiveCall, startLiveWebCall } from "./liveCalls";
import { refreshBusinessSnapshot } from "./knowledge";
import { getActiveOnboardingState } from "./onboarding";
import { acceptPartnerInvitation, hashPartnerToken, invitePartnerMember, listPartnerBusinesses, releaseBusiness, signUpPartner, type PartnerMemberActor } from "./partners";
import { listUserBusinesses, NEW_BUSINESS_RECEPTIONIST_INSTRUCTIONS, readActiveBusinessId } from "./tenancy";
import { periodKeyFor } from "./usage";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner demo integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  vi.stubEnv("PARTNER_SIGNUP", "open");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("MARKETING_HOSTS", "");
  vi.stubEnv("BRAND_APP_NAME", "Front Desk");
  vi.stubEnv("EMAIL_FROM", "Front Desk <no-reply@desk.example.test>");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
});

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

type Person = { userId: string; email: string };

/** Accounts made as the migrator; every call after this runs as the app role. */
async function people(tx: DatabaseTransaction, count: number): Promise<Person[]> {
  const made = Array.from({ length: count }, () => {
    const userId = randomUUID();
    return { userId, email: `${userId}@example.invalid` };
  });
  await tx.execute(sql`reset role`);
  await tx.insert(users).values(made.map((person) => ({ id: person.userId, email: person.email, normalizedEmail: person.email, name: `Person ${person.userId.slice(0, 4)}`, emailVerified: true })));
  await tx.execute(sql`set local role lobbystack_app`);
  return made;
}

/** Reads or writes as the migrator, then goes back to the app role. */
async function asMigrator<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** Runs the call path as the worker runtime role, the way the admin's call routes do, then goes back to the app role. */
async function asWorker<T>(tx: DatabaseTransaction, run: (context: { db: Database }) => Promise<T>): Promise<T> {
  await tx.execute(sql`set local role lobbystack_worker`);
  try {
    return await run({ db: tx as unknown as Database });
  } finally {
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** A refusal's error, or the database error a refused statement raised. */
async function refusal(promise: Promise<unknown>): Promise<{ status?: number; code?: string; message?: string }> {
  return await promise.then(() => ({}), (error: { cause?: { code?: string; message?: string } } & Record<string, unknown>) => (error.cause?.code ? error.cause : error) as { status?: number; code?: string; message?: string });
}

/** The link token in the email queued for an invitation. */
async function linkToken(tx: DatabaseTransaction, invitationId: string): Promise<string> {
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

/** A partner signed up by its owner, with a member on its team. */
async function partner(tx: DatabaseTransaction, name: string) {
  const [owner, member] = await people(tx, 2);
  const context = { db: tx as unknown as Database };
  const { partnerId, subdomain } = await signUpPartner(context, { userId: owner!.userId, email: owner!.email, emailVerified: true, name });
  const ownerActor: PartnerMemberActor = { kind: "member", partnerId, userId: owner!.userId, role: "owner" };
  const { invitationId } = await invitePartnerMember(context, ownerActor, { email: member!.email, role: "member" });
  await acceptPartnerInvitation(context, { userId: member!.userId, tokenHash: hashPartnerToken(await linkToken(tx, invitationId)), email: member!.email, emailVerified: true });
  const memberActor: PartnerMemberActor = { kind: "member", partnerId, userId: member!.userId, role: "member" };
  return { context, partnerId, subdomain: subdomain!, owner: owner!, member: member!, ownerActor, memberActor, brand: { kind: "partner", partnerId } satisfies BrandScope };
}

const demoInput = (name: string) => ({ name, websiteUrl: "https://example.com", suggestedPrompts: ["What do you offer?", "Can I get a quote?"] });

/** The token a demo's link carries, from its URL's fragment. */
const tokenOf = (url: string) => new URLSearchParams(new URL(url).hash.slice(1)).get("prospect_demo_token")!;

/** Marks a demo published, as publishing it does once its website is read. */
async function publish(tx: DatabaseTransaction, demoId: string) {
  await asMigrator(tx, async () => await tx.update(prospectDemos).set({ status: "active", publishedAt: new Date() }).where(eq(prospectDemos.id, demoId)));
}

const notFound = { status: 404, code: "demo_not_found" };

describe.skipIf(!client)("a partner's prospect demos against PostgreSQL", () => {
  it("makes a demo under the partner's brand, as one of its businesses with no owner, whose link opens on its domain", async () => {
    await rollbackTest(async (tx) => {
      await tx.execute(sql`set local role lobbystack_app`);
      const bright = await partner(tx, "Bright Desk");
      const demo = await createPartnerDemo(bright.context, bright.ownerActor, { ...demoInput("Harbor Dental"), accessLevel: "activity" });

      expect(demo).toMatchObject({ status: "preparing", accessLevel: "activity" });
      expect(demo.url).toBe(`https://${bright.subdomain}/demo#prospect_demo_token=${encodeURIComponent(demo.token)}`);
      expect(tokenOf(demo.url)).toBe(demo.token);
      const stored = await asMigrator(tx, async () => ({
        business: (await tx.select({ partnerId: businesses.partnerId, accessLevel: businesses.partnerAccessLevel }).from(businesses).where(eq(businesses.id, demo.businessId)))[0],
        team: await tx.select({ userId: businessMemberships.userId }).from(businessMemberships).where(eq(businessMemberships.businessId, demo.businessId)),
        demo: (await tx.select({ partnerId: prospectDemos.partnerId, operatorUserId: prospectDemos.operatorUserId }).from(prospectDemos).where(eq(prospectDemos.id, demo.demoId)))[0],
        instructions: (await tx.select({ voiceInstructions: receptionistProfiles.voiceInstructions }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, demo.businessId)))[0]?.voiceInstructions,
      }));
      expect(stored.business).toEqual({ partnerId: bright.partnerId, accessLevel: "activity" });
      // The partner's people work in it through opens, never on its team.
      expect(stored.team).toEqual([]);
      expect(stored.demo).toEqual({ partnerId: bright.partnerId, operatorUserId: bright.owner.userId });
      // The receptionist names the partner, never the host.
      expect(stored.instructions).toContain("This is a prospect demo from Bright Desk.");
      expect(stored.instructions).not.toMatch(/LobbyStack|Front Desk/);

      // Everyone on the team sees it on the Demos page, and it stays off the Businesses page until it's claimed.
      for (const actor of [bright.ownerActor, bright.memberActor]) {
        expect((await listPartnerDemos(bright.context, actor)).map((row) => [row.demoId, row.businessName, row.status, row.accessLevel])).toEqual([[demo.demoId, "Harbor Dental", "preparing", "activity"]]);
      }
      expect(await listPartnerBusinesses(bright.context, bright.ownerActor)).toEqual([]);
      // The host's Demos page never shows it, even to the person who made it.
      expect(await listProspectDemos(bright.context, bright.owner.userId)).toEqual([]);
      expect(await refusal(getProspectDemoStatus(bright.context, { operatorUserId: bright.owner.userId, demoId: demo.demoId }))).toMatchObject(notFound);
    });
  });

  it("names the host's brand in the host's own demos", async () => {
    await rollbackTest(async (tx) => {
      await tx.execute(sql`set local role lobbystack_app`);
      const [operator] = await people(tx, 1);
      const demo = await createProspectDemo({ db: tx as unknown as Database }, { operatorUserId: operator!.userId, ...demoInput("Pier Dental") });
      const instructions = await asMigrator(tx, async () => (await tx.select({ voiceInstructions: receptionistProfiles.voiceInstructions }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, demo.businessId)))[0]?.voiceInstructions);
      expect(instructions).toContain("This is a prospect demo from Front Desk.");
      expect((await asMigrator(tx, async () => await tx.select({ partnerId: prospectDemos.partnerId }).from(prospectDemos).where(eq(prospectDemos.id, demo.demoId))))[0]?.partnerId).toBeNull();
    });
  });

  it("keeps each partner's demos to its own team, and refuses platform keys and a partner without a domain", async () => {
    await rollbackTest(async (tx) => {
      await tx.execute(sql`set local role lobbystack_app`);
      // Every suite signs Acme up before Bright, so parallel suites wait on each other's partners instead of deadlocking.
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const demo = await createPartnerDemo(bright.context, bright.memberActor, demoInput("Harbor Dental"));
      expect(demo.accessLevel).toBe("full");
      // A member makes demos at full access. Picking activity only is for owners and admins, as it is for any of the partner's businesses.
      expect(await refusal(createPartnerDemo(bright.context, bright.memberActor, { ...demoInput("Pier Dental"), accessLevel: "activity" }))).toMatchObject({ status: 403 });
      expect(await createPartnerDemo(bright.context, bright.memberActor, { ...demoInput("Pier Dental"), accessLevel: "full" })).toMatchObject({ accessLevel: "full" });

      expect(await listPartnerDemos(acme.context, acme.ownerActor)).toEqual([]);
      for (const attempt of [
        () => publishPartnerDemo(acme.context, acme.ownerActor, { demoId: demo.demoId, token: demo.token }),
        () => rotatePartnerDemoToken(acme.context, acme.ownerActor, { demoId: demo.demoId }),
        () => revokePartnerDemo(acme.context, acme.ownerActor, { demoId: demo.demoId }),
      ]) expect(await refusal(attempt())).toMatchObject(notFound);
      // Naming another partner it isn't on gets nothing either.
      expect(await refusal(revokePartnerDemo(acme.context, { ...acme.ownerActor, partnerId: bright.partnerId }, { demoId: demo.demoId }))).toMatchObject(notFound);

      const key = { kind: "key", partnerId: bright.partnerId, platformKeyId: randomUUID() } as const;
      // A key the partner never made answers as an invalid one. partnerKeyApi.integration.test.ts covers real keys.
      expect(await refusal(createPartnerDemo(bright.context, key, demoInput("Harbor Dental")))).toMatchObject({ status: 401 });
      expect(await refusal(listPartnerDemos(bright.context, key))).toMatchObject({ status: 401 });
      expect(await refusal(createPartnerDemo(bright.context, bright.memberActor, { ...demoInput("Harbor Dental"), accessLevel: "owner" }))).toMatchObject({ status: 400, code: "invalid_access_level" });

      vi.stubEnv("PARTNER_BASE_DOMAIN", "");
      expect(await refusal(createPartnerDemo(bright.context, bright.memberActor, demoInput("Pier Dental")))).toMatchObject({ status: 409, code: "partner_domain_required" });
    });
  });

  it("gives a demo a new link on the partner's domain, refuses to publish one that isn't ready, and turns one off for anyone on the team", async () => {
    await rollbackTest(async (tx) => {
      await tx.execute(sql`set local role lobbystack_app`);
      const bright = await partner(tx, "Bright Desk");
      const demo = await createPartnerDemo(bright.context, bright.memberActor, demoInput("Harbor Dental"));

      const rotated = await rotatePartnerDemoToken(bright.context, bright.ownerActor, { demoId: demo.demoId });
      expect(rotated.url).toBe(`https://${bright.subdomain}/demo#prospect_demo_token=${encodeURIComponent(rotated.token)}`);
      expect(await previewProspectDemo(bright.context, demo.token, bright.brand)).toEqual({ state: "invalid" });
      expect(await refusal(publishPartnerDemo(bright.context, bright.memberActor, { demoId: demo.demoId, token: demo.token }))).toMatchObject({ status: 409, code: "demo_token_mismatch" });
      // The website hasn't been read yet.
      expect(await refusal(publishPartnerDemo(bright.context, bright.memberActor, { demoId: demo.demoId, token: rotated.token }))).toMatchObject({ status: 409, code: "demo_not_ready" });

      // A deployment with no website crawler marks the crawl unavailable, and the demo publishes from its greeting, services and prompts.
      await asMigrator(tx, async () => await refreshBusinessSnapshot(bright.context, { businessId: demo.businessId }));
      await asMigrator(tx, async () => await tx.update(websiteIngestionJobs).set({ status: "unavailable", lastError: "Website crawling is not configured." }).where(eq(websiteIngestionJobs.businessId, demo.businessId)));
      expect((await listPartnerDemos(bright.context, bright.ownerActor))[0]).toMatchObject({ websiteIngestionStatus: "unavailable", websiteIngestionError: "Website crawling is not configured." });
      expect(await publishPartnerDemo(bright.context, bright.memberActor, { demoId: demo.demoId, token: rotated.token })).toMatchObject({ status: "active" });

      await revokePartnerDemo(bright.context, bright.memberActor, { demoId: demo.demoId });
      expect(await previewProspectDemo(bright.context, rotated.token, bright.brand)).toMatchObject({ state: "revoked" });
      expect((await listPartnerDemos(bright.context, bright.ownerActor)).map((row) => row.status)).toEqual(["revoked"]);
      // A turned-off demo stays off the Businesses page too.
      expect(await listPartnerBusinesses(bright.context, bright.ownerActor)).toEqual([]);
      expect(await refusal(rotatePartnerDemoToken(bright.context, bright.memberActor, { demoId: demo.demoId }))).toMatchObject({ status: 409, code: "demo_closed" });
    });
  });

  it("keeps a claimed demo with the partner, on its domain, at the access level the partner picked", async () => {
    await rollbackTest(async (tx) => {
      await tx.execute(sql`set local role lobbystack_app`);
      const bright = await partner(tx, "Bright Desk");
      const [prospect] = await people(tx, 1);
      const demo = await createPartnerDemo(bright.context, bright.ownerActor, { ...demoInput("Harbor Dental"), accessLevel: "activity" });
      await publish(tx, demo.demoId);
      // Like each of the partner's businesses, the demo's business is in the partner's group, which its platform keys reach.
      const groups = async () => (await asMigrator(tx, async () => await tx.select({ groupId: platformKeyBusinesses.groupId }).from(platformKeyBusinesses).where(eq(platformKeyBusinesses.businessId, demo.businessId)))).map((row) => row.groupId);
      expect(await groups()).toEqual([bright.partnerId]);
      // Someone on the team changed how the demo texts while showing it.
      await asMigrator(tx, async () => await tx.update(receptionistProfiles).set({ smsInstructions: "Text back within the hour." }).where(eq(receptionistProfiles.businessId, demo.businessId)));

      // The demo shows only on the partner's domain.
      expect(await previewProspectDemo(bright.context, demo.token, HOST_BRAND_SCOPE)).toEqual({ state: "invalid" });
      expect(await previewProspectDemo(bright.context, demo.token, bright.brand)).toMatchObject({ state: "active", businessName: "Harbor Dental" });
      expect(await refusal(claimProspectDemo(bright.context, { userId: prospect!.userId, token: demo.token }))).toMatchObject({ status: 409, code: "demo_not_claimable" });
      // Someone on the partner's team works in it from the console instead.
      expect(await refusal(claimProspectDemo(bright.context, { userId: bright.member.userId, token: demo.token, brand: bright.brand }))).toMatchObject({ status: 409, code: "partner_member_not_on_team" });

      expect(await claimProspectDemo(bright.context, { userId: prospect!.userId, token: demo.token, brand: bright.brand })).toEqual({ businessId: demo.businessId, status: "claimed" });
      const claimed = await asMigrator(tx, async () => ({
        business: (await tx.select({ partnerId: businesses.partnerId, accessLevel: businesses.partnerAccessLevel, onboardingStage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, demo.businessId)))[0],
        team: await tx.select({ userId: businessMemberships.userId, role: businessMemberships.role, status: businessMemberships.status }).from(businessMemberships).where(eq(businessMemberships.businessId, demo.businessId)),
        hostActive: (await tx.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, prospect!.userId)))[0]?.activeBusinessId,
      }));
      // At the activity level the owner's only onboarding step is their phone, as for an owner the partner invited.
      expect(claimed.business).toEqual({ partnerId: bright.partnerId, accessLevel: "activity", onboardingStage: "verify_phone" });
      // Real calls aren't a demo anymore: the receptionist gets back what a new business is told, apart from what someone changed during the demo.
      const receptionist = await asMigrator(tx, async () => (await tx.select({ bookingPolicy: receptionistProfiles.bookingPolicy, voiceInstructions: receptionistProfiles.voiceInstructions, smsInstructions: receptionistProfiles.smsInstructions }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, demo.businessId)))[0]);
      expect(receptionist).toEqual({ bookingPolicy: NEW_BUSINESS_RECEPTIONIST_INSTRUCTIONS.bookingPolicy, voiceInstructions: NEW_BUSINESS_RECEPTIONIST_INSTRUCTIONS.voiceInstructions, smsInstructions: "Text back within the hour." });
      const refresh = await asMigrator(tx, async () => await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.businessId, demo.businessId), eq(outboxMessages.topic, "snapshot.refresh"), eq(outboxMessages.aggregateType, "receptionist_profile"))));
      expect(refresh).toHaveLength(1);
      // A claim can't be turned off.
      expect(await refusal(revokePartnerDemo(bright.context, bright.memberActor, { demoId: demo.demoId }))).toMatchObject({ status: 409, code: "demo_claimed" });
      expect(claimed.team).toEqual([{ userId: prospect!.userId, role: "business_owner", status: "active" }]);
      // The dashboard opens on it on the partner's domain, and the host's domain is untouched.
      expect(claimed.hostActive).toBeNull();
      expect(await readActiveBusinessId(bright.context.db, { userId: prospect!.userId, brand: bright.brand })).toBe(demo.businessId);
      expect(await getActiveOnboardingState(bright.context.db, prospect!.userId, bright.brand)).toMatchObject({ businessId: demo.businessId, stage: "verify_phone" });
      expect((await listUserBusinesses(bright.context.db, prospect!.userId, bright.brand)).map((row) => row.businessId)).toEqual([demo.businessId]);
      expect(await listUserBusinesses(bright.context.db, prospect!.userId, HOST_BRAND_SCOPE)).toEqual([]);

      // Its operators get the partner's access level on the partner's domain, and nothing on the host's.
      const access = await withBusinessTransaction(bright.context.db, { userId: prospect!.userId, businessId: demo.businessId, actorType: "operator" }, async (inner) => await requireBusinessAccess(inner, { userId: prospect!.userId, businessId: demo.businessId, brand: bright.brand }));
      expect(capabilityNames.filter((capability) => access.can(capability))).toEqual(["activity"]);
      expect(await refusal(withBusinessTransaction(bright.context.db, { userId: prospect!.userId, businessId: demo.businessId, actorType: "operator" }, async (inner) => await requireBusinessAccess(inner, { userId: prospect!.userId, businessId: demo.businessId, brand: HOST_BRAND_SCOPE })))).toMatchObject({ status: 403 });

      // It moves to the Businesses page with its owner, billed outside LobbyStack until an owner or admin sells it a package, and the Demos page shows it claimed.
      expect((await listPartnerBusinesses(bright.context, bright.ownerActor)).map((row) => [row.businessId, row.accessLevel, row.owner, row.billing])).toEqual([[demo.businessId, "activity", { email: prospect!.email, status: "joined" }, { kind: "outside" }]]);
      expect(await groups()).toEqual([bright.partnerId]);
      expect((await listPartnerDemos(bright.context, bright.memberActor)).map((row) => [row.demoId, row.status])).toEqual([[demo.demoId, "claimed"]]);
      expect(await claimProspectDemo(bright.context, { userId: prospect!.userId, token: demo.token, brand: bright.brand })).toEqual({ businessId: demo.businessId, status: "already_claimed" });

      // Only the partner hands it over, by releasing it, and then it leaves the partner's Demos page.
      await releaseBusiness(bright.context, bright.ownerActor, { businessId: demo.businessId });
      expect(await listPartnerDemos(bright.context, bright.ownerActor)).toEqual([]);
      // It's a direct business now, so the partner's keys no longer reach it.
      expect(await groups()).toEqual([]);
    });
  });

  it("counts a demo's calls like any other of the partner's businesses' usage", async () => {
    await rollbackTest(async (tx) => {
      await tx.execute(sql`set local role lobbystack_app`);
      const bright = await partner(tx, "Bright Desk");
      const demo = await createPartnerDemo(bright.context, bright.memberActor, demoInput("Harbor Dental"));
      await publish(tx, demo.demoId);

      // A partner's demo has no package, so it's billed outside LobbyStack and draws on the partner's pool, as its businesses do.
      expect(await asWorker(tx, async (context) => await withBusinessTransaction(context.db, { businessId: demo.businessId, actorType: "worker" }, async (inner) => await loadEntitlement(inner, demo.businessId)))).toMatchObject({ live: true, source: "billed_outside", poolPartnerId: bright.partnerId });
      // The call route starts a partner's demo call as billable.
      const started = await asWorker(tx, async (context) => await startLiveWebCall(context, { businessId: demo.businessId, sessionId: `live_${randomUUID()}`, widgetId: PROSPECT_DEMO_WIDGET_ID, billable: true, maxDurationMs: 120_000, sessionPurpose: "prospect_demo", prospectDemoId: demo.demoId }));
      await asWorker(tx, async (context) => await finishLiveCall(context, { businessId: demo.businessId, callId: started.callId, seconds: 90, end: "caller_finished", channel: "web_voice" }));

      const events = await asMigrator(tx, async () => await tx.select({ quantity: billingUsageEvents.quantity }).from(billingUsageEvents).where(eq(billingUsageEvents.businessId, demo.businessId)));
      expect(events).toEqual([{ quantity: 90 }]);
      expect((await listPartnerDemos(bright.context, bright.memberActor)).map((row) => [row.demoId, row.usage.voiceSeconds, row.usage.chats])).toEqual([[demo.demoId, 90, 0]]);
    });
  });

  it("draws a demo's calls on the partner's pool, and holds them to the calls the partner's businesses may have open at once", async () => {
    await rollbackTest(async (tx) => {
      await tx.execute(sql`set local role lobbystack_app`);
      // With all six tier products set, the deployment bills tiers, and a partner on Free shares 1,800 seconds a month between its businesses.
      for (const tier of ["STARTER", "GROWTH", "SCALE"]) for (const interval of ["MONTHLY", "ANNUAL"]) vi.stubEnv(`POLAR_PARTNER_${tier}_${interval}_PRODUCT_ID`, `prod_${tier.toLowerCase()}_${interval.toLowerCase()}`);
      // A name of its own, so its slug never waits on another suite's partner.
      const cove = await partner(tx, `Cove Desk ${randomUUID().slice(0, 8)}`);
      const harbor = await createPartnerDemo(cove.context, cove.memberActor, demoInput("Harbor Dental"));
      const pier = await createPartnerDemo(cove.context, cove.memberActor, demoInput("Pier Dental"));
      await publish(tx, harbor.demoId);
      await publish(tx, pier.demoId);
      type Demo = typeof harbor;
      // The call route starts a partner's demo call as billable.
      const call = async (demo: Demo, maxDurationMs: number) => await asWorker(tx, async (context) => await startLiveWebCall(context, { businessId: demo.businessId, sessionId: `live_${randomUUID()}`, widgetId: PROSPECT_DEMO_WIDGET_ID, billable: true, maxDurationMs, sessionPurpose: "prospect_demo", prospectDemoId: demo.demoId }));
      const finish = async (demo: Demo, callId: string, seconds: number) => await asWorker(tx, async (context) => await finishLiveCall(context, { businessId: demo.businessId, callId, seconds, end: "caller_finished", channel: "web_voice" }));
      const pool = async () => (await asMigrator(tx, async () => await tx.select({ voiceSecondsUsed: partnerUsageMonths.voiceSecondsUsed, voiceSecondsFinal: partnerUsageMonths.voiceSecondsFinal }).from(partnerUsageMonths).where(and(eq(partnerUsageMonths.partnerId, cove.partnerId), eq(partnerUsageMonths.periodKey, periodKeyFor())))))[0];

      // A demo call holds its two minutes of the pool while it runs, and counts the seconds it used once it ends.
      const first = await call(harbor, 120_000);
      expect(await pool()).toEqual({ voiceSecondsUsed: 120, voiceSecondsFinal: 0 });
      await finish(harbor, first.callId, 90);
      expect(await pool()).toEqual({ voiceSecondsUsed: 90, voiceSecondsFinal: 90 });
      // Pier's demo asks for the longest call and gets what the pool has left, which leaves Harbor's none while it runs.
      const long = await call(pier, 1_800_000);
      expect(long.maxDurationMs).toBe(1_710_000);
      expect(await refusal(call(harbor, 120_000))).toMatchObject({ status: 402, code: "voice_limit_reached" });
      await finish(pier, long.callId, 60);
      expect(await pool()).toEqual({ voiceSecondsUsed: 150, voiceSecondsFinal: 150 });

      // With room for one open call across the partner's businesses, Pier's open demo call keeps Harbor's from starting, though the pool has minutes left.
      vi.stubEnv("PARTNER_MAX_SIMULTANEOUS_CALLS", "1");
      const open = await call(pier, 120_000);
      expect(await refusal(call(harbor, 120_000))).toMatchObject({ status: 402, code: "voice_limit_reached" });
      await finish(pier, open.callId, 30);
      expect(await call(harbor, 120_000)).toMatchObject({ maxDurationMs: 120_000 });
    });
  });

  it("leaves the settings a demo writes for itself out of a template saved from it", async () => {
    await rollbackTest(async (tx) => {
      await tx.execute(sql`set local role lobbystack_app`);
      const bright = await partner(tx, "Bright Desk");
      const demo = await createPartnerDemo(bright.context, bright.memberActor, demoInput("Harbor Dental"));
      const template = await exportBusinessTemplate(bright.context, bright.ownerActor, demo.businessId);
      expect(template.receptionist).toMatchObject({ tone: "professional and friendly", transfer_mode: "on_request" });
      for (const field of ["booking_policy", "voice_instructions", "sms_instructions"]) expect(template.receptionist).not.toHaveProperty(field);
      expect(template.business).not.toHaveProperty("website_url");
    });
  });

  it("deletes a closed demo nobody claimed with its business, for owners and admins only", async () => {
    await rollbackTest(async (tx) => {
      await tx.execute(sql`set local role lobbystack_app`);
      // Every suite signs Acme up before Bright, so parallel suites wait on each other's partners instead of deadlocking.
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const [prospect] = await people(tx, 1);
      const open = await createPartnerDemo(bright.context, bright.memberActor, demoInput("Harbor Dental"));
      const closed = await createPartnerDemo(bright.context, bright.memberActor, demoInput("Pier Dental"));
      const claimed = await createPartnerDemo(bright.context, bright.memberActor, demoInput("Beacon Vets"));
      await revokePartnerDemo(bright.context, bright.memberActor, { demoId: closed.demoId });
      await publish(tx, claimed.demoId);
      await claimProspectDemo(bright.context, { userId: prospect!.userId, token: claimed.token, brand: bright.brand });

      expect(await refusal(deletePartnerDemo(bright.context, bright.memberActor, { demoId: closed.demoId }))).toMatchObject({ status: 403 });
      expect(await refusal(deletePartnerDemo(acme.context, acme.ownerActor, { demoId: closed.demoId }))).toMatchObject(notFound);
      expect(await refusal(deletePartnerDemo(bright.context, bright.ownerActor, { demoId: open.demoId }))).toMatchObject({ status: 409, code: "demo_open" });
      // A claimed demo is one of the partner's businesses, which the Businesses page deletes.
      expect(await refusal(deletePartnerDemo(bright.context, bright.ownerActor, { demoId: claimed.demoId }))).toMatchObject({ status: 409, code: "demo_claimed" });

      // The demo's number and stored file go as a deleted business's do.
      const line = { e164: `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`, providerPhoneId: `PN${randomUUID().replaceAll("-", "")}` };
      const objectKey = `${closed.businessId}/knowledge/${randomUUID()}/menu.pdf`;
      const [number] = await asMigrator(tx, async () => {
        await tx.insert(storageObjects).values({ businessId: closed.businessId, objectKey, purpose: "knowledge", fileName: "menu.pdf", contentType: "application/pdf", status: "ready" });
        return await tx.insert(phoneNumbers).values({ businessId: closed.businessId, ...line, status: "active" }).returning({ id: phoneNumbers.id });
      });

      await deletePartnerDemo(bright.context, bright.ownerActor, { demoId: closed.demoId });
      expect((await listPartnerDemos(bright.context, bright.ownerActor)).map((row) => row.demoId).sort()).toEqual([open.demoId, claimed.demoId].sort());
      const gone = async (businessId: string) => (await asMigrator(tx, async () => await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, businessId)))).length === 0;
      expect(await gone(closed.businessId)).toBe(true);
      const queued = await asMigrator(tx, async () => ({
        released: await tx.select({ businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "phoneNumber.releaseDeleted"), eq(outboxMessages.aggregateId, number!.id))),
        stored: await tx.select({ businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "privacy.deleteStoredObjects"), eq(outboxMessages.aggregateId, closed.businessId))),
      }));
      expect(queued).toEqual({ released: [{ businessId: null, payload: line }], stored: [{ businessId: null, payload: { objectKeys: [objectKey] } }] });

      // One past its expiry is closed too, before the hourly sweep turns it off.
      await asMigrator(tx, async () => await tx.update(prospectDemos).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(prospectDemos.id, open.demoId)));
      await deletePartnerDemo(bright.context, bright.ownerActor, { demoId: open.demoId });
      expect(await gone(open.businessId)).toBe(true);
      expect((await listPartnerDemos(bright.context, bright.ownerActor)).map((row) => row.demoId)).toEqual([claimed.demoId]);
    });
  });
});
