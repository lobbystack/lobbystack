import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { users } from "@lobbystack/db";
import { asApiResponse, getAppDatabase, readJson, requireApiSession } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    const [user] = await getAppDatabase().db.select({ locale: users.preferredLocale }).from(users).where(eq(users.id, session.user.id)).limit(1);
    return NextResponse.json({ locale: user?.locale ?? "en" });
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request) as { locale?: string };
    if (body.locale !== "en" && body.locale !== "fr") return NextResponse.json({ error: "locale must be en or fr." }, { status: 400 });
    await getAppDatabase().db.update(users).set({ preferredLocale: body.locale, updatedAt: new Date() }).where(eq(users.id, session.user.id));
    return NextResponse.json({ locale: body.locale });
  } catch (error) {
    return asApiResponse(error);
  }
}
