import { listSeenPageIntros, type DomainContext } from "@lobbystack/domain";
import { PAGE_INTROS_E2E_COOKIE, type PageIntroKey } from "@lobbystack/shared";

/**
 * The intro cards the signed-in person has closed, which the dashboard layout
 * hands to the shell with the first page, or null when no card may show.
 * A failed read shows none rather than every card again.
 */
export async function loadSeenPageIntros(domain: DomainContext, userId: string, cookies: { get(name: string): { value: string } | undefined }, environment: Record<string, string | undefined> = process.env): Promise<PageIntroKey[] | null> {
  if (environment.PAGE_INTROS_E2E_OPT_IN === "true" && cookies.get(PAGE_INTROS_E2E_COOKIE)?.value !== "on") return null;
  return await listSeenPageIntros(domain, userId).catch(() => null);
}
