import { LiveAgentBasicSettingsSurface } from "@/components/live-agent-basic-settings-surface";
import { redirectLegacyPage } from "@/lib/navigation-server";

export default async function AgentPage() {
  await redirectLegacyPage("/agent");
  return <LiveAgentBasicSettingsSurface />;
}
