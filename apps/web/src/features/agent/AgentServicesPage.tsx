import type { Id } from "../../../../../convex/_generated/dataModel";
import { AgentKnowledgePage } from "./AgentKnowledgePage";

export function AgentServicesPage({ businessId }: { businessId: Id<"businesses"> }) {
  return <AgentKnowledgePage businessId={businessId} section="services" />;
}
