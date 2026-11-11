import type { Viewport } from "next";
import { cookies } from "next/headers";

import { listAgents } from "@lobbystack/domain";
import { RootDocument } from "@/app/root-document";
import { DashboardShell } from "@/components/dashboard-shell";
import type { AgentListItem, AgentsSeed } from "@/hooks/use-agents";
import { readDashboardRequest } from "@/lib/dashboard-request";
import { createDomainContext } from "@/lib/domain-context";
import { DASHBOARD_NAMESPACES } from "@/lib/route-namespaces";
import "../globals.css";

export const dynamic = "force-dynamic";
export { generateBrandingMetadata as generateMetadata } from "@/app/root-document";

// The phone tab bar and top bar pad themselves by the safe area, so the page can run under the iPhone's home indicator.
export const viewport: Viewport = { viewportFit: "cover" };

/**
 * The business's agents for the menu's first render, for people who can set
 * them up. Without them, or when the list fails, the menu loads them itself.
 */
async function loadAgents(request: { businessId: string | null; can: (capability: "setup") => boolean; user: { id: string } }): Promise<AgentsSeed | null> {
  if (!request.businessId || !request.can("setup")) return null;
  const agents = await listAgents(createDomainContext(), { userId: request.user.id, businessId: request.businessId }).catch(() => null);
  // The same JSON the API sends, so the client's copy matches a refetch.
  return agents ? { businessId: request.businessId, agents: JSON.parse(JSON.stringify(agents)) as AgentListItem[] } : null;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const request = await readDashboardRequest();
  const { capabilities, locale, localeSource, partnerConsole, user } = request;
  const [cookieStore, agents] = await Promise.all([cookies(), loadAgents(request)]);
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  return (
    <RootDocument locale={locale} localeSource={localeSource} namespaces={DASHBOARD_NAMESPACES}>
      <DashboardShell
        agents={agents}
        capabilities={capabilities}
        partnerConsole={partnerConsole}
        sidebarOpen={sidebarOpen}
        user={{ email: user.email, name: user.name }}
      >
        {children}
      </DashboardShell>
    </RootDocument>
  );
}
