import { eq } from "drizzle-orm";

import { users } from "@lobbystack/db";
import { getAuthDatabase } from "./auth";

/** Whether the account has a verified mobile number, which alert texts need. Only the auth database role can read it. */
export async function hasVerifiedPhone(userId: string): Promise<boolean> {
  const [user] = await getAuthDatabase().db.select({ phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(user?.phone && user.phoneVerifiedAt);
}
