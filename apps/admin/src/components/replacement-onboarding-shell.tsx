"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { resolveLocale } from "@/lib/locale";
import { localizeMarketingHref } from "@/lib/marketing-site-url";
import { cn } from "@/lib/utils";

type OnboardingShellProps = {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  progress?: { current: number; navigableUntil?: number; total: number } | null;
  width?: "sm" | "md" | "lg" | "xl" | "wide";
  children: React.ReactNode;
  footer?: React.ReactNode;
  legalFooter?: React.ReactNode;
  onSignOut?: () => void;
};

const widths = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", wide: "max-w-7xl" } as const;

export function ReplacementOnboardingShell({ eyebrow, title, description, progress, width = "md", children, footer, legalFooter, onSignOut }: OnboardingShellProps) {
  const { t, i18n } = useTranslation("onboarding");
  const marketingLocale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const progressRoutes: Record<number, string> = {
    2: "/onboarding/business",
    3: "/onboarding/website",
    4: "/onboarding/knowledge",
    5: "/onboarding/greeting",
    6: "/onboarding/verify-phone",
    7: "/onboarding/verify-phone/code",
    8: "/onboarding/plan",
    9: "/onboarding/number",
    10: "/onboarding/attribution",
  };
  return (
    <div className="relative flex min-h-svh w-full flex-col bg-background text-foreground">
      {onSignOut ? (
        <button className="absolute right-6 top-6 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" onClick={onSignOut} type="button">
          {t("shell.signOut")}
        </button>
      ) : null}
      <main className="flex flex-1 flex-col items-center px-6 py-12">
        <div className={cn("my-auto flex w-full flex-col items-center", widths[width])}>
          <div aria-label="LobbyStack" className="flex w-full items-center justify-center gap-2.5">
            <img alt="" aria-hidden="true" className="size-6 select-none dark:invert" draggable={false} src="/brand/logo-icon.svg" />
            <span className="font-heading text-xl font-semibold leading-none text-foreground">LobbyStack</span>
          </div>
          <div className="mt-10 flex w-full flex-col items-center gap-4 text-center">
            {eyebrow ? <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{eyebrow}</span> : null}
            <h1 className="font-heading text-3xl leading-tight font-semibold tracking-tight text-foreground">{title}</h1>
            {description ? <p className="text-[15px] leading-7 text-muted-foreground">{description}</p> : null}
          </div>
          <div className="mt-10 w-full">{children}</div>
          {footer ? <div className="mt-6 w-full">{footer}</div> : null}
        </div>
      </main>
      <footer className="flex flex-col items-center gap-4 px-6 pb-12 pt-16">
        {progress ? (
          <nav aria-label={`Onboarding progress: step ${progress.current} of ${progress.total}`}>
            <ol className="flex items-center justify-center gap-1.5">
              {Array.from({ length: progress.total }, (_, index) => index + 1)
                .filter((step) => !((progress.navigableUntil ?? progress.current) > 7 && (step === 6 || step === 7)))
                .map((step) => {
                  const active = step === progress.current;
                  const completed = step < progress.current;
                  const canNavigate = step <= (progress.navigableUntil ?? progress.current);
                  const href = !active && canNavigate ? progressRoutes[step] : undefined;
                  const className = cn(
                    "h-1.5 rounded-full transition-all",
                    active ? "w-6 bg-foreground" : "w-1.5",
                    completed ? "bg-foreground/40" : active ? "bg-foreground" : "bg-border",
                  );
                  return <li className="flex" key={step}>{href ? <Link aria-label={`Go to onboarding step ${step}`} className={className} href={href} /> : <span role="img" aria-label={`Onboarding step ${step}${active ? ", current step" : ""}`} aria-current={active ? "step" : undefined} className={className} />}</li>;
                })}
            </ol>
          </nav>
        ) : null}
        {legalFooter ?? <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <a className="hover:text-foreground" href={localizeMarketingHref(marketingLocale, "/terms")} rel="noreferrer" target="_blank">{t("shell.terms")}</a>
          <span aria-hidden="true">·</span>
          <a className="hover:text-foreground" href={localizeMarketingHref(marketingLocale, "/privacy")} rel="noreferrer" target="_blank">{t("shell.privacy")}</a>
        </div>}
      </footer>
    </div>
  );
}
