import { useState } from "react";

import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Globe, LoaderCircle } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { getSafeOnboardingErrorMessage } from "@/features/onboarding/onboardingErrors";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";

type OnboardingWebsitePageProps = {
  businessId: Id<"businesses">;
  onSignOut: () => void;
  progressNavigableUntil?: number;
  websiteUrl?: string;
};

export function OnboardingWebsitePage({
  businessId,
  onSignOut,
  progressNavigableUntil,
  websiteUrl: initialWebsiteUrl,
}: OnboardingWebsitePageProps) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const submitOnboardingWebsite = useObservedAction(
    api.onboarding.websites.submitOnboardingWebsite,
  );
  const skipOnboardingWebsite = useObservedMutation(
    api.onboarding.websites.skipOnboardingWebsite,
  );
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  const isWorking = isSubmitting || isSkipping;
  const trimmed = websiteUrl.trim();

  async function handleSubmit(): Promise<void> {
    if (!trimmed || isWorking) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await submitOnboardingWebsite({ businessId, websiteUrl: trimmed });
      captureAnalyticsEvent("web.onboarding.website_submitted", {
        businessId: String(businessId),
      });
      navigate("/onboarding/knowledge");
    } catch (submissionError) {
      setError(
        getSafeOnboardingErrorMessage(submissionError, t, "website.submitFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSkip(): Promise<void> {
    if (isWorking) {
      return;
    }

    setIsSkipping(true);
    setError(null);
    try {
      await skipOnboardingWebsite({ businessId });
      captureAnalyticsEvent("web.onboarding.website_skipped", {
        businessId: String(businessId),
      });
      navigate("/onboarding/knowledge");
    } catch (skipError) {
      setError(getSafeOnboardingErrorMessage(skipError, t, "website.skipFailed"));
    } finally {
      setIsSkipping(false);
    }
  }

  return (
    <OnboardingShell
      description={t("website.description")}
      onSignOut={onSignOut}
      progress={{ current: 3, navigableUntil: progressNavigableUntil, total: 10 }}
      title={t("website.title")}
      footer={
        <div className="flex flex-col items-center gap-3">
          <button
            className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
            disabled={isWorking}
            onClick={() => void handleSkip()}
            type="button"
          >
            {isSkipping ? t("website.skipping") : t("website.skip")}
          </button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="onboarding-website-url">
              {t("website.label")}
            </FieldLabel>
            <div className="relative">
              <Globe
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                autoComplete="url"
                autoFocus
                className="h-11 pl-9"
                id="onboarding-website-url"
                onChange={(event) => setWebsiteUrl(event.target.value)}
                placeholder={t("website.placeholder")}
                type="text"
                value={websiteUrl}
              />
            </div>
          </Field>

          {error ? <FieldError>{error}</FieldError> : null}

          <Button
            className="mt-2 h-11 w-full"
            disabled={trimmed.length === 0 || isWorking}
            type="submit"
          >
            {isSubmitting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                {t("website.submitting")}
              </>
            ) : (
              t("website.continue")
            )}
          </Button>
        </FieldGroup>
      </form>
    </OnboardingShell>
  );
}
