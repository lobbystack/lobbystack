import "server-only";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { users, withBusinessTransaction } from "@lobbystack/db";
import { getWorkspaceNavigation, listUserBusinesses } from "@lobbystack/domain";

import { getAppDatabase } from "./api-helpers";
import { getSession } from "./auth";
import { createDomainContext } from "./domain-context";
import { isNewNavigationEnabled } from "./navigation-flag";
import { defaultReceptionist, legacyToNewPath, newToLegacyPath, type NavigationSnapshot } from "./navigation-routes";

async function activeBusinessId(userId: string): Promise<string | null> {
  const active = await withBusinessTransaction(getAppDatabase().db, { userId, actorType: "operator" }, async (tx) => (await tx.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, userId)).limit(1))[0]?.activeBusinessId ?? null);
  if (active) return active;
  return (await listUserBusinesses(getAppDatabase().db, userId))[0]?.businessId ?? null;
}

/** The active business's navigation, once per request. Null when signed out or without a business. */
export const loadNavigationSnapshot = cache(async (): Promise<NavigationSnapshot | null> => {
  const session = await getSession(new Headers(await headers()));
  if (!session) return null;
  const businessId = await activeBusinessId(session.user.id);
  if (!businessId) return null;
  const navigation = await getWorkspaceNavigation(createDomainContext(), { userId: session.user.id, businessId }).catch(() => null);
  if (!navigation) return null;
  return {
    businessId,
    businessName: navigation.businessName,
    timezone: navigation.timezone,
    newNavigation: isNewNavigationEnabled(navigation.featureFlags),
    staffEnabled: navigation.staffEnabled,
    canManage: ["business_owner", "business_admin"].includes(navigation.role),
    receptionists: navigation.receptionists,
  };
});

/**
 * Sends an old-navigation page to its new home when the new navigation is on,
 * so bookmarks and email links keep working. Call at the top of the page.
 */
export async function redirectLegacyPage(pathname: string, search = ""): Promise<void> {
  const navigation = await loadNavigationSnapshot();
  if (!navigation?.newNavigation) return;
  const target = legacyToNewPath(pathname, { defaultAgentId: defaultReceptionist(navigation.receptionists)?.id, search });
  if (target) redirect(target);
}

/** Sends a new-navigation page back to the old one while the flag is off. */
export async function requireNewNavigation(pathname: string): Promise<NavigationSnapshot> {
  const navigation = await loadNavigationSnapshot();
  if (!navigation?.newNavigation) redirect(newToLegacyPath(pathname) ?? "/");
  return navigation;
}

/** Serializes page search params back into a query string for redirects. */
export function searchString(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}
