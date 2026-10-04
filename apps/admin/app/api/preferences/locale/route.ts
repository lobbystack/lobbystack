import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { users } from "@lobbystack/db";
import { isInterfaceLocale } from "@lobbystack/shared";
import { asApiResponse, jsonError, readJson, requireApiSession } from "@/lib/api-helpers";
import { getAuthDatabase } from "@/lib/auth";
import { SUPPORTED_LOCALES } from "@/lib/locale";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    const [user] = await getAuthDatabase().db.select({ locale: users.preferredLocale }).from(users).where(eq(users.id, session.user.id)).limit(1);
    return NextResponse.json({ locale: user?.locale ?? "en" });
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request) as { locale?: string };
    if (!isInterfaceLocale(body.locale)) return jsonError(`locale must be one of ${SUPPORTED_LOCALES.join(", ")}.`, 400);
    await getAuthDatabase().db.update(users).set({ preferredLocale: body.locale, updatedAt: new Date() }).where(eq(users.id, session.user.id));
    return NextResponse.json({ locale: body.locale });
  } catch (error) {
    return asApiResponse(error);
  }
}
