import type { Id } from "../../../../../convex/_generated/dataModel";
import { AgentKnowledgePage } from "./AgentKnowledgePage";

export function AgentRulesPage({
  businessId,
  canManageTenant,
}: {
  businessId: Id<"businesses">;
  canManageTenant: boolean;
}) {
  return (
    <AgentKnowledgePage
      businessId={businessId}
      canManageTenant={canManageTenant}
      section="rules"
    />
  );
}
