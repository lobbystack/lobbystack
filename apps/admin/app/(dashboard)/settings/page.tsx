import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FirstSettingsTab } from "@/components/first-settings-tab";
import { requestBrandScope } from "@/lib/request-brand";

export default async function SettingsPage() {
  // The host's domain shows only direct businesses, which give every tab, so Settings opens on Usage.
  if (requestBrandScope(await headers()).kind === "host") redirect("/settings/usage");
  // On a partner's domain Settings opens on the first tab the business's access level allows, which is Usage for each level today.
  return <FirstSettingsTab />;
}
