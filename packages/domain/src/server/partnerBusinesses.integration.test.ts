import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { affiliateAttributions, affiliateProfiles, auditLogs, billingAccounts, businesses, businessInvitations, businessMemberships, createDatabaseClient, numberTrials, numberWaitlist, outboxMessages, phoneNumbers, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { billedOutsideEntitlement, type PartnerAccessLevel } from "@lobbystack/shared";

import { attributeBusiness } from "./affiliates";
import { createBillingCheckoutRequestInTransaction, setOverageSpendingCap } from "./billing";
import { brandForEmail, forgetCachedBrands } from "./brands";
import { capabilityNames, HOST_BRAND_SCOPE, requireBusinessAccess, type BrandScope, type Capability } from "./businessAccess";
import { loadEntitlement } from "./entitlement";
import { listGrantableBusinesses } from "./oauth/grants";
import { advanceOnboardingStage, getActiveOnboardingState, queueOnboardingFollowupEmail, scheduleOnboardingFollowupInTransaction } from "./onboarding";
import { getNumberTrialState, joinNumberWaitlist, loadNumberReleaseEmail, loadNumberTrialEmail, queuePlanCancelNoticeInTransaction, sweepNumberReleases, sweepNumberTrial } from "./numberTrials";
import { recordPartnerTierBilling } from "./partnerNumbers";
import { searchBusinessNumberInventory, skipOnboardingNumber } from "./phoneNumbers";
import { checkOnboardingPhoneVerificationCode, startOnboardingPhoneVerification } from "./phoneVerification";
import { acceptPartnerInvitation, createPartnerBusiness, hashPartnerToken, invitePartnerMember, listPartnerBusinesses, signUpPartner, type PartnerMemberActor } from "./partners";
import { createApiKey } from "./publicApi/apiKeys";
import { createClaimLinkForApi, type PlatformKeyCaller } from "./publicApi/operations";
import { createWebhookEndpoint } from "./publicApi/webhooks";
import { acceptInvitation, createBusiness, listUserBusinesses, readActiveBusinessId, readBusinessCapabilities, switchWorkspace } from "./tenancy";
import { readVoiceSecondsLeftInTransaction } from "./usage";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner business integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  // The cloud keeps signup invite-only by default.
  vi.stubEnv("PARTNER_SIGNUP", "open");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("MARKETING_HOSTS", "");
  vi.stubEnv("EMAIL_FROM", "Front Desk <no-reply@desk.example.test>");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
});

/**
 * partner_tier_billing holds one row, and each test writes it in a transaction
 * it rolls back, so suites running at once wait on each other's row. Every
 * test that writes it takes this lock first, before it holds anything another
 * suite could wait on, so those waits never deadlock.
 */
async function lockTierBilling(tx: DatabaseTransaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('test:partner_tier_billing', 0))`);
}

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

/**
 * Runs as the worker role, as the worker and the v1 API do, then goes back to
 * the app role. Security-definer functions trust session_user, so this
 * switches it rather than the current role.
 */
async function asWorker<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`reset session authorization`);
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/**
 * Runs as the app's own session, as the admin does. The phone verification
 * functions trust session_user, so this switches it rather than the role.
 */
async function asAppSession<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_app`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`reset session authorization`);
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** Twilio Verify and Lookup, approving every code. */
const approvingVerify = { lookupLineType: async () => "mobile", sendCode: async () => ({ sid: "VE-test" }), checkCode: async () => "approved" };

/** A refusal's error, or the database error a refused statement raised. */
async function refusal(promise: Promise<unknown>): Promise<{ status?: number; code?: string; message?: string }> {
  return await promise.then(() => ({}), (error: { cause?: { code?: string; message?: string } } & Record<string, unknown>) => (error.cause?.code ? error.cause : error) as { status?: number; code?: string; message?: string });
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
  return { context, partnerId, subdomain, owner: owner!, ownerActor, memberActor, brand: { kind: "partner", partnerId } satisfies BrandScope };
}

/** The link token in the email queued for an invitation. */
async function linkToken(tx: DatabaseTransaction, invitationId: string): Promise<string> {
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** A random Toronto number, so tests running at once never share one. */
const testNumber = () => `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;

// The onboarding stages each kind of business's owner goes through.
const DIRECT_STEPS = ["create_business", "website", "knowledge", "greeting", "test_call", "verify_phone", "phone_number", "attribution"];
const PARTNER_STEPS = ["website", "knowledge", "greeting", "test_call", "verify_phone"];

/** A business the partner created for this person, who accepted the invitation and owns it. */
async function ownedPartnerBusiness(tx: DatabaseTransaction, input: { actor: PartnerMemberActor; owner: Person; name: string; accessLevel?: PartnerAccessLevel }): Promise<string> {
  const context = { db: tx as unknown as Database };
  const { businessId, invitationId } = await createPartnerBusiness(context, input.actor, { name: input.name, timezone: "America/Toronto", businessType: "dental", accessLevel: input.accessLevel ?? "full", ownerEmail: input.owner.email });
  await acceptInvitation(context, { userId: input.owner.userId, tokenHash: hash(await linkToken(tx, invitationId)), email: input.owner.email, emailVerified: true });
  return businessId;
}

/** The person's access to a business, read on a brand's domain in the business's own transaction. */
async function access(tx: DatabaseTransaction, input: { userId: string; businessId: string; brand: BrandScope; capability?: Capability; minimumRole?: "business_admin" }) {
  return await withBusinessTransaction(tx as unknown as Database, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (inner) => await requireBusinessAccess(inner, input));
}

describe.skipIf(!client)("creating a partner's business", () => {
  it("creates it with no owner, linked to the partner, and invites the owner under the partner's brand without a claim link", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [client] = await people(tx, 1);
      const created = await createPartnerBusiness(acme.context, acme.ownerActor, { name: "  Harbor   Dental ", timezone: "america/halifax", businessType: "dental", accessLevel: "activity", ownerEmail: ` ${client!.email.toUpperCase()} ` });
      expect(created).toEqual({ businessId: expect.any(String), invitationId: expect.any(String), expiresAt: expect.any(Date) });

      const stored = await asMigrator(tx, async () => ({
        business: (await tx.select({ name: businesses.name, timezone: businesses.timezone, partnerId: businesses.partnerId, accessLevel: businesses.partnerAccessLevel, onboardingStage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, created.businessId)))[0],
        memberships: await tx.select({ userId: businessMemberships.userId }).from(businessMemberships).where(eq(businessMemberships.businessId, created.businessId)),
        invitations: await tx.select({ email: businessInvitations.email, role: businessInvitations.role, transfersOwnership: businessInvitations.transfersOwnership, invitedByUserId: businessInvitations.invitedByUserId }).from(businessInvitations).where(eq(businessInvitations.businessId, created.businessId)),
        email: (await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, created.invitationId), eq(outboxMessages.topic, "email.send"))))[0]?.payload,
        audit: await tx.select({ eventType: auditLogs.eventType, actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(eq(auditLogs.businessId, created.businessId)),
      }));
      // At the activity level the partner sets the receptionist up, so the owner's onboarding starts at their phone.
      expect(stored.business).toEqual({ name: "Harbor Dental", timezone: "America/Halifax", partnerId: acme.partnerId, accessLevel: "activity", onboardingStage: "verify_phone" });
      expect(stored.memberships).toEqual([]);
      expect(stored.invitations).toEqual([{ email: client!.email, role: "business_owner", transfersOwnership: false, invitedByUserId: acme.owner.userId }]);
      expect(stored.audit).toEqual([{ eventType: "partner.business_created", actorUserId: acme.owner.userId, payload: { partnerId: acme.partnerId, accessLevel: "activity", packageId: null, ownerInvitationId: created.invitationId } }]);
      // The worker reads the business's brand when it sends, which is the partner's, and puts the link on the partner's domain.
      expect(stored.email).toMatchObject({ template: "invitation", email: client!.email, brand: { kind: "business", businessId: created.businessId } });
      expect(await brandForEmail(acme.context, stored.email!.brand as { kind: "business"; businessId: string })).toMatchObject({ kind: "partner", partnerId: acme.partnerId, name: "Acme Reception", origin: "https://acme-reception.portal.example.test" });

      // Anyone on the partner's team sees it in the console, with its owner still invited. Only owners and admins see how it's billed.
      const listed = { businessId: created.businessId, name: "Harbor Dental", accessLevel: "activity", onboardingStage: "verify_phone", createdAt: expect.stringMatching(/Z$/), owner: { email: client!.email, status: "invited", expiresAt: created.expiresAt.toISOString() }, usage: { periodKey: new Date().toISOString().slice(0, 7), voiceSeconds: 0, chats: 0 } };
      expect(await listPartnerBusinesses(acme.context, acme.ownerActor)).toEqual([{ ...listed, billing: { kind: "outside" } }]);
      expect(await listPartnerBusinesses(acme.context, acme.memberActor)).toEqual([{ ...listed, billing: null }]);
      // The partner's people aren't on its team, so it isn't one of their own businesses anywhere.
      expect(await listUserBusinesses(acme.context.db, acme.owner.userId, acme.brand)).toEqual([]);
    });
  });

  it("lets only the partner's owners and admins create one, with a valid owner and access level, once the partner has a domain", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const valid = { name: "Harbor Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@example.invalid" };
      await expect(createPartnerBusiness(acme.context, acme.memberActor, valid)).rejects.toMatchObject({ status: 403 });
      // A partner's platform key creates businesses as the partner; partnerPlatformKeys.integration.test.ts covers it.
      await expect(createPartnerBusiness(acme.context, acme.ownerActor, { ...valid, accessLevel: "admin" })).rejects.toMatchObject({ status: 400, code: "invalid_access_level" });
      await expect(createPartnerBusiness(acme.context, acme.ownerActor, { ...valid, ownerEmail: "a@example.invalid, b@example.invalid" })).rejects.toMatchObject({ status: 400, code: "invalid_email" });
      await expect(createPartnerBusiness(acme.context, acme.ownerActor, { ...valid, timezone: "+05:00" })).rejects.toMatchObject({ status: 400, code: "invalid_timezone" });
      await expect(createPartnerBusiness(acme.context, acme.ownerActor, { ...valid, name: "   " })).rejects.toMatchObject({ status: 400, code: "invalid_name" });
      expect(await listPartnerBusinesses(acme.context, acme.ownerActor)).toEqual([]);

      // Without a partner base domain its businesses would open nowhere, so none is made.
      vi.stubEnv("PARTNER_BASE_DOMAIN", "");
      const solo = await partner(tx, "Solo Desk");
      await expect(createPartnerBusiness(solo.context, solo.ownerActor, valid)).rejects.toMatchObject({ status: 409, code: "partner_domain_required" });
      // Once the deployment has one, the partner gets its subdomain and can create businesses.
      vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
      const { businessId } = await createPartnerBusiness(solo.context, solo.ownerActor, valid);
      expect((await listPartnerBusinesses(solo.context, solo.ownerActor)).map((business) => business.businessId)).toEqual([businessId]);
    });
  });

  it("makes the invited owner its owner, opens it on the partner's domain, and lists it there as joined", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [client] = await people(tx, 1);
      const { businessId, invitationId } = await createPartnerBusiness(acme.context, acme.ownerActor, { name: "Harbor Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: client!.email });
      expect(await acceptInvitation(acme.context, { userId: client!.userId, tokenHash: hash(await linkToken(tx, invitationId)), email: client!.email, emailVerified: true })).toEqual({ businessId, role: "business_owner", partnerId: acme.partnerId });

      expect((await listPartnerBusinesses(acme.context, acme.ownerActor))[0]?.owner).toEqual({ email: client!.email, status: "joined" });
      expect(await listUserBusinesses(acme.context.db, client!.userId, acme.brand)).toEqual([expect.objectContaining({ businessId, role: "business_owner", active: true, partnerAccessLevel: "full", capabilities: ["activity", "setup", "team"] })]);
      expect(await readActiveBusinessId(acme.context.db, { userId: client!.userId, brand: acme.brand })).toBe(businessId);
      expect(await getActiveOnboardingState(acme.context.db, client!.userId, acme.brand)).toEqual({ businessId, stage: "website", steps: PARTNER_STEPS });
      // The host's domain doesn't show it: there the owner has no business yet.
      expect(await listUserBusinesses(acme.context.db, client!.userId, HOST_BRAND_SCOPE)).toEqual([]);
      expect(await readActiveBusinessId(acme.context.db, { userId: client!.userId, brand: HOST_BRAND_SCOPE })).toBeNull();
      expect(await getActiveOnboardingState(acme.context.db, client!.userId, HOST_BRAND_SCOPE)).toEqual({ businessId: null, stage: "create_business", steps: DIRECT_STEPS });
    });
  });
});

describe.skipIf(!client)("businesses on each brand's domains", () => {
  it("lists and opens each brand's businesses only on its own domains, and remembers the active business per brand", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const [person] = await people(tx, 1);
      const context = acme.context;
      const { businessId: direct } = await createBusiness(context, { userId: person!.userId, name: "Corner Shop", timezone: "UTC", businessType: "test" });
      const harbor = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: person!, name: "Harbor Dental" });
      const pier = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: person!, name: "Pier Clinic" });
      const studio = await ownedPartnerBusiness(tx, { actor: bright.ownerActor, owner: person!, name: "Studio North" });

      const listed = async (brand: BrandScope) => (await listUserBusinesses(context.db, person!.userId, brand)).map((business) => [business.name, business.active]);
      expect(await listed(HOST_BRAND_SCOPE)).toEqual([["Corner Shop", true]]);
      expect(await listed(acme.brand)).toEqual([["Harbor Dental", false], ["Pier Clinic", true]]);
      expect(await listed(bright.brand)).toEqual([["Studio North", true]]);

      // A business of another brand can't be opened, and the refusal says no more than for one the person isn't on.
      const notHere = { status: 403, code: "forbidden", message: "You do not have access to this business." };
      await expect(switchWorkspace(context, { userId: person!.userId, businessId: harbor, brand: HOST_BRAND_SCOPE })).rejects.toMatchObject(notHere);
      await expect(switchWorkspace(context, { userId: person!.userId, businessId: direct, brand: acme.brand })).rejects.toMatchObject(notHere);
      await expect(switchWorkspace(context, { userId: person!.userId, businessId: studio, brand: acme.brand })).rejects.toMatchObject(notHere);
      await expect(access(tx, { userId: person!.userId, businessId: harbor, brand: bright.brand })).rejects.toMatchObject(notHere);
      await expect(access(tx, { userId: person!.userId, businessId: studio, brand: HOST_BRAND_SCOPE })).rejects.toMatchObject(notHere);

      // Opening one on its own brand's domain leaves every other brand's choice alone.
      await switchWorkspace(context, { userId: person!.userId, businessId: harbor, brand: acme.brand });
      expect(await listed(acme.brand)).toEqual([["Harbor Dental", true], ["Pier Clinic", false]]);
      expect(await readActiveBusinessId(context.db, { userId: person!.userId, brand: HOST_BRAND_SCOPE })).toBe(direct);
      expect(await readActiveBusinessId(context.db, { userId: person!.userId, brand: bright.brand })).toBe(studio);
      expect(await getActiveOnboardingState(context.db, person!.userId, acme.brand)).toEqual({ businessId: harbor, stage: "website", steps: PARTNER_STEPS });
      expect(await getActiveOnboardingState(context.db, person!.userId, HOST_BRAND_SCOPE)).toEqual({ businessId: direct, stage: "website", steps: DIRECT_STEPS });

      // A person can't point their active business on one partner's domains at another partner's business.
      const crossed = await refusal(withBusinessTransaction(context.db, { userId: person!.userId, actorType: "operator" }, async (inner) => await inner.execute(sql`update public.user_active_businesses set business_id = ${studio}::uuid where user_id = ${person!.userId}::uuid and partner_id = ${acme.partnerId}::uuid`)));
      expect(crossed).toMatchObject({ code: "42501" });
    });
  });
});

describe.skipIf(!client)("access levels", () => {
  const grants = async (tx: DatabaseTransaction, input: { userId: string; businessId: string; brand: BrandScope }) => {
    const found = await access(tx, input);
    return capabilityNames.filter((capability) => found.can(capability));
  };

  it("gives full access today's owner and admin work minus billing, API keys and MCP, and activity only just the activity, on the server", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [owner] = await people(tx, 1);
      const context = acme.context;
      const { businessId: direct } = await createBusiness(context, { userId: owner!.userId, name: "Corner Shop", timezone: "UTC", businessType: "test" });
      const full = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: owner!, name: "Harbor Dental", accessLevel: "full" });
      const activity = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: owner!, name: "Pier Clinic", accessLevel: "activity" });

      expect(await grants(tx, { userId: owner!.userId, businessId: direct, brand: HOST_BRAND_SCOPE })).toEqual(["activity", "setup", "team", "billing", "api_keys", "mcp"]);
      expect(await grants(tx, { userId: owner!.userId, businessId: full, brand: acme.brand })).toEqual(["activity", "setup", "team"]);
      expect(await grants(tx, { userId: owner!.userId, businessId: activity, brand: acme.brand })).toEqual(["activity"]);
      expect(await access(tx, { userId: owner!.userId, businessId: activity, brand: acme.brand })).toMatchObject({ via: "membership", role: "business_owner", partnerId: acme.partnerId, accessLevel: "activity" });
      expect(await access(tx, { userId: owner!.userId, businessId: direct, brand: HOST_BRAND_SCOPE })).toMatchObject({ partnerId: null, accessLevel: null });
      // The workspace list tells the dashboard what to hide.
      const listed = async (brand: BrandScope) => (await listUserBusinesses(context.db, owner!.userId, brand)).map(({ name, partnerAccessLevel, capabilities }) => ({ name, partnerAccessLevel, capabilities }));
      expect(await listed(HOST_BRAND_SCOPE)).toEqual([{ name: "Corner Shop", partnerAccessLevel: null, capabilities: ["activity", "setup", "team", "billing", "api_keys", "mcp"] }]);
      expect(await listed(acme.brand)).toEqual([{ name: "Harbor Dental", partnerAccessLevel: "full", capabilities: ["activity", "setup", "team"] }, { name: "Pier Clinic", partnerAccessLevel: "activity", capabilities: ["activity"] }]);
      // The dashboard reads the same from the business itself when the list leaves it out.
      expect(await readBusinessCapabilities(context.db, { userId: owner!.userId, businessId: activity })).toEqual(["activity"]);
      expect(await readBusinessCapabilities(context.db, { userId: owner!.userId, businessId: direct })).toEqual(["activity", "setup", "team", "billing", "api_keys", "mcp"]);

      const outside = { status: 403, message: "You can't do that in this business." };
      await expect(access(tx, { userId: owner!.userId, businessId: activity, brand: acme.brand, capability: "activity" })).resolves.toBeDefined();
      for (const capability of ["setup", "team", "billing", "api_keys", "mcp"] as const) {
        await expect(access(tx, { userId: owner!.userId, businessId: activity, brand: acme.brand, capability })).rejects.toMatchObject(outside);
      }
      await expect(access(tx, { userId: owner!.userId, businessId: full, brand: acme.brand, capability: "setup", minimumRole: "business_admin" })).resolves.toBeDefined();
      for (const capability of ["billing", "api_keys", "mcp"] as const) {
        await expect(access(tx, { userId: owner!.userId, businessId: full, brand: acme.brand, capability })).rejects.toMatchObject(outside);
      }

      // The operations themselves refuse a partner's business, whatever brand asked.
      await expect(createApiKey(context, { userId: owner!.userId, businessId: full, name: "CRM", scopes: ["calls:read"] })).rejects.toMatchObject(outside);
      const checkout = (businessId: string) => withBusinessTransaction(context.db, { userId: owner!.userId, businessId, actorType: "operator" }, async (inner) => await createBillingCheckoutRequestInTransaction(inner, { userId: owner!.userId, businessId, target: "starter", billingInterval: "monthly" }));
      await expect(checkout(full)).rejects.toMatchObject(outside);
      await expect(checkout(direct)).resolves.toEqual(expect.any(String));
      await expect(createWebhookEndpoint(context, { businessId: full, manager: { kind: "operator", userId: owner!.userId }, url: "https://hooks.example.com/lobbystack", events: ["call.completed"] })).rejects.toMatchObject(outside);
      await expect(setOverageSpendingCap(context, { userId: owner!.userId, businessId: full, capCents: 5_000 })).rejects.toMatchObject(outside);
      // MCP's consent screen offers only direct businesses.
      expect((await listGrantableBusinesses(context.db, owner!.userId)).map((business) => business.businessId)).toEqual([direct]);
    });
  });

  it("keeps a business's own operators from raising its access level, which only the system actor changes", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [owner] = await people(tx, 1);
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: owner!, name: "Pier Clinic", accessLevel: "activity" });
      const raise = (actorType: "operator" | "system") => withBusinessTransaction(acme.context.db, { userId: owner!.userId, businessId, actorType }, async (inner) => await inner.update(businesses).set({ partnerAccessLevel: "full" }).where(eq(businesses.id, businessId)));
      expect(await refusal(raise("operator"))).toMatchObject({ code: "42501", message: "partner_access_level_locked" });
      await expect(raise("system")).resolves.toBeDefined();
      expect(await grants(tx, { userId: owner!.userId, businessId, brand: acme.brand })).toEqual(["activity", "setup", "team"]);
    });
  });

  it("keeps its own operators from taking it away from its partner, which only the system actor does", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const [owner] = await people(tx, 1);
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: owner!, name: "Pier Clinic", accessLevel: "activity" });
      const move = (actorType: "operator" | "system", partnerId: string | null) => withBusinessTransaction(acme.context.db, { userId: owner!.userId, businessId, actorType }, async (inner) => await inner.update(businesses).set({ partnerId }).where(eq(businesses.id, businessId)));
      // Clearing its partner would make it direct, with billing, API keys and MCP.
      expect(await refusal(move("operator", null))).toMatchObject({ code: "42501", message: "business_partner_locked" });
      expect(await refusal(move("operator", bright.partnerId))).toMatchObject({ code: "42501", message: "business_partner_locked" });
      expect(await grants(tx, { userId: owner!.userId, businessId, brand: acme.brand })).toEqual(["activity"]);
      // Releasing the business to its owner will run as the system actor.
      await expect(move("system", null)).resolves.toBeDefined();
      expect(await grants(tx, { userId: owner!.userId, businessId, brand: HOST_BRAND_SCOPE })).toEqual(["activity", "setup", "team", "billing", "api_keys", "mcp"]);
    });
  });
});

describe.skipIf(!client)("claim links", () => {
  it("refuses a claim link for a partner's business, from the API and when one is accepted", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [owner, claimant] = await people(tx, 2);
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: owner!, name: "Harbor Dental" });
      const caller: PlatformKeyCaller = { businessId, platformKeyId: randomUUID(), groupId: "lobbystack", actingUserId: owner!.userId, actor: "platform_key" };
      await expect(asWorker(tx, () => createClaimLinkForApi(acme.context, caller, { email: claimant!.email }, { userId: owner!.userId }))).rejects.toMatchObject({ status: 409, code: "conflict", message: "You can't claim a partner's business. Its partner can release it to its owner." });

      // A claim link made some other way still hands nothing over.
      const token = randomUUID();
      await asMigrator(tx, async () => await tx.insert(businessInvitations).values({ businessId, invitedByUserId: owner!.userId, email: claimant!.email, normalizedEmail: claimant!.email, role: "business_owner", tokenHash: hash(token), expiresAt: new Date(Date.now() + 3_600_000), transfersOwnership: true }));
      await expect(acceptInvitation(acme.context, { userId: claimant!.userId, tokenHash: hash(token), email: claimant!.email, emailVerified: true })).rejects.toMatchObject({ status: 409, code: "partner_business_not_claimable" });
      const team = await asMigrator(tx, async () => await tx.select({ userId: businessMemberships.userId, status: businessMemberships.status }).from(businessMemberships).where(eq(businessMemberships.businessId, businessId)));
      expect(team).toEqual([{ userId: owner!.userId, status: "active" }]);
    });
  });
});

describe.skipIf(!client)("billing a partner's business", () => {
  it("bills it outside LobbyStack with no usage limit, and gives it a live entitlement in SQL too", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [owner] = await people(tx, 1);
      const { businessId: direct } = await createBusiness(acme.context, { userId: owner!.userId, name: "Corner Shop", timezone: "UTC", businessType: "test" });
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: owner!, name: "Harbor Dental" });
      const inBusiness = <T>(id: string, run: (inner: DatabaseTransaction) => Promise<T>) => withBusinessTransaction(acme.context.db, { userId: owner!.userId, businessId: id, actorType: "operator" }, run);
      expect(await inBusiness(businessId, (inner) => loadEntitlement(inner, businessId))).toEqual(billedOutsideEntitlement(acme.partnerId));
      expect(await inBusiness(businessId, (inner) => loadEntitlement(inner, businessId))).toMatchObject({ live: true, source: "billed_outside", allowance: { voiceSeconds: null, chats: null, alertSms: null, outboundAttempts: null }, overage: { enabled: false }, poolPartnerId: acme.partnerId });
      // Calls read what's left as the worker does, which can reach the partner's pool. The host set no pool, so nothing limits it.
      expect((await asWorker(tx, async () => await withBusinessTransaction(acme.context.db, { businessId, actorType: "worker" }, (inner) => readVoiceSecondsLeftInTransaction(inner, { businessId })))).seconds).toBe(Number.POSITIVE_INFINITY);
      expect(await inBusiness(direct, (inner) => loadEntitlement(inner, direct))).toMatchObject({ live: false, source: "plan", allowance: { voiceSeconds: 1_800 } });
      const live = async (id: string) => (await asMigrator(tx, async () => await tx.execute<{ live: boolean }>(sql`select app.has_live_entitlement(${id}::uuid) as live`))).rows[0]?.live;
      expect(await live(businessId)).toBe(true);
      expect(await live(direct)).toBe(false);
    });
  });
});

describe.skipIf(!client)("phone numbers for a partner's business", () => {
  it("on a deployment that bills tiers, buys it no number while its partner's tier includes none, from the number search, the dashboard's claim and the API's", async () => {
    await rollbackTest(async (tx) => {
      await lockTierBilling(tx);
      await asWorker(tx, async () => await recordPartnerTierBilling({ db: tx as unknown as Database }, { enabled: true }));
      const acme = await partner(tx, "Acme Reception");
      const [owner] = await people(tx, 1);
      const context = acme.context;
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: owner!, name: "Harbor Dental" });
      const { businessId: direct } = await createBusiness(context, { userId: owner!.userId, name: "Corner Shop", timezone: "America/Toronto", businessType: "test" });
      await asMigrator(tx, async () => {
        await tx.update(businesses).set({ onboardingStage: "complete" }).where(sql`${businesses.id} in (${businessId}::uuid, ${direct}::uuid)`);
        await tx.insert(billingAccounts).values({ businessId: direct, billingKey: `business:${direct}`, plan: "starter", subscriptionState: "active" });
      });
      const inventory = { listAvailablePhoneNumbers: vi.fn(async () => [{ phoneE164: testNumber(), countryCode: "CA", capabilities: { sms: true, voice: true } }]) };

      // The search offers only the partner's trial number, which needs the owner's verified mobile, so it refuses before it offers one.
      expect(await refusal(searchBusinessNumberInventory(context, { userId: owner!.userId, businessId, claimTokenSecret: "test-secret" }, inventory))).toMatchObject({ status: 409, code: "phone_verification_required" });
      expect(inventory.listAvailablePhoneNumbers).not.toHaveBeenCalled();

      // Its partner is on Free, which includes no number. A claim refuses whichever way it comes, while a direct business on Starter still gets its number.
      const claim = (id: string) => asAppSession(tx, async () => await withBusinessTransaction(context.db, { userId: owner!.userId, businessId: id, actorType: "operator" }, async (inner) => (await inner.execute<{ id: string }>(sql`select app.reserve_onboarding_number_claim(${id}::uuid, ${owner!.userId}::uuid, ${testNumber()}, '{}'::jsonb, ${randomUUID()}, ${randomUUID()}) as id`)).rows[0]?.id));
      expect(await refusal(claim(businessId))).toMatchObject({ code: "P0001", message: "partner_number_limit_reached" });
      await expect(claim(direct)).resolves.toEqual(expect.any(String));
      const apiClaim = asWorker(tx, async () => await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (inner) => await inner.execute(sql`select app.reserve_api_number_claim(${businessId}::uuid, ${owner!.userId}::uuid, 'onboarding', null, ${testNumber()}, '{}'::jsonb, ${randomUUID()}, ${randomUUID()}, null, true)`)));
      expect(await refusal(apiClaim)).toMatchObject({ code: "P0001", message: "partner_number_limit_reached" });
      // The partner's trial number needs the owner's verified mobile too, whatever the business's own entitlement.
      const trialClaim = asAppSession(tx, async () => await withBusinessTransaction(context.db, { userId: owner!.userId, businessId, actorType: "operator" }, async (inner) => await inner.execute(sql`select app.reserve_trial_number_claim(${businessId}::uuid, ${owner!.userId}::uuid, ${testNumber()}, '{}'::jsonb, ${randomUUID()}, ${randomUUID()}, null)`)));
      expect(await refusal(trialClaim)).toMatchObject({ code: "P0001", message: "phone_verification_required" });
    });
  });
});

describe.skipIf(!client)("the host's own emails", () => {
  /** The topics queued for a business, read as the migrator. */
  const queued = (tx: DatabaseTransaction, businessId: string) => asMigrator(tx, async () => (await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(eq(outboxMessages.businessId, businessId))).map((row) => row.topic).sort());

  it("never schedules the founder's check-in, or the number trial and release emails, for a partner's business, and never sends one queued anyway", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [owner] = await people(tx, 1);
      const context = acme.context;
      const { businessId: direct } = await createBusiness(context, { userId: owner!.userId, name: "Corner Shop", timezone: "UTC", businessType: "test" });
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: owner!, name: "Harbor Dental" });
      const before = { direct: await queued(tx, direct), partner: await queued(tx, businessId) };

      // Scheduled: the founder's check-in, a plan's cancel notice and the release reminder.
      const now = new Date();
      const numbers = await asMigrator(tx, async () => await tx.insert(phoneNumbers).values([direct, businessId].map((id) => ({ businessId: id, e164: `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`, status: "active" }))).returning({ id: phoneNumbers.id, businessId: phoneNumbers.businessId }));
      const numberOf = (id: string) => numbers.find((number) => number.businessId === id)!.id;
      for (const id of [direct, businessId]) {
        await withBusinessTransaction(context.db, { businessId: id, actorType: "system" }, async (inner) => await scheduleOnboardingFollowupInTransaction(inner, id, now));
      }
      await asWorker(tx, async () => {
        for (const id of [direct, businessId]) await withBusinessTransaction(context.db, { businessId: id, actorType: "worker" }, async (inner) => await queuePlanCancelNoticeInTransaction(inner, { businessId: id, periodEnd: now }));
      });
      // Then the plan ended, and both numbers go in two days.
      await asMigrator(tx, async () => await tx.update(phoneNumbers).set({ reclaimScheduledAt: new Date(now.getTime() + 2 * 86_400_000), reclaimReason: "subscription_ended" }).where(sql`${phoneNumbers.id} in (${sql.join(numbers.map((number) => sql`${number.id}::uuid`), sql`, `)})`));
      await asWorker(tx, async () => {
        expect(await sweepNumberReleases(context, { businessId, now })).toBe(0);
        expect(await sweepNumberReleases(context, { businessId: direct, now })).toBe(1);
      });
      expect((await queued(tx, businessId)).filter((topic) => !before.partner.includes(topic))).toEqual([]);
      expect((await queued(tx, direct)).filter((topic) => !before.direct.includes(topic))).toEqual(["onboarding.sendFollowup", "phoneNumber.releaseEmail", "phoneNumber.releaseEmail"]);

      // Sent: each email's job reads what to send, and gets nothing for a partner's business.
      const trials = await asMigrator(tx, async () => await tx.insert(numberTrials).values([direct, businessId].map((id) => ({ businessId: id, userId: owner!.userId, phoneNumberId: numberOf(id), verifiedPhone: "+14165550100", status: "active", startedAt: new Date(now.getTime() - 13 * 86_400_000), endsAt: new Date(now.getTime() + 86_400_000) }))).returning({ id: numberTrials.id, businessId: numberTrials.businessId }));
      const trialOf = (id: string) => trials.find((trial) => trial.businessId === id)!.id;
      const sender = { from: "Raphael <raphael@desk.example.test>", name: "Raphael" };
      await asWorker(tx, async () => {
        expect(await queueOnboardingFollowupEmail(context, { businessId, completedAt: new Date(now.getTime() - 86_400_000), sender })).toBe(false);
        expect(await loadNumberReleaseEmail(context, { businessId, phoneNumberId: numberOf(businessId) })).toBeNull();
        expect(await loadNumberReleaseEmail(context, { businessId: direct, phoneNumberId: numberOf(direct) })).toMatchObject({ to: owner!.email });
        expect(await loadNumberTrialEmail(context, { businessId, trialId: trialOf(businessId), email: "day13" })).toBeNull();
        expect(await loadNumberTrialEmail(context, { businessId: direct, trialId: trialOf(direct), email: "day13" })).toMatchObject({ to: owner!.email });
        // A trial on a partner's business, which onboarding never gives it, still sends no reminder.
        expect(await sweepNumberTrial(context, { businessId, now })).toEqual({ ended: false, emails: [] });
        expect(await sweepNumberTrial(context, { businessId: direct, now })).toEqual({ ended: false, emails: ["day13"] });
      });
      expect((await queued(tx, businessId)).filter((topic) => !before.partner.includes(topic))).toEqual([]);
    });
  });
});

describe.skipIf(!client)("the owner's onboarding", () => {
  /** Verifies the owner's mobile in the business, as the onboarding phone step does. */
  const verifyPhone = async (tx: DatabaseTransaction, input: { userId: string; businessId: string }) => {
    const context = { db: tx as unknown as Database };
    const phoneE164 = `+1416${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
    return await asAppSession(tx, async () => {
      const { attemptId } = await startOnboardingPhoneVerification(context, { ...input, phoneE164, countryCode: "CA" }, approvingVerify);
      return await checkOnboardingPhoneVerificationCode(context, { ...input, attemptId, code: "123456" }, approvingVerify);
    });
  };
  const followups = (tx: DatabaseTransaction, businessId: string) => asMigrator(tx, async () => await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "onboarding.sendFollowup"))));

  it("at full access, skips creating the business, the number and attribution, and finishes once the owner verifies their phone", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [owner] = await people(tx, 1);
      const context = acme.context;
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: owner!, name: "Harbor Dental", accessLevel: "full" });
      const state = () => getActiveOnboardingState(context.db, owner!.userId, acme.brand);
      expect(await state()).toEqual({ businessId, stage: "website", steps: PARTNER_STEPS });

      // The owner sets up the receptionist as a direct owner would.
      for (const to of ["knowledge", "greeting", "test_call", "verify_phone"] as const) await advanceOnboardingStage(context, { userId: owner!.userId, businessId, to });
      expect((await state()).stage).toBe("verify_phone");
      // The partner gives it numbers, so there's no number step and no trial to offer.
      await expect(advanceOnboardingStage(context, { userId: owner!.userId, businessId, to: "phone_number" })).rejects.toThrow("Invalid onboarding transition from verify_phone to phone_number.");
      expect(await getNumberTrialState(context, { userId: owner!.userId, businessId })).toEqual({ status: "none" });

      // Calls forward to the owner's phone, so they still verify it, and that finishes onboarding.
      expect(await verifyPhone(tx, { userId: owner!.userId, businessId })).toMatchObject({ approved: true });
      expect(await state()).toEqual({ businessId, stage: "complete", steps: PARTNER_STEPS });
      // Finishing without attribution schedules no founder's check-in either.
      expect(await followups(tx, businessId)).toEqual([]);
    });
  });

  it("at activity only, starts at the owner's phone, and finishes there when the phone can't be verified", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [owner, other] = await people(tx, 2);
      const context = acme.context;
      const verified = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: owner!, name: "Harbor Dental", accessLevel: "activity" });
      expect(await getActiveOnboardingState(context.db, owner!.userId, acme.brand)).toEqual({ businessId: verified, stage: "verify_phone", steps: ["verify_phone"] });
      expect(await verifyPhone(tx, { userId: owner!.userId, businessId: verified })).toMatchObject({ approved: true });
      expect((await getActiveOnboardingState(context.db, owner!.userId, acme.brand)).stage).toBe("complete");

      // In a country without numbers, or on a server that verifies no phones, the owner finishes without one.
      const skipped = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: other!, name: "Pier Clinic", accessLevel: "activity" });
      await advanceOnboardingStage(context, { userId: other!.userId, businessId: skipped, to: "complete" });
      expect((await getActiveOnboardingState(context.db, other!.userId, acme.brand)).stage).toBe("complete");
      expect(await followups(tx, skipped)).toEqual([]);
    });
  });

  it("keeps its owner off the host's number waitlist, number skip and affiliate attribution, which only a direct business's onboarding has", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const [owner, affiliate] = await people(tx, 2);
      const context = acme.context;
      const businessId = await ownedPartnerBusiness(tx, { actor: acme.ownerActor, owner: owner!, name: "Pier Clinic", accessLevel: "activity" });
      const { businessId: direct } = await createBusiness(context, { userId: owner!.userId, name: "Corner Shop", timezone: "UTC", businessType: "test" });

      // The waitlist is who the host tells when numbers reach a country.
      await expect(joinNumberWaitlist(context, { userId: owner!.userId, businessId, countryCode: "FR" })).rejects.toMatchObject({ status: 409, code: "partner_business" });
      await joinNumberWaitlist(context, { userId: owner!.userId, businessId: direct, countryCode: "FR" });
      const waitlisted = await asMigrator(tx, async () => (await tx.select({ businessId: numberWaitlist.businessId }).from(numberWaitlist).where(eq(numberWaitlist.userId, owner!.userId))).map((row) => row.businessId));
      expect(waitlisted).toEqual([direct]);

      // Skipping the number would lead a direct business to attribution, which a partner's business doesn't have.
      await expect(skipOnboardingNumber(context, { userId: owner!.userId, businessId })).rejects.toMatchObject({ status: 409, code: "invalid_onboarding_stage" });
      expect((await getActiveOnboardingState(context.db, owner!.userId, acme.brand)).stage).toBe("verify_phone");

      // The host's affiliates refer only the host's own businesses.
      await asMigrator(tx, async () => await tx.insert(affiliateProfiles).values({ userId: affiliate!.userId, referralCode: `partner-test-${affiliate!.userId.slice(0, 8)}` }));
      const referralCode = `partner-test-${affiliate!.userId.slice(0, 8)}`;
      expect(await attributeBusiness(context, { businessId, referredUserId: owner!.userId, referralCode, source: "referral_link" })).toBeNull();
      expect(await attributeBusiness(context, { businessId: direct, referredUserId: owner!.userId, referralCode, source: "referral_link" })).toEqual(expect.any(String));
      const attributed = await asMigrator(tx, async () => (await tx.select({ businessId: affiliateAttributions.businessId }).from(affiliateAttributions).where(eq(affiliateAttributions.referredUserId, owner!.userId))).map((row) => row.businessId));
      expect(attributed).toEqual([direct]);
    });
  });

  it("keeps a direct business's onboarding as it was: the phone leads to the number, and only attribution finishes it", async () => {
    await rollbackTest(async (tx) => {
      const [owner] = await people(tx, 1);
      const context = { db: tx as unknown as Database };
      const { businessId } = await createBusiness(context, { userId: owner!.userId, name: "Corner Shop", timezone: "UTC", businessType: "test" });
      for (const to of ["knowledge", "greeting", "test_call", "verify_phone"] as const) await advanceOnboardingStage(context, { userId: owner!.userId, businessId, to });
      await expect(advanceOnboardingStage(context, { userId: owner!.userId, businessId, to: "complete" })).rejects.toMatchObject({ status: 400, code: "invalid_onboarding_stage" });
      expect(await verifyPhone(tx, { userId: owner!.userId, businessId })).toMatchObject({ approved: true });
      expect(await getActiveOnboardingState(context.db, owner!.userId, HOST_BRAND_SCOPE)).toEqual({ businessId, stage: "phone_number", steps: DIRECT_STEPS });
    });
  });
});
