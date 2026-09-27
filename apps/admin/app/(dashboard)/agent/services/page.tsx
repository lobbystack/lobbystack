import { LiveServicesSurface } from "@/components/live-services-surface";
import { redirectLegacyPage } from "@/lib/navigation-server";

export default async function AgentServicesPage() {
  await redirectLegacyPage("/agent/services");
  return <LiveServicesSurface />;
}
