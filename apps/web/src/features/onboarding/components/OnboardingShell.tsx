import type { ReactNode } from "react";

import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { OnboardingHeader } from "./OnboardingHeader";
import { OnboardingProgress } from "./OnboardingProgress";

type OnboardingShellProps = {
  /** Optional small chip rendered above the title (Visitors-style eyebrow). */
  eyebrow?: string;
  /** Page heading (rendered as an H1). */
  title: string;
  /** Optional muted sub-headline rendered immediately under the title. */
  description?: ReactNode;
  /** Page-dot progress (current/total). Pass `null` to hide the indicator. */
  progress?: { current: number; navigableUntil?: number | undefined; total: number } | null;
  /** Optional sign-out handler rendered as a top-right logout link. */
  onSignOut?: () => void;
  /** Width of the central content column (defaults to `max-w-md`). */
  width?: "sm" | "md" | "lg" | "xl" | "wide";
  /** Form/content rendered inside the shell. */
  children: ReactNode;
  /** Optional links/CTAs rendered below the progress indicator. */
  footer?: ReactNode;
  /** Optional legal footer override. Defaults to Terms / Privacy links. */
  legalFooter?: ReactNode;
};

const widthMap: Record<NonNullable<OnboardingShellProps["width"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  wide: "max-w-5xl",
};

const onboardingStepRoutes: Record<number, string> = {
  2: "/onboarding/business",
  3: "/onboarding/website",
  4: "/onboarding/knowledge",
  5: "/onboarding/greeting",
  6: "/onboarding/verify-phone",
  7: "/onboarding/verify-phone/code",
  8: "/onboarding/number",
  9: "/onboarding/plan",
  10: "/onboarding/attribution",
};

function getOnboardingStepRoutes({
  current,
  navigableUntil,
}: {
  current: number;
  navigableUntil?: number | undefined;
}): Record<number, string> {
  const maxNavigableStep = navigableUntil ?? current;

  return Object.fromEntries(
    Object.entries(onboardingStepRoutes).filter(([step]) => {
      const stepNumber = Number(step);
      return stepNumber <= maxNavigableStep;
    }),
  );
}

function getHiddenOnboardingSteps({
  current,
  navigableUntil,
}: {
  current: number;
  navigableUntil?: number | undefined;
}): number[] {
  const maxNavigableStep = navigableUntil ?? current;
  return maxNavigableStep > 7 ? [6, 7] : [];
}

/**
 * Shared layout for every redesigned auth + onboarding screen.
 *
 * Renders a centred LobbyStack wordmark, an optional eyebrow chip, a page
 * title with a muted description, the step's content column, an optional
 * footer, page-dot progress, and a small Terms/Privacy footer. The visual
 * direction is intentionally minimal — plain white background, monochrome
 * tokens, generous negative space — to match the operator-dashboard
 * aesthetic and contrast with the previous onboarding's heavy violet card.
 */
export function OnboardingShell({
  eyebrow,
  title,
  description,
  progress,
  width = "md",
  children,
  footer,
  legalFooter,
  onSignOut,
}: OnboardingShellProps) {
  const { t } = useTranslation("onboarding");

  return (
    <div className="relative flex min-h-svh w-full flex-col bg-background text-foreground">
      {onSignOut ? (
        <button
          className="absolute right-6 top-6 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={onSignOut}
          type="button"
        >
          {t("shell.signOut")}
        </button>
      ) : null}

      <main className="flex flex-1 flex-col items-center px-6 py-12">
        <div className={cn("my-auto flex w-full flex-col items-center", widthMap[width])}>
          <OnboardingHeader />

          <div className="mt-10 flex w-full flex-col items-center gap-4 text-center">
            {eyebrow ? (
              <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                {eyebrow}
              </span>
            ) : null}
            <h1 className="font-heading text-3xl leading-tight font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {description ? (
              <p className="text-[15px] leading-7 text-muted-foreground">{description}</p>
            ) : null}
          </div>

          <div className="mt-10 w-full">{children}</div>

          {footer ? <div className="mt-6 w-full">{footer}</div> : null}
        </div>
      </main>

      <footer className="flex flex-col items-center gap-4 px-6 pb-12 pt-16">
        {progress ? (
          <OnboardingProgress
            current={progress.current}
            hiddenSteps={getHiddenOnboardingSteps(progress)}
            routes={getOnboardingStepRoutes(progress)}
            total={progress.total}
          />
        ) : null}
        {legalFooter ?? (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a className="hover:text-foreground" href="/terms" rel="noreferrer" target="_blank">
              {t("shell.terms")}
            </a>
            <span aria-hidden="true">·</span>
            <a className="hover:text-foreground" href="/privacy" rel="noreferrer" target="_blank">
              {t("shell.privacy")}
            </a>
          </div>
        )}
      </footer>
    </div>
  );
}
