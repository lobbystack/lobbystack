import { cn } from "@/lib/utils";

type OnboardingProgressProps = {
  current: number;
  total: number;
  className?: string;
};

/**
 * Page-dot progress indicator used at the bottom of every onboarding step.
 *
 * The active dot is rendered as a wider pill (`w-6`) so the user always knows
 * which step they're on, while inactive dots are rendered as small circles.
 */
export function OnboardingProgress({ current, total, className }: OnboardingProgressProps) {
  const dots = Array.from({ length: total }, (_, index) => index + 1);

  return (
    <div
      aria-label={`Step ${current} of ${total}`}
      className={cn("flex items-center justify-center gap-1.5", className)}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
    >
      {dots.map((step) => {
        const isActive = step === current;
        const isComplete = step < current;
        return (
          <span
            key={step}
            aria-hidden="true"
            className={cn(
              "h-1.5 rounded-full transition-all",
              isActive ? "w-6 bg-foreground" : "w-1.5",
              isComplete ? "bg-foreground/40" : isActive ? "bg-foreground" : "bg-border",
            )}
          />
        );
      })}
    </div>
  );
}
