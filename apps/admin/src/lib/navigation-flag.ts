export const NEW_NAVIGATION_FLAG = "new_navigation";

/**
 * Whether a business sees the new navigation. `LOBBYSTACK_NEW_NAVIGATION`
 * overrides the per-business flag for a whole deployment: `on` turns it on for
 * every business (staging), `off` turns it off everywhere (kill switch). Any
 * other value leaves it to `businesses.feature_flags.new_navigation`.
 */
export function isNewNavigationEnabled(featureFlags: unknown, override: string | undefined = process.env.LOBBYSTACK_NEW_NAVIGATION): boolean {
  const mode = override?.trim().toLowerCase();
  if (mode === "on") return true;
  if (mode === "off") return false;
  return typeof featureFlags === "object" && featureFlags !== null && (featureFlags as Record<string, unknown>)[NEW_NAVIGATION_FLAG] === true;
}
