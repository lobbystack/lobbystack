import { notFound, redirect } from "next/navigation";

import { listAgents } from "@lobbystack/domain";
import { readDashboardRequest } from "@/lib/dashboard-request";
import { createDomainContext } from "@/lib/domain-context";
import { withSearchParams, type PageSearchParams } from "@/lib/search-params";

/**
 * /agents/primary and the pages under it open the workspace's default agent,
 * keeping the rest of the path and the query. Emails and old routes link here.
 */
export default async function PrimaryAgentPage({ params, searchParams }: { params: Promise<{ rest?: string[] }>; searchParams: Promise<PageSearchParams> }) {
  const { businessId, can, user } = await readDashboardRequest();
  if (!businessId || !can("setup")) redirect("/");
  const agents = await listAgents(createDomainContext(), { userId: user.id, businessId });
  const primary = agents.find((agent) => agent.isDefault) ?? agents[0];
  if (!primary) notFound();
  const { rest = [] } = await params;
  const path = [`/agents/${encodeURIComponent(primary.id)}`, ...rest.map(encodeURIComponent)].join("/");
  redirect(withSearchParams(path, await searchParams));
}
