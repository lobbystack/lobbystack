import { LiveWidgetSettingsSurface } from "@/components/live-widget-settings-surface";
import { redirectLegacyPage } from "@/lib/navigation-server";

export default async function SettingsWidgetPage() {
  await redirectLegacyPage("/settings/widget");
  return <LiveWidgetSettingsSurface />;
}
