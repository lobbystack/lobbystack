import { and, asc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import { enqueueOutbox, partnerDomains, partnerMembers, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import type { CustomHostnameProvider, TxtLookup } from "@lobbystack/providers";
import {
  currentPartnerSubdomain,
  customDomainOrigin,
  customDomainVerificationName,
  isHostDomain,
  normalizeCustomDomain,
  partnerFeatures,
  partnerOrigin,
  type CustomDomainDnsRecord,
  type CustomDomainStatus,
  type PartnerRole,
} from "@lobbystack/shared";

import { AuthorizationError } from "../authz";
import { announceBrandChange } from "./brands";
import type { DomainContext } from "./context";
import { loadPartnerTierInTransaction } from "./partnerBilling";
import { reservePartnerSubdomain, type PartnerActor, type PartnerMemberActor } from "./partners";

// A partner's own domain, such as app.acmeagency.com, beside its subdomain of
// the partner base domain. Owners and admins add one on the console's
// Branding & domain page while the partner holds a paid tier, and remove it
// there. The worker registers it with the deployment's custom hostname
// provider (Cloudflare for SaaS, or Caddy with a DNS check) and checks it
// until the provider says it's active and the partner's TXT record proves the
// partner controls the domain. Only then does the domain carry the partner's
// brand and get a certificate from the host's Caddy: every process clears
// that hostname from its brand cache when the worker announces the change.
// A partner has one domain of its own. Several partners may claim the same
// domain while none is verified; the first to prove it controls the domain
// gets it, and the others' claims fail.

/** What the worker asks for a partner's own domain: the provider that sets it up, and DNS for the partner's TXT record. */
export type CustomDomainProviders = {
  hostnames: CustomHostnameProvider;
  lookupTxt: TxtLookup;
};

/** A partner's own domain as the Branding & domain page shows it. */
export type PartnerCustomDomain = {
  hostname: string;
  status: CustomDomainStatus;
  /** The records to add at the partner's DNS provider, and whether each checks out. Empty until the provider first answers. */
  records: CustomDomainDnsRecord[];
  /** What the provider last said is wrong, in its own words. */
  errors: string[];
  /** When the worker last asked the provider, or null before it first did. */
  checkedAt: string | null;
  /** Where the partner's dashboard lives on it, once it's active. */
  url: string | null;
  /** Whether another partner proved it controls the domain first, so this claim can't go live. */
  taken: boolean;
};

/** The Branding & domain page's addresses: the partner's subdomain, and its own domain. */
export type PartnerDomains = {
  /** The actor's own role, read with the domains: only owners and admins can add or remove one. */
  role: PartnerRole;
  subdomain: string | null;
  subdomainUrl: string | null;
  /**
   * Whether the partner can add a domain of its own: yes, not until it pays
   * for a tier, or never on this deployment, which issues no certificates
   * for partners' domains.
   */
  customDomains: "available" | "paid_tier_required" | "unavailable";
  custom: PartnerCustomDomain | null;
};

function failure(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

function domainActor(actor: PartnerActor): PartnerMemberActor {
  if (actor.kind !== "member") throw new AuthorizationError("Platform keys can't change a partner's domains.");
  return actor;
}

/** The actor's role as the database has it now, which may differ from the one it arrived with. */
async function currentRole(tx: DatabaseTransaction, member: PartnerMemberActor): Promise<PartnerRole> {
  const [row] = await tx.select({ role: partnerMembers.role }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, member.partnerId), eq(partnerMembers.userId, member.userId), eq(partnerMembers.status, "active"))).limit(1);
  if (!row) throw new AuthorizationError("You aren't on this partner's team.");
  return row.role;
}

/** The lock adding and removing a partner's own domain take, so two people can't each add one. */
async function lockPartnerDomains(tx: DatabaseTransaction, partnerId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('partner-domains:' || ${partnerId}::uuid::text, 0))`);
}

/**
 * Runs `run` in a worker transaction that holds the hostname's lock, so
 * registering a hostname with the provider, removing it there, and verifying
 * a claim on it never interleave: a removal can't delete the provider's
 * hostname that a claim added again just reused.
 */
async function withHostnameLock<T>(context: DomainContext, hostname: string, run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('partner-domain-hostname:' || ${hostname}, 0))`);
    return await run(tx);
  });
}

/** Whether the partner's tier lets it add a domain: any tier on a deployment that bills none, and a paid one otherwise. */
async function customDomainsFor(tx: DatabaseTransaction, partnerId: string): Promise<PartnerDomains["customDomains"]> {
  if (!partnerFeatures(process.env).customDomains) return "unavailable";
  const tier = await loadPartnerTierInTransaction(tx, partnerId);
  return tier.billed && tier.tier === "free" ? "paid_tier_required" : "available";
}

/** Whether a hostname is the host's own or one the partner base domain gives out, which no partner can claim as its own. */
function belongsToHost(hostname: string): boolean {
  if (isHostDomain(hostname, process.env)) return true;
  const { baseDomain } = partnerFeatures(process.env);
  return Boolean(baseDomain && (hostname === baseDomain || hostname.endsWith(`.${baseDomain}`)));
}

const customColumns = {
  id: partnerDomains.id,
  partnerId: partnerDomains.partnerId,
  hostname: partnerDomains.hostname,
  provider: partnerDomains.provider,
  providerHostnameId: partnerDomains.providerHostnameId,
  verificationToken: partnerDomains.verificationToken,
  dnsRecords: partnerDomains.dnsRecords,
  providerErrors: partnerDomains.providerErrors,
  checkedAt: partnerDomains.checkedAt,
  verifiedAt: partnerDomains.verifiedAt,
  failedAt: partnerDomains.failedAt,
};

type CustomDomainRow = { hostname: string; dnsRecords: CustomDomainDnsRecord[]; providerErrors: string[]; checkedAt: Date | null; verifiedAt: Date | null; failedAt: Date | null };

function customDomainView(row: CustomDomainRow, taken: boolean): PartnerCustomDomain {
  const status: CustomDomainStatus = row.verifiedAt ? "active" : row.failedAt ? "failed" : "pending";
  return {
    hostname: row.hostname,
    status,
    records: row.dnsRecords,
    errors: row.providerErrors,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    url: status === "active" ? customDomainOrigin(row.hostname, process.env) : null,
    taken,
  };
}

/** Whether another partner's domain is verified on this hostname. Nobody signed in can see it, so it's read through the definer function brands use. */
async function verifiedForAnotherPartner(tx: DatabaseTransaction, partnerId: string, hostname: string): Promise<boolean> {
  const owners = await tx.execute<{ partner_id: string }>(sql`select partner_id from app.partner_for_host(${hostname})`);
  return owners.rows.some((row) => row.partner_id !== partnerId);
}

async function readPartnerDomains(tx: DatabaseTransaction, member: PartnerMemberActor): Promise<PartnerDomains> {
  const role = await currentRole(tx, member);
  const rows = await tx.select({ kind: partnerDomains.kind, ...customColumns }).from(partnerDomains).where(eq(partnerDomains.partnerId, member.partnerId));
  const subdomain = currentPartnerSubdomain(rows.find((row) => row.kind === "subdomain")?.hostname ?? null, process.env);
  const custom = rows.find((row) => row.kind === "custom");
  return {
    role,
    subdomain,
    subdomainUrl: subdomain ? partnerOrigin(subdomain, process.env) : null,
    customDomains: await customDomainsFor(tx, member.partnerId),
    custom: custom ? customDomainView(custom, !custom.verifiedAt && await verifiedForAnotherPartner(tx, member.partnerId, custom.hostname)) : null,
  };
}

/**
 * The partner's subdomain and own domain, for the Branding & domain page.
 * Anyone on the team can read them. A partner with no subdomain under the
 * current base domain gets one reserved first, as the brand settings do.
 */
export async function getPartnerDomains(context: DomainContext, actor: PartnerActor): Promise<PartnerDomains> {
  const member = domainActor(actor);
  const read = async () => await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => await readPartnerDomains(tx, member));
  const domains = await read();
  if (domains.subdomain || !partnerFeatures(process.env).baseDomain) return domains;
  return await reservePartnerSubdomain(context, member.partnerId) ? await read() : domains;
}

/**
 * Adds the partner's own domain, as pending with a fresh verification token
 * from the database, and queues the worker to set it up with the
 * deployment's provider. Owners and admins can, while the partner holds a
 * paid tier, or any tier on a deployment that bills none. It must be a
 * subdomain outside the host's domain and the partner base domain that no
 * partner has verified, and the partner must remove its current one first.
 * Another partner's pending claim doesn't stop it: whoever proves it controls
 * the domain first gets it.
 */
export async function addPartnerCustomDomain(context: DomainContext, actor: PartnerActor, input: { hostname: string }): Promise<PartnerDomains> {
  const member = domainActor(actor);
  const provider = partnerFeatures(process.env).customDomains;
  if (!provider) throw failure("This deployment can't connect partners' own domains.", 409, "custom_domains_unavailable");
  const hostname = normalizeCustomDomain(input.hostname);
  if (!hostname) throw failure("Enter a subdomain of your own domain, such as app.yourcompany.com.", 400, "invalid_domain");
  if (belongsToHost(hostname)) throw failure("That domain belongs to this deployment. Enter a subdomain of your own domain.", 409, "domain_reserved");

  // The provisioning job belongs to no business, so the domain is added as the system actor once the role and tier are checked.
  await withBusinessTransaction(context.db, { userId: member.userId, actorType: "system" }, async (tx) => {
    await lockPartnerDomains(tx, member.partnerId);
    if (await currentRole(tx, member) === "member") throw new AuthorizationError("Only owners and admins can change the partner's domains.");
    if (await customDomainsFor(tx, member.partnerId) === "paid_tier_required") throw failure("Your own domain comes with a paid tier. An owner can choose one on the Billing page.", 403, "paid_tier_required");
    const [existing] = await tx.select({ id: partnerDomains.id }).from(partnerDomains).where(and(eq(partnerDomains.partnerId, member.partnerId), eq(partnerDomains.kind, "custom"))).limit(1);
    if (existing) throw failure("Remove your current domain before you add another.", 409, "custom_domain_exists");
    const [held] = await tx.select({ id: partnerDomains.id }).from(partnerDomains).where(and(eq(partnerDomains.hostname, hostname), or(isNotNull(partnerDomains.verifiedAt), eq(partnerDomains.kind, "subdomain")))).limit(1);
    if (held) throw failure("That domain is already connected to a dashboard.", 409, "domain_taken");
    const [added] = await tx.insert(partnerDomains)
      .values({ partnerId: member.partnerId, hostname, kind: "custom", provider, addedByUserId: member.userId })
      .returning({ id: partnerDomains.id });
    await enqueueOutbox(tx, {
      topic: "partnerDomain.provision",
      aggregateType: "partner_domain",
      aggregateId: added!.id,
      dedupeKey: `partner-domain-provision:${added!.id}`,
      payload: { partnerId: member.partnerId, domainId: added!.id },
    });
  });
  return await getPartnerDomains(context, actor);
}

/**
 * Removes the partner's own domain. Every process stops answering it once it
 * hears of the change, and the worker removes it from the provider. Owners
 * and admins can.
 */
export async function removePartnerCustomDomain(context: DomainContext, actor: PartnerActor): Promise<PartnerDomains> {
  const member = domainActor(actor);
  await withBusinessTransaction(context.db, { userId: member.userId, actorType: "system" }, async (tx) => {
    await lockPartnerDomains(tx, member.partnerId);
    if (await currentRole(tx, member) === "member") throw new AuthorizationError("Only owners and admins can change the partner's domains.");
    const [removed] = await tx.delete(partnerDomains)
      .where(and(eq(partnerDomains.partnerId, member.partnerId), eq(partnerDomains.kind, "custom")))
      .returning({ id: partnerDomains.id, hostname: partnerDomains.hostname, provider: partnerDomains.provider, providerHostnameId: partnerDomains.providerHostnameId });
    if (!removed) throw failure("Your partner has no domain of its own.", 404, "custom_domain_not_found");
    // A domain the worker never registered has nothing to remove: its provisioning job finds the row gone.
    if (removed.provider && removed.providerHostnameId) {
      await enqueueOutbox(tx, {
        topic: "partnerDomain.remove",
        aggregateType: "partner_domain",
        aggregateId: removed.id,
        dedupeKey: `partner-domain-remove:${removed.id}`,
        payload: { partnerId: member.partnerId, hostname: removed.hostname, provider: removed.provider, providerHostnameId: removed.providerHostnameId },
      });
    }
  });
  // Every process may have the hostname cached as the partner's.
  await announceBrandChange(context, { kind: "partner", partnerId: member.partnerId });
  return await getPartnerDomains(context, actor);
}

/** Whether any partner's own domain holds this hostname, as one added again after a removal, or another partner's claim, does. */
async function hostnameStillAdded(tx: DatabaseTransaction, hostname: string): Promise<boolean> {
  return (await tx.select({ id: partnerDomains.id }).from(partnerDomains).where(and(eq(partnerDomains.hostname, hostname), eq(partnerDomains.kind, "custom"))).limit(1)).length > 0;
}

type CheckedDomain = { id: string; hostname: string; providerHostnameId: string | null; verificationToken: string };

/**
 * Registers a domain with the provider and saves its id there, holding the
 * hostname's lock. Returns the id, or null when the domain was removed or
 * settled meanwhile. A domain removed while it was being registered is
 * removed from the provider again, unless another claim holds the hostname.
 * When the provider turns the hostname down, its reasons go on the domain for
 * the partner to read, and the scheduler asks again later.
 */
async function registerCustomDomain(context: DomainContext, hostnames: CustomHostnameProvider, domain: CheckedDomain): Promise<string | null> {
  const outcome = await withHostnameLock(context, domain.hostname, async (tx): Promise<{ id: string | null } | { error: unknown }> => {
    const [current] = await tx.select({ providerHostnameId: partnerDomains.providerHostnameId }).from(partnerDomains)
      .where(and(eq(partnerDomains.id, domain.id), isNull(partnerDomains.verifiedAt), isNull(partnerDomains.failedAt))).limit(1);
    if (!current) return { id: null };
    // Another run registered it first.
    if (current.providerHostnameId) return { id: current.providerHostnameId };
    let id: string;
    try {
      ({ id } = await hostnames.create(domain.hostname));
    } catch (error) {
      return { error };
    }
    const saved = await tx.update(partnerDomains)
      .set({ providerHostnameId: id, providerErrors: [], updatedAt: new Date() })
      .where(and(eq(partnerDomains.id, domain.id), isNull(partnerDomains.providerHostnameId)))
      .returning({ id: partnerDomains.id });
    if (saved.length > 0) return { id };
    // The partner removed the domain before its id was saved, so nothing else will remove it from the provider.
    if (!await hostnameStillAdded(tx, domain.hostname)) await hostnames.remove(id);
    return { id: null };
  });
  if (!("error" in outcome)) return outcome.id;
  const refusal = outcome.error as { code?: unknown; reasons?: unknown };
  if (refusal?.code === "custom_hostname_refused" && Array.isArray(refusal.reasons)) {
    const now = new Date();
    await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => await tx.update(partnerDomains)
      .set({ providerErrors: refusal.reasons as string[], checkedAt: now, updatedAt: now })
      .where(and(eq(partnerDomains.id, domain.id), isNull(partnerDomains.providerHostnameId))));
  }
  throw outcome.error;
}

/**
 * Asks the provider about one domain, registering it first if it isn't yet,
 * and looks for the partner's TXT record. Records both. A domain goes live
 * once the provider says it's active and the TXT record holds its token, and
 * every process then hears of it; every other partner's claim on the
 * hostname fails then. Returns the domain's state, or null when the domain
 * was removed or settled meanwhile.
 */
async function checkCustomDomain(context: DomainContext, providers: CustomDomainProviders, domain: CheckedDomain): Promise<CustomDomainStatus | null> {
  const providerHostnameId = domain.providerHostnameId ?? await registerCustomDomain(context, providers.hostnames, domain);
  if (!providerHostnameId) return null;
  const proofName = customDomainVerificationName(domain.hostname);
  const [status, published] = await Promise.all([providers.hostnames.status(providerHostnameId), providers.lookupTxt(proofName)]);
  const proven = published.includes(domain.verificationToken);
  // The CNAME first, then the partner's proof, then any record the provider asks for besides.
  const [first, ...rest] = status.records;
  const proof: CustomDomainDnsRecord = { type: "TXT", name: proofName, value: domain.verificationToken, verified: proven };
  const records = first ? [first, proof, ...rest] : [proof];
  const reached = status.state === "active" && !proven ? "pending" : status.state;
  const now = new Date();
  const recorded = await withHostnameLock(context, domain.hostname, async (tx) => {
    // Another partner proved first that it controls the domain.
    const taken = reached === "active" && (await tx.select({ id: partnerDomains.id }).from(partnerDomains)
      .where(and(eq(partnerDomains.hostname, domain.hostname), isNotNull(partnerDomains.verifiedAt), ne(partnerDomains.id, domain.id))).limit(1)).length > 0;
    const state = taken ? "failed" : reached;
    const [row] = await tx.update(partnerDomains)
      .set({
        dnsRecords: records,
        providerErrors: status.errors,
        checkedAt: now,
        updatedAt: now,
        ...(state === "active" ? { verifiedAt: now } : {}),
        ...(state === "failed" ? { failedAt: now } : {}),
      })
      .where(and(eq(partnerDomains.id, domain.id), eq(partnerDomains.providerHostnameId, providerHostnameId), isNull(partnerDomains.verifiedAt), isNull(partnerDomains.failedAt)))
      .returning({ partnerId: partnerDomains.partnerId });
    if (!row) return null;
    if (state === "active") {
      // No other claim on the hostname can go live now.
      await tx.update(partnerDomains).set({ failedAt: now, updatedAt: now })
        .where(and(eq(partnerDomains.hostname, domain.hostname), eq(partnerDomains.kind, "custom"), ne(partnerDomains.id, domain.id), isNull(partnerDomains.verifiedAt), isNull(partnerDomains.failedAt)));
    }
    return { partnerId: row.partnerId, state };
  });
  if (!recorded) return null;
  // From now on the hostname carries the partner's brand, in every process once its cache clears.
  if (recorded.state === "active") await announceBrandChange(context, { kind: "partner", partnerId: recorded.partnerId });
  return recorded.state;
}

/**
 * Counts an attempt the provider or DNS couldn't answer as a check, so the
 * domain waits its turn before the next one instead of holding the front of
 * every run.
 */
async function recordAttempt(context: DomainContext, domainId: string): Promise<void> {
  const now = new Date();
  await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => await tx.update(partnerDomains)
    .set({ checkedAt: now, updatedAt: now })
    .where(and(eq(partnerDomains.id, domainId), isNull(partnerDomains.verifiedAt), isNull(partnerDomains.failedAt))));
}

async function checkRecordingAttempt(context: DomainContext, providers: CustomDomainProviders, domain: CheckedDomain): Promise<CustomDomainStatus | null> {
  try {
    return await checkCustomDomain(context, providers, domain);
  } catch (error) {
    await recordAttempt(context, domain.id).catch(() => undefined);
    throw error;
  }
}

/**
 * Registers a partner's newly added domain with the provider, then checks it
 * once, so the console shows its DNS records within moments. A domain removed
 * meanwhile, or set up by another provider, is skipped. When the provider
 * can't answer, the job fails and retries, and the scheduler's check keeps
 * trying after that.
 */
export async function provisionPartnerCustomDomain(context: DomainContext, providers: CustomDomainProviders, input: { domainId: string }): Promise<"provisioned" | "skipped"> {
  const [domain] = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => await tx.select(customColumns).from(partnerDomains).where(and(eq(partnerDomains.id, input.domainId), eq(partnerDomains.kind, "custom"))).limit(1));
  if (!domain || domain.provider !== providers.hostnames.kind || domain.verifiedAt || domain.failedAt) return "skipped";
  return await checkRecordingAttempt(context, providers, domain) === null ? "skipped" : "provisioned";
}

/** Removes a partner's domain from the provider, unless a partner added the hostname again since or another claim holds it. */
export async function removePartnerCustomHostname(context: DomainContext, hostnames: CustomHostnameProvider, input: { hostname: string; providerHostnameId: string }): Promise<"removed" | "skipped"> {
  // A domain added again reuses the provider's hostname, which registering it a second time finds. The lock keeps it from doing so while this removes it.
  return await withHostnameLock(context, input.hostname, async (tx) => {
    if (await hostnameStillAdded(tx, input.hostname)) return "skipped";
    await hostnames.remove(input.providerHostnameId);
    return "removed";
  });
}

const CHECK_BATCH = 50;

/**
 * The domains still waiting whose next check is due: every minute in their
 * first hour, every 5 minutes in their first day, and hourly after that,
 * since a partner who hasn't added the records in a day may take days more.
 * A domain the provider hasn't registered yet counts once its provisioning
 * job had a minute to do it, so a provider outage longer than that job's
 * retries never strands it.
 */
async function dueCustomDomains(context: DomainContext, kind: CustomHostnameProvider["kind"], now: Date): Promise<CheckedDomain[]> {
  const at = now.toISOString();
  return await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => await tx
    .select({ id: partnerDomains.id, hostname: partnerDomains.hostname, providerHostnameId: partnerDomains.providerHostnameId, verificationToken: partnerDomains.verificationToken })
    .from(partnerDomains)
    .where(and(
      eq(partnerDomains.kind, "custom"),
      eq(partnerDomains.provider, kind),
      isNull(partnerDomains.verifiedAt),
      isNull(partnerDomains.failedAt),
      sql`(${partnerDomains.providerHostnameId} is not null or ${partnerDomains.checkedAt} is not null or ${partnerDomains.createdAt} <= ${at}::timestamptz - interval '1 minute')`,
      sql`(${partnerDomains.checkedAt} is null or ${partnerDomains.checkedAt} <= ${at}::timestamptz - case
        when ${partnerDomains.createdAt} > ${at}::timestamptz - interval '1 hour' then interval '50 seconds'
        when ${partnerDomains.createdAt} > ${at}::timestamptz - interval '1 day' then interval '5 minutes'
        else interval '1 hour' end)`,
    ))
    .orderBy(sql`${partnerDomains.checkedAt} asc nulls first`, asc(partnerDomains.id))
    .limit(CHECK_BATCH));
}

/**
 * The scheduler's check of every partner's domain still waiting on the
 * provider, registering any its provisioning job couldn't. A domain the
 * provider or DNS can't answer for waits its turn for the next check while
 * the others are checked. The job fails only when nothing answered, as when
 * the provider itself is down.
 */
export async function checkPartnerCustomDomains(context: DomainContext, providers: CustomDomainProviders, options: { now?: Date } = {}): Promise<{ checked: number; activated: number; failed: number; unanswered: number }> {
  const due = await dueCustomDomains(context, providers.hostnames.kind, options.now ?? new Date());
  const result = { checked: 0, activated: 0, failed: 0, unanswered: 0 };
  let lastError: unknown;
  for (const domain of due) {
    try {
      const state = await checkRecordingAttempt(context, providers, domain);
      if (state === null) continue;
      result.checked += 1;
      if (state === "active") result.activated += 1;
      if (state === "failed") result.failed += 1;
    } catch (error) {
      result.unanswered += 1;
      lastError = error;
    }
  }
  if (result.unanswered > 0 && result.unanswered === due.length) {
    throw new Error(`The custom hostname provider couldn't answer for any of ${due.length} partner domains. They wait for the next check.`, { cause: lastError });
  }
  return result;
}
