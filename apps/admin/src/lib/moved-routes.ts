/**
 * Where each dashboard page that moved lives now. Next checks these in order
 * and keeps the query string. They stay temporary and stay for good: emails
 * already sent link to the old paths. "primary" opens the workspace's default
 * agent on the server. /settings itself is a page that opens the first one
 * the person may use, so none of these match it.
 */
export const MOVED_DASHBOARD_ROUTES = [
  // Calls and messages share the Inbox.
  { source: "/calls", destination: "/inbox?channel=phone_call", permanent: false },
  { source: "/calls/:callId", destination: "/inbox?call=:callId", permanent: false },
  { source: "/messages", destination: "/inbox", permanent: false },
  { source: "/agent", destination: "/agents/primary", permanent: false },
  { source: "/agent/basic-settings", destination: "/agents/primary", permanent: false },
  { source: "/agent/rules", destination: "/agents/primary/rules", permanent: false },
  { source: "/agent/integrations", destination: "/agents/primary/channels", permanent: false },
  { source: "/agent/:section(knowledge|services|employees)", destination: "/workspace/:section", permanent: false },
  { source: "/integrations", destination: "/workspace/connections", permanent: false },
  { source: "/integrations/webhooks", destination: "/workspace/webhooks", permanent: false },
  { source: "/widget", destination: "/agents/primary/channels/widget", permanent: false },
  { source: "/settings/widget", destination: "/agents/primary/channels/widget", permanent: false },
  { source: "/settings/phone-number", destination: "/agents/primary/channels/phone", permanent: false },
  { source: "/settings/account", destination: "/account", permanent: false },
  { source: "/settings/plan", destination: "/workspace/billing", permanent: false },
  // Connected apps moved to the bottom of API keys as MCP connections.
  { source: "/settings/connected-apps", destination: "/workspace/api-keys", permanent: false },
  { source: "/settings/:page(appearance|notifications)", destination: "/account/:page", permanent: false },
  { source: "/settings/:page(team|usage|subscription|partner-access|api-keys)", destination: "/workspace/:page", permanent: false },
] as const satisfies ReadonlyArray<{ source: string; destination: string; permanent: false }>;
