import { useState } from "react";

import { useTranslation } from "react-i18next";
import { LoaderCircle } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { PhoneInput } from "@/components/ui/phone-input";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { useObservedAction } from "@/lib/observed-convex";

type OnboardingVerifyPhonePageProps = {
  businessId: Id<"businesses">;
  currentUserPhone?: string;
  onSignOut: () => void;
};

export function OnboardingVerifyPhonePage({
  businessId,
  currentUserPhone,
  onSignOut,
}: OnboardingVerifyPhonePageProps) {
  const { t } = useTranslation("onboarding");
  const startPhoneVerification = useObservedAction(
    api.onboarding.phoneVerification.startPhoneVerification,
  );
  const [phone, setPhone] = useState<string>(currentUserPhone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(): Promise<void> {
    const trimmed = phone.trim();
    if (trimmed.length === 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await startPhoneVerification({ businessId, phoneE164: trimmed });
      captureAnalyticsEvent("web.onboarding.verify_phone_started", {
        businessId: String(businessId),
        countryCode: result.countryCode,
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : t("verifyPhone.sendFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      description={t("verifyPhone.description")}
      onSignOut={onSignOut}
      progress={{ current: 6, total: 10 }}
      title={t("verifyPhone.title")}
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
            <FieldLabel htmlFor="onboarding-phone">
              {t("verifyPhone.fields.mobileNumber")}
            </FieldLabel>
            <PhoneInput
              autoFocus
              className="h-11"
              id="onboarding-phone"
              onChange={(value) => setPhone(value ?? "")}
              placeholder={t("verifyPhone.placeholders.mobileNumber")}
              value={phone}
            />
            <FieldDescription>{t("verifyPhone.hint")}</FieldDescription>
          </Field>

          {error ? <FieldError>{error}</FieldError> : null}

          <Button
            className="mt-2 h-11 w-full"
            disabled={phone.trim().length === 0 || isSubmitting}
            type="submit"
          >
            {isSubmitting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                {t("verifyPhone.sending")}
              </>
            ) : (
              t("verifyPhone.sendCode")
            )}
          </Button>
        </FieldGroup>
      </form>
    </OnboardingShell>
  );
}
