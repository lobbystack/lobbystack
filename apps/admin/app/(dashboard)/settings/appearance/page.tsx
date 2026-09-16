"use client";

import { selectActiveBusiness } from "@/lib/active-business";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppearancePreference } from "@/components/appearance-provider";
import { useLocalePreference } from "@/components/replacement-locale-provider";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { requestJson } from "@/lib/request-json";
import type { SupportedLocale, TimeFormatPreference } from "@/lib/locale";

export default function AppearancePage() {
  const { t } = useTranslation(["settings", "common"]);
  const { locale, setLocale, isSaving: isLocaleSaving } = useLocalePreference();
  const { timeFormatPreference, setTimeFormatPreference } = useAppearancePreference();
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Array<{ businessId: string; active: boolean }> }>("/api/businesses") });
  const businessId = selectActiveBusiness(businesses.data?.businesses)?.businessId;
  type Preference = { telemetryEnabled: boolean; canManageTenant: boolean };
  const appearance = useQuery({ queryKey: ["appearance-preferences", businessId], enabled: Boolean(businessId), queryFn: () => requestJson<Preference>(`/api/preferences/appearance?businessId=${encodeURIComponent(businessId!)}`) });
  const updateAppearance = useMutation({
    mutationFn: (input: { businessId: string; telemetryEnabled: boolean }) => requestJson<{ telemetryEnabled: boolean }>(`/api/preferences/appearance?businessId=${encodeURIComponent(input.businessId)}`, { method: "PATCH", body: JSON.stringify({ telemetryEnabled: input.telemetryEnabled }) }),
    onMutate: async input => {
      const key = ["appearance-preferences", input.businessId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Preference>(key);
      if (previous) queryClient.setQueryData(key, { ...previous, telemetryEnabled: input.telemetryEnabled });
      return { previous };
    },
    onError: (_error, input, context) => {
      if (context?.previous) queryClient.setQueryData(["appearance-preferences", input.businessId], context.previous);
      const current = queryClient.getQueryData<{ businesses: Array<{ businessId: string; active: boolean }> }>(["businesses"]);
      if (selectActiveBusiness(current?.businesses)?.businessId === input.businessId) toast.error(t("appearance.telemetry.saveFailed"));
    },
    onSettled: async (_result, _error, input) => { await queryClient.invalidateQueries({ queryKey: ["appearance-preferences", input.businessId] }); },
  });
  return (
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex w-full flex-col gap-8">
        <Surface className="flex flex-col">
          <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0" variant="default">
            <ItemContent><ItemTitle>{t("appearance.language.label")}</ItemTitle><ItemDescription>{t("appearance.language.description")}</ItemDescription></ItemContent>
            <ItemActions className="w-full sm:w-auto"><NativeSelect aria-label={t("common:language.ariaLabel")} disabled={isLocaleSaving} className="w-full sm:w-28" onChange={(event) => void setLocale(event.target.value as SupportedLocale)} value={locale}><NativeSelectOption value="en">{t("common:language.english")}</NativeSelectOption><NativeSelectOption value="fr">{t("common:language.french")}</NativeSelectOption></NativeSelect></ItemActions>
          </Item>
          <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0" variant="default">
            <ItemContent><ItemTitle>{t("appearance.timeFormat.label")}</ItemTitle><ItemDescription>{t("appearance.timeFormat.description")}</ItemDescription></ItemContent>
            <ItemActions className="w-full sm:w-auto"><NativeSelect aria-label={t("appearance.timeFormat.label")} className="w-full sm:w-28" onChange={(event) => setTimeFormatPreference(event.target.value as TimeFormatPreference)} value={timeFormatPreference}><NativeSelectOption value="24h">{t("appearance.timeFormat.twentyFourHour")}</NativeSelectOption><NativeSelectOption value="ampm">{t("appearance.timeFormat.ampm")}</NativeSelectOption></NativeSelect></ItemActions>
          </Item>
          <Item className="rounded-none border-0" variant="default">
            <ItemContent><ItemTitle>{t("appearance.telemetry.label")}</ItemTitle><ItemDescription>{t("appearance.telemetry.description")}</ItemDescription></ItemContent>
            <ItemActions className="w-full sm:w-auto"><Switch aria-label={t("appearance.telemetry.label")} checked={appearance.data?.telemetryEnabled ?? true} disabled={appearance.data?.canManageTenant !== true || (updateAppearance.isPending && updateAppearance.variables?.businessId === businessId)} onCheckedChange={(checked) => { if (businessId) updateAppearance.mutate({ businessId, telemetryEnabled: checked }); }} /></ItemActions>
          </Item>
        </Surface>
      </div>
    </div>
  );
}
