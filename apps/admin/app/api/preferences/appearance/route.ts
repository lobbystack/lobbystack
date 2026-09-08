import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { hasMinimumRole, requireBusinessMembership } from "@lobbystack/domain";
import { businesses } from "@lobbystack/db";
import { asApiResponse, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ session, businessId, tx }) => {
      const membership = await requireBusinessMembership(tx, { userId: session.user.id, businessId });
      const row = (await tx.select({ telemetryEnabled: businesses.telemetryEnabled }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
      if (!row) throw jsonError("Business not found.", 404);
      return { ...row, canManageTenant: hasMinimumRole(membership.role, "business_admin") };
    }));
  } catch (error) { return asApiResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const body = await readJson(request) as { telemetryEnabled?: boolean };
      if (!body || typeof body.telemetryEnabled !== "boolean") throw jsonError("telemetryEnabled must be a boolean.");
      await tx.update(businesses).set({ telemetryEnabled: body.telemetryEnabled, updatedAt: new Date() }).where(eq(businesses.id, businessId));
      return { telemetryEnabled: body.telemetryEnabled };
    }, { minimumRole: "business_admin" }));
  } catch (error) { return asApiResponse(error); }
}
