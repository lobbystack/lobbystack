import { LiveWidgetSettingsSurface } from "@/components/live-widget-settings-surface";

// ?add=1 comes from the agent's Channels page and opens the new widget form.
export default async function AgentWidgetPage({ params, searchParams }: { params: Promise<{ agentId: string }>; searchParams: Promise<{ add?: string | string[] }> }) {
  return <LiveWidgetSettingsSurface agentId={(await params).agentId} startAdding={(await searchParams).add === "1"} />;
}
