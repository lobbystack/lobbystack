import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { users } from "@lobbystack/db";
import { isInterfaceLocale } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { getAuthDatabase } from "@/lib/auth";
import { SUPPORTED_LOCALES } from "@/lib/locale";
import { signedInRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = signedInRoute(async ({ userId }) => {
  const [user] = await getAuthDatabase().db.select({ locale: users.preferredLocale }).from(users).where(eq(users.id, userId)).limit(1);
  return NextResponse.json({ locale: user?.locale ?? "en" });
});

export const PATCH = signedInRoute(async ({ userId, body }) => {
  const { locale } = body;
  if (!isInterfaceLocale(locale)) return jsonError(`locale must be one of ${SUPPORTED_LOCALES.join(", ")}.`, 400);
  await getAuthDatabase().db.update(users).set({ preferredLocale: locale, updatedAt: new Date() }).where(eq(users.id, userId));
  return NextResponse.json({ locale });
});
