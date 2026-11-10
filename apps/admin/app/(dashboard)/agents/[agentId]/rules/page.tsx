import { RulesSurface } from "@/components/rules-surface";

export default async function AgentRulesPage({ params }: { params: Promise<{ agentId: string }> }) {
  return <RulesSurface agentId={(await params).agentId} />;
}
