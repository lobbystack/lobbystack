"use client";

import { useTranslation } from "react-i18next";

import { useAppearancePreference } from "@/components/appearance-provider";
import { useLocalePreference } from "@/components/replacement-locale-provider";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Surface } from "@/components/ui/surface";
import type { SupportedLocale, TimeFormatPreference } from "@/lib/locale";

export default function AppearancePage() {
  const { t } = useTranslation(["settings", "common"]);
  const { locale, setLocale } = useLocalePreference();
  const { timeFormatPreference, setTimeFormatPreference } = useAppearancePreference();
  return (
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex w-full flex-col gap-8">
        <Surface className="flex flex-col">
          <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0" variant="default">
            <ItemContent><ItemTitle>{t("appearance.language.label")}</ItemTitle><ItemDescription>{t("appearance.language.description")}</ItemDescription></ItemContent>
            <ItemActions className="w-full sm:w-auto"><NativeSelect aria-label={t("common:language.ariaLabel")} className="w-full sm:w-28" onChange={(event) => void setLocale(event.target.value as SupportedLocale)} value={locale}><NativeSelectOption value="en">{t("common:language.english")}</NativeSelectOption><NativeSelectOption value="fr">{t("common:language.french")}</NativeSelectOption></NativeSelect></ItemActions>
          </Item>
          <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0" variant="default">
            <ItemContent><ItemTitle>{t("appearance.timeFormat.label")}</ItemTitle><ItemDescription>{t("appearance.timeFormat.description")}</ItemDescription></ItemContent>
            <ItemActions className="w-full sm:w-auto"><NativeSelect aria-label={t("appearance.timeFormat.label")} className="w-full sm:w-28" onChange={(event) => setTimeFormatPreference(event.target.value as TimeFormatPreference)} value={timeFormatPreference}><NativeSelectOption value="24h">{t("appearance.timeFormat.twentyFourHour")}</NativeSelectOption><NativeSelectOption value="ampm">{t("appearance.timeFormat.ampm")}</NativeSelectOption></NativeSelect></ItemActions>
          </Item>
        </Surface>
      </div>
    </div>
  );
}
