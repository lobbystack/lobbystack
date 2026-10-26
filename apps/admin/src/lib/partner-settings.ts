import type { PartnerRole } from "@lobbystack/shared";
import type { DeploymentMode } from "@lobbystack/telemetry";

import { requestJson } from "./request-json";

/** What GET /api/partner/settings answers. PATCH answers the same without the mode. */
export type PartnerSettings = { role: PartnerRole; telemetryEnabled: boolean; deploymentMode?: DeploymentMode };

/** The query the console's Settings page and its telemetry consent share, so a change on the page applies at once. */
export function partnerSettingsQueryKey(partnerId: string | undefined) {
  return ["partner-settings", partnerId] as const;
}

export function fetchPartnerSettings(partnerId: string): Promise<PartnerSettings> {
  return requestJson<PartnerSettings>(`/api/partner/settings?partnerId=${encodeURIComponent(partnerId)}`);
}
