import { redirect } from "next/navigation";

import { withSearchParams, type PageSearchParams } from "@/lib/search-params";

/** The old Shared with every agent page. Its links open the agent's Specific knowledge page, and the redirect stays temporary. */
export default async function AgentSharedRoute({ params, searchParams }: { params: Promise<{ agentId: string }>; searchParams: Promise<PageSearchParams> }) {
  redirect(withSearchParams(`/agents/${encodeURIComponent((await params).agentId)}/knowledge`, await searchParams));
}
