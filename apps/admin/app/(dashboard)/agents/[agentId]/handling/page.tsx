import { AgentHandlingPage } from "@/components/agent-pages";

/** Calls and booking: transfers, staff answers first, booking and appointment changes. */
export default async function AgentHandlingRoute({ params }: { params: Promise<{ agentId: string }> }) {
  return <AgentHandlingPage agentId={(await params).agentId} />;
}
