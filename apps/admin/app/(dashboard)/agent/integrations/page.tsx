import { redirect } from "next/navigation";

import { redirectLegacyPage } from "@/lib/navigation-server";

export default async function AgentIntegrationsPage() {
  await redirectLegacyPage("/agent/integrations");
  redirect("/agent");
}
