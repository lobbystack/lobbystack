import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { hasMinimumRole } from "@lobbystack/domain";
import { businesses } from "@lobbystack/db";
import { jsonError } from "@/lib/api-helpers";
import { runtimeDeploymentMode } from "@/lib/deployment-mode";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx, role) => {
  const row = (await tx.select({ telemetryEnabled: businesses.telemetryEnabled }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
  if (!row) throw jsonError("Business not found.", 404);
  // Browser telemetry stamps this on every event once the workspace opts in.
  return { ...row, canManageTenant: hasMinimumRole(role, "business_admin"), deploymentMode: runtimeDeploymentMode() };
})));

export const PATCH = operatorRoute(async ({ businessId, body, transaction }) => {
  const { telemetryEnabled } = body;
  if (typeof telemetryEnabled !== "boolean") return jsonError("telemetryEnabled must be a boolean.");
  return NextResponse.json(await transaction(async (tx) => {
    await tx.update(businesses).set({ telemetryEnabled, updatedAt: new Date() }).where(eq(businesses.id, businessId));
    return { telemetryEnabled };
  }, { minimumRole: "business_admin" }));
});
