import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabaseClient, outboxMessages, partnerBillingAccounts, partnerDomains, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { CustomHostnameRefusedError } from "@lobbystack/providers/customHostnames/customHostnames";
import { FakeCustomHostnames, FakeTxtRecords } from "@lobbystack/providers/customHostnames/fakeCustomHostnames";

import type { BrandChange } from "./brands";
import { forgetCachedBrands, resolveHostBrand } from "./brands";
import { addPartnerCustomDomain, checkPartnerCustomDomains, getPartnerDomains, provisionPartnerCustomDomain, removePartnerCustomDomain, removePartnerCustomHostname } from "./partnerDomains";
import { acceptPartnerInvitation, createPartnerBusiness, hashPartnerToken, invitePartnerMember, signUpPartner, type PartnerMemberActor } from "./partners";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner domain integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

// The Polar products a host sells tiers with.
const TIER_PRODUCTS = Object.fromEntries(["STARTER", "GROWTH", "SCALE"].flatMap((tier) => ["MONTHLY", "ANNUAL"].map((interval) => [`POLAR_PARTNER_${tier}_${interval}_PRODUCT_ID`, `prod_${tier.toLowerCase()}_${interval.toLowerCase()}`])));

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "self_hosted_standard");
  vi.stubEnv("PARTNER_SIGNUP", "open");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("MARKETING_HOSTS", "www.example.test");
  vi.stubEnv("AUTH_TRUSTED_ORIGINS", "");
  vi.stubEnv("EMAIL_FROM", "Front Desk <no-reply@desk.example.test>");
  vi.stubEnv("CLOUDFLARE_SAAS_API_TOKEN", "test-token");
  vi.stubEnv("CLOUDFLARE_SAAS_ZONE_ID", "test-zone");
  vi.stubEnv("CADDY_ON_DEMAND_TLS", "");
  for (const name of Object.keys(TIER_PRODUCTS)) vi.stubEnv(name, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
});

function sellTiers(): void {
  for (const [name, value] of Object.entries(TIER_PRODUCTS)) vi.stubEnv(name, value);
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

/** Runs as the worker role, as the worker does, then goes back to the app role. */
async function asWorker<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`set local session authorization lobbystack_worker`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`reset session authorization`);
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** A refusal's error, or the database error a refused statement raised. */
async function refusal(promise: Promise<unknown>): Promise<{ status?: number; code?: string; message?: string }> {
  return await promise.then(() => ({}), (error: { cause?: { code?: string; message?: string } } & Record<string, unknown>) => (error.cause?.code ? error.cause : error) as { status?: number; code?: string; message?: string });
}

/** The link token in the email queued for a team invitation. */
async function linkToken(tx: DatabaseTransaction, invitationId: string): Promise<string> {
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

/** A partner signed up by its owner, with an admin and a member on its team, and a context that records the brand changes it announces. */
async function partner(tx: DatabaseTransaction, name: string) {
  const [owner, admin, member] = await people(tx, 3);
  const announced: BrandChange[] = [];
  const context = { db: tx as unknown as Database, brandChanges: { publish: async (change: BrandChange) => { announced.push(change); } } };
  const { partnerId, subdomain } = await signUpPartner(context, { userId: owner!.userId, email: owner!.email, emailVerified: true, name: `${name} ${randomUUID().slice(0, 8)}` });
  const actor = (person: Person, role: PartnerMemberActor["role"]): PartnerMemberActor => ({ kind: "member", partnerId, userId: person.userId, role });
  const ownerActor = actor(owner!, "owner");
  for (const [person, role] of [[admin!, "admin"], [member!, "member"]] as const) {
    const { invitationId } = await invitePartnerMember(context, ownerActor, { email: person.email, role });
    await acceptPartnerInvitation(context, { userId: person.userId, tokenHash: hashPartnerToken(await linkToken(tx, invitationId)), email: person.email, emailVerified: true });
  }
  return { context, announced, partnerId, subdomain: subdomain!, ownerActor, adminActor: actor(admin!, "admin"), memberActor: actor(member!, "member") };
}

/** Gives the partner a live paid tier, as reconciling Polar's subscription would. */
async function payForTier(tx: DatabaseTransaction, partnerId: string): Promise<void> {
  await asMigrator(tx, async () => await tx.insert(partnerBillingAccounts).values({ partnerId, billingKey: `partner:${partnerId}`, tier: "starter", billingInterval: "monthly", subscriptionState: "active", poolVoiceSeconds: 15_000, poolChats: 1_000, includedNumbers: 2 }));
}

async function domainRow(tx: DatabaseTransaction, hostname: string) {
  return (await asMigrator(tx, async () => await tx.select().from(partnerDomains).where(eq(partnerDomains.hostname, hostname))))[0];
}

async function queued(tx: DatabaseTransaction, topic: string, aggregateId: string) {
  return await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload, businessId: outboxMessages.businessId }).from(outboxMessages).where(and(eq(outboxMessages.topic, topic), eq(outboxMessages.aggregateId, aggregateId))));
}

/** A hostname of its own for each test, so suites running at once never hold the same one. */
function ownHostname(): string {
  return `app.${randomUUID().slice(0, 8)}.example`;
}

/** The worker's view of the world: the custom hostname provider, and the DNS that holds partners' TXT records. */
function worldOf(tx: DatabaseTransaction, kind: "cloudflare" | "caddy" = "cloudflare", context: { brandChanges?: { publish(change: BrandChange): Promise<void> } } = {}) {
  const hostnames = new FakeCustomHostnames(kind);
  const dns = new FakeTxtRecords();
  return { hostnames, dns, providers: { hostnames, lookupTxt: dns.lookup }, worker: { db: tx as unknown as Database, ...context } };
}

/** The partner adds the TXT record its domain's row asks for, as its DNS provider would publish it. */
async function prove(tx: DatabaseTransaction, dns: FakeTxtRecords, hostname: string, partnerId: string): Promise<void> {
  const [row] = await asMigrator(tx, async () => await tx.select({ token: partnerDomains.verificationToken }).from(partnerDomains).where(and(eq(partnerDomains.hostname, hostname), eq(partnerDomains.partnerId, partnerId))));
  dns.add(`_domain-verification.${hostname}`, row!.token);
}

const inAMinute = () => new Date(Date.now() + 60_000);

/** Runs the provisioning job for the one domain on this hostname, as the worker does. */
async function provisionAsWorker(tx: DatabaseTransaction, worker: { db: Database }, providers: ReturnType<typeof worldOf>["providers"], hostname: string) {
  const row = await domainRow(tx, hostname);
  return await asWorker(tx, () => provisionPartnerCustomDomain(worker, providers, { domainId: row!.id }));
}

describe.skipIf(!testUrl)("adding a partner's own domain", () => {
  it("adds it as pending for owners and admins, shows the records once the worker set it up, and queues nothing else", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      const hostname = ownHostname();
      const added = await addPartnerCustomDomain(team.context, team.adminActor, { hostname: ` https://${hostname.toUpperCase()}/ ` });
      expect(added).toMatchObject({ role: "admin", subdomain: team.subdomain, customDomains: "available", custom: { hostname, status: "pending", records: [], errors: [], checkedAt: null, url: null, taken: false } });
      const row = await domainRow(tx, hostname);
      expect(row).toMatchObject({ partnerId: team.partnerId, kind: "custom", provider: "cloudflare", providerHostnameId: null, verifiedAt: null });
      // Its own token, for the TXT record that proves the partner controls the domain.
      expect(row!.verificationToken).toMatch(/^[0-9a-f]{32}$/);
      // The job belongs to no business.
      expect(await queued(tx, "partnerDomain.provision", row!.id)).toEqual([{ businessId: null, payload: { partnerId: team.partnerId, domainId: row!.id } }]);
      // Not verified, so it carries no brand yet.
      expect(await resolveHostBrand(team.context, hostname)).toBeNull();
      // The team sees it, members included.
      expect((await getPartnerDomains(team.context, team.memberActor)).custom).toMatchObject({ hostname, status: "pending" });
    });
  });

  it("refuses members, platform keys, a second domain and a hostname another partner verified", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      const rival = await partner(tx, "Rival Desk");
      const hostname = ownHostname();
      expect(await refusal(addPartnerCustomDomain(team.context, team.memberActor, { hostname }))).toMatchObject({ status: 403, code: "forbidden" });
      // A key the partner never made answers as an invalid one. partnerKeyApi.integration.test.ts covers real keys.
      expect(await refusal(addPartnerCustomDomain(team.context, { kind: "key", partnerId: team.partnerId, platformKeyId: randomUUID() }, { hostname }))).toMatchObject({ status: 401 });
      await addPartnerCustomDomain(team.context, team.ownerActor, { hostname });
      expect(await refusal(addPartnerCustomDomain(team.context, team.ownerActor, { hostname: ownHostname() }))).toMatchObject({ status: 409, code: "custom_domain_exists" });
      const { hostnames, dns, providers, worker } = worldOf(tx);
      await provisionAsWorker(tx, worker, providers, hostname);
      hostnames.activate(hostname);
      await prove(tx, dns, hostname, team.partnerId);
      await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: inAMinute() }));
      expect(await refusal(addPartnerCustomDomain(rival.context, rival.ownerActor, { hostname }))).toMatchObject({ status: 409, code: "domain_taken" });
      // A partner's subdomain is taken from the start.
      expect(await refusal(addPartnerCustomDomain(rival.context, rival.ownerActor, { hostname: team.subdomain }))).toMatchObject({ status: 409, code: "domain_reserved" });
      expect(await refusal(removePartnerCustomDomain(team.context, team.memberActor))).toMatchObject({ status: 403 });
    });
  });

  it("lets partners claim the same domain while none is verified, and gives it to the first whose TXT record proves it controls the domain", async () => {
    await rollbackTest(async (tx) => {
      const squatter = await partner(tx, "Early Desk");
      const owner = await partner(tx, "Owner Desk");
      const hostname = ownHostname();
      // A claim made first doesn't keep the domain from its owner.
      await addPartnerCustomDomain(squatter.context, squatter.ownerActor, { hostname });
      expect((await addPartnerCustomDomain(owner.context, owner.ownerActor, { hostname })).custom).toMatchObject({ hostname, status: "pending", taken: false });
      const { hostnames, dns, providers, worker } = worldOf(tx, "cloudflare", { brandChanges: owner.context.brandChanges });
      for (const team of [squatter, owner]) {
        const [row] = await asMigrator(tx, async () => await tx.select({ id: partnerDomains.id }).from(partnerDomains).where(and(eq(partnerDomains.hostname, hostname), eq(partnerDomains.partnerId, team.partnerId))));
        await asWorker(tx, () => provisionPartnerCustomDomain(worker, providers, { domainId: row!.id }));
      }
      // Both claims share the provider's one hostname.
      expect(hostnames.hostnames.size).toBe(1);
      hostnames.activate(hostname);
      await prove(tx, dns, hostname, owner.partnerId);
      expect(await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: inAMinute() }))).toMatchObject({ activated: 1, unanswered: 0 });
      expect((await getPartnerDomains(owner.context, owner.ownerActor)).custom).toMatchObject({ status: "active", taken: false });
      expect((await getPartnerDomains(squatter.context, squatter.memberActor)).custom).toMatchObject({ status: "failed", taken: true, url: null });
      expect(await resolveHostBrand(owner.context, hostname)).toMatchObject({ partnerId: owner.partnerId });
      // The losing claim's removal leaves the provider's hostname to the owner.
      await removePartnerCustomDomain(squatter.context, squatter.ownerActor);
      expect(await asWorker(tx, () => removePartnerCustomHostname(worker, hostnames, { hostname, providerHostnameId: hostnames.idOf(hostname) }))).toBe("skipped");
      expect(hostnames.removed).toEqual([]);
    });
  });

  it("refuses an apex, the host's own hostnames and anything under the partner base domain", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      expect(await refusal(addPartnerCustomDomain(team.context, team.ownerActor, { hostname: "acmeagency.com" }))).toMatchObject({ status: 400, code: "invalid_domain" });
      for (const hostname of ["desk.example.test", "www.example.test", "other.portal.example.test", "deep.bright.portal.example.test"]) {
        expect(await refusal(addPartnerCustomDomain(team.context, team.ownerActor, { hostname })), hostname).toMatchObject({ status: 409, code: "domain_reserved" });
      }
    });
  });

  it("needs a paid tier while the deployment bills tiers, and any tier when it bills none", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      sellTiers();
      expect((await getPartnerDomains(team.context, team.adminActor)).customDomains).toBe("paid_tier_required");
      expect(await refusal(addPartnerCustomDomain(team.context, team.adminActor, { hostname: ownHostname() }))).toMatchObject({ status: 403, code: "paid_tier_required" });
      await payForTier(tx, team.partnerId);
      expect((await getPartnerDomains(team.context, team.adminActor)).customDomains).toBe("available");
      await addPartnerCustomDomain(team.context, team.adminActor, { hostname: ownHostname() });

      const selfHosted = await partner(tx, "Self Desk");
      for (const name of Object.keys(TIER_PRODUCTS)) vi.stubEnv(name, "");
      await addPartnerCustomDomain(selfHosted.context, selfHosted.ownerActor, { hostname: ownHostname() });
    });
  });

  it("refuses everyone on a deployment that issues no certificates for partners' domains", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      vi.stubEnv("CLOUDFLARE_SAAS_API_TOKEN", "");
      expect((await getPartnerDomains(team.context, team.ownerActor)).customDomains).toBe("unavailable");
      expect(await refusal(addPartnerCustomDomain(team.context, team.ownerActor, { hostname: ownHostname() }))).toMatchObject({ status: 409, code: "custom_domains_unavailable" });
    });
  });
});

describe.skipIf(!testUrl)("setting a partner's own domain up with the provider", () => {
  it("registers it, shows the DNS records, and turns it into the partner's brand once the provider says it's active and its TXT record checks out", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      const hostname = ownHostname();
      await addPartnerCustomDomain(team.context, team.adminActor, { hostname });
      const row = await domainRow(tx, hostname);
      const { hostnames, dns, providers, worker } = worldOf(tx, "cloudflare", { brandChanges: team.context.brandChanges });
      const proof = { type: "TXT", name: `_domain-verification.${hostname}`, value: row!.verificationToken };

      expect(await asWorker(tx, () => provisionPartnerCustomDomain(worker, providers, { domainId: row!.id }))).toBe("provisioned");
      expect(hostnames.created).toEqual([hostname]);
      const pending = await getPartnerDomains(team.context, team.adminActor);
      expect(pending.custom).toMatchObject({ hostname, status: "pending", records: [{ type: "CNAME", name: hostname, value: "edge.portal.example.test", verified: false }, { ...proof, verified: false }] });
      expect(pending.custom!.checkedAt).not.toBeNull();
      // Running the job again registers nothing twice.
      expect(await asWorker(tx, () => provisionPartnerCustomDomain(worker, providers, { domainId: row!.id }))).toBe("provisioned");
      expect(hostnames.created).toEqual([hostname]);

      // The provider serving the domain isn't enough: anyone can point a CNAME here.
      hostnames.activate(hostname);
      expect(await asWorker(tx, () => checkPartnerCustomDomains(worker, providers))).toMatchObject({ checked: 0 });
      expect(await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: inAMinute() }))).toEqual({ checked: 1, activated: 0, failed: 0, unanswered: 0 });
      expect((await getPartnerDomains(team.context, team.adminActor)).custom).toMatchObject({ status: "pending", records: [{ type: "CNAME", verified: true }, { ...proof, verified: false }] });
      expect(await resolveHostBrand(team.context, hostname)).toBeNull();

      // The partner's TXT record, beside another value at the same name, proves it controls the domain.
      dns.add(proof.name, "someone-else");
      await prove(tx, dns, hostname, team.partnerId);
      team.announced.length = 0;
      expect(await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: new Date(Date.now() + 2 * 60_000) }))).toEqual({ checked: 1, activated: 1, failed: 0, unanswered: 0 });
      // Every process hears of it, and its cache then answers the hostname with the partner's brand.
      expect(team.announced).toEqual([{ kind: "partner", partnerId: team.partnerId }]);
      // Links keep going to the subdomain, where sign-up works on every deployment.
      expect(await resolveHostBrand(team.context, hostname)).toMatchObject({ kind: "partner", partnerId: team.partnerId, origin: `https://${team.subdomain}` });
      expect((await getPartnerDomains(team.context, team.memberActor)).custom).toMatchObject({ status: "active", url: `https://${hostname}`, records: [{ verified: true }, { verified: true }] });
      // An active domain isn't checked again.
      expect(await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: new Date(Date.now() + 2 * 60 * 60_000) }))).toEqual({ checked: 0, activated: 0, failed: 0, unanswered: 0 });
    });
  });

  it("never lets a partner take a domain whose DNS still points here from an earlier partner", async () => {
    await rollbackTest(async (tx) => {
      const earlier = await partner(tx, "Earlier Desk");
      const taker = await partner(tx, "Taker Desk");
      const hostname = ownHostname();
      const { hostnames, dns, providers, worker } = worldOf(tx);
      await addPartnerCustomDomain(earlier.context, earlier.ownerActor, { hostname });
      await provisionAsWorker(tx, worker, providers, hostname);
      hostnames.activate(hostname);
      await prove(tx, dns, hostname, earlier.partnerId);
      await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: inAMinute() }));
      // The earlier partner leaves, and its CNAME and TXT record stay.
      await removePartnerCustomDomain(earlier.context, earlier.ownerActor);
      await addPartnerCustomDomain(taker.context, taker.ownerActor, { hostname });
      // The provider still serves the hostname, and registering it again finds it active.
      expect(await provisionAsWorker(tx, worker, providers, hostname)).toBe("provisioned");
      expect((await getPartnerDomains(taker.context, taker.ownerActor)).custom).toMatchObject({ status: "pending", records: [{ type: "CNAME", verified: true }, { type: "TXT", verified: false }] });
      expect(await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: inAMinute() }))).toMatchObject({ activated: 0 });
      expect(await resolveHostBrand(taker.context, hostname)).toBeNull();
    });
  });

  it("records the provider's errors when it gives up, and the domain never carries the brand", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      const hostname = ownHostname();
      await addPartnerCustomDomain(team.context, team.ownerActor, { hostname });
      const row = await domainRow(tx, hostname);
      const { hostnames, providers, worker } = worldOf(tx);
      await asWorker(tx, () => provisionPartnerCustomDomain(worker, providers, { domainId: row!.id }));
      hostnames.fail(hostname, ["Validation timed out."]);
      expect(await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: inAMinute() }))).toEqual({ checked: 1, activated: 0, failed: 1, unanswered: 0 });
      expect((await getPartnerDomains(team.context, team.ownerActor)).custom).toMatchObject({ status: "failed", errors: ["Validation timed out."], url: null });
      expect(await resolveHostBrand(team.context, hostname)).toBeNull();
    });
  });

  it("checks every domain it can when the provider can't answer for one, and that one waits its turn rather than holding the front of every run", async () => {
    await rollbackTest(async (tx) => {
      const first = await partner(tx, "First Desk");
      const second = await partner(tx, "Second Desk");
      const { hostnames, dns, providers, worker } = worldOf(tx);
      const names = [ownHostname(), ownHostname()];
      for (const [team, hostname] of [[first, names[0]!], [second, names[1]!]] as const) {
        await addPartnerCustomDomain(team.context, team.ownerActor, { hostname });
        await provisionAsWorker(tx, worker, providers, hostname);
        hostnames.activate(hostname);
        await prove(tx, dns, hostname, team.partnerId);
      }
      const checkedBefore: number[] = [];
      for (const hostname of names) checkedBefore.push((await domainRow(tx, hostname))!.checkedAt!.getTime());
      hostnames.failNextCall();
      expect(await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: inAMinute() }))).toEqual({ checked: 1, activated: 1, failed: 0, unanswered: 1 });
      // The other one went live; the first waits for the next check, which counts from this attempt.
      const rows: NonNullable<Awaited<ReturnType<typeof domainRow>>>[] = [];
      for (const hostname of names) rows.push((await domainRow(tx, hostname))!);
      expect(rows.map((row) => Boolean(row.verifiedAt)).sort()).toEqual([false, true]);
      const waiting = rows.findIndex((row) => !row.verifiedAt);
      expect(rows[waiting]!.checkedAt!.getTime()).toBeGreaterThanOrEqual(checkedBefore[waiting]!);
      expect(await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: new Date(Date.now() + 30_000) }))).toMatchObject({ checked: 0, unanswered: 0 });
      expect(await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: inAMinute() }))).toMatchObject({ checked: 1, activated: 1 });
    });
  });

  it("fails the job only when nothing answered, as when DNS or the provider is down", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      const hostname = ownHostname();
      const { dns, providers, worker } = worldOf(tx);
      await addPartnerCustomDomain(team.context, team.ownerActor, { hostname });
      await provisionAsWorker(tx, worker, providers, hostname);
      dns.failNextLookup();
      await expect(asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: inAMinute() }))).rejects.toThrow("couldn't answer for any of 1");
      expect((await getPartnerDomains(team.context, team.ownerActor)).custom).toMatchObject({ status: "pending" });
    });
  });

  it("registers a domain on the scheduler's check when the provider was down through its provisioning job, and shows the provider's reasons when it turns the domain down", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      const hostname = ownHostname();
      const { hostnames, providers, worker } = worldOf(tx);
      await addPartnerCustomDomain(team.context, team.ownerActor, { hostname });
      const row = await domainRow(tx, hostname);
      hostnames.failNextCall();
      await expect(asWorker(tx, () => provisionPartnerCustomDomain(worker, providers, { domainId: row!.id }))).rejects.toThrow("unavailable");
      expect(await domainRow(tx, hostname)).toMatchObject({ providerHostnameId: null, providerErrors: [] });
      expect((await getPartnerDomains(team.context, team.ownerActor)).custom).toMatchObject({ status: "pending", records: [] });
      // Cloudflare turns the hostname down on the next try, and says why.
      hostnames.failNextCall(new CustomHostnameRefusedError(["Custom hostname is not allowed."]));
      await expect(asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: inAMinute() }))).rejects.toThrow("couldn't answer for any of 1");
      expect((await getPartnerDomains(team.context, team.ownerActor)).custom).toMatchObject({ status: "pending", errors: ["Custom hostname is not allowed."], records: [] });
      // Once the provider takes it, the domain shows its records, and the reasons go.
      expect(await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: new Date(Date.now() + 2 * 60_000) }))).toMatchObject({ checked: 1, unanswered: 0 });
      expect(hostnames.created).toEqual([hostname]);
      expect((await getPartnerDomains(team.context, team.ownerActor)).custom).toMatchObject({ status: "pending", errors: [], records: [{ type: "CNAME" }, { type: "TXT" }] });
    });
  });

  it("leaves a domain another provider set up alone", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      const hostname = ownHostname();
      await addPartnerCustomDomain(team.context, team.ownerActor, { hostname });
      const row = await domainRow(tx, hostname);
      const caddy = worldOf(tx, "caddy");
      expect(await asWorker(tx, () => provisionPartnerCustomDomain(caddy.worker, caddy.providers, { domainId: row!.id }))).toBe("skipped");
      expect(await asWorker(tx, () => checkPartnerCustomDomains(caddy.worker, caddy.providers, { now: new Date(Date.now() + 2 * 60_000) }))).toMatchObject({ checked: 0 });
      expect(caddy.hostnames.created).toEqual([]);
    });
  });
});

describe.skipIf(!testUrl)("removing a partner's own domain", () => {
  it("stops answering it everywhere at once, and has the worker remove it from the provider", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      const hostname = ownHostname();
      await addPartnerCustomDomain(team.context, team.ownerActor, { hostname });
      const row = await domainRow(tx, hostname);
      const { hostnames: provider, dns, providers, worker } = worldOf(tx);
      await asWorker(tx, () => provisionPartnerCustomDomain(worker, providers, { domainId: row!.id }));
      provider.activate(hostname);
      await prove(tx, dns, hostname, team.partnerId);
      await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: inAMinute() }));
      expect(await resolveHostBrand(team.context, hostname)).not.toBeNull();

      team.announced.length = 0;
      expect(await removePartnerCustomDomain(team.context, team.adminActor)).toMatchObject({ custom: null, subdomain: team.subdomain });
      expect(team.announced).toEqual([{ kind: "partner", partnerId: team.partnerId }]);
      expect(await resolveHostBrand(team.context, hostname)).toBeNull();
      expect(await resolveHostBrand(team.context, team.subdomain)).toMatchObject({ origin: `https://${team.subdomain}` });
      const [job] = await queued(tx, "partnerDomain.remove", row!.id);
      expect(job).toEqual({ businessId: null, payload: { partnerId: team.partnerId, hostname, provider: "cloudflare", providerHostnameId: provider.idOf(hostname) } });
      expect(await asWorker(tx, () => removePartnerCustomHostname(worker, provider, { hostname, providerHostnameId: String(job!.payload.providerHostnameId) }))).toBe("removed");
      expect(provider.hostnames.size).toBe(0);
      expect(await refusal(removePartnerCustomDomain(team.context, team.adminActor))).toMatchObject({ status: 404, code: "custom_domain_not_found" });
    });
  });

  it("keeps the provider's hostname for a partner that added the domain again, and removes one registered after its domain was removed", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      const { hostnames: provider, providers, worker } = worldOf(tx);
      const hostname = ownHostname();
      await addPartnerCustomDomain(team.context, team.ownerActor, { hostname });
      const first = await domainRow(tx, hostname);
      await asWorker(tx, () => provisionPartnerCustomDomain(worker, providers, { domainId: first!.id }));
      const providerHostnameId = provider.idOf(hostname);
      await removePartnerCustomDomain(team.context, team.ownerActor);
      await addPartnerCustomDomain(team.context, team.ownerActor, { hostname });
      expect(await asWorker(tx, () => removePartnerCustomHostname(worker, provider, { hostname, providerHostnameId }))).toBe("skipped");
      // Registering it again finds the hostname the provider kept.
      const second = await domainRow(tx, hostname);
      await asWorker(tx, () => provisionPartnerCustomDomain(worker, providers, { domainId: second!.id }));
      expect((await domainRow(tx, hostname))!.providerHostnameId).toBe(providerHostnameId);

      // A domain removed while the worker registered it: the worker removes what it registered.
      const other = await partner(tx, "Other Desk");
      const late = ownHostname();
      await addPartnerCustomDomain(other.context, other.ownerActor, { hostname: late });
      const lateRow = await domainRow(tx, late);
      const racing = new FakeCustomHostnames("cloudflare");
      const create = racing.create.bind(racing);
      // The partner removes the domain while the provider registers it, before the worker saved its id.
      racing.create = async (name) => {
        const created = await create(name);
        await tx.execute(sql`reset session authorization`);
        await tx.delete(partnerDomains).where(eq(partnerDomains.id, lateRow!.id));
        await tx.execute(sql`set local session authorization lobbystack_worker`);
        return created;
      };
      expect(await asWorker(tx, () => provisionPartnerCustomDomain(worker, { hostnames: racing, lookupTxt: new FakeTxtRecords().lookup }, { domainId: lateRow!.id }))).toBe("skipped");
      expect(racing.removed).toHaveLength(1);
      expect(racing.hostnames.size).toBe(0);
    });
  });
});

describe.skipIf(!testUrl)("what the database lets each role do with a partner's own domain", () => {
  it("lets only the worker verify a partner's own domain, never the app role or a person", async () => {
    await rollbackTest(async (tx) => {
      const team = await partner(tx, "Bright Desk");
      const hostname = ownHostname();
      await addPartnerCustomDomain(team.context, team.ownerActor, { hostname });
      const row = await domainRow(tx, hostname);
      // As the system actor, the app role can't mark it verified or move it.
      const verified = await withBusinessTransaction(tx as unknown as Database, { actorType: "system" }, async (inner) => await inner.update(partnerDomains).set({ verifiedAt: new Date() }).where(eq(partnerDomains.id, row!.id)).returning({ id: partnerDomains.id }));
      expect(verified).toEqual([]);
      // Nor add one already verified.
      expect(await refusal(withBusinessTransaction(tx as unknown as Database, { actorType: "system" }, async (inner) => await inner.insert(partnerDomains).values({ partnerId: team.partnerId, hostname: ownHostname(), kind: "custom", verifiedAt: new Date() })))).toMatchObject({ code: "42501" });
      // An owner, as a person, deletes nothing directly.
      const deleted = await withBusinessTransaction(tx as unknown as Database, { userId: team.ownerActor.userId, actorType: "operator" }, async (inner) => await inner.delete(partnerDomains).where(eq(partnerDomains.id, row!.id)).returning({ id: partnerDomains.id }));
      expect(deleted).toEqual([]);
      // The worker never moves it to another hostname or partner, or changes the token that proves who controls it.
      expect(await refusal(asWorker(tx, () => withBusinessTransaction(tx as unknown as Database, { actorType: "worker" }, async (inner) => await inner.update(partnerDomains).set({ hostname: ownHostname() }).where(eq(partnerDomains.id, row!.id)))))).toMatchObject({ code: "42501" });
      expect(await refusal(asWorker(tx, () => withBusinessTransaction(tx as unknown as Database, { actorType: "worker" }, async (inner) => await inner.update(partnerDomains).set({ verificationToken: "0".repeat(32) }).where(eq(partnerDomains.id, row!.id)))))).toMatchObject({ code: "42501" });
      // Nor sees a partner's subdomain.
      expect(await asWorker(tx, () => withBusinessTransaction(tx as unknown as Database, { actorType: "worker" }, async (inner) => await inner.select({ id: partnerDomains.id }).from(partnerDomains).where(eq(partnerDomains.partnerId, team.partnerId))))).toEqual([{ id: row!.id }]);
    });
  });
});

describe.skipIf(!testUrl)("a partner whose only domain is its own", () => {
  it("creates businesses once that domain is verified, without a partner base domain", async () => {
    await rollbackTest(async (tx) => {
      vi.stubEnv("PARTNER_BASE_DOMAIN", "");
      const team = await partner(tx, "Own Desk");
      const business = { name: "Clinic", timezone: "America/Toronto", businessType: "clinic", accessLevel: "full", ownerEmail: `${randomUUID()}@example.invalid` };
      expect(await refusal(createPartnerBusiness(team.context, team.adminActor, business))).toMatchObject({ status: 409, code: "partner_domain_required" });
      const hostname = ownHostname();
      await addPartnerCustomDomain(team.context, team.adminActor, { hostname });
      const row = await domainRow(tx, hostname);
      const { hostnames, dns, providers, worker } = worldOf(tx);
      await asWorker(tx, () => provisionPartnerCustomDomain(worker, providers, { domainId: row!.id }));
      hostnames.activate(hostname);
      await prove(tx, dns, hostname, team.partnerId);
      await asWorker(tx, () => checkPartnerCustomDomains(worker, providers, { now: inAMinute() }));
      const { businessId } = await createPartnerBusiness(team.context, team.adminActor, business);
      expect(businessId).toBeTruthy();
      // With no subdomain, the partner's own domain is where its links go.
      expect(await resolveHostBrand(team.context, hostname)).toMatchObject({ partnerId: team.partnerId, origin: `https://${hostname}` });
      // Once the deployment stops serving partners' own domains, links go nowhere it can't answer.
      vi.stubEnv("CLOUDFLARE_SAAS_API_TOKEN", "");
      forgetCachedBrands();
      expect(await resolveHostBrand(team.context, hostname)).toBeNull();
    });
  });
});
