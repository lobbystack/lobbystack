import { NextResponse } from "next/server";

import { getPartnerSettings, savePartnerSettings } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { runtimeDeploymentMode } from "@/lib/deployment-mode";
import { partnerRoute } from "@/lib/partner-request";

export const dynamic = "force-dynamic";

// The partner console's Settings page, and the telemetry consent the
// console's pages ask for, as /api/preferences/appearance answers both for a
// business. The partner operation checks the actor's role itself.

// Browser telemetry stamps the mode the server runs with on every event once the partner opts in.
export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json({ ...(await getPartnerSettings(domain, actor)), deploymentMode: runtimeDeploymentMode() }));

/** Saves `{ telemetryEnabled }`. */
export const PATCH = partnerRoute(async ({ actor, body, domain }) => {
  const { telemetryEnabled } = body;
  if (typeof telemetryEnabled !== "boolean") return jsonError("telemetryEnabled must be a boolean.", 400, "invalid_request");
  return NextResponse.json(await savePartnerSettings(domain, actor, { telemetryEnabled }));
});
