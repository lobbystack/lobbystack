import { useMemo } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAppearancePreference } from "@/components/appearance-provider";
import { cn } from "@/lib/utils";
import type { TimeFormatPreference } from "@/lib/locale";

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
      ? "bg-[#f3f2ee]"
      : "bg-[#18181b]";
  const panelClassName =
    mode === "light"
      ? "bg-white border-border/50"
      : "border-white/10 bg-[#27272a]";
  const lineClassName =
    mode === "light"
      ? "bg-slate-300"
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
        <div className="space-y-2">
          <div className={cn("rounded-md border p-2", panelClassName)}>
            <div className={cn("h-1.5 w-14 rounded-full", lineClassName)} />
            <div className={cn("mt-1.5 h-1.5 w-20 rounded-full", lineClassName)} />
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
  const { t } = useTranslation("settings");
  const { resolvedTheme, setTheme, theme } = useTheme();
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
      <div className="max-w-3xl space-y-8">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">
              {t("appearance.timeFormat.label")}
            </label>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("appearance.timeFormat.description")}
            </p>
          </div>
          <div className="relative w-full max-w-xs">
            <select
              className="h-9 w-full appearance-none rounded-md border border-input bg-transparent px-3 pe-10 text-sm shadow-xs outline-none transition-colors focus:border-ring focus:ring-0 focus-visible:border-ring focus-visible:ring-0"
              onChange={(event) =>
                setTimeFormatPreference(event.target.value as TimeFormatPreference)
              }
              value={timeFormatPreference}
            >
              <option value="24h">
                {t("appearance.timeFormat.twentyFourHour")}
              </option>
              <option value="ampm">
                {t("appearance.timeFormat.ampm")}
              </option>
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">
              {t("appearance.theme.label")}
            </label>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("appearance.theme.description")}
            </p>
          </div>
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
            </div>
      </div>
    </div>
  );
}
