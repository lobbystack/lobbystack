import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Clock3, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAppearancePreference } from "@/components/appearance-provider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { TimeFormatPreference } from "@/lib/locale";

type ThemeChoice = "light" | "dark";

type SettingsAppearancePageProps = {
  businessId: Id<"businesses">;
};

type ThemeCardProps = {
  active: boolean;
  description: string;
  icon: typeof Sun;
  label: string;
  mode: ThemeChoice;
  onClick: (mode: ThemeChoice) => void;
};

function ThemePreviewCard({
  active,
  description,
  icon: Icon,
  label,
  mode,
  onClick,
}: ThemeCardProps) {
  const shellClassName =
    mode === "light"
      ? "bg-[#f3f2ee]"
      : "bg-slate-950";
  const panelClassName =
    mode === "light"
      ? "bg-white border-border/50"
      : "border-slate-700/80 bg-slate-900";
  const lineClassName =
    mode === "light"
      ? "bg-slate-300"
      : "bg-slate-500";

  return (
    <button
      className={cn(
        "group flex flex-col rounded-2xl border-2 p-2 text-left transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border/70 bg-card hover:border-primary/40",
      )}
      onClick={() => onClick(mode)}
      type="button"
    >
      <div
        className={cn(
          "rounded-xl border p-3 shadow-sm transition-colors",
          shellClassName,
          active && "shadow-primary/10",
        )}
      >
        <div className="space-y-3">
          <div className={cn("rounded-lg border p-3", panelClassName)}>
            <div className={cn("h-2 w-20 rounded-full", lineClassName)} />
            <div className={cn("mt-2 h-2 w-28 rounded-full", lineClassName)} />
          </div>
          <div className={cn("flex items-center gap-2 rounded-lg border p-3", panelClassName)}>
            <div className={cn("size-4 rounded-full", lineClassName)} />
            <div className={cn("h-2 w-24 rounded-full", lineClassName)} />
          </div>
          <div className={cn("flex items-center gap-2 rounded-lg border p-3", panelClassName)}>
            <div className={cn("size-4 rounded-full", lineClassName)} />
            <div className={cn("h-2 w-16 rounded-full", lineClassName)} />
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 px-2 pt-3 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Icon className="size-4" />
            {label}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        {active ? <Check className="mt-0.5 size-4 text-primary" /> : null}
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
  const [selectedTheme, setSelectedTheme] = useState<ThemeChoice>("light");
  const [selectedTimeFormat, setSelectedTimeFormat] =
    useState<TimeFormatPreference>(timeFormatPreference);
  const [status, setStatus] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    const currentTheme = theme === "light" || theme === "dark"
      ? theme
      : resolvedTheme === "dark"
        ? "dark"
        : "light";
    setSelectedTheme(currentTheme);
  }, [resolvedTheme, theme]);

  useEffect(() => {
    setSelectedTimeFormat(timeFormatPreference);
  }, [timeFormatPreference]);

  useEffect(() => {
    setStatus("idle");
  }, [selectedTheme, selectedTimeFormat]);

  const themeChoices = useMemo(
    () =>
      [
        {
          mode: "light" as const,
          label: t("appearance.theme.light"),
          description: t("appearance.theme.lightDescription"),
          icon: Sun,
        },
        {
          mode: "dark" as const,
          label: t("appearance.theme.dark"),
          description: t("appearance.theme.darkDescription"),
          icon: Moon,
        },
      ] satisfies Array<Omit<ThemeCardProps, "active" | "onClick">>,
    [t],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedTheme !== theme) {
      setTheme(selectedTheme);
    }
    if (selectedTimeFormat !== timeFormatPreference) {
      setTimeFormatPreference(selectedTimeFormat);
    }

    setStatus("saved");
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-none space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("appearance.title")}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("appearance.description")}
        </p>
      </div>
      <Separator className="my-6 flex-none" />
      <div className="w-full overflow-y-auto pb-12">
        <div className="max-w-3xl">
          <form className="space-y-8" onSubmit={handleSubmit}>
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
                <Select
                  onValueChange={(value) =>
                    setSelectedTimeFormat(value as TimeFormatPreference)
                  }
                  value={selectedTimeFormat}
                >
                  <SelectTrigger className="w-full font-normal">
                    <Clock3 className="size-4 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">
                      {t("appearance.timeFormat.twentyFourHour")}
                    </SelectItem>
                    <SelectItem value="ampm">
                      {t("appearance.timeFormat.ampm")}
                    </SelectItem>
                  </SelectContent>
                </Select>
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
              <div className="grid gap-4 md:grid-cols-2">
                {themeChoices.map((choice) => (
                  <ThemePreviewCard
                    active={selectedTheme === choice.mode}
                    description={choice.description}
                    icon={choice.icon}
                    key={choice.mode}
                    label={choice.label}
                    mode={choice.mode}
                    onClick={setSelectedTheme}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">{t("appearance.save")}</Button>
              {status === "saved" ? (
                <p className="text-sm text-muted-foreground">
                  {t("appearance.saved")}
                </p>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
