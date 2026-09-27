import { RulesSurface } from "@/components/rules-surface";
import { redirectLegacyPage } from "@/lib/navigation-server";

export default async function AgentRulesPage() {
  await redirectLegacyPage("/agent/rules");
  return <RulesSurface />;
}
