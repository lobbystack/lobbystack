import { AgentKnowledgeSurface } from "@/components/knowledge/agent-knowledge-surface";

export default async function AgentKnowledgePage({ params }: { params: Promise<{ agentId: string }> }) {
  return <AgentKnowledgeSurface agentId={(await params).agentId} />;
}
