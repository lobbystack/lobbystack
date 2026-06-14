import { useMemo, useState } from "react";

import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import type { Country } from "react-phone-number-input/input";

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { getSafeOnboardingErrorMessage } from "@/features/onboarding/onboardingErrors";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { useObservedAction } from "@/lib/observed-convex";
import {
  getDefaultPhoneCountry,
  getSupportedOnboardingPhoneCountryOptions,
  inferPhoneCountry,
  isSupportedOnboardingPhoneCountry,
  normalizeOnboardingPhoneCountry,
} from "@/lib/phone";

type OnboardingVerifyPhonePageProps = {
  businessId: Id<"businesses">;
  currentUserPhone?: string;
  onSignOut: () => void;
  progressNavigableUntil?: number;
};

export function OnboardingVerifyPhonePage({
  businessId,
  currentUserPhone,
  onSignOut,
  progressNavigableUntil,
}: OnboardingVerifyPhonePageProps) {
  const { t, i18n } = useTranslation("onboarding");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const defaultCountry = normalizeOnboardingPhoneCountry(getDefaultPhoneCountry(locale));
  const navigate = useNavigate();
  const startPhoneVerification = useObservedAction(
    api.onboarding.phoneVerification.startPhoneVerification,
  );
  const countryOptions = useMemo(
    () => getSupportedOnboardingPhoneCountryOptions(locale),
    [locale],
  );
  const initialVerifyPhone = (() => {
    const inferredCountry = inferPhoneCountry(currentUserPhone, defaultCountry);
    return {
      country: normalizeOnboardingPhoneCountry(inferredCountry, defaultCountry) as Country,
      phone:
        currentUserPhone && isSupportedOnboardingPhoneCountry(inferredCountry)
          ? currentUserPhone
          : "",
    };
  })();
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    initialVerifyPhone.country,
  );
  const [phone, setPhone] = useState<string>(initialVerifyPhone.phone);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedCountryOption =
    countryOptions.find((option) => option.code === selectedCountry) ??
    countryOptions.find((option) => option.code === defaultCountry) ??
    countryOptions[0];

  function handleCountryChange(value: string | null): void {
    if (!value) {
      return;
    }
    const nextCountry = normalizeOnboardingPhoneCountry(value, defaultCountry);
    if (nextCountry === selectedCountry) {
      return;
    }

    setSelectedCountry(nextCountry as Country);
    setPhone("");
  }

  function handlePhoneChange(value?: string): void {
    setPhone(value ?? "");
  }

  function handleRawPhoneChange(rawValue: string): void {
    if (!rawValue.trim().startsWith("+")) {
      return;
    }

    const inferredCountry = inferPhoneCountry(rawValue, selectedCountry);
    if (
      isSupportedOnboardingPhoneCountry(inferredCountry) &&
      inferredCountry !== selectedCountry
    ) {
      setSelectedCountry(inferredCountry as Country);
    }
  }

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
      navigate("/onboarding/verify-phone/code");
    } catch (submissionError) {
      setError(
        getSafeOnboardingErrorMessage(submissionError, t, "verifyPhone.sendFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      description={t("verifyPhone.description")}
      onSignOut={onSignOut}
      progress={{ current: 6, navigableUntil: progressNavigableUntil, total: 10 }}
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
            <div className="flex min-w-0">
              <Select onValueChange={handleCountryChange} value={selectedCountry}>
                <SelectTrigger
                  aria-label={t("verifyPhone.fields.region")}
                  className="h-11 w-20 shrink-0 rounded-l-4xl rounded-r-none px-4 font-medium text-muted-foreground data-[size=default]:h-11"
                  data-phone-country-prefix
                >
                  <span data-phone-country-calling-code>
                    {selectedCountryOption?.callingCode ?? ""}
                  </span>
                </SelectTrigger>
                <SelectContent className="min-w-72">
                  <SelectGroup>
                    {countryOptions.map((option) => (
                      <SelectItem key={option.code} value={option.code}>
                        <span>{option.label}</span>
                        <span className="text-muted-foreground">{option.callingCode}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <PhoneInput
                autoFocus
                className="h-11 rounded-l-none border-l-0"
                containerClassName="min-w-0 flex-1"
                country={selectedCountry}
                id="onboarding-phone"
                limitNationalDigits
                onChange={handlePhoneChange}
                onRawValueChange={handleRawPhoneChange}
                value={phone}
              />
            </div>
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
