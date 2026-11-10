import { AgentIdentityPage } from "@/components/agent-pages";

export default async function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  return <AgentIdentityPage agentId={(await params).agentId} />;
}
