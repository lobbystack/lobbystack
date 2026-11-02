import { and, eq, gt } from "drizzle-orm";
import { verifications } from "@lobbystack/db";
import { getAuthDatabase } from "./auth";
import { calendarOAuthStateDigest, verifyCalendarOAuthState, type CalendarOAuthProvider } from "./google-calendar-oauth";

const identifier = (state: string, provider: CalendarOAuthProvider) => `${provider}-calendar:${calendarOAuthStateDigest(state, provider)}`;

export async function storeCalendarOAuthState(state: string, provider: CalendarOAuthProvider = "google"): Promise<void> {
  const parsed = verifyCalendarOAuthState(state, provider);
  if (!parsed) throw new Error("Invalid calendar authorization state.");
  await getAuthDatabase().db.insert(verifications).values({ identifier: identifier(state, provider), value: `${parsed.userId}:${parsed.businessId}`, expiresAt: new Date(parsed.issuedAt + 10 * 60_000) });
}

export async function consumeCalendarOAuthState(state: string, userId: string, businessId: string, provider: CalendarOAuthProvider = "google"): Promise<boolean> {
  const parsed = verifyCalendarOAuthState(state, provider);
  if (!parsed || parsed.userId !== userId || parsed.businessId !== businessId) return false;
  const rows = await getAuthDatabase().db.delete(verifications).where(and(eq(verifications.identifier, identifier(state, provider)), eq(verifications.value, `${userId}:${businessId}`), gt(verifications.expiresAt, new Date()))).returning({ id: verifications.id });
  return rows.length === 1;
}
