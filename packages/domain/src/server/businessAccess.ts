import { and, eq } from "drizzle-orm";

import type { AuthzRole } from "@lobbystack/contracts";
import { businesses, businessMemberships, type DatabaseTransaction } from "@lobbystack/db";
import type { PartnerAccessLevel } from "@lobbystack/shared";

import { AuthorizationError, hasMinimumRole } from "../authz";

// Business access: whether a person may act in a business, and what they may
// do there. Callers check capabilities, never roles, so adding a role or an
// access level changes this module only. A business shows only on its own
// brand's domains: a partner's business on that partner's, and a direct
// business on the host's. Direct businesses keep today's role rules for every
// capability. A partner's business never gives its own operators billing, API
// keys or MCP, and at the activity level gives them only activity.

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

export type BusinessAccess = {
  businessId: string;
  /** How the person reaches the business: their own membership in it. */
  via: "membership";
  role: AuthzRole;
  /** The business's partner, or null for a direct business. */
  partnerId: string | null;
  /** What a partner's business lets its own operators do, or null for a direct business. */
  accessLevel: PartnerAccessLevel | null;
  can(capability: Capability): boolean;
};

const everything: ReadonlySet<Capability> = new Set(capabilityNames);
const fullAccess: ReadonlySet<Capability> = new Set(["activity", "setup", "team"]);
const activityOnly: ReadonlySet<Capability> = new Set(["activity"]);

/** The capabilities a business gives its own operators, before their role's rules. */
export function businessCapabilities(business: { partnerId: string | null; accessLevel: PartnerAccessLevel }): ReadonlySet<Capability> {
  if (!business.partnerId) return everything;
  return business.accessLevel === "activity" ? activityOnly : fullAccess;
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

/**
 * The person's access to the business on this brand's domain, or an
 * AuthorizationError when they have none there: they aren't on its team, the
 * business belongs to another brand, their role is below `minimumRole`, or
 * the business doesn't give them `capability`. A business of another brand
 * answers like one they aren't on, so a domain never learns what another
 * brand holds. The transaction must be scoped to the business.
 */
export async function requireBusinessAccess(
  tx: DatabaseTransaction,
  input: { userId: string; businessId: string; brand: BrandScope; capability?: Capability | undefined; minimumRole?: AuthzRole | undefined },
): Promise<BusinessAccess> {
  const [row] = await tx
    .select({ role: businessMemberships.role, partnerId: businesses.partnerId, accessLevel: businesses.partnerAccessLevel })
    .from(businessMemberships)
    .innerJoin(businesses, eq(businesses.id, businessMemberships.businessId))
    .where(and(eq(businessMemberships.userId, input.userId), eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active")))
    .limit(1);
  if (!row || !businessShowsOnBrand(row.partnerId, input.brand) || (input.minimumRole && !hasMinimumRole(row.role, input.minimumRole))) throw new AuthorizationError();
  const allowed = businessCapabilities({ partnerId: row.partnerId, accessLevel: row.accessLevel });
  const access: BusinessAccess = {
    businessId: input.businessId,
    via: "membership",
    role: row.role as AuthzRole,
    partnerId: row.partnerId,
    accessLevel: row.partnerId ? row.accessLevel : null,
    can: (capability) => allowed.has(capability),
  };
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
