import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAppearancePreference } from "@/components/appearance-provider";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { useLocalePreference } from "@/components/locale-provider";
import { useObservedMutation } from "@/lib/observed-convex";
import { updateBusinessTelemetryPreference } from "@/lib/analytics";
import type { SupportedLocale, TimeFormatPreference } from "@/lib/locale";

type SettingsAppearancePageProps = {
  businessId: Id<"businesses">;
  canManageTenant: boolean;
};

export function SettingsAppearancePage({
  businessId,
  canManageTenant,
}: SettingsAppearancePageProps) {
  const { t } = useTranslation(["settings", "common"]);
  const { locale, setLocale } = useLocalePreference();
  const { timeFormatPreference, setTimeFormatPreference } =
    useAppearancePreference();
  const telemetry = useQuery(api.settings.telemetryOptOut.getTelemetryEnabled, {
    businessId,
  });
  const setTelemetryEnabled = useObservedMutation(
    api.settings.telemetryOptOut.setTelemetryEnabled,
    {
      operation: "settings.telemetry_set_enabled",
      properties: { businessId: String(businessId) },
    },
  );
  const [telemetryEnabled, setTelemetryEnabledState] = useState<boolean | undefined>(
    undefined,
  );
  const [isTelemetrySaving, setIsTelemetrySaving] = useState(false);
  const currentBusinessIdRef = useRef(businessId);
  currentBusinessIdRef.current = businessId;

  useEffect(() => {
    setTelemetryEnabledState(telemetry?.telemetryEnabled);
  }, [businessId, telemetry?.telemetryEnabled]);

  useEffect(() => {
    setIsTelemetrySaving(false);
  }, [businessId]);

  async function handleTelemetryToggle(next: boolean): Promise<void> {
    if (!canManageTenant) {
      return;
    }
    const previous = telemetryEnabled;
    if (previous === undefined || previous === next || isTelemetrySaving) {
      return;
    }

    const requestBusinessId = businessId;
    setIsTelemetrySaving(true);
    if (!next) {
      setTelemetryEnabledState(false);
      updateBusinessTelemetryPreference(String(requestBusinessId), false);
    }
    try {
      await setTelemetryEnabled({
        businessId: requestBusinessId,
        telemetryEnabled: next,
      });
      updateBusinessTelemetryPreference(String(requestBusinessId), next);
      if (currentBusinessIdRef.current === requestBusinessId) {
        setTelemetryEnabledState(next);
      }
    } catch {
      updateBusinessTelemetryPreference(String(requestBusinessId), previous);
      if (currentBusinessIdRef.current === requestBusinessId) {
        setTelemetryEnabledState(previous);
        toast.error(t("settings:appearance.telemetry.saveFailed"));
      }
    } finally {
      if (currentBusinessIdRef.current === requestBusinessId) {
        setIsTelemetrySaving(false);
      }
    }
  }

  return (
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex w-full flex-col gap-8">
        <Surface className="flex flex-col">
          <Item
            className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
            variant="default"
          >
            <ItemContent>
              <ItemTitle>{t("appearance.language.label")}</ItemTitle>
              <ItemDescription>
                {t("appearance.language.description")}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="w-full sm:w-auto">
              <NativeSelect
                aria-label={t("common:language.ariaLabel")}
                className="w-full sm:w-28"
                onChange={(event) =>
                  void setLocale(event.target.value as SupportedLocale)
                }
                value={locale}
              >
                <NativeSelectOption value="en">
                  {t("common:language.english")}
                </NativeSelectOption>
                <NativeSelectOption value="fr">
                  {t("common:language.french")}
                </NativeSelectOption>
              </NativeSelect>
            </ItemActions>
          </Item>

          <Item
            className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
            variant="default"
          >
            <ItemContent>
              <ItemTitle>{t("appearance.timeFormat.label")}</ItemTitle>
              <ItemDescription>
                {t("appearance.timeFormat.description")}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="w-full sm:w-auto">
              <NativeSelect
                aria-label={t("appearance.timeFormat.label")}
                className="w-full sm:w-28"
                onChange={(event) =>
                  setTimeFormatPreference(event.target.value as TimeFormatPreference)
                }
                value={timeFormatPreference}
              >
                <NativeSelectOption value="24h">
                  {t("appearance.timeFormat.twentyFourHour")}
                </NativeSelectOption>
                <NativeSelectOption value="ampm">
                  {t("appearance.timeFormat.ampm")}
                </NativeSelectOption>
              </NativeSelect>
            </ItemActions>
          </Item>

          <Item
            className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
            variant="default"
          >
            <ItemContent>
              <ItemTitle>{t("appearance.telemetry.label")}</ItemTitle>
              <ItemDescription>
                {t("appearance.telemetry.description")}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="w-full sm:w-auto">
              <Switch
                aria-label={t("appearance.telemetry.label")}
                checked={telemetryEnabled ?? false}
                disabled={
                  !canManageTenant ||
                  telemetryEnabled === undefined ||
                  isTelemetrySaving
                }
                onCheckedChange={(checked) => void handleTelemetryToggle(checked)}
              />
            </ItemActions>
          </Item>
        </Surface>
      </div>
    </div>
  );
}
