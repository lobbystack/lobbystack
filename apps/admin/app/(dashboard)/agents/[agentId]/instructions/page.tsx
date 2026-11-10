import { AgentInstructionsPage } from "@/components/agent-pages";

export default async function AgentInstructionsRoute({ params }: { params: Promise<{ agentId: string }> }) {
  return <AgentInstructionsPage agentId={(await params).agentId} />;
}
