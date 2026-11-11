import { notFound, redirect } from "next/navigation";

import { getAgent } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { AgentShell } from "@/components/agent-shell";
import { readDashboardRequest } from "@/lib/dashboard-request";
import { createDomainContext } from "@/lib/domain-context";

/** An agent's pages, for people the business lets set agents up. An archived or unknown agent isn't found. */
export default async function AgentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const { businessId, can, user } = await readDashboardRequest();
  if (!businessId || !can("setup")) redirect("/");
  if (!isUuid(agentId)) notFound();
  const agent = await getAgent(createDomainContext(), { userId: user.id, businessId, agentId }).catch((error: unknown) => {
    if ((error as { status?: number }).status === 404) notFound();
    throw error;
  });
  return <AgentShell agent={{ id: agent.id, name: agent.name }}>{children}</AgentShell>;
}
