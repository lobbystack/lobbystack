import { LivePhoneNumberSettingsSurface } from "@/components/live-phone-number-settings-surface";
import { redirectLegacyPage } from "@/lib/navigation-server";

export default async function PhoneNumberPage() {
  await redirectLegacyPage("/settings/phone-number");
  return <LivePhoneNumberSettingsSurface />;
}
