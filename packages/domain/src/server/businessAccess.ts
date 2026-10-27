import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

import type { AuthzRole } from "@lobbystack/contracts";
import { auditLogs, businesses, businessMemberships, partnerBusinessOpens, partnerMembers, partners, userActiveBusinesses, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import type { PartnerAccessLevel, PartnerRole } from "@lobbystack/shared";

import { AuthorizationError, hasMinimumRole, PARTNER_ACCESS_ROLE } from "../authz";
import type { DomainContext } from "./context";

// Business access: whether a person may act in a business, and what they may
// do there. Callers check capabilities, never roles, so adding a role or an
// access level changes this module only. A business shows only on its own
// brand's domains: a partner's business on that partner's, and a direct
// business on the host's. Direct businesses keep today's role rules for every
// capability. A partner's business never gives its own operators billing, API
// keys or MCP, and at the activity level gives them only activity. A partner
// member reaches one of the partner's businesses only while they hold an open
// of it, and then with full access whatever its level, without joining its
// team.

/**
 * What a person may do in a business. Activity is calls, chats,
 * appointments, contacts and messages. Setup is the rest of today's owner and
 * admin work in the business: the receptionist, knowledge, hours, services,
 * rules, numbers, integrations, the website widget and analytics. Team is
 * the business's team.
 */
export type Capability = "activity" | "setup" | "team" | "billing" | "api_keys" | "mcp";

export const capabilityNames = ["activity", "setup", "team", "billing", "api_keys", "mcp"] as const satisfies ReadonlyArray<Capability>;

/** The brand a request is on: the host's own domain, or a partner's. A Brand fits, and so does what the proxy resolved. */
export type BrandScope = { kind: "host" | "partner"; partnerId?: string | null };

/** The host's own domain, where direct businesses show. */
export const HOST_BRAND_SCOPE: BrandScope = { kind: "host" };

/** How a person reaches a business: their own place on its team, or an open through its partner. */
export type BusinessAccessVia = "membership" | "partner";

export type BusinessAccess = {
  businessId: string;
  /** How the person reaches the business: their own membership in it, or an open of it as a member of its partner. */
  via: BusinessAccessVia;
  /** The role the business's rules see: the person's own on its team, or an admin's through a partner open. */
  role: AuthzRole;
  /** The person's role on the partner's team when they reach the business through an open, or null. */
  partnerRole: PartnerRole | null;
  /** The business's partner, or null for a direct business. */
  partnerId: string | null;
  /** What a partner's business lets its own operators do, or null for a direct business. */
  accessLevel: PartnerAccessLevel | null;
  can(capability: Capability): boolean;
};

/** How long an open lets a partner member into a business. Opening it again starts the time over. */
export const PARTNER_OPEN_LIFETIME_MS = 8 * 60 * 60 * 1000;

const everything: ReadonlySet<Capability> = new Set(capabilityNames);
const fullAccess: ReadonlySet<Capability> = new Set(["activity", "setup", "team"]);
const activityOnly: ReadonlySet<Capability> = new Set(["activity"]);

/** The capabilities a business gives its own operators, before their role's rules. */
export function businessCapabilities(business: { partnerId: string | null; accessLevel: PartnerAccessLevel }): ReadonlySet<Capability> {
  if (!business.partnerId) return everything;
  return business.accessLevel === "activity" ? activityOnly : fullAccess;
}

/** The capabilities a person gets in a business: its own operators' through the team, and full access through a partner open. */
export function accessCapabilities(business: { partnerId: string | null; accessLevel: PartnerAccessLevel }, via: BusinessAccessVia): ReadonlySet<Capability> {
  return via === "partner" ? fullAccess : businessCapabilities(business);
}

/** The partner whose brand this is, or null for the host's. */
export function brandPartnerId(brand: BrandScope): string | null {
  if (brand.kind === "host") return null;
  if (!brand.partnerId) throw new Error("A partner's brand names its partner.");
  return brand.partnerId.toLowerCase();
}

/** Whether a business with this partner shows on this brand's domains. */
export function businessShowsOnBrand(partnerId: string | null, brand: BrandScope): boolean {
  return (partnerId?.toLowerCase() ?? null) === brandPartnerId(brand);
}

function accessFrom(input: { businessId: string; via: BusinessAccessVia; role: AuthzRole; partnerRole: PartnerRole | null; partnerId: string | null; accessLevel: PartnerAccessLevel }): BusinessAccess {
  const allowed = accessCapabilities(input, input.via);
  return {
    businessId: input.businessId,
    via: input.via,
    role: input.role,
    partnerRole: input.partnerRole,
    partnerId: input.partnerId,
    accessLevel: input.partnerId ? input.accessLevel : null,
    can: (capability) => allowed.has(capability),
  };
}

/**
 * The person's access to the business on any brand, or null when they have
 * none: they aren't on its team and hold no open of it as a member of its
 * partner. The transaction must act as the person, scoped to the business.
 */
export async function readBusinessAccess(tx: DatabaseTransaction, input: { userId: string; businessId: string }): Promise<BusinessAccess | null> {
  const [member] = await tx
    .select({ role: businessMemberships.role, partnerId: businesses.partnerId, accessLevel: businesses.partnerAccessLevel })
    .from(businessMemberships)
    .innerJoin(businesses, eq(businesses.id, businessMemberships.businessId))
    .where(and(eq(businessMemberships.userId, input.userId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active")))
    .limit(1);
  if (member) return accessFrom({ businessId: input.businessId, via: "membership", role: member.role as AuthzRole, partnerRole: null, partnerId: member.partnerId, accessLevel: member.accessLevel });
  // The database decides whether an open lets the person in, as row-level security does.
  const [opened] = await tx
    .select({ partnerId: businesses.partnerId, accessLevel: businesses.partnerAccessLevel, partnerRole: sql<PartnerRole | null>`app.partner_access_role(${businesses.id})` })
    .from(businesses)
    .where(and(eq(businesses.id, input.businessId), sql`app.current_user_id() = ${input.userId}::uuid`))
    .limit(1);
  if (!opened?.partnerRole || !opened.partnerId) return null;
  return accessFrom({ businessId: input.businessId, via: "partner", role: PARTNER_ACCESS_ROLE, partnerRole: opened.partnerRole, partnerId: opened.partnerId, accessLevel: opened.accessLevel });
}

/**
 * The person's access to the business on this brand's domain, or an
 * AuthorizationError when they have none there: they aren't on its team and
 * hold no partner open of it, the business belongs to another brand, their
 * role is below `minimumRole`, or the business doesn't give them
 * `capability`. A business of another brand answers like one they aren't on,
 * so a domain never learns what another brand holds. The transaction must be
 * scoped to the business.
 */
export async function requireBusinessAccess(
  tx: DatabaseTransaction,
  input: { userId: string; businessId: string; brand: BrandScope; capability?: Capability | undefined; minimumRole?: AuthzRole | undefined },
): Promise<BusinessAccess> {
  const access = await readBusinessAccess(tx, input);
  if (!access || !businessShowsOnBrand(access.partnerId, input.brand) || (input.minimumRole && !hasMinimumRole(access.role, input.minimumRole))) throw new AuthorizationError();
  if (input.capability && !access.can(input.capability)) throw new AuthorizationError("You can't do that in this business.");
  return access;
}

/**
 * Refuses an operation a partner's business doesn't give its own operators,
 * such as billing, API keys or MCP, whatever brand asked. The entry points
 * check the request's brand first; this keeps the rule where the operation
 * runs too. The transaction must be scoped to the business.
 */
export async function requireBusinessCapability(tx: DatabaseTransaction, input: { businessId: string; capability: Capability }): Promise<void> {
  const [business] = await tx.select({ partnerId: businesses.partnerId, accessLevel: businesses.partnerAccessLevel }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  if (business && !businessCapabilities(business).has(input.capability)) throw new AuthorizationError("You can't do that in this business.");
}

function businessNotFound(): Error {
  return Object.assign(new Error("Business not found."), { status: 404, code: "business_not_found" });
}

/**
 * Opens one of a partner's businesses for a member of its team, so they can
 * work inside it without joining its team. The open lasts
 * PARTNER_OPEN_LIFETIME_MS, and opening again starts the time over. Each open
 * goes in the business's audit log with who opened it and until when, in the
 * same transaction, and the business becomes the one the person works in on
 * the partner's domains. A business of another partner, a direct business, or
 * one that's no longer active answers as one that doesn't exist. When the
 * console names its partner, a business of any other partner is refused too.
 */
export async function openPartnerBusiness(context: DomainContext, input: { userId: string; businessId: string; partnerId?: string | undefined; openedBy?: { name: string | null } | undefined }): Promise<{ expiresAt: Date }> {
  // The person isn't on the business's team, so its rows show only to the system actor until the open exists.
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "system" }, async (tx) => {
    const [business] = await tx.select({ partnerId: businesses.partnerId, status: businesses.status }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    const partnerId = business?.status === "active" ? business.partnerId : null;
    if (!partnerId || (input.partnerId && input.partnerId.toLowerCase() !== partnerId)) throw businessNotFound();
    const [member] = await tx.select({ role: partnerMembers.role, partnerName: partners.name }).from(partnerMembers).innerJoin(partners, eq(partners.id, partnerMembers.partnerId)).where(and(eq(partnerMembers.partnerId, partnerId), eq(partnerMembers.userId, input.userId), eq(partnerMembers.status, "active"))).limit(1);
    if (!member) throw businessNotFound();
    const openedAt = new Date();
    const expiresAt = new Date(openedAt.getTime() + PARTNER_OPEN_LIFETIME_MS);
    await tx.insert(partnerBusinessOpens).values({ businessId: input.businessId, userId: input.userId, partnerId, openedAt, expiresAt }).onConflictDoUpdate({
      target: [partnerBusinessOpens.businessId, partnerBusinessOpens.userId],
      set: { openedAt, expiresAt },
    });
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "partner.business_opened", entityType: "business", entityId: input.businessId, payload: { partnerId, partnerRole: member.role, openedAt: openedAt.toISOString(), expiresAt: expiresAt.toISOString(), partnerName: member.partnerName, ...(input.openedBy?.name ? { openedBy: { name: input.openedBy.name } } : {}) } });
    // The partner's domain opens the dashboard on it.
    await tx.insert(userActiveBusinesses).values({ userId: input.userId, partnerId, businessId: input.businessId }).onConflictDoUpdate({
      target: [userActiveBusinesses.userId, userActiveBusinesses.partnerId],
      set: { businessId: input.businessId, updatedAt: new Date() },
    });
    return { expiresAt };
  });
}

/**
 * When the person's open of a partner's business that's still running began,
 * or null without one. A dashboard reads it as it loads, so leaving ends that
 * open and not a newer one another tab started.
 */
export async function currentPartnerOpen(context: DomainContext, input: { userId: string; businessId: string }): Promise<{ openedAt: Date } | null> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    const [open] = await tx.select({ openedAt: partnerBusinessOpens.openedAt }).from(partnerBusinessOpens)
      .where(and(eq(partnerBusinessOpens.businessId, input.businessId), eq(partnerBusinessOpens.userId, input.userId), gt(partnerBusinessOpens.expiresAt, sql`now()`))).limit(1);
    return open ?? null;
  });
}

/**
 * Ends the person's open of a partner's business when they go back to the
 * console or sign out, so it doesn't run out its PARTNER_OPEN_LIFETIME_MS.
 * With `openedAt`, only the open that began then ends: opening the business
 * again in another tab starts a newer one, which stays. A tab closed without
 * either leaves the open to expire by itself. The business's audit log
 * records when they left. Without a matching open still running, it does
 * nothing.
 */
export async function leavePartnerBusiness(context: DomainContext, input: { userId: string; businessId: string; openedAt?: Date | undefined }): Promise<{ left: boolean }> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "system" }, async (tx) => {
    // The open checks expires_at against the transaction's now(), so the leave sets that. The row
    // needs expires_at past opened_at, which the app's clock wrote, so opened_at moves back if it must;
    // the audit log keeps when they opened it.
    const [ended] = await tx.update(partnerBusinessOpens).set({ expiresAt: sql`now()`, openedAt: sql`least(${partnerBusinessOpens.openedAt}, now() - interval '1 millisecond')` })
      .where(and(eq(partnerBusinessOpens.businessId, input.businessId), eq(partnerBusinessOpens.userId, input.userId), gt(partnerBusinessOpens.expiresAt, sql`now()`), ...(input.openedAt ? [eq(partnerBusinessOpens.openedAt, input.openedAt)] : [])))
      .returning({ partnerId: partnerBusinessOpens.partnerId, leftAt: partnerBusinessOpens.expiresAt });
    if (!ended) return { left: false };
    // The leave names who left as their last open did.
    const [opened] = await tx.select({ payload: auditLogs.payload }).from(auditLogs)
      .where(and(eq(auditLogs.businessId, input.businessId), eq(auditLogs.actorUserId, input.userId), eq(auditLogs.eventType, "partner.business_opened")))
      // Opens in one transaction share created_at; the time each recorded tells them apart.
      .orderBy(desc(auditLogs.createdAt), desc(sql`${auditLogs.payload}->>'openedAt'`)).limit(1);
    const { openedBy, partnerName } = (opened?.payload ?? {}) as Record<string, unknown>;
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "partner.business_left", entityType: "business", entityId: input.businessId, payload: { partnerId: ended.partnerId, leftAt: ended.leftAt.toISOString(), ...(partnerName ? { partnerName } : {}), ...(openedBy ? { openedBy } : {}) } });
    return { left: true };
  });
}

/**
 * One time someone on the business's partner's team opened it or left it, as
 * its audit log has it. The business sees the person's name and the partner
 * as they were then, never their email or role on the partner's team, so it
 * reads the same after they leave the partner or the partner releases it.
 */
export type PartnerAccessEvent = {
  id: string;
  kind: "opened" | "left";
  at: Date;
  /** Their name when they opened it, or null for someone with none or an open recorded before the log kept names. */
  name: string | null;
  /** The partner's name then, or null for an open recorded before the log kept it. */
  partnerName: string | null;
};

const PARTNER_ACCESS_EVENTS = ["partner.business_opened", "partner.business_left"] as const;

/**
 * The business's partner's visits, newest first, for its owners and admins.
 * The transaction is the operator's, scoped to the business.
 */
export async function listPartnerAccess(tx: DatabaseTransaction, input: { businessId: string; limit?: number }): Promise<PartnerAccessEvent[]> {
  const rows = await tx.select({ id: auditLogs.id, eventType: auditLogs.eventType, actorUserId: auditLogs.actorUserId, payload: auditLogs.payload, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(and(eq(auditLogs.businessId, input.businessId), inArray(auditLogs.eventType, [...PARTNER_ACCESS_EVENTS])))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 500));
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
  return rows.map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const opener = typeof payload.openedBy === "object" && payload.openedBy !== null ? payload.openedBy as Record<string, unknown> : null;
    const opened = row.eventType === "partner.business_opened";
    return { id: row.id, kind: opened ? "opened" : "left", at: row.createdAt, name: text(opener?.name), partnerName: text(payload.partnerName) };
  });
}
