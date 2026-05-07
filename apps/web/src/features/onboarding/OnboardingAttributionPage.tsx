import type { ComponentType, SVGProps } from "react";
import { useState } from "react";

import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  Briefcase,
  Facebook,
  GraduationCap,
  Instagram,
  LoaderCircle,
  Linkedin,
  MessageCircleQuestion,
  Mic,
  Music2,
  Newspaper,
  Rss,
  Search,
  Youtube,
} from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { getSafeOnboardingErrorMessage } from "@/features/onboarding/onboardingErrors";
import { captureAnalyticsEvent, setAnalyticsPersonProperties } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useObservedMutation } from "@/lib/observed-convex";

type OnboardingAttributionPageProps = {
  businessId: Id<"businesses">;
  onSignOut: () => void;
  progressNavigableUntil?: number;
};

type AttributionSource =
  | "ai_assistant"
  | "newsletter"
  | "podcast"
  | "news"
  | "work"
  | "school"
  | "x"
  | "facebook"
  | "youtube"
  | "instagram"
  | "linkedin"
  | "google"
  | "tiktok"
  | "other";

type AttributionOption = {
  key: AttributionSource;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

function XLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M13.9 10.47 21.35 2h-1.76l-6.47 7.35L7.96 2H2l7.81 11.12L2 22h1.76l6.83-7.76L16.04 22H22l-8.1-11.53Zm-2.42 2.75-.79-1.11L4.4 3.3h2.72l5.08 7.12.79 1.11 6.6 9.25h-2.72l-5.39-7.56Z" />
    </svg>
  );
}

const OPTIONS: Array<AttributionOption> = [
  { key: "google", Icon: Search },
  { key: "ai_assistant", Icon: Bot },
  { key: "youtube", Icon: Youtube },
  { key: "newsletter", Icon: Rss },
  { key: "work", Icon: Briefcase },
  { key: "podcast", Icon: Mic },
  { key: "instagram", Icon: Instagram },
  { key: "news", Icon: Newspaper },
  { key: "linkedin", Icon: Linkedin },
  { key: "x", Icon: XLogo },
  { key: "facebook", Icon: Facebook },
  { key: "school", Icon: GraduationCap },
  { key: "tiktok", Icon: Music2 },
  { key: "other", Icon: MessageCircleQuestion },
];

export function OnboardingAttributionPage({
  businessId,
  onSignOut,
  progressNavigableUntil,
}: OnboardingAttributionPageProps) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const submitOnboardingAttribution = useObservedMutation(
    api.onboarding.attribution.submitOnboardingAttribution,
  );
  const [selected, setSelected] = useState<AttributionSource | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(source: string | null): Promise<void> {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    const attributionSource = source ?? "skipped";
    try {
      await submitOnboardingAttribution({
        businessId,
        ...(source ? { source } : { source: null }),
      });
      try {
        setAnalyticsPersonProperties({
          signupAttribution: attributionSource,
        });
        captureAnalyticsEvent("web.onboarding.attribution_submitted", {
          businessId: String(businessId),
          source: attributionSource,
        });
      } catch {
        // Analytics should never block the user from entering the app.
      }
      navigate("/", { replace: true });
    } catch (submissionError) {
      setError(
        getSafeOnboardingErrorMessage(
          submissionError,
          t,
          "attribution.submitFailed",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      onSignOut={onSignOut}
      progress={{ current: 10, navigableUntil: progressNavigableUntil, total: 10 }}
      title={t("attribution.title")}
      width="xl"
      footer={
        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <button
            className="hover:text-foreground disabled:opacity-50"
            disabled={isSubmitting}
            onClick={() => void handleSubmit(null)}
            type="button"
          >
            {t("attribution.skip")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:[grid-template-columns:repeat(4,minmax(200px,1fr))]">
          {OPTIONS.map(({ key, Icon }) => {
            const isSelected = selected === key;
            return (
              <button
                aria-pressed={isSelected}
                className={cn(
                  "flex h-24 items-center gap-3 rounded-xl border px-4 text-left text-sm font-medium transition-colors",
                  isSelected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:border-foreground/30",
                )}
                key={key}
                onClick={() => setSelected(key)}
                type="button"
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0",
                    isSelected ? "text-background" : "text-muted-foreground",
                  )}
                />
                <span className="min-w-0 whitespace-normal break-words leading-snug">
                  {t(`attribution.options.${key}`)}
                </span>
              </button>
            );
          })}
        </div>

        {error ? <FieldError>{error}</FieldError> : null}

        <Button
          className="h-11 w-full"
          disabled={selected === null || isSubmitting}
          onClick={() => void handleSubmit(selected)}
          type="button"
        >
          {isSubmitting ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              {t("attribution.finishing")}
            </>
          ) : (
            t("attribution.finish")
          )}
        </Button>
      </div>
    </OnboardingShell>
  );
}
