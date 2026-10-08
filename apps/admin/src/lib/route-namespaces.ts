import { stripLocalePrefix } from "./locale-path";

export const PUBLIC_ROUTE_NAMESPACES = ["common", "auth", "onboarding", "demos", "widget"] as const;

/**
 * Every dashboard namespace: the shared navigation and dialogs plus each
 * section's own. Dashboard routes always need all of them: the layout ships
 * them with the first page, and a language change loads them together, so
 * moving between sections never waits on a translation request. Some browsers
 * kept failing that request for /affiliate even after a retry.
 */
export const DASHBOARD_NAMESPACES = ["common", "nav", "settings", "agent", "dashboard", "calls", "contacts", "messages", "inbox", "knowledge", "affiliate", "demos", "widget"];

export function routeNamespaces(pathname: string): string[] {
  const section = stripLocalePrefix(pathname).split("/")[1] ?? "";
  if (["login", "signup", "forgot-password", "reset-password", "verify-email", "confirm-email-change", "accept-invite"].includes(section)) return ["common", "auth", "onboarding"];
  if (section === "embed") return ["common", "widget"];
  if (["demo", "claim-demo"].includes(section)) return ["common", "auth", "demos", "widget"];
  if (section === "onboarding") return ["common", "onboarding", "auth", "settings", "nav"];
  return DASHBOARD_NAMESPACES;
}
