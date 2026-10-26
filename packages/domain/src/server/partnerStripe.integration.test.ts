import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabaseClient, outboxMessages, partnerStripeAccounts, providerEvents, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { FakeStripeConnect } from "@lobbystack/providers/stripe/fakeStripeConnect";

import { acceptPartnerInvitation, hashPartnerToken, invitePartnerMember, signUpPartner, type PartnerMemberActor } from "./partners";
import {
  archivePartnerPackage,
  createPartnerPackage,
  getPartnerStripeConnection,
  listPartnerPackages,
  recordStripeConnectEvent,
  renamePartnerPackage,
  startPartnerStripeOnboarding,
  type PartnerPackageInput,
} from "./partnerStripe";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner Stripe integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "self_hosted_standard");
  vi.stubEnv("PARTNER_SIGNUP", "");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "");
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
});
afterEach(() => { vi.unstubAllEnvs(); });

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

/** Reads what the migrator sees, then goes back to the app role. */
async function asMigrator<T>(tx: DatabaseTransaction, read: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  try {
    return await read();
  } finally {
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** A partner with an owner, an admin and a member, and the fake Stripe its context talks to. */
async function partnerWithTeam(tx: DatabaseTransaction) {
  const [owner, admin, member] = await people(tx, 3);
  const stripe = new FakeStripeConnect();
  const context = { db: tx as unknown as Database, stripeConnect: stripe };
  const { partnerId } = await signUpPartner(context, { userId: owner!.userId, email: owner!.email, emailVerified: true, name: `Partner ${randomUUID().slice(0, 6)}` });
  const ownerActor: PartnerMemberActor = { kind: "member", partnerId, userId: owner!.userId, role: "owner" };
  const join = async (person: Person, role: "admin" | "member"): Promise<PartnerMemberActor> => {
    const { invitationId } = await invitePartnerMember(context, ownerActor, { email: person.email, role });
    const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.aggregateId, invitationId)));
    const token = new URL(String(message!.payload.url)).searchParams.get("token")!;
    await acceptPartnerInvitation(context, { userId: person.userId, tokenHash: hashPartnerToken(token), email: person.email, emailVerified: true });
    return { kind: "member", partnerId, userId: person.userId, role };
  };
  return { context, stripe, partnerId, owner: ownerActor, admin: await join(admin!, "admin"), member: await join(member!, "member") };
}

const urls = { returnUrl: "https://desk.example.test/partner/p/stripe?onboarding=return", refreshUrl: "https://desk.example.test/partner/p/stripe?onboarding=refresh" };

/** A partner whose owner connected a Canadian account that Stripe now lets take payments. */
async function connectedPartner(tx: DatabaseTransaction) {
  const team = await partnerWithTeam(tx);
  const { accountId } = await startPartnerStripeOnboarding(team.context, team.owner, { country: "CA", ...urls });
  team.stripe.updateAccount(accountId, { currency: "CAD", detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, disabledReason: null });
  await deliver(team, "account.updated", accountId);
  return { ...team, accountId };
}

/** Sends a Connect delivery through the fake's signature check, as the webhook route does. */
async function deliver(team: { context: { db: Database }; stripe: FakeStripeConnect }, type: string, accountId: string, extra: { eventId?: string; createdAt?: Date } = {}) {
  const { body, signature } = team.stripe.delivery(type, { accountId, ...extra });
  return await recordStripeConnectEvent(team.context, team.stripe.verifyWebhook(body, signature));
}

async function refusal(promise: Promise<unknown>): Promise<{ status?: number | undefined; code?: string | undefined }> {
  return await promise.then(() => ({}), (error: { status?: number; code?: string }) => ({ status: error.status, code: error.code }));
}

const frontDesk: PartnerPackageInput = { name: "Front desk", monthlyPriceMinor: 14900, setupFeeMinor: 5000, voiceMinutes: 300, chats: 1000 };

describe.skipIf(!client)("a partner's Stripe connection", () => {
  it("shows only owners the Stripe page, and says when the deployment has no Stripe Connect", async () => {
    await rollbackTest(async (tx) => {
      const team = await partnerWithTeam(tx);
      expect(await getPartnerStripeConnection(team.context, team.owner)).toEqual({ configured: true, status: "not_connected", accountId: null, country: null, currency: null, detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false, disconnectedAt: null });
      expect(await refusal(getPartnerStripeConnection(team.context, team.admin))).toEqual({ status: 403, code: "owner_only" });
      expect(await refusal(getPartnerStripeConnection(team.context, team.member))).toEqual({ status: 403, code: "owner_only" });
      expect((await getPartnerStripeConnection({ db: team.context.db }, team.owner)).configured).toBe(false);
      expect(await refusal(startPartnerStripeOnboarding({ db: team.context.db }, team.owner, { country: "CA", ...urls }))).toEqual({ status: 409, code: "stripe_not_configured" });
    });
  });

  it("creates the partner's account in the country the owner chose, and resumes onboarding on it after that", async () => {
    await rollbackTest(async (tx) => {
      const team = await partnerWithTeam(tx);
      expect(await refusal(startPartnerStripeOnboarding(team.context, team.owner, { country: null, ...urls }))).toEqual({ status: 400, code: "invalid_country" });
      expect(await refusal(startPartnerStripeOnboarding(team.context, team.owner, { country: "RS", ...urls }))).toEqual({ status: 400, code: "invalid_country" });
      expect(await refusal(startPartnerStripeOnboarding(team.context, team.admin, { country: "CA", ...urls }))).toEqual({ status: 403, code: "owner_only" });

      const first = await startPartnerStripeOnboarding(team.context, team.owner, { country: "CA", ...urls });
      expect(first.url).toContain(first.accountId);
      expect(team.stripe.onboardingLinks[0]).toMatchObject({ accountId: null, country: "CA", ...urls, metadata: { lobbystack_partner_id: team.partnerId } });
      expect(await getPartnerStripeConnection(team.context, team.owner)).toMatchObject({ status: "onboarding", accountId: first.accountId, country: "CA" });

      const again = await startPartnerStripeOnboarding(team.context, team.owner, { country: "US", ...urls });
      expect(again.accountId).toBe(first.accountId);
      expect(team.stripe.onboardingLinks[1]).toMatchObject({ accountId: first.accountId, country: null });
      expect(team.stripe.accounts.size).toBe(1);
    });
  });

  it("continues onboarding the account another owner connected first, when both start at once", async () => {
    await rollbackTest(async (tx) => {
      const team = await partnerWithTeam(tx);
      const createLink = team.stripe.createOnboardingLink.bind(team.stripe);
      let theirs: string | undefined;
      team.stripe.createOnboardingLink = async (input) => {
        if (input.accountId === null && !theirs) {
          // Another owner's onboarding records its account while Stripe makes this one.
          theirs = (await createLink({ ...input, country: "FR", idempotencyKey: "another-owner" })).accountId;
          await withBusinessTransaction(team.context.db, { actorType: "system" }, async (inner) => await inner.insert(partnerStripeAccounts).values({ partnerId: team.partnerId, stripeAccountId: theirs!, country: "FR" }));
        }
        return await createLink(input);
      };
      const started = await startPartnerStripeOnboarding(team.context, team.owner, { country: "CA", ...urls });
      expect(started.accountId).toBe(theirs);
      expect(team.stripe.onboardingLinks.at(-1)).toMatchObject({ accountId: theirs });
      expect(await getPartnerStripeConnection(team.context, team.owner)).toMatchObject({ accountId: theirs, country: "FR" });
    });
  });

  it("records what the Connect webhook says of the account, once per event and never older news over newer", async () => {
    await rollbackTest(async (tx) => {
      const team = await partnerWithTeam(tx);
      const { accountId } = await startPartnerStripeOnboarding(team.context, team.owner, { country: "CA", ...urls });

      team.stripe.updateAccount(accountId, { currency: "CAD", detailsSubmitted: true });
      expect(await deliver(team, "account.updated", accountId, { eventId: "evt_review", createdAt: new Date("2026-10-26T10:00:00Z") })).toEqual({ duplicate: false, applied: true, partnerId: team.partnerId });
      expect(await getPartnerStripeConnection(team.context, team.owner)).toMatchObject({ status: "restricted", currency: "CAD", detailsSubmitted: true, chargesEnabled: false });

      team.stripe.updateAccount(accountId, { chargesEnabled: true, payoutsEnabled: true, disabledReason: null });
      await deliver(team, "account.updated", accountId, { eventId: "evt_live", createdAt: new Date("2026-10-26T11:00:00Z") });
      expect(await deliver(team, "account.updated", accountId, { eventId: "evt_live", createdAt: new Date("2026-10-26T11:00:00Z") })).toEqual({ duplicate: true, applied: false, partnerId: null });

      // A retry of the earlier event arrives late, under a new id, saying the account can't take payments.
      team.stripe.updateAccount(accountId, { chargesEnabled: false });
      expect(await deliver(team, "account.updated", accountId, { eventId: "evt_review_late", createdAt: new Date("2026-10-26T10:30:00Z") })).toEqual({ duplicate: false, applied: false, partnerId: team.partnerId });
      expect(await getPartnerStripeConnection(team.context, team.owner)).toMatchObject({ status: "active", chargesEnabled: true, payoutsEnabled: true });

      const stored = await asMigrator(tx, async () => await tx.select({ providerEventId: providerEvents.providerEventId, status: providerEvents.status, businessId: providerEvents.businessId, payload: providerEvents.payload }).from(providerEvents).where(eq(providerEvents.provider, "stripe")));
      expect(stored.map(({ providerEventId, status }) => [providerEventId, status]).sort()).toEqual([["evt_live", "processed"], ["evt_review", "processed"], ["evt_review_late", "ignored"]]);
      expect(stored.every((event) => event.businessId === null)).toBe(true);
      // Only the account's state is kept, not the rest of what Stripe holds of the partner.
      expect(Object.keys(stored[0]!.payload).sort()).toEqual(["account", "accountId", "createdAt"]);
    });
  });

  it("marks the account disconnected when the partner disconnects it, and connects a new account after that", async () => {
    await rollbackTest(async (tx) => {
      const team = await connectedPartner(tx);
      expect(await deliver(team, "account.application.deauthorized", team.accountId)).toMatchObject({ applied: true, partnerId: team.partnerId });
      const disconnected = await getPartnerStripeConnection(team.context, team.owner);
      expect(disconnected).toMatchObject({ status: "disconnected", chargesEnabled: false, accountId: team.accountId });
      expect(disconnected.disconnectedAt).toEqual(expect.any(String));

      // News of the old account no longer applies.
      expect(await deliver(team, "account.updated", team.accountId)).toMatchObject({ applied: false });
      expect(await deliver(team, "account.application.deauthorized", team.accountId)).toMatchObject({ applied: false });

      const reconnected = await startPartnerStripeOnboarding(team.context, team.owner, { country: "US", ...urls });
      expect(reconnected.accountId).not.toBe(team.accountId);
      expect(await getPartnerStripeConnection(team.context, team.owner)).toMatchObject({ status: "onboarding", accountId: reconnected.accountId, country: "US", currency: null, chargesEnabled: false, disconnectedAt: null });
    });
  });

  it("ignores events about accounts no partner has", async () => {
    await rollbackTest(async (tx) => {
      const team = await partnerWithTeam(tx);
      team.stripe.accounts.set("acct_stranger", { accountId: "acct_stranger", country: "US", currency: "USD", detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, disabledReason: null });
      expect(await deliver(team, "account.updated", "acct_stranger")).toEqual({ duplicate: false, applied: false, partnerId: null });
      expect(await deliver(team, "checkout.session.completed", "acct_stranger")).toEqual({ duplicate: false, applied: false, partnerId: null });
    });
  });

  it("asks Stripe for the account when the owner comes back from onboarding, and keeps what it knows when Stripe can't answer", async () => {
    await rollbackTest(async (tx) => {
      const team = await partnerWithTeam(tx);
      const { accountId } = await startPartnerStripeOnboarding(team.context, team.owner, { country: "CA", ...urls });
      team.stripe.updateAccount(accountId, { currency: "CAD", detailsSubmitted: true, chargesEnabled: true });
      expect(await getPartnerStripeConnection(team.context, team.owner)).toMatchObject({ status: "onboarding" });

      team.stripe.failNextCall();
      expect(await getPartnerStripeConnection(team.context, team.owner, { refresh: true })).toMatchObject({ status: "onboarding" });
      expect(await getPartnerStripeConnection(team.context, team.owner, { refresh: true })).toMatchObject({ status: "active", currency: "CAD" });

      // A webhook event older than that read changes nothing.
      team.stripe.updateAccount(accountId, { chargesEnabled: false });
      expect(await deliver(team, "account.updated", accountId, { createdAt: new Date(Date.now() - 60_000) })).toMatchObject({ applied: false });
    });
  });

  it("lets no runtime role but the system actor write the connection, and keeps it from members", async () => {
    await rollbackTest(async (tx) => {
      const team = await connectedPartner(tx);
      const asOperator = async (actor: PartnerMemberActor, statement: ReturnType<typeof sql>) => await withBusinessTransaction(team.context.db, { userId: actor.userId, actorType: "operator" }, async (inner) => await inner.execute(statement));
      const errorCode = (promise: Promise<unknown>) => promise.then(() => null, (error: { cause?: { code?: string } }) => error.cause?.code ?? "error");

      expect((await asOperator(team.member, sql`select * from public.partner_stripe_accounts`)).rows).toEqual([]);
      expect((await asOperator(team.admin, sql`select stripe_account_id from public.partner_stripe_accounts`)).rows).toEqual([{ stripe_account_id: team.accountId }]);
      const updated = await asOperator(team.owner, sql`update public.partner_stripe_accounts set charges_enabled = false where partner_id = ${team.partnerId}::uuid`);
      expect(updated.rowCount).toBe(0);
      expect(await errorCode(asOperator(team.owner, sql`insert into public.partner_stripe_accounts (partner_id, stripe_account_id) values (${team.partnerId}::uuid, 'acct_forged')`))).toBe("42501");
      expect(await errorCode(withBusinessTransaction(team.context.db, { actorType: "system" }, async (inner) => await inner.execute(sql`update public.partner_stripe_accounts set partner_id = ${randomUUID()}::uuid`)))).toBe("42501");
    });
  });
});

describe.skipIf(!client)("a partner's packages", () => {
  it("creates a package's prices on the partner's own account, in its currency, and lists it for owners and admins", async () => {
    await rollbackTest(async (tx) => {
      const team = await connectedPartner(tx);
      const created = await createPartnerPackage(team.context, team.admin, { ...frontDesk, name: "  Front   desk " });
      expect(created).toEqual({ packageId: expect.any(String), name: "Front desk", currency: "CAD", monthlyPriceMinor: 14900, setupFeeMinor: 5000, allowance: { voiceMinutes: 300, chats: 1000 }, onConnectedAccount: true, createdAt: expect.any(String) });

      const prices = [...team.stripe.prices.values()];
      expect(prices).toEqual([
        { accountId: team.accountId, productId: expect.any(String), currency: "CAD", unitAmountMinor: 14900, recurring: true, active: true },
        { accountId: team.accountId, productId: prices[0]!.productId, currency: "CAD", unitAmountMinor: 5000, recurring: false, active: true },
      ]);
      expect(team.stripe.products.get(prices[0]!.productId)).toEqual({ accountId: team.accountId, name: "Front desk", active: true });

      const basic = await createPartnerPackage(team.context, team.owner, { ...frontDesk, name: "Basic", setupFeeMinor: null });
      expect(basic.setupFeeMinor).toBeNull();
      const listed = await listPartnerPackages(team.context, team.owner);
      expect(listed).toEqual({ role: "owner", stripe: { configured: true, status: "active", currency: "CAD" }, packages: expect.any(Array) });
      // Both were made in this test's one transaction, so they share a creation time.
      expect([...listed.packages].sort((a, b) => a.name.localeCompare(b.name))).toEqual([basic, created]);
      expect((await listPartnerPackages(team.context, team.admin)).role).toBe("admin");
      expect(await refusal(listPartnerPackages(team.context, team.member))).toEqual({ status: 403, code: "forbidden" });
      expect(await refusal(createPartnerPackage(team.context, team.member, frontDesk))).toEqual({ status: 403, code: "forbidden" });
    });
  });

  it("refuses a package before Stripe is connected or on a deployment without it, and terms it can't sell", async () => {
    await rollbackTest(async (tx) => {
      const team = await partnerWithTeam(tx);
      expect(await refusal(createPartnerPackage({ db: team.context.db }, team.admin, frontDesk))).toEqual({ status: 409, code: "stripe_not_configured" });
      expect(await refusal(createPartnerPackage(team.context, team.admin, frontDesk))).toEqual({ status: 409, code: "stripe_not_connected" });
      // Onboarding started, and Stripe hasn't given the account its currency yet.
      await startPartnerStripeOnboarding(team.context, team.owner, { country: "CA", ...urls });
      expect(await refusal(createPartnerPackage(team.context, team.admin, frontDesk))).toEqual({ status: 409, code: "stripe_not_connected" });
      expect((await listPartnerPackages(team.context, team.admin)).stripe).toEqual({ configured: true, status: "onboarding", currency: null });

      for (const [input, code] of [
        [{ ...frontDesk, name: " " }, "invalid_name"],
        [{ ...frontDesk, monthlyPriceMinor: 0 }, "invalid_price"],
        [{ ...frontDesk, monthlyPriceMinor: 49.5 }, "invalid_price"],
        [{ ...frontDesk, setupFeeMinor: -1 }, "invalid_setup_fee"],
        [{ ...frontDesk, voiceMinutes: 1_000_001 }, "invalid_allowance"],
        [{ ...frontDesk, chats: "lots" }, "invalid_allowance"],
      ] as const) {
        expect(await refusal(createPartnerPackage(team.context, team.admin, input)), code).toEqual({ status: 400, code });
      }
      expect(team.stripe.products.size).toBe(0);
    });
  });

  it("renames a package on Stripe too, and archiving takes its prices off sale and off the list", async () => {
    await rollbackTest(async (tx) => {
      const team = await connectedPartner(tx);
      const created = await createPartnerPackage(team.context, team.admin, frontDesk);
      const [monthly, setup] = [...team.stripe.prices.keys()];

      expect(await renamePartnerPackage(team.context, team.admin, { packageId: created.packageId, name: "Front desk plus" })).toMatchObject({ name: "Front desk plus", monthlyPriceMinor: 14900 });
      expect([...team.stripe.products.values()]).toEqual([{ accountId: team.accountId, name: "Front desk plus", active: true }]);
      expect(await refusal(renamePartnerPackage(team.context, team.member, { packageId: created.packageId, name: "Mine" }))).toEqual({ status: 403, code: "forbidden" });
      expect(await refusal(renamePartnerPackage(team.context, team.admin, { packageId: randomUUID(), name: "Nothing" }))).toEqual({ status: 404, code: "package_not_found" });

      await archivePartnerPackage(team.context, team.owner, { packageId: created.packageId });
      expect(team.stripe.prices.get(monthly!)?.active).toBe(false);
      expect(team.stripe.prices.get(setup!)?.active).toBe(false);
      expect([...team.stripe.products.values()][0]?.active).toBe(false);
      expect((await listPartnerPackages(team.context, team.admin)).packages).toEqual([]);
      expect(await refusal(archivePartnerPackage(team.context, team.owner, { packageId: created.packageId }))).toEqual({ status: 404, code: "package_not_found" });
    });
  });

  it("keeps a package on the account it was made on after the partner disconnects, where it can't sell", async () => {
    await rollbackTest(async (tx) => {
      const team = await connectedPartner(tx);
      const created = await createPartnerPackage(team.context, team.admin, frontDesk);
      await deliver(team, "account.application.deauthorized", team.accountId);

      const listed = await listPartnerPackages(team.context, team.admin);
      expect(listed.stripe).toEqual({ configured: true, status: "disconnected", currency: null });
      expect(listed.packages).toEqual([{ ...created, onConnectedAccount: false }]);
      expect(await refusal(renamePartnerPackage(team.context, team.admin, { packageId: created.packageId, name: "Renamed" }))).toEqual({ status: 409, code: "stripe_not_connected" });
      expect(await refusal(createPartnerPackage(team.context, team.admin, frontDesk))).toEqual({ status: 409, code: "stripe_not_connected" });

      // The deployment can't reach the old account, so archiving it only stops it here.
      await archivePartnerPackage(team.context, team.admin, { packageId: created.packageId });
      expect((await listPartnerPackages(team.context, team.admin)).packages).toEqual([]);
      expect([...team.stripe.prices.values()].every((price) => price.active)).toBe(true);
    });
  });

  it("lets the database take a package only on the partner's own connected account, and never change what businesses pay", async () => {
    await rollbackTest(async (tx) => {
      const team = await connectedPartner(tx);
      const other = await connectedPartner(tx);
      const created = await createPartnerPackage(team.context, team.admin, frontDesk);
      const errorOf = (promise: Promise<unknown>) => promise.then(() => null, (error: { cause?: { code?: string; message?: string } }) => error.cause?.message === "package_account_mismatch" ? "package_account_mismatch" : error.cause?.code ?? "error");
      const asAdmin = async (statement: ReturnType<typeof sql>) => await withBusinessTransaction(team.context.db, { userId: team.admin.userId, actorType: "operator" }, async (inner) => await inner.execute(statement));
      const insert = (accountId: string, currency: string) => sql`insert into public.partner_packages (partner_id, name, currency, monthly_price_minor, voice_minutes, chats, stripe_account_id, stripe_product_id, stripe_price_id) values (${team.partnerId}::uuid, 'Forged', ${currency}, 100, 0, 0, ${accountId}, 'prod_x', 'price_x')`;

      expect(await errorOf(asAdmin(insert(other.accountId, "CAD")))).toBe("package_account_mismatch");
      expect(await errorOf(asAdmin(insert(team.accountId, "USD")))).toBe("package_account_mismatch");
      expect(await errorOf(withBusinessTransaction(team.context.db, { actorType: "system" }, async (inner) => await inner.execute(insert(other.accountId, "CAD"))))).toBe("package_account_mismatch");
      expect(await errorOf(asAdmin(sql`update public.partner_packages set monthly_price_minor = 1 where id = ${created.packageId}::uuid`))).toBe("42501");
      expect(await errorOf(asAdmin(sql`update public.partner_packages set stripe_price_id = 'price_elsewhere' where id = ${created.packageId}::uuid`))).toBe("42501");
      // The other partner's admin sees none of this partner's packages.
      const seen = await withBusinessTransaction(team.context.db, { userId: other.admin.userId, actorType: "operator" }, async (inner) => await inner.execute(sql`select id from public.partner_packages where partner_id = ${team.partnerId}::uuid`));
      expect(seen.rows).toEqual([]);
      expect(await refusal(listPartnerPackages(team.context, { ...other.admin, partnerId: team.partnerId }))).toEqual({ status: 403, code: "forbidden" });
    });
  });
});
