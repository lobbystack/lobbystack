import { configuredPlatformKeys, disableRemovedPlatformKeyWebhooks, PlatformKeyConfigError, type DomainContext } from "@lobbystack/domain";

import { getDatabase } from "./databases";
import { shouldAssertAdminDatabaseRoles, type AdminStartupContext } from "./startup-role-assertion";

/**
 * Turns off the webhooks that platform keys no longer in PLATFORM_API_KEYS set
 * up. The admin runs this when it starts: the worker delivers webhooks but
 * doesn't read PLATFORM_API_KEYS, and removing a key restarts the admin. Keys
 * partners made in their consoles aren't in PLATFORM_API_KEYS; the database
 * keeps their webhooks while they aren't revoked, and revoking one turns its
 * webhooks off at once. Returns how many endpoints it turned off, or null
 * when it didn't run.
 */
export async function disableRemovedPlatformKeyWebhooksAtStartup(
  context: AdminStartupContext = {
    runtime: process.env.NEXT_RUNTIME,
    phase: process.env.NEXT_PHASE,
    environment: process.env,
  },
  domain: () => DomainContext = () => ({ db: getDatabase("lobbystack_worker").db }),
): Promise<number | null> {
  // The same deployments that check the database roles at startup: production, outside builds and maintenance.
  if (!shouldAssertAdminDatabaseRoles(context)) return null;
  let configuredPlatformKeyIds: string[];
  try {
    configuredPlatformKeyIds = configuredPlatformKeys(context.environment).map((key) => key.platformKeyId);
  } catch (error) {
    // A malformed PLATFORM_API_KEYS refuses every platform key, so it can't say which keys are gone.
    if (!(error instanceof PlatformKeyConfigError)) throw error;
    console.warn(`[platform-keys] Left platform keys' webhooks as they are: ${error.message}`);
    return null;
  }
  const disabled = await disableRemovedPlatformKeyWebhooks(domain(), { configuredPlatformKeyIds });
  if (disabled > 0) console.info(JSON.stringify({ event: "platform_key_webhooks.disabled", count: disabled }));
  return disabled;
}
