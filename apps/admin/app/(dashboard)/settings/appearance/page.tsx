"use client";

import { selectActiveBusiness } from "@/lib/active-business";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppearancePreference } from "@/components/appearance-provider";
import { useLocalePreference } from "@/components/replacement-locale-provider";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { requestJson } from "@/lib/request-json";
import { LOCALE_LABEL_KEYS, SUPPORTED_LOCALES, localeTag, type SupportedLocale, type TimeFormatPreference } from "@/lib/locale";

export default function AppearancePage() {
  const { t } = useTranslation(["settings", "common"]);
  const { locale, setLocale, isSaving: isLocaleSaving } = useLocalePreference();
  const { ready: timeFormatReady, timeFormatPreference, setTimeFormatPreference } = useAppearancePreference();
  const queryClient = useQueryClient();
  const { businesses, business } = useActiveBusiness();
  const businessId = business?.businessId;
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
    onSuccess: (_result, input) => {
      const current = queryClient.getQueryData<{ businesses: Array<{ businessId: string; active: boolean }> }>(["businesses"]);
      if (selectActiveBusiness(current?.businesses)?.businessId === input.businessId) toast.success(t("appearance.saved"));
    },
    onSettled: async (_result, _error, input) => { await queryClient.invalidateQueries({ queryKey: ["appearance-preferences", input.businessId] }); },
  });
  // The saved telemetry choice comes from the server and the time format from the browser, so the three rows turn real together.
  const loading = businesses.isLoading || appearance.isLoading || !timeFormatReady;
  return (
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex w-full flex-col gap-8">
        <Surface className="flex flex-col">
          <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0" variant="default">
            <RowText description={t("appearance.language.description")} label={t("appearance.language.label")} loading={loading} />
            <ItemActions className="w-full sm:w-auto">
              {loading ? <Skeleton aria-hidden="true" className="h-9 w-full sm:w-36" /> : <Select disabled={isLocaleSaving} items={SUPPORTED_LOCALES.map((option) => ({ value: option, label: t(LOCALE_LABEL_KEYS[option]) }))} onValueChange={(value) => { if (value) void setLocale(value as SupportedLocale).then((saved) => { if (saved) toast.success(t("appearance.saved")); }); }} value={locale}>
                <SelectTrigger aria-label={t("common:language.ariaLabel")} className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{SUPPORTED_LOCALES.map((option) => <SelectItem key={option} lang={localeTag(option)} value={option}>{t(LOCALE_LABEL_KEYS[option])}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>}
            </ItemActions>
          </Item>
          <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0" variant="default">
            <RowText description={t("appearance.timeFormat.description")} label={t("appearance.timeFormat.label")} loading={loading} />
            <ItemActions className="w-full sm:w-auto">
              {loading ? <Skeleton aria-hidden="true" className="h-9 w-full sm:w-36" /> : <Select items={[{ value: "24h", label: t("appearance.timeFormat.twentyFourHour") }, { value: "ampm", label: t("appearance.timeFormat.ampm") }]} onValueChange={(value) => { if (value) { setTimeFormatPreference(value as TimeFormatPreference); toast.success(t("appearance.saved")); } }} value={timeFormatPreference}>
                <SelectTrigger aria-label={t("appearance.timeFormat.label")} className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="24h">{t("appearance.timeFormat.twentyFourHour")}</SelectItem><SelectItem value="ampm">{t("appearance.timeFormat.ampm")}</SelectItem></SelectGroup></SelectContent>
              </Select>}
            </ItemActions>
          </Item>
          <Item className="rounded-none border-0" variant="default">
            <RowText description={t("appearance.telemetry.description")} label={t("appearance.telemetry.label")} loading={loading} />
            <ItemActions className="w-full sm:w-auto">{loading ? <Skeleton aria-hidden="true" className="h-[18.4px] w-8 rounded-full" /> : <Switch aria-label={t("appearance.telemetry.label")} checked={appearance.data?.telemetryEnabled ?? true} disabled={appearance.data?.canManageTenant !== true || (updateAppearance.isPending && updateAppearance.variables?.businessId === businessId)} onCheckedChange={(checked) => { if (businessId) updateAppearance.mutate({ businessId, telemetryEnabled: checked }); }} />}</ItemActions>
          </Item>
        </Surface>
      </div>
    </div>
  );
}

/** A row's title and description. While loading they are placeholders holding their real text, hidden, so each is as wide and tall as the text. */
function RowText({ description, label, loading }: { description: string; label: string; loading: boolean }) {
  if (loading) return (
    <ItemContent>
      <ItemTitle aria-hidden="true"><Skeleton className="w-fit"><span className="invisible">{label}</span></Skeleton></ItemTitle>
      <div aria-hidden="true" className="text-sm"><Skeleton className="w-fit max-w-full"><span className="invisible">{description}</span></Skeleton></div>
    </ItemContent>
  );
  return <ItemContent><ItemTitle>{label}</ItemTitle><ItemDescription>{description}</ItemDescription></ItemContent>;
}
