import { stripLocalePrefix } from "./locale-path";

export const PUBLIC_ROUTE_NAMESPACES = ["common", "auth", "onboarding", "demos", "widget"] as const;

/**
 * Every dashboard namespace: the shared navigation and dialogs plus each
 * section's own. Dashboard routes always need all of them: the layout ships
 * them with the first page, and a language change loads them together, so
 * moving between sections never waits on a translation request. Some browsers
 * kept failing that request for /affiliate even after a retry.
 */
export const DASHBOARD_NAMESPACES = ["common", "nav", "settings", "agent", "dashboard", "calls", "contacts", "employees", "messages", "inbox", "knowledge", "affiliate", "demos", "widget"];

/**
 * The partner console's namespaces: its own, the account menu's, the shell
 * its signup and invitation pages share with onboarding, the demo page's
 * its Demos page shares with the host's, and the account form White Label's
 * sign-in and sign-up show. The console ships them all, so opening signup
 * from the switcher never waits on a translation request.
 */
export const PARTNER_NAMESPACES = ["common", "nav", "onboarding", "partner", "demos", "auth"];

export function routeNamespaces(pathname: string): string[] {
  const section = stripLocalePrefix(pathname).split("/")[1] ?? "";
  if (["login", "signup", "forgot-password", "reset-password", "verify-email", "confirm-email-change", "accept-invite"].includes(section)) return ["common", "auth", "onboarding"];
  if (section === "embed") return ["common", "widget"];
  if (["demo", "claim-demo"].includes(section)) return ["common", "auth", "demos", "widget"];
  if (section === "onboarding") return ["common", "onboarding", "auth", "settings", "nav"];
  if (section === "billing") return ["common", "onboarding", "settings"];
  // A partner's host shows this, in onboarding's shell, to someone with no business there.
  if (section === "no-businesses") return ["common", "onboarding"];
  if (section === "partner") return PARTNER_NAMESPACES;
  return DASHBOARD_NAMESPACES;
}
