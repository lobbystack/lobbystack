import type { Id } from "../../../../../convex/_generated/dataModel";
import { AgentKnowledgePage } from "./AgentKnowledgePage";

export function AgentRulesPage({ businessId }: { businessId: Id<"businesses"> }) {
  return <AgentKnowledgePage businessId={businessId} section="rules" />;
}
