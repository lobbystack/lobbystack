import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FirstSettingsTab } from "@/components/first-settings-tab";
import { requestBrandScope } from "@/lib/request-brand";

export default async function SettingsPage() {
  // The host's domain shows only direct businesses, which give every tab, so Settings opens on Usage.
  if (requestBrandScope(await headers()).kind === "host") redirect("/settings/usage");
  // A partner's business has no Usage tab, so Settings opens on the first tab its access level allows.
  return <FirstSettingsTab />;
}
