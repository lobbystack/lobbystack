import { AgentSettingsPage } from "@/components/agent-pages";

/** The agent's own page: name, greeting and voice, then calls and booking. */
export default async function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  return <AgentSettingsPage agentId={(await params).agentId} />;
}
