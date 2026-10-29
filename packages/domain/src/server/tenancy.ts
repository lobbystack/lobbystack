import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, gt, isNull, ne, or, sql } from "drizzle-orm";

import { enqueueOutbox, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { apiKeys, businesses, businessInvitations, businessMemberships, closures, partnerMembers, receptionistProfiles, services, staff, userActiveBusinesses, users } from "@lobbystack/db";
import { currencyFractionDigits, defaultAppointmentChangePolicy, defaultCurrencyForTimezone, defaultGreeting, isCurrencyCode, isDefaultGreeting, normalizeAuthEmail, normalizeRuntimeLocale, parseDeploymentMode, type EmailBrandReference, type PartnerAccessLevel } from "@lobbystack/shared";

import { requireBusinessAdmin } from "../authz";
import { accessCapabilities, brandPartnerId, businessShowsOnBrand, capabilityNames, readBusinessAccess, requireBusinessAccess, type BrandScope, type BusinessAccessVia, type Capability } from "./businessAccess";
import { enqueueBusinessSummaryRefresh } from "./businessSummary";
import type { DomainContext } from "./context";
import type { OnboardingStage } from "./onboarding";
import { invitationOfferInTransaction, type InvitationPayment } from "./packageBilling";
import { disableWebhookEndpointsInTransaction } from "./publicApi/webhooks";

export type BusinessRole = "business_owner" | "business_admin" | "scheduler" | "viewer";

export type CreateBusinessInput = {
  userId: string;
  name: string;
  slug?: string;
  timezone: string;
  businessType: string;
  deploymentMode?: string;
};

function cleanSlug(slug: string): string {
  const result = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (result.length < 2 || result.length > 120) {
    throw Object.assign(new Error("Business slug must be between 2 and 120 characters."), { status: 400 });
  }
  return result;
}

// Each business adds recurring worker jobs, so one account can own at most this many direct businesses. A partner's businesses count against its tier.
const maxOwnedBusinesses = 10;

/**
 * The IANA time zone a value names, spelled the way Intl lists it, such as
 * America/Vancouver for " america/vancouver", or undefined when it names none.
 * UTC offsets such as +05:00 don't name a zone.
 */
export function ianaTimeZone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const zone = value.trim();
  if (zone.length > 80 || !/^[A-Za-z][\w+-]*(?:\/[\w+-]+)*$/.test(zone)) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    return undefined;
  }
  // Intl accepts any letter case. resolvedOptions() would also swap in legacy names such as Asia/Calcutta, so only the case is fixed.
  return Intl.supportedValuesOf("timeZone").find((known) => known.toLowerCase() === zone.toLowerCase()) ?? zone;
}

function requireIanaTimeZone(value: unknown): string {
  const zone = ianaTimeZone(value);
  if (!zone) throw Object.assign(new Error("timezone must be an IANA time zone, such as America/Toronto."), { status: 400, code: "invalid_timezone" });
  return zone;
}

export async function createBusiness(
  context: DomainContext,
  input: CreateBusinessInput,
): Promise<{ businessId: string; membershipId: string }> {
  const timezone = requireIanaTimeZone(input.timezone);
  // Refuse a bad slug before taking any locks.
  if (input.slug !== undefined) cleanSlug(input.slug);
  const businessId = randomUUID();
  return await withBusinessTransaction(context.db, {
    userId: input.userId,
    businessId,
    actorType: "system",
  }, async (tx) => {
    // Lock the user row so concurrent creates by the same account count each other.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).for("update");
    // Row-level security shows this transaction only the new business, so the database counts the rest.
    const owned = await tx.execute<{ count: number }>(sql`select app.count_owned_direct_businesses(${input.userId}::uuid) as count`);
    if ((owned.rows[0]?.count ?? 0) >= maxOwnedBusinesses) {
      throw Object.assign(new Error(`Too many workspaces. One account can own up to ${maxOwnedBusinesses}.`), { status: 403 });
    }
    const created = await insertBusinessInTransaction(tx, { businessId, userId: input.userId, name: input.name, slug: input.slug, timezone, businessType: input.businessType, deploymentMode: input.deploymentMode });
    await tx.update(users).set({ activeBusinessId: businessId, updatedAt: new Date() }).where(eq(users.id, input.userId));
    return created;
  });
}

/**
 * Creates a business that has no owner yet, such as one a partner sets up
 * before it invites the owner. The business gets the staff member, receptionist
 * profile and first snapshot every business gets. It counts toward no
 * account's cap and becomes no one's active business. No route calls this yet.
 */
export async function createOwnerlessBusiness(
  context: DomainContext,
  input: Omit<CreateBusinessInput, "userId">,
): Promise<{ businessId: string }> {
  const timezone = requireIanaTimeZone(input.timezone);
  if (input.slug !== undefined) cleanSlug(input.slug);
  const businessId = randomUUID();
  return await withBusinessTransaction(context.db, { businessId, actorType: "system" }, async (tx) => await insertOwnerlessBusinessInTransaction(tx, { businessId, name: input.name, slug: input.slug, timezone, businessType: input.businessType, deploymentMode: input.deploymentMode }));
}

type NewBusiness = {
  businessId: string;
  name: string;
  slug?: string | undefined;
  timezone: string;
  businessType: string;
  deploymentMode?: string | undefined;
  defaultLocale?: string | undefined;
  websiteUrl?: string | undefined;
  /** The partner that resells the business, set only when it's created: a direct business never gets one. */
  partner?: { partnerId: string; accessLevel: PartnerAccessLevel } | undefined;
  /** Where the owner's onboarding starts: its website unless the caller says otherwise. */
  onboardingStage?: OnboardingStage | undefined;
};

/**
 * Inserts a business with what every new business needs: its owner, the staff
 * member that stands for it, a receptionist profile, and its first snapshot.
 * The transaction must be scoped to businessId, and timezone must already be
 * an IANA name. A generated slug gets a random suffix when taken; a taken slug
 * the caller chose fails with a unique violation.
 */
export async function insertBusinessInTransaction(
  tx: DatabaseTransaction,
  input: NewBusiness & { userId: string },
): Promise<{ businessId: string; membershipId: string }> {
  const { membershipId } = await insertBusinessRowsInTransaction(tx, input, input.userId);
  return { businessId: input.businessId, membershipId };
}

/** The same without an owner. The transaction must be scoped to businessId as the system or worker actor. */
export async function insertOwnerlessBusinessInTransaction(tx: DatabaseTransaction, input: NewBusiness): Promise<{ businessId: string }> {
  await insertBusinessRowsInTransaction(tx, input, null);
  return { businessId: input.businessId };
}

/** How a new business's receptionist books and answers calls and texts until someone changes it. */
export const NEW_BUSINESS_RECEPTIONIST_INSTRUCTIONS = {
  bookingPolicy: "Only confirm a booking after availability is checked.",
  voiceInstructions: "Sound calm, confident, and concise. Escalate urgent requests to a human when policy requires it.",
  smsInstructions: "Keep replies concise and friendly. Ask one follow-up question at a time.",
} as const;

async function insertBusinessRowsInTransaction(tx: DatabaseTransaction, input: NewBusiness, ownerUserId: string): Promise<{ membershipId: string }>;
async function insertBusinessRowsInTransaction(tx: DatabaseTransaction, input: NewBusiness, ownerUserId: null): Promise<{ membershipId: null }>;
async function insertBusinessRowsInTransaction(tx: DatabaseTransaction, input: NewBusiness, ownerUserId: string | null): Promise<{ membershipId: string | null }> {
  const { businessId, timezone } = input;
  const name = input.name.trim();
  const generatedSlug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96).replace(/-$/, "") || "business";
  const baseSlug = input.slug === undefined ? generatedSlug : cleanSlug(input.slug);
  // Inserting a slug that another open transaction has inserted waits for it to end, and two transactions that each
  // hold a slug the other wants deadlock. A generated slug that another transaction is making gets a suffix instead.
  const baseSlugFree = input.slug !== undefined || (await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(hashtextextended(${`business-slug:${baseSlug}`}, 0)) as locked`)).rows[0]?.locked === true;
  let business: { id: string } | undefined;
  for (let attempt = baseSlugFree ? 0 : 1; attempt < 5; attempt++) {
    const insert = tx.insert(businesses).values({
      id: businessId,
      name,
      slug: attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(6).toString("hex")}`,
      timezone,
      currency: defaultCurrencyForTimezone(timezone),
      businessType: input.businessType,
      // A self-hosted server's businesses get its unlimited plan, not the cloud's free one. Any other mode, development included, keeps them cloud, as before:
      // every mode but cloud skips billing and the paid-plan check on numbers.
      deploymentMode: input.deploymentMode ?? (parseDeploymentMode(process.env.DEPLOYMENT_MODE) === "self_hosted_standard" ? "self_hosted_standard" : "cloud"),
      onboardingStage: input.onboardingStage ?? "website",
      ...(input.defaultLocale !== undefined ? { defaultLocale: input.defaultLocale } : {}),
      ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}),
      ...(input.partner ? { partnerId: input.partner.partnerId, partnerAccessLevel: input.partner.accessLevel } : {}),
    });
    // Only generated slugs are replaceable. Target this constraint explicitly
    // so unrelated insert failures still roll back the transaction.
    [business] = await (input.slug === undefined ? insert.onConflictDoNothing({ target: businesses.slug }) : insert).returning({ id: businesses.id });
    if (business) break;
  }
  if (!business) {
    throw new Error("Business could not be created.");
  }
  let membershipId: string | null = null;
  if (ownerUserId !== null) {
    const [membership] = await tx.insert(businessMemberships).values({
      businessId,
      userId: ownerUserId,
      role: "business_owner",
      status: "active",
    }).returning({ id: businessMemberships.id });
    if (!membership) {
      throw new Error("Business owner membership could not be created.");
    }
    membershipId = membership.id;
  }
  // Booking assigns every appointment to a staff member. Businesses that don't
  // manage a team get one hidden member that stands for the business itself.
  await tx.insert(staff).values({ businessId, name, timezone });
  await tx.insert(receptionistProfiles).values({
    businessId,
    greeting: defaultGreeting(name),
    tone: "warm and direct",
    summary: `${name} uses LobbyStack to answer calls.`,
    ...NEW_BUSINESS_RECEPTIONIST_INSTRUCTIONS,
    transferMode: "on_request",
    appointmentChangePolicy: defaultAppointmentChangePolicy,
  });
  await enqueueOutbox(tx, {
    topic: "snapshot.refresh",
    businessId,
    aggregateType: "business",
    aggregateId: businessId,
    dedupeKey: `business:${businessId}:snapshot:initial`,
    payload: { businessId, reason: "business_created" },
  });
  return { membershipId };
}

/**
 * The business the person last worked in on this brand's domains, or null
 * for none: on the host's domain users.active_business_id, and on a
 * partner's its own row. On the host's domain, a remembered business the
 * person can no longer open gives way to one of their own. Whether they may
 * open a partner's is for the caller to check. The transaction acts as the person.
 */
export async function readActiveBusinessIdInTransaction(tx: DatabaseTransaction, input: { userId: string; brand: BrandScope }): Promise<string | null> {
  const partnerId = brandPartnerId(input.brand);
  if (!partnerId) {
    const remembered = (await tx.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, input.userId)).limit(1))[0]?.activeBusinessId ?? null;
    if (!remembered) return null;
    // users.active_business_id has no foreign key, so it outlives a deleted business and one the person left. Pointing at it would fail every request that names no business, so the person's own businesses answer instead.
    const own = (await tx.execute<{ business_id: string; role: string; partner_id: string | null; access_via: string }>(sql`select business_id, role, partner_id, access_via from app.list_user_businesses(${input.userId})`)).rows.filter((row) => businessShowsOnBrand(row.partner_id, input.brand));
    if (own.some((row) => row.business_id === remembered)) return remembered;
    const members = own.filter((row) => row.access_via === "membership");
    return (members.find((row) => row.role !== "viewer") ?? members[0])?.business_id ?? null;
  }
  return (await tx.select({ businessId: userActiveBusinesses.businessId }).from(userActiveBusinesses).where(and(eq(userActiveBusinesses.userId, input.userId), eq(userActiveBusinesses.partnerId, partnerId))).limit(1))[0]?.businessId ?? null;
}

/** readActiveBusinessIdInTransaction in a transaction of its own. */
export async function readActiveBusinessId(db: Database, input: { userId: string; brand: BrandScope }): Promise<string | null> {
  return await withBusinessTransaction(db, { userId: input.userId, actorType: "operator" }, async (tx) => await readActiveBusinessIdInTransaction(tx, input));
}

/**
 * Remembers the business as the one the person works in on its brand's
 * domains: a direct business on the host's, a partner's on that partner's.
 * The transaction acts as the person.
 */
export async function rememberActiveBusinessInTransaction(tx: DatabaseTransaction, input: { userId: string; businessId: string; partnerId: string | null }): Promise<void> {
  if (!input.partnerId) {
    await tx.update(users).set({ activeBusinessId: input.businessId, updatedAt: new Date() }).where(eq(users.id, input.userId));
    return;
  }
  await tx.insert(userActiveBusinesses).values({ userId: input.userId, partnerId: input.partnerId, businessId: input.businessId }).onConflictDoUpdate({
    target: [userActiveBusinesses.userId, userActiveBusinesses.partnerId],
    set: { businessId: input.businessId, updatedAt: new Date() },
  });
}

export type UserBusiness = {
  businessId: string;
  name: string;
  slug: string;
  role: string;
  active: boolean;
  timezone: string;
  businessType: string;
  defaultLocale: string;
  websiteUrl: string | null;
  onboardingStage: string;
  createdAt: string;
  /** The access level a partner's business gives its own operators, or null for a direct business. */
  partnerAccessLevel: PartnerAccessLevel | null;
  /** How the person reaches the business: on its team, or through an open as a member of its partner. */
  via: BusinessAccessVia;
  /** What the business lets the person do, before their role's rules. The dashboard hides the rest. */
  capabilities: Capability[];
};

/**
 * The businesses that show on this brand's domains which the person is on
 * the team of, or holds an open of as a member of their partner, with the one
 * they work in there marked active: their direct businesses on the host's
 * domain, and a partner's businesses only on that partner's. Through an open
 * the role is an admin's.
 */
export async function listUserBusinesses(db: Database, userId: string, brand: BrandScope): Promise<UserBusiness[]> {
  return await withBusinessTransaction(db, { userId, actorType: "operator" }, async (tx) => {
    const active = await readActiveBusinessIdInTransaction(tx, { userId, brand });
    const rows = await tx.execute<Omit<UserBusiness, "active" | "createdAt" | "partnerAccessLevel" | "via" | "capabilities"> & { createdAt: Date; partnerId: string | null; accessLevel: PartnerAccessLevel; via: BusinessAccessVia }>(sql`select business_id as "businessId", name, slug, role, timezone, business_type as "businessType", default_locale as "defaultLocale", website_url as "websiteUrl", onboarding_stage as "onboardingStage", created_at as "createdAt", partner_id as "partnerId", partner_access_level as "accessLevel", access_via as "via" from app.list_user_businesses(${userId})`);
    return rows.rows.filter((row) => businessShowsOnBrand(row.partnerId, brand)).map(({ partnerId, accessLevel, via, ...row }) => ({
      ...row,
      active: row.businessId === active,
      createdAt: new Date(row.createdAt).toISOString(),
      partnerAccessLevel: partnerId ? accessLevel : null,
      via,
      capabilities: [...accessCapabilities({ partnerId, accessLevel }, via)],
    }));
  });
}

export async function updateBusiness(
  context: DomainContext,
  input: { userId: string; businessId: string; name?: string; timezone?: string; businessType?: string; defaultLocale?: string; websiteUrl?: string | null },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await updateBusinessInTransaction(tx, input);
  });
}

/** Updates basic business fields and refreshes the receptionist's snapshot. Callers authorize first. */
export async function updateBusinessInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; name?: string; timezone?: string; businessType?: string; defaultLocale?: string; teamLocale?: string | null; websiteUrl?: string | null; currency?: string },
): Promise<void> {
  const timezone = input.timezone === undefined ? undefined : requireIanaTimeZone(input.timezone);
  if (input.currency !== undefined && !isCurrencyCode(input.currency)) throw Object.assign(new Error("currency is invalid."), { status: 400 });
  const values = { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(timezone !== undefined ? { timezone } : {}), ...(input.businessType !== undefined ? { businessType: input.businessType.trim() } : {}), ...(input.defaultLocale !== undefined ? { defaultLocale: input.defaultLocale.trim() } : {}), ...(input.teamLocale !== undefined ? { teamLocale: input.teamLocale } : {}), ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}), ...(input.currency !== undefined ? { currency: input.currency } : {}), updatedAt: new Date() };
  if (Object.keys(values).length === 1) throw Object.assign(new Error("At least one business field is required."), { status: 400 });
  // Locks the row, so a concurrent change can't alter the zone the closures were entered in, or the language the greeting is in.
  const [before] = timezone === undefined && input.defaultLocale === undefined && input.currency === undefined ? [] : await tx.select({ timezone: businesses.timezone, defaultLocale: businesses.defaultLocale, name: businesses.name, currency: businesses.currency }).from(businesses).where(eq(businesses.id, input.businessId)).for("update");
  const [business] = await tx.update(businesses).set(values).where(eq(businesses.id, input.businessId)).returning({ id: businesses.id });
  if (!business) throw Object.assign(new Error("Business not found."), { status: 404 });
  // Prices are stored in the currency's smallest unit. Keep the numbers people read: USD 40.00 (4000) becomes JPY 40 (40).
  const shift = input.currency !== undefined && before ? currencyFractionDigits(input.currency) - currencyFractionDigits(before.currency) : 0;
  if (shift) {
    const factor = sql.raw(`${10 ** Math.abs(shift)}`);
    const rescale = (column: typeof services.priceMinor | typeof services.priceMaxMinor) => shift > 0 ? sql`${column} * ${factor}` : sql`round(${column}::numeric / ${factor})::bigint`;
    await tx.update(services).set({ priceMinor: rescale(services.priceMinor), priceMaxMinor: rescale(services.priceMaxMinor), updatedAt: new Date() }).where(eq(services.businessId, input.businessId));
  }
  // shortcut: every staff row today is the default member that stands for the business; once staff set their own zones, update only that member.
  if (timezone !== undefined) await tx.update(staff).set({ timezone, updatedAt: new Date() }).where(eq(staff.businessId, input.businessId));
  // Closures are entered as local times but saved as instants. Keep their local times in the new zone, as weekly hours do.
  if (timezone !== undefined && before && before.timezone !== timezone) {
    await tx.update(closures).set({
      startsAt: sql`(${closures.startsAt} at time zone ${before.timezone}) at time zone ${timezone}`,
      endsAt: sql`(${closures.endsAt} at time zone ${before.timezone}) at time zone ${timezone}`,
      updatedAt: new Date(),
    }).where(and(eq(closures.businessId, input.businessId), gt(closures.endsAt, sql`now()`)));
  }
  // A greeting still on the old language's default follows the new language; one the owner wrote stays.
  if (input.defaultLocale !== undefined && before) {
    const from = normalizeRuntimeLocale(before.defaultLocale);
    const to = normalizeRuntimeLocale(input.defaultLocale);
    const [profile] = from === to ? [] : await tx.select({ greeting: receptionistProfiles.greeting }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, input.businessId)).limit(1);
    if (profile && isDefaultGreeting(profile.greeting, before.name, from)) await tx.update(receptionistProfiles).set({ greeting: defaultGreeting(input.name?.trim() || before.name, to), updatedAt: new Date() }).where(eq(receptionistProfiles.businessId, input.businessId));
  }
  await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: input.businessId, aggregateType: "business", aggregateId: input.businessId, dedupeKey: `business:${input.businessId}:snapshot:${Date.now()}`, payload: { businessId: input.businessId, reason: "business_updated" } });
  // The generated summary names the business and is written in its default locale.
  if (input.name !== undefined || input.defaultLocale !== undefined) await enqueueBusinessSummaryRefresh(tx, { businessId: input.businessId, reason: "business_updated" });
}

/**
 * What a business gives the person, before their role's rules: everything
 * for a direct business, less for a partner's, and full access through a
 * partner open. Null when they can't reach the business. The dashboard uses
 * it for a business the workspace list leaves out, such as one no longer
 * active.
 */
export async function readBusinessCapabilities(db: Database, input: { userId: string; businessId: string }): Promise<Capability[] | null> {
  return await withBusinessTransaction(db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    const access = await readBusinessAccess(tx, input);
    return access ? capabilityNames.filter((capability) => access.can(capability)) : null;
  });
}

/**
 * Opens a business on this brand's domains and remembers it as the one the
 * person works in there. A business of another brand can't be opened here.
 */
export async function switchWorkspace(
  context: DomainContext,
  input: { userId: string; businessId: string; brand: BrandScope },
): Promise<void> {
  await withBusinessTransaction(context.db, {
    userId: input.userId,
    businessId: input.businessId,
    actorType: "operator",
  }, async (tx) => {
    const access = await requireBusinessAccess(tx, input);
    await rememberActiveBusinessInTransaction(tx, { userId: input.userId, businessId: input.businessId, partnerId: access.partnerId });
  });
}

/**
 * The lock every change to a business's team takes: role changes, removals,
 * accepting an invitation and sending a claim link. Taken first, it keeps the
 * last owner from being demoted twice at once without two transactions waiting
 * on each other's rows.
 */
export async function lockBusinessTeam(tx: DatabaseTransaction, businessId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('team:' || ${businessId}::uuid::text, 0))`);
}

/** Exactly one plain address: mail transports send a comma or semicolon list to every recipient. */
export function isSingleEmailAddress(normalizedEmail: string): boolean {
  return /^[^\s@,;:<>()"]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(normalizedEmail);
}

/** Where an invitation's email sends its recipient to accept it. */
export function invitationUrl(token: string): string {
  // Invitations may go to someone without an account preference. Let the
  // compatibility entry point negotiate their locale before redirecting.
  return `${process.env.APP_BASE_URL ?? "http://localhost"}/accept-invite?token=${encodeURIComponent(token)}`;
}

/**
 * Records an invitation the caller may send and queues its email. The email
 * must already be normalized and valid. A person sends it, or a partner's
 * platform key, which acts as the partner and has no account; a claim link
 * always has a person behind it.
 */
export async function insertInvitationInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; normalizedEmail: string; role: BusinessRole; transfersOwnership?: boolean } & ({ invitedByUserId: string; invitedByPlatformKeyId?: undefined } | { invitedByPlatformKeyId: string; invitedByUserId?: undefined; transfersOwnership?: false }),
): Promise<{ invitationId: string; token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitationId = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [business] = await tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  await tx.insert(businessInvitations).values({
    id: invitationId,
    businessId: input.businessId,
    invitedByUserId: input.invitedByUserId ?? null,
    invitedByPlatformKeyId: input.invitedByPlatformKeyId ?? null,
    email: input.normalizedEmail,
    normalizedEmail: input.normalizedEmail,
    role: input.role,
    tokenHash,
    expiresAt,
    transfersOwnership: input.transfersOwnership ?? false,
  });
  await enqueueOutbox(tx, {
    topic: "email.send",
    businessId: input.businessId,
    aggregateType: "business_invitation",
    aggregateId: invitationId,
    dedupeKey: `invitation:${invitationId}:send`,
    // The worker writes the email under the business's brand when it sends,
    // and puts the link on that brand's origin.
    // The email names the business, so an owner its partner set up sees whose dashboard it is.
    payload: { invitationId, email: input.normalizedEmail, token, template: "invitation", url: invitationUrl(token), variables: { url: invitationUrl(token), businessName: business?.name ?? "" }, brand: { kind: "business", businessId: input.businessId } satisfies EmailBrandReference, replyTo: null },
  });
  return { invitationId, token, expiresAt };
}

/**
 * The refusal of someone on a business's partner's team joining the
 * business's team. They work in it through opens, which its audit log records
 * and which end when they leave the partner or the partner releases it, so
 * the team list holds only the business's own operators.
 */
export function partnerMemberNotOnTeam(): Error {
  return Object.assign(new Error("People on the business's partner's team work in it from the partner's console, so they can't join its team."), { status: 409, code: "partner_member_not_on_team" });
}

/**
 * Whether this address belongs to someone on the partner's team. The
 * database answers only someone on that team, and false for anyone else, so
 * a business's own operators learn nothing of the partner's team.
 */
export async function isPartnerMemberEmail(tx: DatabaseTransaction, input: { partnerId: string; normalizedEmail: string }): Promise<boolean> {
  const rows = await tx.execute<{ found: boolean }>(sql`select app.is_partner_member_email(${input.partnerId}::uuid, ${input.normalizedEmail}) as found`);
  return rows.rows[0]?.found === true;
}

export async function inviteMember(
  context: DomainContext,
  input: { userId: string; businessId: string; email: string; role: BusinessRole },
): Promise<{ invitationId: string; token: string }> {
  const normalizedEmail = normalizeAuthEmail(input.email);
  if (!isSingleEmailAddress(normalizedEmail)) {
    throw Object.assign(new Error("Enter one valid email address."), { status: 400 });
  }
  return await withBusinessTransaction(context.db, {
    userId: input.userId,
    businessId: input.businessId,
    actorType: "operator",
  }, async (tx) => {
    await requireBusinessAdmin(tx, { userId: input.userId, businessId: input.businessId });
    // A partner member can't put themselves or their colleagues on the team through an open. Accepting checks it too.
    const [business] = await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    if (business?.partnerId && await isPartnerMemberEmail(tx, { partnerId: business.partnerId, normalizedEmail })) throw partnerMemberNotOnTeam();
    const { invitationId, token } = await insertInvitationInTransaction(tx, { businessId: input.businessId, invitedByUserId: input.userId, normalizedEmail, role: input.role });
    return { invitationId, token };
  });
}

export async function acceptInvitation(
  context: DomainContext,
  input: { userId: string; tokenHash: string; email: string | null | undefined; emailVerified: boolean | null | undefined },
): Promise<{ businessId: string; role: string; partnerId: string | null }> {
  const resolved = await context.db.execute<{ business_id: string }>(sql`select app.resolve_business_by_invitation(${input.tokenHash}) as business_id`);
  const businessId = resolved.rows[0]?.business_id;
  if (!businessId) {
    throw Object.assign(new Error("Invitation is invalid or expired."), { status: 404 });
  }
  return await withBusinessTransaction(context.db, { userId: input.userId, actorType: "system", businessId }, async (tx) => {
    await lockBusinessTeam(tx, businessId);
    const rows = await tx.select().from(businessInvitations).where(and(eq(businessInvitations.tokenHash, input.tokenHash), eq(businessInvitations.status, "pending"))).limit(1);
    const invitation = rows[0];
    // The resolver also finds accepted, revoked and expired invitations, so the preview can say which.
    if (!invitation || invitation.expiresAt <= new Date()) {
      throw Object.assign(new Error("Invitation is invalid or expired."), { status: 409 });
    }
    // A forwarded or leaked link must not let a different account join.
    if (!input.emailVerified || !input.email || normalizeAuthEmail(input.email) !== invitation.normalizedEmail) {
      throw Object.assign(new Error("Sign in with the verified email address this invitation was sent to."), { status: 403 });
    }
    const partnerId = (await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, invitation.businessId)).limit(1))[0]?.partnerId ?? null;
    // A partner's business stays with its partner, which can release it to its owner. No claim link hands it over.
    if (invitation.transfersOwnership && partnerId) throw partnerBusinessNotClaimable();
    // Whoever sent the invitation, someone on the business's partner's team never joins its team.
    if (partnerId) {
      const [partnerMember] = await tx.select({ id: partnerMembers.id }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, partnerId), eq(partnerMembers.userId, input.userId), eq(partnerMembers.status, "active"))).limit(1);
      if (partnerMember) throw partnerMemberNotOnTeam();
    }
    // Only an owner can hand the business over, and the sender may have stopped being one since. The database keeps a claim link's sender.
    const senderUserId = invitation.invitedByUserId;
    const staleClaimLink = () => Object.assign(new Error("This claim link no longer works. Ask whoever sent it for a new one."), { status: 409 });
    if (invitation.transfersOwnership && senderUserId === null) throw staleClaimLink();
    // Someone on the partner's team can invite people while they have the business open. Once
    // they leave that team, what they sent stops working, so the invitation can't outlast them.
    if (partnerId && senderUserId !== null && !invitation.transfersOwnership) {
      const [onTeam] = await tx.select({ id: businessMemberships.id }).from(businessMemberships).where(and(eq(businessMemberships.businessId, invitation.businessId), eq(businessMemberships.userId, senderUserId), eq(businessMemberships.status, "active"))).limit(1);
      const [onPartner] = onTeam ? [onTeam] : await tx.select({ id: partnerMembers.id }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, partnerId), eq(partnerMembers.userId, senderUserId), eq(partnerMembers.status, "active"))).limit(1);
      if (!onPartner) throw Object.assign(new Error("Invitation is invalid or expired."), { status: 409 });
    }
    if (invitation.transfersOwnership && senderUserId !== null && senderUserId !== input.userId) {
      const [sender] = await tx.select({ role: businessMemberships.role }).from(businessMemberships).where(and(eq(businessMemberships.businessId, invitation.businessId), eq(businessMemberships.userId, senderUserId), eq(businessMemberships.status, "active"))).limit(1);
      if (sender?.role !== "business_owner") throw staleClaimLink();
    }
    // Claim the invitation before joining, so a second accept of the same token fails.
    const [claimed] = await tx.update(businessInvitations).set({ status: "accepted", acceptedByUserId: input.userId, acceptedAt: new Date(), updatedAt: new Date() }).where(and(eq(businessInvitations.id, invitation.id), eq(businessInvitations.status, "pending"))).returning({ id: businessInvitations.id });
    if (!claimed) {
      throw Object.assign(new Error("Invitation is invalid or expired."), { status: 409 });
    }
    if (invitation.transfersOwnership) {
      // A claim link makes the claimant an owner even if they were already on the team.
      await tx.insert(businessMemberships).values({ businessId: invitation.businessId, userId: input.userId, role: "business_owner", status: "active" }).onConflictDoUpdate({
        target: [businessMemberships.businessId, businessMemberships.userId],
        set: { role: "business_owner", status: "active", updatedAt: new Date() },
      });
      // The business is theirs now, so the account that set it up loses its access:
      // its place on the team, the invitations it sent (it holds their links), its
      // API keys for the business, the webhooks those keys, the account or any
      // platform key set up, and any platform key group's link to it.
      if (senderUserId !== null && senderUserId !== input.userId) {
        await tx.update(businessMemberships).set({ status: "removed", updatedAt: new Date() }).where(and(eq(businessMemberships.businessId, invitation.businessId), eq(businessMemberships.userId, senderUserId), eq(businessMemberships.status, "active")));
        await tx.update(businessInvitations).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(businessInvitations.businessId, invitation.businessId), eq(businessInvitations.invitedByUserId, senderUserId), eq(businessInvitations.status, "pending")));
        const revokedKeys = await tx.update(apiKeys).set({ revokedAt: new Date(), revokedByUserId: input.userId, updatedAt: new Date() }).where(and(eq(apiKeys.businessId, invitation.businessId), eq(apiKeys.createdByUserId, senderUserId), isNull(apiKeys.revokedAt))).returning({ id: apiKeys.id });
        // Otherwise the sender, or the group whose platform keys set the business up, would keep
        // receiving the new owner's calls, contacts, appointments and messages.
        await disableWebhookEndpointsInTransaction(tx, { businessId: invitation.businessId, createdByApiKeyIds: revokedKeys.map((key) => key.id), createdByUserId: senderUserId, createdByPlatformKeys: true });
        await tx.execute(sql`select app.finish_business_handover(${invitation.businessId}::uuid, ${senderUserId}::uuid)`);
      }
      // As with a claimed prospect demo, the dashboard opens on the business they now own.
      await tx.update(users).set({ activeBusinessId: invitation.businessId, updatedAt: new Date() }).where(eq(users.id, input.userId));
      return { businessId: invitation.businessId, role: "business_owner", partnerId: null };
    }
    // An active member keeps their role, so an owner who accepts a viewer invite stays owner.
    const [joined] = await tx.insert(businessMemberships).values({
      businessId: invitation.businessId,
      userId: input.userId,
      role: invitation.role,
      status: "active",
    }).onConflictDoUpdate({
      target: [businessMemberships.businessId, businessMemberships.userId],
      set: { role: invitation.role, status: "active", updatedAt: new Date() },
      setWhere: ne(businessMemberships.status, "active"),
    }).returning({ role: businessMemberships.role });
    const role = joined?.role ?? (await tx.select({ role: businessMemberships.role }).from(businessMemberships).where(and(eq(businessMemberships.businessId, invitation.businessId), eq(businessMemberships.userId, input.userId))).limit(1))[0]!.role;
    // Someone joining a partner's business, such as the owner the partner invited, lands in it on the partner's domain.
    if (partnerId) await rememberActiveBusinessInTransaction(tx, { userId: input.userId, businessId: invitation.businessId, partnerId });
    return { businessId: invitation.businessId, role, partnerId };
  });
}

/** The refusal of a claim link for a partner's business. */
export function partnerBusinessNotClaimable(): Error {
  return Object.assign(new Error("You can't claim a partner's business. Its partner can release it to its owner."), { status: 409, code: "partner_business_not_claimable" });
}

/**
 * What an invitation's link shows before its recipient signs in. An
 * invitation to own a partner's business on a package also names the
 * package and says whether it's paid, since the link opens its checkout.
 */
export async function previewInvitation(
  context: DomainContext,
  input: { tokenHash: string },
): Promise<{ businessName: string; email: string; expired: boolean; status: string; payment: InvitationPayment | null } | null> {
  const resolved = await context.db.execute<{ business_id: string }>(sql`select app.resolve_business_by_invitation(${input.tokenHash}) as business_id`);
  const businessId = resolved.rows[0]?.business_id;
  if (!businessId) return null;
  return await withBusinessTransaction(context.db, { actorType: "system", businessId }, async (tx) => {
    const rows = await tx.select({
      businessName: businesses.name,
      email: businessInvitations.email,
      expiresAt: businessInvitations.expiresAt,
      status: businessInvitations.status,
      role: businessInvitations.role,
      transfersOwnership: businessInvitations.transfersOwnership,
    }).from(businessInvitations).innerJoin(businesses, eq(businesses.id, businessInvitations.businessId)).where(and(eq(businessInvitations.tokenHash, input.tokenHash), eq(businessInvitations.businessId, businessId))).limit(1);
    const invitation = rows[0];
    if (!invitation) return null;
    const payment = await invitationOfferInTransaction(tx, { businessId, role: invitation.role, transfersOwnership: invitation.transfersOwnership, stripeConnect: Boolean(context.stripeConnect) });
    return { businessName: invitation.businessName, email: invitation.email, expired: invitation.expiresAt <= new Date(), status: invitation.status, payment };
  });
}

export type TeamChangeOutcome = "changed" | "not_found" | "final_owner";

/** Whether the active membership is the business's last active owner. The caller holds the team lock. */
async function isFinalOwner(tx: DatabaseTransaction, businessId: string, role: string): Promise<boolean> {
  if (role !== "business_owner") return false;
  const owners = await tx.select({ id: businessMemberships.id }).from(businessMemberships).where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.role, "business_owner"), eq(businessMemberships.status, "active")));
  return owners.length <= 1;
}

/** Changes an active member's role. A business always keeps an owner. */
export async function updateMemberRoleInTransaction(tx: DatabaseTransaction, input: { businessId: string; membershipId: string; role: Exclude<BusinessRole, "business_owner"> }): Promise<TeamChangeOutcome> {
  await lockBusinessTeam(tx, input.businessId);
  const membership = (await tx.select({ role: businessMemberships.role }).from(businessMemberships).where(and(eq(businessMemberships.id, input.membershipId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active"))).limit(1))[0];
  if (!membership) return "not_found";
  if (await isFinalOwner(tx, input.businessId, membership.role)) return "final_owner";
  await tx.update(businessMemberships).set({ role: input.role, updatedAt: new Date() }).where(and(eq(businessMemberships.id, input.membershipId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active")));
  return "changed";
}

/**
 * Takes an active member off the team, with the pending invitations they sent
 * (the inviter holds the link) or received, either of which would let them
 * back in. The app role can't read other people's users rows, so the caller
 * says how to find the member's email.
 */
export async function removeMemberInTransaction(tx: DatabaseTransaction, input: { businessId: string; membershipId: string }, memberEmail: () => Promise<string | undefined>): Promise<TeamChangeOutcome> {
  await lockBusinessTeam(tx, input.businessId);
  const membership = (await tx.select({ role: businessMemberships.role, userId: businessMemberships.userId }).from(businessMemberships).where(and(eq(businessMemberships.id, input.membershipId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active"))).limit(1))[0];
  if (!membership) return "not_found";
  if (await isFinalOwner(tx, input.businessId, membership.role)) return "final_owner";
  const email = await memberEmail();
  await tx.update(businessMemberships).set({ status: "removed", updatedAt: new Date() }).where(and(eq(businessMemberships.id, input.membershipId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active")));
  await tx.update(businessInvitations).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(businessInvitations.businessId, input.businessId), eq(businessInvitations.status, "pending"), or(eq(businessInvitations.invitedByUserId, membership.userId), email ? eq(businessInvitations.normalizedEmail, normalizeAuthEmail(email)) : undefined)));
  return "changed";
}

/** Revokes a pending invitation. False when the business has no such pending invitation. */
export async function revokeInvitationInTransaction(tx: DatabaseTransaction, input: { businessId: string; invitationId: string }): Promise<boolean> {
  const changed = await tx.update(businessInvitations).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(businessInvitations.id, input.invitationId), eq(businessInvitations.businessId, input.businessId), eq(businessInvitations.status, "pending"))).returning({ id: businessInvitations.id });
  return changed.length > 0;
}

export async function removeMember(
  context: DomainContext,
  input: { userId: string; businessId: string; membershipId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    // RLS hides the member's users row from the app role; this function returns their email.
    const outcome = await removeMemberInTransaction(tx, input, async () => (await tx.execute<{ email: string }>(sql`select email from app.list_business_members(${input.businessId}::uuid) where membership_id = ${input.membershipId}::uuid`)).rows[0]?.email);
    if (outcome === "not_found") throw Object.assign(new Error("Membership not found."), { status: 404, code: "not_found" });
    if (outcome === "final_owner") throw Object.assign(new Error("The final owner cannot be removed."), { status: 409, code: "final_owner" });
  });
}

export async function revokeInvitation(
  context: DomainContext,
  input: { userId: string; businessId: string; invitationId: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    if (!await revokeInvitationInTransaction(tx, input)) throw Object.assign(new Error("Invitation not found or already resolved."), { status: 409 });
  });
}
