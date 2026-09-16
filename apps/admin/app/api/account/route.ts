import { NextResponse } from "next/server";

import { listUserBusinesses } from "@lobbystack/domain";
import { asApiResponse, getAppDatabase, requireApiSession } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    return NextResponse.json({
      user: session.user,
      session: { id: session.session.id, expiresAt: session.session.expiresAt.toISOString() },
      businesses: await listUserBusinesses(getAppDatabase().db, session.user.id),
    });
  } catch (error) {
    return asApiResponse(error);
  }
}
