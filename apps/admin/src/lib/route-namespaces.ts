export function routeNamespaces(pathname: string): string[] {
  const section = pathname.split("/")[1] ?? "";
  if (["login", "signup", "forgot-password", "reset-password", "verify-email", "confirm-email-change", "accept-invite"].includes(section)) return ["common", "auth"];
  if (section === "embed") return ["common", "widget"];
  if (["demo", "claim-demo"].includes(section)) return ["common", "auth", "demos", "widget"];
  if (section === "onboarding") return ["common", "onboarding", "auth", "settings", "nav"];
  const route: Record<string, string[]> = {
    "": ["dashboard"], analytics: ["dashboard"], calls: ["calls"], contacts: ["contacts"],
    messages: ["messages", "inbox"], appointments: [], integrations: [],
    agent: ["knowledge"], affiliate: ["affiliate"], demos: ["demos"],
    settings: ["widget"], "setup-guide": [],
  };
  // These namespaces belong to the shared dashboard navigation and dialogs.
  return [...new Set(["common", "nav", "settings", "agent", ...(route[section] ?? ["dashboard"])])];
}
