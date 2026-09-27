import { LiveAgentBasicSettingsSurface } from "@/components/live-agent-basic-settings-surface";
import { redirectLegacyPage } from "@/lib/navigation-server";

export default async function AgentBasicSettingsPage() {
  await redirectLegacyPage("/agent/basic-settings");
  return <LiveAgentBasicSettingsSurface />;
}
