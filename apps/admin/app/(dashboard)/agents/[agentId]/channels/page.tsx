import { isWidgetKeyIssuanceEnabled } from "@lobbystack/shared";
import { AgentChannelsPage } from "@/components/agent-pages";
import { PageIntro } from "@/components/page-intros/page-intro";

export default async function AgentChannelsRoute({ params }: { params: Promise<{ agentId: string }> }) {
  return <><AgentChannelsPage agentId={(await params).agentId} widgetsEnabled={isWidgetKeyIssuanceEnabled(process.env)} /><PageIntro page="channels" /></>;
}
