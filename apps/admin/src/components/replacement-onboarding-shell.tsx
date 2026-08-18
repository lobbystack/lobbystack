"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

type OnboardingShellProps = {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  progress?: { current: number; total: number } | null;
  width?: "sm" | "md" | "lg" | "xl" | "wide";
  children: React.ReactNode;
  footer?: React.ReactNode;
};

const widths = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", wide: "max-w-7xl" } as const;

export function ReplacementOnboardingShell({ eyebrow, title, description, progress, width = "md", children, footer }: OnboardingShellProps) {
  const { t } = useTranslation("onboarding");
  const pathname = usePathname();
  const progressRoutes = ["/onboarding/business", "/onboarding/website", "/onboarding/knowledge", "/onboarding/greeting", "/onboarding/verify-phone", "/onboarding/verify-phone/code", "/onboarding/plan", "/onboarding/number", "/onboarding/attribution"];
  return (
    <div className="relative flex min-h-svh w-full flex-col bg-background text-foreground">
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
        {progress ? <nav aria-label={`${progress.current} of ${progress.total}`} className="flex items-center gap-1.5">{Array.from({ length: progress.total }, (_, index) => { const step = index + 1; const href = progressRoutes[Math.min(index, progressRoutes.length - 1)]; const completed = step < progress.current; const active = step === progress.current; return <Link aria-current={active ? "step" : undefined} className={cn("block rounded-full transition-all", active ? "h-1.5 w-6 bg-foreground" : completed ? "size-1.5 bg-foreground/50 hover:bg-foreground" : "size-1.5 bg-muted hover:bg-muted-foreground")} href={href ?? pathname} key={step} />; })}</nav> : null}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <Link className="hover:text-foreground" href="/terms" target="_blank">{t("shell.terms")}</Link>
          <span aria-hidden="true">·</span>
          <Link className="hover:text-foreground" href="/privacy" target="_blank">{t("shell.privacy")}</Link>
        </div>
      </footer>
    </div>
  );
}
