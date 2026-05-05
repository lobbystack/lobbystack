import { useState } from "react";

import { useTranslation } from "react-i18next";
import {
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
  Search,
  Sparkles,
  Twitter,
  Youtube,
} from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useObservedMutation } from "@/lib/observed-convex";

type OnboardingAttributionPageProps = {
  businessId: Id<"businesses">;
  onSignOut: () => void;
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
  Icon: typeof Sparkles;
};

const OPTIONS: Array<AttributionOption> = [
  { key: "ai_assistant", Icon: Sparkles },
  { key: "newsletter", Icon: Newspaper },
  { key: "podcast", Icon: Mic },
  { key: "news", Icon: Newspaper },
  { key: "work", Icon: Briefcase },
  { key: "school", Icon: GraduationCap },
  { key: "x", Icon: Twitter },
  { key: "facebook", Icon: Facebook },
  { key: "youtube", Icon: Youtube },
  { key: "instagram", Icon: Instagram },
  { key: "linkedin", Icon: Linkedin },
  { key: "google", Icon: Search },
  { key: "tiktok", Icon: Music2 },
  { key: "other", Icon: MessageCircleQuestion },
];

export function OnboardingAttributionPage({
  businessId,
  onSignOut,
}: OnboardingAttributionPageProps) {
  const { t } = useTranslation("onboarding");
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
    try {
      await submitOnboardingAttribution({
        businessId,
        ...(source ? { source } : { source: null }),
      });
      captureAnalyticsEvent("web.onboarding.attribution_submitted", {
        businessId: String(businessId),
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : t("attribution.submitFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      description={t("attribution.description")}
      onSignOut={onSignOut}
      progress={{ current: 10, total: 10 }}
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {OPTIONS.map(({ key, Icon }) => {
            const isSelected = selected === key;
            return (
              <button
                aria-pressed={isSelected}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-4 text-left text-sm font-medium transition-colors",
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
                <span>{t(`attribution.options.${key}`)}</span>
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
