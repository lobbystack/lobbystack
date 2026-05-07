import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

type OnboardingProgressProps = {
  current: number;
  total: number;
  className?: string;
  routes?: Record<number, string>;
};

/**
 * Page-dot progress indicator used at the bottom of every onboarding step.
 *
 * The active dot is rendered as a wider pill (`w-6`) so the user always knows
 * which step they're on, while inactive dots are rendered as small circles.
 */
export function OnboardingProgress({
  current,
  total,
  className,
  routes = {},
}: OnboardingProgressProps) {
  const dots = Array.from({ length: total }, (_, index) => index + 1);

  return (
    <nav aria-label={`Onboarding progress: step ${current} of ${total}`} className={className}>
      <ol className="flex items-center justify-center gap-1.5">
        {dots.map((step) => {
          const isActive = step === current;
          const isComplete = step < current;
          const route = !isActive ? routes[step] : undefined;
          const dotClassName = cn(
            "h-1.5 rounded-full transition-all",
            isActive ? "w-6 bg-foreground" : "w-1.5",
            isComplete ? "bg-foreground/40" : isActive ? "bg-foreground" : "bg-border",
            route ? "inline-block focus-visible:outline-none" : null,
          );

          return (
            <li key={step} className="flex">
              {route ? (
                <Link
                  aria-label={`Go to onboarding step ${step}`}
                  className={dotClassName}
                  to={route}
                />
              ) : (
                <span
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Onboarding step ${step}${isActive ? ", current step" : ""}`}
                  className={dotClassName}
                  role="img"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
