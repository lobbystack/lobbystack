// The fixed pages of each agent, under /agents/[agentId]. The agent's own
// page holds its name, greeting and voice, then how it handles calls and
// bookings. The phone number and website widget pages open from Channels.
// Rules hold what the agent does, on every channel or on one: the
// Instructions page they replaced redirects there (moved-routes.ts).

export type AgentPage = {
  /** The path under /agents/[agentId], empty for the agent's own page. */
  section: "" | "rules" | "channels" | "channels/phone" | "channels/widget" | "shared";
  /** A key in the nav namespace. */
  titleKey: `agentPages.${string}`;
};

export const AGENT_PAGES: readonly AgentPage[] = [
  { section: "", titleKey: "agentPages.general" },

  { section: "rules", titleKey: "agentPages.rules" },
  { section: "channels", titleKey: "agentPages.channels" },
  { section: "channels/phone", titleKey: "agentPages.phone" },
  { section: "channels/widget", titleKey: "agentPages.widget" },
  { section: "shared", titleKey: "agentPages.shared" },
];

export function agentHref(agentId: string, section: AgentPage["section"] = ""): string {
  return section ? `/agents/${agentId}/${section}` : `/agents/${agentId}`;
}

/**
 * Where an agent's page goes once the person switches business: the same page
 * of the new business's default agent, through /agents/primary. Null outside
 * an agent's pages.
 */
export function agentPathAfterBusinessSwitch(pathname: string, search = ""): string | null {
  const match = /^\/agents\/[^/]+(\/.*)?$/u.exec(pathname);
  if (!match) return null;
  return `/agents/primary${match[1] ?? ""}${search ? `?${search.replace(/^\?/u, "")}` : ""}`;
}

/** The agent page a path shows, or null outside the agent's pages. */
export function agentPageOf(pathname: string): AgentPage | null {
  const match = /^\/agents\/[^/]+(?:\/(.+?))?\/?$/u.exec(pathname);
  if (!match) return null;
  return AGENT_PAGES.find((page) => page.section === (match[1] ?? "")) ?? null;
}
