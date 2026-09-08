import { eq } from "drizzle-orm";
import { users } from "@lobbystack/db";
import { getAuthDatabase } from "@/lib/auth";
import { NextResponse } from "next/server";

import { getLatestPhoneVerificationAttempt } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export async function GET(request: Request) {
  try { const session = await requireApiSession(request); const businessId = businessIdFromRequest(request); if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 }); const attempt = await getLatestPhoneVerificationAttempt(createDomainContext(), { userId: session.user.id, businessId }); const user = (await getAuthDatabase().db.select({ phone: users.phone }).from(users).where(eq(users.id, session.user.id)).limit(1))[0]; return NextResponse.json({ attempt, currentUserPhone: user?.phone ?? null }); } catch (error) { return asApiResponse(error); }
}
