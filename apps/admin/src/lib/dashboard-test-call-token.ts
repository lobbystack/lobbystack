import { createHmac } from "node:crypto";

const dashboardTestCallTokenContext =
  "lobbystack:dashboard-test-call:development";

export function resolveDashboardTestCallToken(
  source: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const configuredToken = source.DASHBOARD_TEST_CALL_TOKEN?.trim();
  if (configuredToken) return configuredToken;
  if (
    source.NODE_ENV === "production" ||
    source.DEPLOYMENT_MODE !== "development"
  ) {
    return undefined;
  }

  const internalToken = source.INTERNAL_SERVICE_TOKEN?.trim();
  if (!internalToken) return undefined;

  return createHmac("sha256", internalToken)
    .update(dashboardTestCallTokenContext)
    .digest("hex");
}
