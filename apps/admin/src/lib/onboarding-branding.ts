import { canSaveInitialBranding } from "@lobbystack/domain";
import { readBrandingEnvironment } from "@lobbystack/shared";

import { getAppDatabase } from "./api-helpers";
import { runtimeDeploymentMode } from "./deployment-mode";
import { reportServerError } from "./error-reporting";
import { readResolvedBrand } from "./request-brand";

export type InitialBrandingFields = { appName: boolean; logo: boolean };

/**
 * What the brand step asks this person for: the fields the environment leaves
 * open, while nobody has chosen and they own every business on the deployment.
 * Null when the step doesn't apply, which includes LobbyStack's own cloud and
 * a partner's host: the step names the host's deployment, so only the host's
 * own domain shows it.
 */
export async function initialBrandingFields(userId: string, requestHeaders: Headers): Promise<InitialBrandingFields | null> {
  if (runtimeDeploymentMode() === "cloud" || readResolvedBrand(requestHeaders)?.kind !== "host") return null;
  const environment = readBrandingEnvironment(process.env);
  const fields = { appName: !environment.appName, logo: !environment.logoUrl };
  if (!fields.appName && !fields.logo) return null;
  try {
    return await canSaveInitialBranding({ db: getAppDatabase().db }, { userId }) ? fields : null;
  } catch (error) {
    // Onboarding carries on without the brand step rather than stopping here.
    void reportServerError(error, { operation: "initial_branding_check" });
    return null;
  }
}
