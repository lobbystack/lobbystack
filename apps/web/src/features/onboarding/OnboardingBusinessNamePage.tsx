import { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Building2, LoaderCircle } from "lucide-react";

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
import { useObservedMutation } from "@/lib/observed-convex";

type OnboardingBusinessNamePageProps = {
  businessId?: Id<"businesses">;
  businessName?: string;
  onSignOut: () => void;
  progressNavigableUntil?: number;
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function OnboardingBusinessNamePage({
  businessId,
  businessName,
  onSignOut,
  progressNavigableUntil,
}: OnboardingBusinessNamePageProps) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const bootstrapBusiness = useObservedMutation(api.businesses.admin.bootstrapBusiness);
  const updateBusinessName = useObservedMutation(api.businesses.catalog.updateBusinessName);
  const [name, setName] = useState(businessName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bootstrappedBusinessId, setBootstrappedBusinessId] =
    useState<Id<"businesses"> | null>(null);

  const trimmedName = name.trim();
  const isDisabled = trimmedName.length === 0 || isSubmitting;

  useEffect(() => {
    if (!bootstrappedBusinessId || businessId !== bootstrappedBusinessId) {
      return;
    }

    navigate("/onboarding/website");
  }, [bootstrappedBusinessId, businessId, navigate]);

  async function handleSubmit(): Promise<void> {
    if (isDisabled) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (businessId) {
        await updateBusinessName({ businessId, name: trimmedName });
        navigate("/onboarding/website");
      } else {
        const slugBase = slugify(trimmedName);
        const slug = slugBase.length > 0 ? `${slugBase}-${Date.now().toString(36)}` : `business-${Date.now().toString(36)}`;
        const result = await bootstrapBusiness({
          name: trimmedName,
          slug,
          timezone: resolveTimezone(),
          businessType: "general",
        });
        setBootstrappedBusinessId(result.businessId);
      }
      captureAnalyticsEvent("web.onboarding.business_name_submitted");
    } catch (submissionError) {
      setError(
        getSafeOnboardingErrorMessage(
          submissionError,
          t,
          "businessName.submitFailed",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      description={t("businessName.description")}
      onSignOut={onSignOut}
      progress={{ current: 2, navigableUntil: progressNavigableUntil, total: 10 }}
      title={t("businessName.title")}
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
            <FieldLabel htmlFor="onboarding-business-name">
              {t("businessName.label")}
            </FieldLabel>
            <div className="relative">
              <Building2
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                autoComplete="organization"
                autoFocus
                className="h-11 pl-9"
                id="onboarding-business-name"
                onChange={(event) => setName(event.target.value)}
                placeholder={t("businessName.placeholder")}
                required
                type="text"
                value={name}
              />
            </div>
          </Field>

          {error ? <FieldError>{error}</FieldError> : null}

          <Button className="mt-2 h-11 w-full" disabled={isDisabled} type="submit">
            {isSubmitting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                {t("businessName.submitting")}
              </>
            ) : (
              t("businessName.continue")
            )}
          </Button>
        </FieldGroup>
      </form>
    </OnboardingShell>
  );
}
