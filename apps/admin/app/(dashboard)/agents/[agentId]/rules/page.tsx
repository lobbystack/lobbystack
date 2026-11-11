import { RulesSurface } from "@/components/rules-surface";
import { PageIntro } from "@/components/page-intros/page-intro";

export default async function AgentRulesPage({ params }: { params: Promise<{ agentId: string }> }) {
  return <><RulesSurface agentId={(await params).agentId} /><PageIntro page="rules" /></>;
}
