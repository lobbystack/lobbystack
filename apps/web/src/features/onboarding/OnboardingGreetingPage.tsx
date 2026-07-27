import { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LoaderCircle } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { getSafeOnboardingErrorMessage } from "@/features/onboarding/onboardingErrors";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { useObservedMutation } from "@/lib/observed-convex";

type OnboardingGreetingPageProps = {
  businessId: Id<"businesses">;
  businessName?: string;
  initialGreeting?: string;
  onSignOut: () => void;
  progressNavigableUntil?: number;
};

function buildDefaultGreeting(name: string | undefined): string {
  const safeName = name?.trim();
  if (!safeName) {
    return "Thanks for calling. How can I help?";
  }
  return `Thanks for calling ${safeName}. How can I help?`;
}

export function OnboardingGreetingPage({
  businessId,
  businessName,
  initialGreeting,
  onSignOut,
  progressNavigableUntil,
}: OnboardingGreetingPageProps) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const submitOnboardingGreeting = useObservedMutation(
    api.onboarding.greeting.submitOnboardingGreeting,
  );
  const [greeting, setGreeting] = useState(
    () => initialGreeting?.trim() || buildDefaultGreeting(businessName),
  );
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prefer a persisted greeting (e.g. from a claimed prospect demo) when it
  // resolves after mount, then fall back to the default built from the
  // business name — unless the user already started typing.
  useEffect(() => {
    if (hasUserEdited) {
      return;
    }
    if (initialGreeting && initialGreeting.trim()) {
      setGreeting(initialGreeting.trim());
      return;
    }
    if (businessName) {
      setGreeting(buildDefaultGreeting(businessName));
    }
  }, [businessName, hasUserEdited, initialGreeting]);

  const trimmed = greeting.trim();

  async function handleSubmit(): Promise<void> {
    if (trimmed.length === 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await submitOnboardingGreeting({ businessId, greeting: trimmed });
      captureAnalyticsEvent("web.onboarding.greeting_submitted", {
        businessId: String(businessId),
      });
      navigate("/onboarding/verify-phone");
    } catch (submissionError) {
      setError(
        getSafeOnboardingErrorMessage(submissionError, t, "greeting.submitFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      description={t("greeting.description")}
      onSignOut={onSignOut}
      progress={{ current: 5, navigableUntil: progressNavigableUntil, total: 10 }}
      title={t("greeting.title")}
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
            <FieldLabel htmlFor="onboarding-greeting">{t("greeting.label")}</FieldLabel>
            <Textarea
              autoFocus
              className="min-h-32 rounded-xl"
              id="onboarding-greeting"
              onChange={(event) => {
                setHasUserEdited(true);
                setGreeting(event.target.value);
              }}
              placeholder={t("greeting.placeholder")}
              value={greeting}
            />
          </Field>

          {error ? <FieldError>{error}</FieldError> : null}

          <Button className="mt-2 h-11 w-full" disabled={trimmed.length === 0 || isSubmitting} type="submit">
            {isSubmitting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                {t("greeting.submitting")}
              </>
            ) : (
              t("greeting.continue")
            )}
          </Button>
        </FieldGroup>
      </form>
    </OnboardingShell>
  );
}
