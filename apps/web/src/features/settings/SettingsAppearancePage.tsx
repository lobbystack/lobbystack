import { useMemo } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAppearancePreference } from "@/components/appearance-provider";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useLocalePreference } from "@/components/locale-provider";
import type { SupportedLocale, TimeFormatPreference } from "@/lib/locale";

type ThemeChoice = "light" | "dark";

type SettingsAppearancePageProps = {
  businessId: Id<"businesses">;
};

export function SettingsAppearancePage({
  businessId: _businessId,
}: SettingsAppearancePageProps) {
  const { t } = useTranslation(["settings", "common"]);
  const { resolvedTheme, setTheme, theme } = useTheme();
  const { locale, setLocale } = useLocalePreference();
  const { timeFormatPreference, setTimeFormatPreference } =
    useAppearancePreference();
  const selectedTheme: ThemeChoice =
    theme === "light" || theme === "dark"
      ? theme
      : resolvedTheme === "dark"
        ? "dark"
        : "light";

  const themeChoices = useMemo(
    () =>
      [
        {
          mode: "light" as const,
          label: t("appearance.theme.light"),
        },
        {
          mode: "dark" as const,
          label: t("appearance.theme.dark"),
        },
      ] satisfies Array<{ mode: ThemeChoice; label: string }>,
    [t],
  );
  return (
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex w-full flex-col gap-8">
        <ItemGroup spacing="section">
          <Item variant="outline">
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

          <Item variant="outline">
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

          <Item variant="outline">
            <ItemContent>
              <ItemTitle>{t("appearance.theme.label")}</ItemTitle>
              <ItemDescription>
                {t("appearance.theme.description")}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="w-full sm:w-auto">
              <NativeSelect
                aria-label={t("appearance.theme.label")}
                className="w-full sm:w-28"
                onChange={(event) => setTheme(event.target.value as ThemeChoice)}
                value={selectedTheme}
              >
                {themeChoices.map((choice) => (
                  <NativeSelectOption key={choice.mode} value={choice.mode}>
                    {choice.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </ItemActions>
          </Item>
        </ItemGroup>
      </div>
    </div>
  );
}
