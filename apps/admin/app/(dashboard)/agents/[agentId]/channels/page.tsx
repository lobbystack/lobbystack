import { isWidgetKeyIssuanceEnabled } from "@lobbystack/shared";
import { AgentChannelsPage } from "@/components/agent-pages";

export default async function AgentChannelsRoute({ params }: { params: Promise<{ agentId: string }> }) {
  return <AgentChannelsPage agentId={(await params).agentId} widgetsEnabled={isWidgetKeyIssuanceEnabled(process.env)} />;
}
