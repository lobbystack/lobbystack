import { useMemo } from "react";
import { Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAppearancePreference } from "@/components/appearance-provider";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useLocalePreference } from "@/components/locale-provider";
import { cn } from "@/lib/utils";
import type { SupportedLocale, TimeFormatPreference } from "@/lib/locale";

type ThemeChoice = "light" | "dark";

type SettingsAppearancePageProps = {
  businessId: Id<"businesses">;
};

type ThemeCardProps = {
  active: boolean;
  label: string;
  mode: ThemeChoice;
  onClick: (mode: ThemeChoice) => void;
};

function ThemePreviewCard({
  active,
  label,
  mode,
  onClick,
}: ThemeCardProps) {
  const shellClassName =
    mode === "light"
      ? "bg-[#f5f5f5]"
      : "bg-[#18181b]";
  const panelClassName =
    mode === "light"
      ? "border-[#e5e5e5] bg-white"
      : "border-white/10 bg-[#27272a]";
  const lineClassName =
    mode === "light"
      ? "bg-[#d4d4d4]"
      : "bg-[#71717a]";

  return (
    <button
      className={cn(
        "group flex flex-col rounded-xl border-2 p-1.5 text-left transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border/70 bg-card hover:border-primary/40",
      )}
      onClick={() => onClick(mode)}
      type="button"
      >
        <div
          className={cn(
            "rounded-lg border p-2 shadow-sm transition-colors",
            shellClassName,
            active && "shadow-primary/10",
          )}
        >
        <div className="flex flex-col gap-2">
          <div className={cn("flex flex-col gap-1.5 rounded-md border p-2", panelClassName)}>
            <div className={cn("h-1.5 w-14 rounded-full", lineClassName)} />
            <div className={cn("h-1.5 w-20 rounded-full", lineClassName)} />
          </div>
          <div className={cn("flex items-center gap-2 rounded-md border p-2", panelClassName)}>
            <div className={cn("size-3 rounded-full", lineClassName)} />
            <div className={cn("h-1.5 w-16 rounded-full", lineClassName)} />
          </div>
          <div className={cn("flex items-center gap-2 rounded-md border p-2", panelClassName)}>
            <div className={cn("size-3 rounded-full", lineClassName)} />
            <div className={cn("h-1.5 w-14 rounded-full", lineClassName)} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-2 pt-2 pb-1">
        <span className="text-sm font-medium">{label}</span>
        {active ? <Check className="size-4 text-primary" /> : null}
      </div>
    </button>
  );
}

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
      ] satisfies Array<Omit<ThemeCardProps, "active" | "onClick">>,
    [t],
  );

  return (
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex max-w-3xl flex-col gap-8">
        <FieldGroup>
          <Field>
            <FieldContent>
              <FieldLabel>{t("appearance.language.label")}</FieldLabel>
              <FieldDescription>
                {t("appearance.language.description")}
              </FieldDescription>
            </FieldContent>
            <NativeSelect
              aria-label={t("common:language.ariaLabel")}
              className="max-w-xs"
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
          </Field>
        </FieldGroup>

        <FieldGroup>
          <Field>
            <FieldContent>
              <FieldLabel>{t("appearance.timeFormat.label")}</FieldLabel>
              <FieldDescription>
                {t("appearance.timeFormat.description")}
              </FieldDescription>
            </FieldContent>
            <NativeSelect
              className="max-w-xs"
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
          </Field>
        </FieldGroup>

        <FieldGroup>
          <Field>
            <FieldContent>
              <FieldLabel>{t("appearance.theme.label")}</FieldLabel>
              <FieldDescription>
                {t("appearance.theme.description")}
              </FieldDescription>
            </FieldContent>
            <div className="grid max-w-md gap-3 md:grid-cols-2">
              {themeChoices.map((choice) => (
                <ThemePreviewCard
                  active={selectedTheme === choice.mode}
                  key={choice.mode}
                  label={choice.label}
                  mode={choice.mode}
                  onClick={(mode) => setTheme(mode)}
                />
              ))}
            </div>
          </Field>
        </FieldGroup>
      </div>
    </div>
  );
}
