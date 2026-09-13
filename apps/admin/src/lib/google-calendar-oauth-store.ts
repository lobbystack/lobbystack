import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { verifications } from "@lobbystack/db";
import { getAuthDatabase } from "./auth";
import { verifyCalendarOAuthState } from "./google-calendar-oauth";

const identifier = (state: string) => `google-calendar:${createHash("sha256").update(state).digest("hex")}`;

export async function storeCalendarOAuthState(state: string): Promise<void> {
  const parsed = verifyCalendarOAuthState(state);
  if (!parsed) throw new Error("Invalid calendar authorization state.");
  await getAuthDatabase().db.insert(verifications).values({ identifier: identifier(state), value: `${parsed.userId}:${parsed.businessId}`, expiresAt: new Date(parsed.issuedAt + 10 * 60_000) });
}

export async function consumeCalendarOAuthState(state: string, userId: string, businessId: string): Promise<boolean> {
  const rows = await getAuthDatabase().db.delete(verifications).where(and(eq(verifications.identifier, identifier(state)), eq(verifications.value, `${userId}:${businessId}`), gt(verifications.expiresAt, new Date()))).returning({ id: verifications.id });
  return rows.length === 1;
}
