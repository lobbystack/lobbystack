"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { CountryCombobox } from "@/components/country-combobox";
import { useTelemetry } from "@/components/product-analytics";
import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { getPhoneCountryOptions, type PhoneCountryOption } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";

/**
 * The number step's way on in a country where LobbyStack sells no numbers.
 * The list holds only such countries. Once the owner picks theirs, which the
 * server trusts and logs, they can ask to hear when numbers arrive there and
 * continue without a number.
 */
export function OnboardingNumberCountryFallback({ businessId, initialCountry, numberCountries, onBack, onSkipped }: {
  businessId: string;
  /** The country the owner already picked, when we sell no numbers there. */
  initialCountry: string | null;
  /** Where LobbyStack sells numbers, which the list leaves out. */
  numberCountries: readonly string[];
  /** Back to the picker, or null when no country has numbers. */
  onBack: (() => void) | null;
  onSkipped: () => void;
}) {
  const { i18n, t } = useTranslation("onboarding");
  const telemetry = useTelemetry();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const options = useMemo(() => getPhoneCountryOptions(locale).filter((option) => !numberCountries.includes(option.code)), [locale, numberCountries]);
  const [country, setCountry] = useState<PhoneCountryOption["code"] | null>(options.find((option) => option.code === initialCountry)?.code ?? null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countryName = options.find((option) => option.code === country)?.label ?? country ?? "";
  const waitlist = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/numbers?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ countryCode: country }) }),
    onSuccess: () => { setJoined(true); telemetry.track("web.onboarding.number_waitlist_joined", { businessId, countryCode: country ?? "" }); },
    onError: (cause) => setError(getSafeOnboardingErrorMessage(cause, t, "number.country.failed")),
    meta: { inlineError: true },
  });
  const skip = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/phone-numbers/skip?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ countryCode: country }) }),
    onSuccess: () => { telemetry.track("web.onboarding.number_skipped", { businessId, countryCode: country ?? "" }); onSkipped(); },
    onError: (cause) => setError(getSafeOnboardingErrorMessage(cause, t, "number.country.failed")),
    meta: { inlineError: true },
  });
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="number-fallback-country">{t("number.country.label")}</FieldLabel>
        <CountryCombobox countries={options} id="number-fallback-country" onChange={(next) => { setCountry(next); setJoined(false); setError(null); }} placeholder={t("number.country.placeholder")} value={country} />
      </Field>
      {country ? <>
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4 text-left">
          <p className="type-title text-foreground">{t("number.country.title", { country: countryName })}</p>
          <p className="type-body-muted">{t("number.country.body", { country: countryName })}</p>
          {joined ? <p className="type-body text-foreground">{t("number.country.joined")}</p> : <Button disabled={skip.isPending} loading={waitlist.isPending} loadingLabel={t("common:pending.sending")} onClick={() => waitlist.mutate()} type="button" variant="outline">{t("number.country.notify")}</Button>}
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button className="w-full" disabled={waitlist.isPending} loading={skip.isPending} loadingLabel={t("common:pending.continuing")} onClick={() => { setError(null); skip.mutate(); }} type="button">{t("number.country.continue")}</Button>
      </> : null}
      {onBack ? <button className="mx-auto type-title text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={onBack} type="button">{t("number.country.back")}</button> : null}
    </div>
  );
}
