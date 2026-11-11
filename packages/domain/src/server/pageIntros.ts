import { eq } from "drizzle-orm";

import { userPageIntros, withBusinessTransaction } from "@lobbystack/db";
import { isPageIntroKey, type PageIntroKey } from "@lobbystack/shared";

import type { DomainContext } from "./context";

// Each person's closed intro cards. The rows belong to the person, not a
// business, so the transaction names only them (migration 0206).

/** The intro cards the person has closed, and whether they've visited the dashboard before. */
export async function listSeenPageIntros(context: DomainContext, userId: string): Promise<PageIntroKey[]> {
  return await withBusinessTransaction(context.db, { userId, actorType: "operator" }, async (tx) => {
    const rows = await tx.select({ intro: userPageIntros.intro }).from(userPageIntros).where(eq(userPageIntros.userId, userId));
    return rows.map(({ intro }) => intro).filter(isPageIntroKey);
  });
}

/** Records a closed card, or the first visit. Closing it again changes nothing. */
export async function markPageIntroSeen(context: DomainContext, input: { userId: string; intro: PageIntroKey }): Promise<void> {
  await withBusinessTransaction(context.db, { userId: input.userId, actorType: "operator" }, async (tx) => {
    await tx.insert(userPageIntros).values({ userId: input.userId, intro: input.intro }).onConflictDoNothing();
  });
}
