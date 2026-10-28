import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, businesses, createDatabaseClient, outboxMessages, partnerApiIdempotencyKeys, partnerInvitations, partnerMembers, prospectDemos, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { FakeStripeConnect } from "@lobbystack/providers/stripe/fakeStripeConnect";
import type { ApiKeyScope } from "@lobbystack/shared";

import { forgetCachedBrands } from "./brands";
import type { TemplateStorage } from "./businessTemplates";
import type { DomainContext } from "./context";
import { createPartnerBusiness, hashPartnerToken, acceptPartnerInvitation, invitePartnerMember, releaseBusiness, signUpPartner, type PartnerMemberActor } from "./partners";
import { setPartnerBusinessBilling, setPartnerBusinessOverage } from "./packageBilling";
import { recordStripeConnectEvent, startPartnerStripeOnboarding } from "./partnerStripe";
import { createPartnerPlatformKey, revokePartnerPlatformKey } from "./partnerPlatformKeys";
import {
  archivePartnerPackageForApi,
  createPartnerDemoForApi,
  createPartnerPackageForApi,
  createPartnerStripeOnboardingLinkForApi,
  createPartnerTeamInvitationForApi,
  createPartnerTemplateForApi,
  createPartnerTierCheckoutForApi,
  deletePartnerBusinessForApi,
  deletePartnerDemoForApi,
  deletePartnerTemplateForApi,
  getPartnerBillingForApi,
  getPartnerBrandForApi,
  getPartnerBusinessBillingForApi,
  getPartnerDemoForApi,
  getPartnerDomainsForApi,
  getPartnerForApi,
  getPartnerStripeForApi,
  getPartnerTeamForApi,
  getPartnerTierCheckoutForApi,
  listPartnerDemosForApi,
  listPartnerPackagesForApi,
  listPartnerTemplatesForApi,
  releasePartnerBusinessForApi,
  removePartnerTeamMemberForApi,
  renamePartnerPackageForApi,
  revokePartnerDemoForApi,
  revokePartnerTeamInvitationForApi,
  rotatePartnerDemoLinkForApi,
  runPartnerIdempotent,
  updatePartnerBrandForApi,
  updatePartnerBusinessBillingForApi,
  updatePartnerPoolOverageForApi,
  updatePartnerTeamMemberForApi,
} from "./publicApi/partner";
import { createPartnerBusinessForApi } from "./publicApi/operations";
import { prunePartnerApiIdempotencyKeys } from "./publicApi/webhooks";
import type { PartnerPlatformKey } from "./publicApi/platformKeys";
import { acceptInvitation } from "./tenancy";

// The v1 Partner endpoints' operations with real keys a partner made: each
// acts as the partner with an admin's rights, reaches only its own partner,
// stays away from owners, and reaches billing only with a scope an owner
// granted. The HTTP pipeline's refusals of business keys, host keys and
// missing scopes are in apps/admin's http.test.ts.

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner key API integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

const TIER_PRODUCTS = Object.fromEntries(["STARTER", "GROWTH", "SCALE"].flatMap((tier) => ["MONTHLY", "ANNUAL"].map((interval) => [`POLAR_PARTNER_${tier}_${interval}_PRODUCT_ID`, `prod_${tier.toLowerCase()}_${interval.toLowerCase()}`])));

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  vi.stubEnv("PARTNER_SIGNUP", "open");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("MARKETING_HOSTS", "");
  vi.stubEnv("EMAIL_FROM", "Front Desk <no-reply@desk.example.test>");
  vi.stubEnv("PLATFORM_API_KEYS", "");
  for (const name of Object.keys(TIER_PRODUCTS)) vi.stubEnv(name, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
});

/** Runs a test in one transaction as the app role, and rolls everything it wrote back. */
async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    // Tests that write the deployment's one tier billing row take this first, as partnerBilling's do.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('test:partner_tier_billing', 0))`);
    await tx.execute(sql`set local role lobbystack_app`);
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

async function asMigrator<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** The worker's context, as the v1 routes apply a template with it: each transaction runs as lobbystack_worker. */
function workerContext(tx: DatabaseTransaction): DomainContext {
  const db = {
    async transaction<T>(callback: (inner: DatabaseTransaction) => Promise<T>): Promise<T> {
      await tx.execute(sql`set local session authorization lobbystack_worker`);
      try {
        return await tx.transaction(callback);
      } finally {
        await tx.execute(sql`reset session authorization`);
        await tx.execute(sql`set local role lobbystack_app`);
      }
    },
  };
  return { db: db as unknown as Database };
}

/** A context whose transactions run on tx, calling `before` ahead of the nth one, as a request racing the operation would. */
function contextRacing(tx: DatabaseTransaction, nth: number, before: () => Promise<void>): DomainContext {
  let count = 0;
  const db = {
    async transaction<T>(callback: (inner: DatabaseTransaction) => Promise<T>): Promise<T> {
      count += 1;
      if (count === nth) await before();
      return await tx.transaction(callback);
    },
  };
  return { db: db as unknown as Database, stripeConnect: new FakeStripeConnect() };
}

async function refusal(promise: Promise<unknown>): Promise<{ status?: number; code?: string; message?: string }> {
  return await promise.then(() => ({}), (error: { cause?: { code?: string; message?: string } } & Record<string, unknown>) => (error.cause?.code ? error.cause : error) as { status?: number; code?: string; message?: string });
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

type Person = { userId: string; email: string };

async function people(tx: DatabaseTransaction, count: number): Promise<Person[]> {
  const made = Array.from({ length: count }, () => {
    const userId = randomUUID();
    return { userId, email: `${userId}@example.invalid` };
  });
  await asMigrator(tx, async () => { await tx.insert(users).values(made.map((person) => ({ id: person.userId, email: person.email, normalizedEmail: person.email, name: `Person ${person.userId.slice(0, 4)}`, emailVerified: true }))); });
  return made;
}

async function linkToken(tx: DatabaseTransaction, invitationId: string): Promise<string> {
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

const ALL_PARTNER_SCOPES: ApiKeyScope[] = ["partner:read", "partner.businesses:write", "partner.demos:write", "partner.packages:write", "partner.branding:write", "partner.templates:write", "partner.team:write", "partner.billing:read", "partner.billing:write"];
const ADMIN_SCOPES = ALL_PARTNER_SCOPES.filter((scope) => !scope.startsWith("partner.billing"));

/** A partner signed up by its owner, with an admin and a member, and a fake Stripe its context talks to. */
async function partner(tx: DatabaseTransaction, name: string) {
  const [owner, admin, member] = await people(tx, 3);
  const stripe = new FakeStripeConnect();
  const context: DomainContext = { db: tx as unknown as Database, stripeConnect: stripe };
  const { partnerId } = await signUpPartner(context, { userId: owner!.userId, email: owner!.email, emailVerified: true, name });
  const ownerActor: PartnerMemberActor = { kind: "member", partnerId, userId: owner!.userId, role: "owner" };
  const memberIds: Record<"admin" | "member", string> = { admin: "", member: "" };
  for (const [person, role] of [[admin!, "admin"], [member!, "member"]] as const) {
    const { invitationId } = await invitePartnerMember(context, ownerActor, { email: person.email, role });
    await acceptPartnerInvitation(context, { userId: person.userId, tokenHash: hashPartnerToken(await linkToken(tx, invitationId)), email: person.email, emailVerified: true });
    const [row] = await asMigrator(tx, async () => await tx.select({ id: partnerMembers.id }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, partnerId), eq(partnerMembers.userId, person.userId))));
    memberIds[role] = row!.id;
  }
  const adminActor: PartnerMemberActor = { kind: "member", partnerId, userId: admin!.userId, role: "admin" };
  /** A key made in the console by the owner or the admin, as the v1 pipeline resolves it. */
  const key = async (scopes: ApiKeyScope[], by: PartnerMemberActor = ownerActor): Promise<PartnerPlatformKey> => {
    const { platformKey } = await createPartnerPlatformKey(context, by, { name: "Coding assistant", scopes });
    return { platformKeyId: platformKey.id, prefix: platformKey.prefix, name: platformKey.name, group: partnerId, scopes: platformKey.scopes, createdAt: platformKey.createdAt, partnerId, access: "group" };
  };
  const business = async (businessName: string, ownerPerson?: Person) => {
    const ownerEmail = ownerPerson?.email ?? `${randomUUID()}@example.invalid`;
    const created = await createPartnerBusiness(context, ownerActor, { name: businessName, timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail });
    if (ownerPerson) await acceptInvitation(context, { userId: ownerPerson.userId, tokenHash: hash(await linkToken(tx, created.invitationId)), email: ownerPerson.email, emailVerified: true });
    return created.businessId;
  };
  return { context, stripe, partnerId, owner: owner!, admin: admin!, ownerActor, adminActor, memberIds, key, business };
}

/** Connects a Canadian Stripe account that takes payments, as its owner would in the console. */
async function connectStripe(team: Awaited<ReturnType<typeof partner>>) {
  const { accountId } = await startPartnerStripeOnboarding(team.context, team.ownerActor, { country: "CA", returnUrl: "https://desk.example.test/return", refreshUrl: "https://desk.example.test/refresh" });
  team.stripe.updateAccount(accountId, { currency: "CAD", detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, disabledReason: null });
  const { body, signature } = team.stripe.delivery("account.updated", { accountId });
  await recordStripeConnectEvent(team.context, team.stripe.verifyWebhook(body, signature));
}

function memoryStorage(): TemplateStorage {
  const objects = new Map<string, Uint8Array>();
  return {
    async createUpload(input) { return { url: `https://storage.example.test/${input.key}`, headers: {} }; },
    async headObject() { return null; },
    async getObject(input) { return objects.get(input.key) ?? new Uint8Array(); },
    async putObject(input) { objects.set(input.key, input.body); },
    async deleteObject(input) { objects.delete(input.key); },
    async createDownloadUrl(input) { return `https://storage.example.test/${input.key}`; },
  };
}

describe.skipIf(!testUrl)("the v1 Partner endpoints with a partner's own keys, against PostgreSQL with RLS", () => {
  it("reads its own partner, and the pool only with partner.billing:read", async () => {
    await rollbackTest(async (tx) => {
      for (const [name, value] of Object.entries(TIER_PRODUCTS)) vi.stubEnv(name, value);
      const acme = await partner(tx, "Acme Agency");
      const reader = await acme.key(["partner:read"]);
      const partnerView = await getPartnerForApi(acme.context, reader);
      expect(partnerView).toMatchObject({ id: acme.partnerId, name: "Acme Agency", slug: expect.any(String), subdomain: expect.stringContaining("portal.example.test"), custom_domain: null, tier: { slug: "free" }, pool: null });
      expect(partnerView.dashboard_url).toMatch(/^https:\/\/.+portal\.example\.test$/);
      const billing = await acme.key(["partner:read", "partner.billing:read"]);
      expect((await getPartnerForApi(acme.context, billing)).pool).toMatchObject({ voice_seconds_limit: expect.any(Number), voice_seconds_used: 0 });
    });
  });

  it("lets only owners grant the billing scopes, and refuses a key its own partner's billing without them", async () => {
    await rollbackTest(async (tx) => {
      for (const [name, value] of Object.entries(TIER_PRODUCTS)) vi.stubEnv(name, value);
      const acme = await partner(tx, "Acme Agency");
      // An admin makes keys, but never one that reaches what only owners see.
      expect(await refusal(acme.key(["partner:read", "partner.billing:read"], acme.adminActor))).toMatchObject({ status: 403, code: "owner_only" });
      const adminKey = await acme.key(ADMIN_SCOPES, acme.adminActor);
      expect(await refusal(getPartnerBillingForApi(acme.context, adminKey))).toMatchObject({ status: 403, code: "forbidden" });
      expect(await refusal(getPartnerStripeForApi(acme.context, adminKey))).toMatchObject({ status: 403 });
      expect(await refusal(updatePartnerPoolOverageForApi(acme.context, adminKey, { enabled: false }))).toMatchObject({ status: 403 });

      // An owner's key reads billing with partner.billing:read, and changes it only with partner.billing:write.
      const readOnly = await acme.key(["partner.billing:read"]);
      expect(await getPartnerBillingForApi(acme.context, readOnly)).toMatchObject({ billed: true, tier: "free", pool_overage: { enabled: true } });
      expect(await getPartnerStripeForApi(acme.context, readOnly)).toMatchObject({ configured: true, status: "not_connected" });
      expect(await refusal(updatePartnerPoolOverageForApi(acme.context, readOnly, { enabled: false }))).toMatchObject({ status: 403 });
      const writer = await acme.key(["partner.billing:read", "partner.billing:write"]);
      expect(await updatePartnerPoolOverageForApi(acme.context, writer, { enabled: false, cap_cents: 5_000 })).toMatchObject({ enabled: false, cap_cents: 5_000 });

      // A checkout is made out to the owner who made the key, while they're one.
      const checkout = await createPartnerTierCheckoutForApi(acme.context, writer, { tier: "starter", interval: "monthly" });
      expect(checkout).toMatchObject({ tier: "starter", interval: "monthly", status: "pending", checkout_url: null });
      expect(await getPartnerTierCheckoutForApi(acme.context, writer, checkout.id)).toMatchObject({ id: checkout.id });
      const [request] = await asMigrator(tx, async () => await tx.execute<{ requested_by_user_id: string }>(sql`select requested_by_user_id from public.partner_checkout_requests where id = ${checkout.id}::uuid`)).then((result) => result.rows);
      expect(request?.requested_by_user_id).toBe(acme.owner.userId);
      // Another partner's key never sees it.
      const bright = await partner(tx, "Bright Desk");
      const brightKey = await bright.key(["partner.billing:read", "partner.billing:write"]);
      expect(await refusal(getPartnerTierCheckoutForApi(bright.context, brightKey, checkout.id))).toMatchObject({ status: 404 });
    });
  });

  it("refuses a key's checkout once the owner who made it is no longer one", async () => {
    await rollbackTest(async (tx) => {
      for (const [name, value] of Object.entries(TIER_PRODUCTS)) vi.stubEnv(name, value);
      const acme = await partner(tx, "Acme Agency");
      // The admin becomes an owner, makes a key, and is an admin again.
      await asMigrator(tx, async () => { await tx.update(partnerMembers).set({ role: "owner" }).where(eq(partnerMembers.id, acme.memberIds.admin)); });
      const key = await acme.key(["partner.billing:read", "partner.billing:write"], { ...acme.adminActor, role: "owner" });
      await asMigrator(tx, async () => { await tx.update(partnerMembers).set({ role: "admin" }).where(eq(partnerMembers.id, acme.memberIds.admin)); });
      expect(await refusal(createPartnerTierCheckoutForApi(acme.context, key, { tier: "growth", interval: "annual" }))).toMatchObject({ status: 409, code: "key_owner_inactive" });
    });
  });

  it("runs the team as an admin would: never an owner, only its own partner, and its invitations last while it does", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const bright = await partner(tx, "Bright Desk");
      const key = await acme.key(["partner:read", "partner.team:write"]);
      const team = await getPartnerTeamForApi(acme.context, key);
      expect(team.members.map((member) => member.role).sort()).toEqual(["admin", "member", "owner"]);
      const owner = team.members.find((member) => member.role === "owner")!;

      // A key invites admins and members as the partner; the invitation names the key.
      const [invitee] = await people(tx, 1);
      const invitation = await createPartnerTeamInvitationForApi(acme.context, key, { email: invitee!.email, role: "admin" });
      expect(invitation).toMatchObject({ email: invitee!.email, role: "admin" });
      const [row] = await asMigrator(tx, async () => await tx.select({ byUser: partnerInvitations.invitedByUserId, byKey: partnerInvitations.invitedByPlatformKeyId }).from(partnerInvitations).where(eq(partnerInvitations.id, invitation.id)));
      expect(row).toEqual({ byUser: null, byKey: key.platformKeyId });
      // The domain refuses an owner's invitation however the request asks for one.
      const domain = await import("./partners");
      expect(await refusal(domain.invitePartnerMember(acme.context, { kind: "key", partnerId: acme.partnerId, platformKeyId: key.platformKeyId, scopes: key.scopes }, { email: `${randomUUID()}@example.invalid`, role: "owner" }))).toMatchObject({ status: 403, code: "owner_only" });

      // Roles: member and admin, never an owner's.
      const promoted = await updatePartnerTeamMemberForApi(acme.context, key, acme.memberIds.member, "admin");
      expect(promoted).toMatchObject({ id: acme.memberIds.member, role: "admin" });
      expect(await refusal(updatePartnerTeamMemberForApi(acme.context, key, owner.id, "member"))).toMatchObject({ status: 403 });
      expect(await refusal(removePartnerTeamMemberForApi(acme.context, key, owner.id))).toMatchObject({ status: 403 });
      // Another partner's key finds none of Acme's people or invitations.
      const brightKey = await bright.key(["partner:read", "partner.team:write"]);
      expect(await refusal(updatePartnerTeamMemberForApi(bright.context, brightKey, acme.memberIds.admin, "member"))).toMatchObject({ status: 404 });
      expect(await refusal(removePartnerTeamMemberForApi(bright.context, brightKey, acme.memberIds.admin))).toMatchObject({ status: 404 });
      expect(await refusal(revokePartnerTeamInvitationForApi(bright.context, brightKey, invitation.id))).toMatchObject({ status: 409 });
      expect((await getPartnerTeamForApi(bright.context, brightKey)).members.map((member) => member.email)).not.toContain(acme.owner.email);

      expect(await removePartnerTeamMemberForApi(acme.context, key, acme.memberIds.member)).toEqual({ id: acme.memberIds.member, deleted: true });

      // The key's invitation works while the key does, and revoking the key revokes it.
      const [later] = await people(tx, 1);
      const pending = await createPartnerTeamInvitationForApi(acme.context, key, { email: later!.email, role: "member" });
      const token = await linkToken(tx, pending.id);
      expect(await acceptPartnerInvitation(acme.context, { userId: invitee!.userId, tokenHash: hashPartnerToken(await linkToken(tx, invitation.id)), email: invitee!.email, emailVerified: true })).toEqual({ partnerId: acme.partnerId, role: "admin" });
      const revoked = await revokePartnerPlatformKey(acme.context, acme.ownerActor, { platformKeyId: key.platformKeyId });
      expect(revoked.revokedInvitationIds).toContain(pending.id);
      expect(await refusal(acceptPartnerInvitation(acme.context, { userId: later!.userId, tokenHash: hashPartnerToken(token), email: later!.email, emailVerified: true }))).toMatchObject({ status: 409 });
      // A revoked key does nothing more.
      expect(await refusal(getPartnerTeamForApi(acme.context, key))).toMatchObject({ status: 401 });
    });
  });

  it("reads and changes only its own partner's brand, keeping the fields it leaves out", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const bright = await partner(tx, "Bright Desk");
      const reader = await acme.key(["partner:read"]);
      const writer = await acme.key(["partner:read", "partner.branding:write"]);
      expect(await getPartnerBrandForApi(acme.context, reader)).toMatchObject({ name: "Acme Agency", color: null });
      await updatePartnerBrandForApi(acme.context, writer, { color: "#0F766E", support_email: "help@acme.example" });
      const saved = await updatePartnerBrandForApi(acme.context, writer, { name: "Acme Reception" });
      expect(saved).toMatchObject({ name: "Acme Reception", color: "#0f766e", support_email: "help@acme.example" });
      expect(await refusal(updatePartnerBrandForApi(acme.context, writer, { color: "teal" }))).toMatchObject({ status: 400 });
      // A 1x1 PNG, as the console sends it.
      const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      expect((await updatePartnerBrandForApi(acme.context, writer, { logo: png })).logo_url).toEqual(expect.any(String));
      expect((await updatePartnerBrandForApi(acme.context, writer, { logo: null })).logo_url).toBeNull();
      expect((await getPartnerBrandForApi(bright.context, await bright.key(["partner:read"]))).name).toBe("Bright Desk");
      expect(await getPartnerDomainsForApi(acme.context, reader)).toMatchObject({ subdomain: expect.stringContaining("portal.example.test"), custom: null });
    });
  });

  it("makes, lists, renames and archives packages on its own partner's Stripe account only", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const bright = await partner(tx, "Bright Desk");
      await connectStripe(acme);
      const key = await acme.key(["partner:read", "partner.packages:write"]);
      const made = await createPartnerPackageForApi(acme.context, key, { name: "Front desk", monthly_price_minor: 9_900, voice_minutes: 300, chats: 500 });
      expect(made).toMatchObject({ name: "Front desk", currency: "CAD", monthly_price_minor: 9_900, setup_fee_minor: null, allowance: { voice_minutes: 300, chats: 500 }, on_connected_account: true });
      expect((await listPartnerPackagesForApi(acme.context, key)).map((pkg) => pkg.id)).toEqual([made.id]);
      expect((await renamePartnerPackageForApi(acme.context, key, made.id, "Front desk plus")).name).toBe("Front desk plus");
      const brightKey = await bright.key(["partner:read", "partner.packages:write"]);
      expect(await refusal(renamePartnerPackageForApi(bright.context, brightKey, made.id, "Stolen"))).toMatchObject({ status: 404 });
      expect(await refusal(archivePartnerPackageForApi(bright.context, brightKey, made.id))).toMatchObject({ status: 404 });
      expect(await listPartnerPackagesForApi(bright.context, brightKey)).toEqual([]);

      // Selling it to a business, then billing it outside LobbyStack again.
      const businessId = await acme.business("Harbor Dental");
      const businessKey = await acme.key(["partner:read", "partner.businesses:write"]);
      expect(await getPartnerBusinessBillingForApi(acme.context, businessKey, businessId)).toMatchObject({ kind: "outside", package_id: null });
      expect(await updatePartnerBusinessBillingForApi(acme.context, businessKey, businessId, { package_id: made.id })).toMatchObject({ kind: "package", package_id: made.id, status: "awaiting_payment" });
      expect(await updatePartnerBusinessBillingForApi(acme.context, businessKey, businessId, { overage: { enabled: true, voice_minute_rate_minor: 25, chat_rate_minor: 5, cap_minor: 10_000 } })).toMatchObject({ overage: { enabled: true, voice_minute_rate_minor: 25, cap_minor: 10_000 } });
      expect(await refusal(getPartnerBusinessBillingForApi(bright.context, await bright.key(["partner:read"]), businessId))).toMatchObject({ status: 404 });
      expect(await refusal(updatePartnerBusinessBillingForApi(bright.context, await bright.key(["partner.businesses:write"]), businessId, { package_id: null }))).toMatchObject({ status: 404 });
      expect(await updatePartnerBusinessBillingForApi(acme.context, businessKey, businessId, { package_id: null })).toMatchObject({ kind: "outside" });

      expect(await archivePartnerPackageForApi(acme.context, key, made.id)).toEqual({ id: made.id, deleted: true });
      expect(await listPartnerPackagesForApi(acme.context, key)).toEqual([]);
    });
  });

  it("releases and deletes its own partner's businesses, and records the key", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const bright = await partner(tx, "Bright Desk");
      const [client] = await people(tx, 1);
      const owned = await acme.business("Harbor Dental", client);
      const unclaimed = await acme.business("Pier Dental");
      const key = await acme.key(["partner.businesses:write"]);
      const brightKey = await bright.key(["partner.businesses:write"]);
      expect(await refusal(releasePartnerBusinessForApi(bright.context, brightKey, owned))).toMatchObject({ status: 404 });
      expect(await refusal(deletePartnerBusinessForApi(bright.context, brightKey, owned))).toMatchObject({ status: 404 });
      // Nobody accepted Pier Dental's invitation, so there's no owner to release it to.
      expect(await refusal(releasePartnerBusinessForApi(acme.context, key, unclaimed))).toMatchObject({ status: 409 });

      expect(await releasePartnerBusinessForApi(acme.context, key, owned)).toEqual({ id: owned, released: true, owner_user_id: client!.userId });
      const [released] = await asMigrator(tx, async () => await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, owned)));
      expect(released?.partnerId).toBeNull();
      const [audit] = await asMigrator(tx, async () => await tx.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, owned), eq(auditLogs.eventType, "partner.business_released"))));
      expect(audit).toMatchObject({ actorUserId: null, payload: { partnerId: acme.partnerId, actor: "platform_key", platformKeyId: key.platformKeyId } });
      // A released business is no longer the partner's.
      expect(await refusal(deletePartnerBusinessForApi(acme.context, key, owned))).toMatchObject({ status: 404 });

      expect(await deletePartnerBusinessForApi(acme.context, key, unclaimed)).toEqual({ id: unclaimed, deleted: true });
      expect(await asMigrator(tx, async () => await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, unclaimed)))).toEqual([]);
    });
  });

  it("makes, follows, turns off and deletes its own partner's demos, which name the key", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const bright = await partner(tx, "Bright Desk");
      const key = await acme.key(["partner:read", "partner.demos:write"]);
      const created = await createPartnerDemoForApi(acme.context, key, { name: "Harbor Dental", website_url: "https://harbor.example", suggested_prompts: ["Are you open Saturday?", "Do you take new patients?"] });
      expect(created).toMatchObject({ status: "preparing", access_level: "full", token: expect.any(String), url: expect.stringContaining("portal.example.test/demo#") });
      const [row] = await asMigrator(tx, async () => await tx.select({ operator: prospectDemos.operatorUserId, byKey: prospectDemos.createdByPlatformKeyId, partnerId: prospectDemos.partnerId }).from(prospectDemos).where(eq(prospectDemos.id, created.id)));
      expect(row).toEqual({ operator: null, byKey: key.platformKeyId, partnerId: acme.partnerId });

      expect((await listPartnerDemosForApi(acme.context, key)).map((demo) => demo.id)).toEqual([created.id]);
      expect(await getPartnerDemoForApi(acme.context, key, created.id)).toMatchObject({ id: created.id, status: "preparing", ready: { website: false, prompts: true } });
      const brightKey = await bright.key(["partner:read", "partner.demos:write"]);
      expect(await refusal(getPartnerDemoForApi(bright.context, brightKey, created.id))).toMatchObject({ status: 404 });
      expect(await refusal(revokePartnerDemoForApi(bright.context, brightKey, created.id))).toMatchObject({ status: 404 });
      expect(await listPartnerDemosForApi(bright.context, brightKey)).toEqual([]);

      const rotated = await rotatePartnerDemoLinkForApi(acme.context, key, created.id);
      expect(rotated.token).not.toBe(created.token);
      // An open demo can't be deleted; once turned off it can.
      expect(await refusal(deletePartnerDemoForApi(acme.context, key, created.id))).toMatchObject({ status: 409 });
      expect(await revokePartnerDemoForApi(acme.context, key, created.id)).toEqual({ id: created.id, status: "revoked", expires_at: null });
      expect(await deletePartnerDemoForApi(acme.context, key, created.id)).toEqual({ id: created.id, deleted: true });
      expect(await listPartnerDemosForApi(acme.context, key)).toEqual([]);
    });
  });

  it("saves templates from its own partner's businesses, starts a business from one, and deletes it", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const bright = await partner(tx, "Bright Desk");
      const storage = memoryStorage();
      const harbor = await acme.business("Harbor Dental");
      const key = await acme.key(["partner:read", "partner.templates:write", "businesses:create"]);
      const template = await createPartnerTemplateForApi(acme.context, key, { business_id: harbor, name: "Dental clinic" }, { storage });
      expect(template).toMatchObject({ name: "Dental clinic", manifest: expect.objectContaining({ business: expect.any(Object) }) });
      const [exported] = await asMigrator(tx, async () => await tx.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, harbor), eq(auditLogs.eventType, "partner.business_setup_exported"))));
      expect(exported).toMatchObject({ actorUserId: null, payload: { actor: "platform_key", platformKeyId: key.platformKeyId, templateId: template.id } });
      expect((await listPartnerTemplatesForApi(acme.context, key)).map((saved) => saved.id)).toEqual([template.id]);

      const brightKey = await bright.key(["partner:read", "partner.templates:write", "businesses:create"]);
      expect(await refusal(createPartnerTemplateForApi(bright.context, brightKey, { business_id: harbor, name: "Stolen" }, { storage }))).toMatchObject({ status: 404 });
      expect(await refusal(deletePartnerTemplateForApi(bright.context, brightKey, template.id))).toMatchObject({ status: 404 });
      expect(await listPartnerTemplatesForApi(bright.context, brightKey)).toEqual([]);
      // Another partner's template is no start for a business either.
      expect(await refusal(createPartnerBusinessForApi(bright.context, { key: brightKey, idempotencyKey: randomUUID(), requestHash: "hash", body: { name: "Copy", timezone: "America/Toronto", owner_email: `${randomUUID()}@example.invalid`, template_id: template.id } }, { setup: { worker: workerContext(tx), storage } }))).toMatchObject({ status: 404 });

      // POST /businesses with template_id starts the business from it.
      const pier = await createPartnerBusinessForApi(acme.context, { key, idempotencyKey: randomUUID(), requestHash: "hash", body: { name: "Pier Dental", timezone: "America/Vancouver", owner_email: `${randomUUID()}@example.invalid`, template_id: template.id } }, { setup: { worker: workerContext(tx), storage } });
      expect(pier.business).toMatchObject({ name: "Pier Dental", timezone: "America/Vancouver" });
      const [made] = await asMigrator(tx, async () => await tx.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, pier.business.id), eq(auditLogs.eventType, "partner.business_created"))));
      expect(made?.payload).toMatchObject({ templateId: template.id, platformKeyId: key.platformKeyId });

      expect(await deletePartnerTemplateForApi(acme.context, key, template.id)).toEqual({ id: template.id, deleted: true });
      expect(await listPartnerTemplatesForApi(acme.context, key)).toEqual([]);
    });
  });

  it("gives a key an admin's role in the database on its own partner only, and none once revoked or beside a person", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const bright = await partner(tx, "Bright Desk");
      const key = await acme.key(["partner:read"]);
      const role = async (settings: { userId?: string; platformKeyId?: string }, partnerId: string) => (await tx.execute<{ role: string | null }>(sql`select set_config('app.user_id', ${settings.userId ?? ""}, true), set_config('app.platform_key_id', ${settings.platformKeyId ?? ""}, true), set_config('app.actor_type', 'operator', true), app.partner_role(${partnerId}::uuid) as role`)).rows[0]?.role ?? null;
      expect(await role({ platformKeyId: key.platformKeyId }, acme.partnerId)).toBe("admin");
      expect(await role({ platformKeyId: key.platformKeyId }, bright.partnerId)).toBeNull();
      // A person's own role wins, and a key named beside them adds nothing.
      expect(await role({ userId: bright.owner.userId, platformKeyId: key.platformKeyId }, acme.partnerId)).toBeNull();
      expect(await role({ userId: acme.admin.userId, platformKeyId: key.platformKeyId }, acme.partnerId)).toBe("admin");
      // A key's context reads its partner's rows and no other's.
      const visible = await tx.execute<{ id: string }>(sql`select set_config('app.user_id', '', true), set_config('app.platform_key_id', ${key.platformKeyId}, true), set_config('app.actor_type', 'operator', true), id from public.partners`);
      expect(visible.rows.map((row) => row.id)).toEqual([acme.partnerId]);
      // It can't make keys with its own SQL either.
      expect(await refusal(tx.transaction(async (inner) => { await inner.execute(sql`insert into public.partner_platform_keys (partner_id, name, prefix, key_hash, scopes) values (${acme.partnerId}::uuid, 'Rogue', 'lsp_00000000', ${randomUUID()}, '["partner:read"]'::jsonb)`); }))).toMatchObject({ code: "42501" });
      await revokePartnerPlatformKey(acme.context, acme.ownerActor, { platformKeyId: key.platformKeyId });
      expect(await role({ platformKeyId: key.platformKeyId }, acme.partnerId)).toBeNull();
    });
  });

  it("replays a request with the same Idempotency-Key, refuses another body, and keeps each key's records apart", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const bright = await partner(tx, "Bright Desk");
      const key = await acme.key(["partner.packages:write"]);
      let runs = 0;
      const run = async () => ({ status: 201, body: { data: { run: ++runs } } });
      const request = { key, operation: "createPartnerPackage", idempotencyKey: "retry-1", requestHash: "a" };
      expect(await runPartnerIdempotent(acme.context, request, run)).toEqual({ replayed: false, response: { status: 201, body: { data: { run: 1 } } } });
      expect(await runPartnerIdempotent(acme.context, request, run)).toEqual({ replayed: true, response: { status: 201, body: { data: { run: 1 } } } });
      expect(await refusal(runPartnerIdempotent(acme.context, { ...request, requestHash: "b" }, run))).toMatchObject({ status: 422, code: "idempotency_key_reused" });
      // A failed request leaves nothing, so a retry runs again.
      const failing = { ...request, idempotencyKey: "retry-2" };
      expect(await refusal(runPartnerIdempotent(acme.context, failing, async () => { throw new Error("Stripe is down."); }))).toMatchObject({ message: "Stripe is down." });
      expect((await runPartnerIdempotent(acme.context, failing, run)).replayed).toBe(false);
      // Another partner's key with the same Idempotency-Key runs its own request.
      const brightKey = await bright.key(["partner.packages:write"]);
      expect((await runPartnerIdempotent(bright.context, { ...request, key: brightKey }, run)).replayed).toBe(false);
      expect(runs).toBe(3);
      // The app role sees no record outside a key's own transaction, an operator's included.
      await tx.execute(sql`select set_config('app.platform_key_id', '', true), set_config('app.user_id', ${acme.owner.userId}, true), set_config('app.actor_type', 'operator', true)`);
      const visible = await tx.select({ id: partnerApiIdempotencyKeys.id }).from(partnerApiIdempotencyKeys);
      expect(visible).toEqual([]);
    });
  });
  it("lets a key with only partner.billing:write read billing and the checkout it starts", async () => {
    await rollbackTest(async (tx) => {
      for (const [name, value] of Object.entries(TIER_PRODUCTS)) vi.stubEnv(name, value);
      const acme = await partner(tx, "Acme Agency");
      const writeOnly = await acme.key(["partner:read", "partner.billing:write"]);
      expect(await getPartnerBillingForApi(acme.context, writeOnly)).toMatchObject({ billed: true, tier: "free" });
      expect(await getPartnerStripeForApi(acme.context, writeOnly)).toMatchObject({ configured: true, status: "not_connected" });
      expect((await getPartnerForApi(acme.context, writeOnly)).pool).toMatchObject({ voice_seconds_used: 0 });
      const checkout = await createPartnerTierCheckoutForApi(acme.context, writeOnly, { tier: "starter", interval: "monthly" });
      expect(checkout).toMatchObject({ id: expect.any(String), tier: "starter", interval: "monthly", status: "pending", checkout_url: null });
      expect(await getPartnerTierCheckoutForApi(acme.context, writeOnly, checkout.id)).toMatchObject({ id: checkout.id, status: "pending" });
      // A retry finds the same checkout.
      expect((await createPartnerTierCheckoutForApi(acme.context, writeOnly, { tier: "starter", interval: "monthly" })).id).toBe(checkout.id);
    });
  });

  it("stops counting a key's billing scopes once the owner who made it isn't an owner, and keeps its other scopes", async () => {
    for (const change of ["demoted", "removed"] as const) {
      await rollbackTest(async (tx) => {
        for (const [name, value] of Object.entries(TIER_PRODUCTS)) vi.stubEnv(name, value);
        const acme = await partner(tx, "Acme Agency");
        // The admin becomes an owner and makes a key with every scope.
        await asMigrator(tx, async () => { await tx.update(partnerMembers).set({ role: "owner" }).where(eq(partnerMembers.id, acme.memberIds.admin)); });
        const key = await acme.key(ALL_PARTNER_SCOPES, { ...acme.adminActor, role: "owner" });
        expect(await getPartnerBillingForApi(acme.context, key)).toMatchObject({ tier: "free" });
        const hasScope = async (scope: string) => (await tx.execute<{ has: boolean }>(sql`select set_config('app.user_id', '', true), set_config('app.platform_key_id', ${key.platformKeyId}, true), set_config('app.actor_type', 'operator', true), app.partner_key_has_scope(${acme.partnerId}::uuid, ${scope}) as has`)).rows[0]?.has;
        expect(await hasScope("partner.billing:write")).toBe(true);

        await asMigrator(tx, async () => { await tx.update(partnerMembers).set(change === "demoted" ? { role: "admin" } : { status: "removed" }).where(eq(partnerMembers.id, acme.memberIds.admin)); });
        const inactive = { status: 409, code: "key_owner_inactive" };
        expect(await refusal(getPartnerBillingForApi(acme.context, key))).toMatchObject(inactive);
        expect(await refusal(updatePartnerPoolOverageForApi(acme.context, key, { enabled: false }))).toMatchObject(inactive);
        expect(await refusal(getPartnerStripeForApi(acme.context, key))).toMatchObject(inactive);
        expect(await refusal(createPartnerStripeOnboardingLinkForApi(acme.context, key, { country: "CA" }))).toMatchObject(inactive);
        expect(await refusal(createPartnerTierCheckoutForApi(acme.context, key, { tier: "starter", interval: "monthly" }))).toMatchObject(inactive);
        // The database stops counting them too.
        expect(await hasScope("partner.billing:read")).toBe(false);
        expect(await hasScope("partner.billing:write")).toBe(false);
        expect(await hasScope("partner:read")).toBe(true);
        await tx.execute(sql`select set_config('app.platform_key_id', '', true)`);

        // What the key does as an admin still works, and the partner reads without its pool.
        expect(await getPartnerForApi(acme.context, key)).toMatchObject({ id: acme.partnerId, pool: null });
        expect(await getPartnerBrandForApi(acme.context, key)).toMatchObject({ name: "Acme Agency" });
        expect((await getPartnerTeamForApi(acme.context, key)).members.length).toBeGreaterThan(0);
      });
    }
  });

  it("checks the key and the business again in the transaction that changes a business's billing", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      await connectStripe(acme);
      const pkgKey = await acme.key(["partner:read", "partner.packages:write"]);
      const made = await createPartnerPackageForApi(acme.context, pkgKey, { name: "Front desk", monthly_price_minor: 9_900, voice_minutes: 300, chats: 500 });
      const readPackage = async (businessId: string) => (await asMigrator(tx, async () => await tx.execute<{ package_id: string | null }>(sql`select package_id from public.billing_accounts where business_id = ${businessId}::uuid`))).rows[0]?.package_id ?? null;

      // The key is revoked after the first check and before the change.
      const harbor = await acme.business("Harbor Dental");
      const revoked = await acme.key(["partner.businesses:write"]);
      const revoking = contextRacing(tx, 2, async () => { await revokePartnerPlatformKey(acme.context, acme.ownerActor, { platformKeyId: revoked.platformKeyId }); });
      expect(await refusal(updatePartnerBusinessBillingForApi(revoking, revoked, harbor, { package_id: made.id }))).toMatchObject({ status: 401 });
      expect(await readPackage(harbor)).toBeNull();

      // The business is released after the first check and before the change.
      const [client] = await people(tx, 1);
      const pier = await acme.business("Pier Dental", client);
      const key = await acme.key(["partner.businesses:write"]);
      const releasing = contextRacing(tx, 2, async () => { await releaseBusiness(acme.context, acme.ownerActor, { businessId: pier }); });
      expect(await refusal(updatePartnerBusinessBillingForApi(releasing, key, pier, { package_id: made.id }))).toMatchObject({ status: 404 });
      expect(await readPackage(pier)).toBeNull();

      // Overage: the key is revoked between the two transactions.
      const cove = await acme.business("Cove Dental");
      const seller = await acme.key(["partner.businesses:write"]);
      await updatePartnerBusinessBillingForApi(acme.context, seller, cove, { package_id: made.id });
      const revokingOverage = contextRacing(tx, 2, async () => { await revokePartnerPlatformKey(acme.context, acme.ownerActor, { platformKeyId: seller.platformKeyId }); });
      expect(await refusal(updatePartnerBusinessBillingForApi(revokingOverage, seller, cove, { overage: { enabled: true, voice_minute_rate_minor: 25, chat_rate_minor: 5, cap_minor: null } }))).toMatchObject({ status: 401 });
      const [overage] = (await asMigrator(tx, async () => await tx.execute<{ overage_voice_minute_rate_minor: number | null }>(sql`select overage_voice_minute_rate_minor from public.billing_accounts where business_id = ${cove}::uuid`))).rows;
      expect(overage?.overage_voice_minute_rate_minor ?? null).not.toBe(25);
    });
  });

  it("checks the person's role again in the transaction that writes for them", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      await connectStripe(acme);
      const pkgKey = await acme.key(["partner:read", "partner.packages:write", "partner.templates:write"]);
      const made = await createPartnerPackageForApi(acme.context, pkgKey, { name: "Front desk", monthly_price_minor: 9_900, voice_minutes: 300, chats: 500 });
      const readAccount = async (businessId: string) => (await asMigrator(tx, async () => await tx.execute<{ package_id: string | null; overage_voice_minute_rate_minor: number | null }>(sql`select package_id, overage_voice_minute_rate_minor from public.billing_accounts where business_id = ${businessId}::uuid`))).rows[0];
      const setAdmin = (change: { role?: "member" | "admin"; status?: "removed" | "active" }) => async () => { await asMigrator(tx, async () => { await tx.update(partnerMembers).set(change).where(eq(partnerMembers.id, acme.memberIds.admin)); }); };
      const restore = setAdmin({ role: "admin", status: "active" });

      // Billing: the admin is made a member, or removed, after the first check and before the change.
      for (const change of [{ role: "member" as const }, { status: "removed" as const }]) {
        const harbor = await acme.business(`Harbor ${change.role ?? change.status}`);
        expect(await refusal(setPartnerBusinessBilling(contextRacing(tx, 2, setAdmin(change)), acme.adminActor, { businessId: harbor, packageId: made.id }))).toMatchObject({ status: 403 });
        expect((await readAccount(harbor))?.package_id ?? null).toBeNull();
        await restore();

        // Overage, on a business that has the package.
        await setPartnerBusinessBilling(acme.context, acme.adminActor, { businessId: harbor, packageId: made.id });
        expect(await refusal(setPartnerBusinessOverage(contextRacing(tx, 2, setAdmin(change)), acme.adminActor, { businessId: harbor, enabled: true, voiceMinuteRateMinor: 25, chatRateMinor: 5, capMinor: null }))).toMatchObject({ status: 403 });
        expect((await readAccount(harbor))?.overage_voice_minute_rate_minor ?? null).not.toBe(25);
        await restore();
      }

      // A business from a template: the admin is made a member while the template is applied, so nobody is invited and the business goes.
      const storage = memoryStorage();
      const source = await acme.business("Template source");
      const template = await createPartnerTemplateForApi(acme.context, pkgKey, { business_id: source, name: "Dental clinic" }, { storage });
      const businessId = randomUUID();
      const demoting = contextRacing(tx, 2, setAdmin({ role: "member" }));
      expect(await refusal(createPartnerBusiness(demoting, acme.adminActor, { businessId, name: "Pier Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: `${randomUUID()}@example.invalid`, templateId: template.id }, { worker: workerContext(tx), storage }))).toMatchObject({ status: 403 });
      expect(await asMigrator(tx, async () => await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, businessId)))).toEqual([]);
      await restore();
    });
  });

  it("deletes Idempotency-Key records older than the window, for every partner", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const bright = await partner(tx, "Bright Desk");
      const acmeKey = await acme.key(["partner.packages:write"]);
      const brightKey = await bright.key(["partner.packages:write"]);
      const run = async () => ({ status: 201, body: { data: {} } });
      for (const [team, key, idempotencyKey] of [[acme, acmeKey, "old"], [acme, acmeKey, "fresh"], [bright, brightKey, "old"]] as const) {
        await runPartnerIdempotent(team.context, { key, operation: "createPartnerPackage", idempotencyKey, requestHash: "a" }, run);
      }
      await asMigrator(tx, async () => { await tx.update(partnerApiIdempotencyKeys).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(partnerApiIdempotencyKeys.key, "old")); });
      expect(await prunePartnerApiIdempotencyKeys(workerContext(tx))).toEqual({ deleted: 2 });
      const left = await asMigrator(tx, async () => await tx.select({ key: partnerApiIdempotencyKeys.key, partnerId: partnerApiIdempotencyKeys.partnerId }).from(partnerApiIdempotencyKeys).where(sql`${partnerApiIdempotencyKeys.partnerId} in (${acme.partnerId}::uuid, ${bright.partnerId}::uuid)`));
      expect(left).toEqual([{ key: "fresh", partnerId: acme.partnerId }]);
      expect(await prunePartnerApiIdempotencyKeys(workerContext(tx))).toEqual({ deleted: 0 });
    });
  });

  it("needs partner.businesses:write to send package_id and partner:read to send template_id to POST /businesses", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const creator = await acme.key(["businesses:create"]);
      const body = { name: "Pier Dental", timezone: "America/Toronto", owner_email: `${randomUUID()}@example.invalid` };
      expect(await refusal(createPartnerBusinessForApi(acme.context, { key: creator, idempotencyKey: randomUUID(), requestHash: "hash", body: { ...body, package_id: randomUUID() } }))).toMatchObject({ status: 403, code: "insufficient_scope" });
      expect(await refusal(createPartnerBusinessForApi(acme.context, { key: creator, idempotencyKey: randomUUID(), requestHash: "hash", body: { ...body, template_id: randomUUID() } }, { setup: { worker: workerContext(tx), storage: memoryStorage() } }))).toMatchObject({ status: 403, code: "insufficient_scope" });
      // With the scopes, the request goes on to look for the package and the template, which aren't the partner's.
      const seller = await acme.key(["businesses:create", "partner.businesses:write"]);
      expect(await refusal(createPartnerBusinessForApi(acme.context, { key: seller, idempotencyKey: randomUUID(), requestHash: "hash", body: { ...body, package_id: randomUUID() } }))).not.toMatchObject({ code: "insufficient_scope" });
      const reader = await acme.key(["businesses:create", "partner:read"]);
      expect(await refusal(createPartnerBusinessForApi(acme.context, { key: reader, idempotencyKey: randomUUID(), requestHash: "hash", body: { ...body, template_id: randomUUID() } }, { setup: { worker: workerContext(tx), storage: memoryStorage() } }))).toMatchObject({ status: 404 });
      // Neither field needs more than businesses:create.
      expect((await createPartnerBusinessForApi(acme.context, { key: creator, idempotencyKey: randomUUID(), requestHash: "hash", body })).business).toMatchObject({ name: "Pier Dental" });
    });
  });

  it("deletes a partner whose key made a demo, and keeps the demo", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Agency");
      const key = await acme.key(["partner:read", "partner.demos:write"]);
      const created = await createPartnerDemoForApi(acme.context, key, { name: "Harbor Dental", website_url: "https://harbor.example" });
      const [demo] = await asMigrator(tx, async () => await tx.select({ businessId: prospectDemos.businessId }).from(prospectDemos).where(eq(prospectDemos.id, created.id)));
      // The demo's business left the partner, as a claimed one released to its owner does, so the demo stays when the partner goes.
      // In a savepoint, so a refused delete surfaces as itself.
      await asMigrator(tx, async () => {
        await tx.update(businesses).set({ partnerId: null }).where(eq(businesses.id, demo!.businessId));
        await tx.transaction(async (inner) => { await inner.execute(sql`delete from public.partners where id = ${acme.partnerId}::uuid`); });
      });
      const [row] = await asMigrator(tx, async () => await tx.select({ partnerId: prospectDemos.partnerId, byKey: prospectDemos.createdByPlatformKeyId }).from(prospectDemos).where(eq(prospectDemos.id, created.id)));
      expect(row).toEqual({ partnerId: null, byKey: key.platformKeyId });
    });
  });
});
