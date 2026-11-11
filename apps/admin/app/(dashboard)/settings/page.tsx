import { redirect } from "next/navigation";

import { readDashboardRequest } from "@/lib/dashboard-request";
import { settingsLandingPage } from "@/lib/settings-pages";

/** Settings opens the first workspace page the business lets the person use, or their account. */
export default async function SettingsPage() {
  const { can, opensPartnerBilling } = await readDashboardRequest();
  redirect(settingsLandingPage(can, opensPartnerBilling));
}
