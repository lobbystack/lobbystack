import { LiveKnowledgeSurface } from "@/components/live-knowledge-surface";
import { redirectLegacyPage } from "@/lib/navigation-server";

export default async function AgentKnowledgePage() {
  await redirectLegacyPage("/agent/knowledge");
  return <LiveKnowledgeSurface />;
}
