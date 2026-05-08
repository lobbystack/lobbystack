import type { Id } from "../../../../../convex/_generated/dataModel";
import { AgentKnowledgePage } from "./AgentKnowledgePage";

export function AgentServicesPage({
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
      section="services"
    />
  );
}
