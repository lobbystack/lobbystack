"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, LoaderCircle } from "lucide-react";
import type { Country } from "react-phone-number-input/input";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select";
import { formatPhoneNumberDisplay, getPhoneCountryOptions } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";

type NumberCountries = { trialCountries: string[]; suggestedCountry: string | null };
type CheckResult = { approved: boolean; status: string; remainingAttempts?: number };

const startErrorKeys: Record<string, string> = {
  phone_voip_refused: "voip",
  phone_not_mobile: "notMobile",
  phone_country_mismatch: "countryMismatch",
  phone_number_invalid: "invalidNumber",
  verification_rate_limited: "rateLimited",
  verification_cooldown: "rateLimited",
};

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
}

/**
 * Verifies the signed-in person's mobile before they pick a partner's trial
 * number, whose calls transfer only to the mobile of whoever claims it. It
 * runs the onboarding phone step's checks, from a trial country, without
 * moving the owner's onboarding. A partner member who opened the business
 * verifies here, and so does an owner who has no verified mobile in it yet.
 */
export function TrialPhoneVerification({ businessId, onVerified }: { businessId: string; onVerified: () => Promise<unknown> }) {
  const { i18n, t } = useTranslation("settings");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const query = `businessId=${encodeURIComponent(businessId)}`;
  const numbers = useQuery({ queryKey: ["onboarding-number-countries", businessId], queryFn: () => requestJson<NumberCountries>(`/api/onboarding/numbers?${query}`) });
  const trialCountries = numbers.data?.trialCountries;
  const options = useMemo(() => getPhoneCountryOptions(locale).filter((option) => trialCountries?.includes(option.code)), [locale, trialCountries]);
  const [country, setCountry] = useState<Country | null>(null);
  const [phone, setPhone] = useState("");
  const [attempt, setAttempt] = useState<{ id: string; phoneE164: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submittedCode = useRef("");
  // Start on the country the business's time zone points to, when it has trial numbers.
  useEffect(() => {
    if (country || !trialCountries?.length) return;
    const suggested = numbers.data?.suggestedCountry;
    setCountry((suggested && trialCountries.includes(suggested) ? suggested : trialCountries[0]) as Country);
  }, [country, numbers.data?.suggestedCountry, trialCountries]);
  const selected = options.find((option) => option.code === country);

  const send = useMutation({
    mutationFn: () => requestJson<{ attemptId: string; phoneE164: string }>(`/api/onboarding/phone-verification?${query}`, { method: "POST", body: JSON.stringify({ phoneNumber: attempt?.phoneE164 ?? phone, countryCode: country, locale }) }),
    onSuccess: (result) => { setAttempt({ id: result.attemptId, phoneE164: result.phoneE164 }); setCode(""); submittedCode.current = ""; },
    onError: (cause) => setError(t(`phoneNumber.trialPhone.errors.${startErrorKeys[errorCode(cause) ?? ""] ?? "sendFailed"}`)),
    meta: { inlineError: true },
  });
  const check = useMutation({
    mutationFn: (value: string) => requestJson<CheckResult>(`/api/onboarding/phone-verification/check?${query}`, { method: "POST", body: JSON.stringify({ attemptId: attempt!.id, code: value }) }),
    onSuccess: async (result) => {
      if (result.approved) { await onVerified(); return; }
      setError(result.status === "invalid" && result.remainingAttempts !== undefined ? t("phoneNumber.trialPhone.code.invalid", { count: result.remainingAttempts }) : result.status === "expired" ? t("phoneNumber.trialPhone.code.expired") : t("phoneNumber.trialPhone.code.locked"));
    },
    onError: () => setError(t("phoneNumber.trialPhone.code.failed")),
    meta: { inlineError: true },
  });

  useEffect(() => {
    if (attempt && code.length === 6 && submittedCode.current !== code && !check.isPending) {
      submittedCode.current = code;
      setError(null);
      check.mutate(code);
    }
  }, [attempt, code, check]);

  function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    send.mutate();
  }

  if (!country) return <div className="flex justify-center p-6"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>;

  if (attempt) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-center text-sm text-muted-foreground">{t("phoneNumber.trialPhone.code.sentTo", { phone: formatPhoneNumberDisplay(attempt.phoneE164, locale) })}</p>
        <InputOTP aria-label={t("phoneNumber.trialPhone.code.label")} autoComplete="one-time-code" autoFocus disabled={check.isPending} maxLength={6} onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} value={code}>
          <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((index) => <InputOTPSlot className="size-12 text-lg" index={index} key={index} />)}</InputOTPGroup>
        </InputOTP>
        {check.isPending ? <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin" />{t("phoneNumber.trialPhone.code.checking")}</div> : null}
        {error ? <FieldError className="text-center">{error}</FieldError> : null}
        <div className="mt-2 flex flex-col items-center gap-4">
          <button className="text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50" disabled={send.isPending || check.isPending} onClick={() => { setError(null); send.mutate(); }} type="button">{send.isPending ? t("phoneNumber.trialPhone.sending") : t("phoneNumber.trialPhone.code.resend")}</button>
          <button className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={check.isPending} onClick={() => { setAttempt(null); setCode(""); setError(null); }} type="button"><ChevronLeft className="size-4" />{t("phoneNumber.trialPhone.code.changeNumber")}</button>
        </div>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={sendCode}>
      <FieldGroup className="gap-4">
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="trial-phone">{t("phoneNumber.trialPhone.fields.mobileNumber")}</FieldLabel>
          <div className="flex min-w-0">
            <Select onValueChange={(value) => { if (value && value !== country) { setCountry(value as Country); setPhone(""); setError(null); } }} value={country}>
              <SelectTrigger aria-label={t("phoneNumber.trialPhone.fields.country")} className="h-11 w-24 shrink-0 rounded-l-4xl rounded-r-none px-4 font-medium text-muted-foreground data-[size=default]:h-11"><span>{selected?.callingCode ?? ""}</span></SelectTrigger>
              <SelectContent className="min-w-72"><SelectGroup>{options.map((option) => <SelectItem key={option.code} value={option.code}><span>{option.label}</span><span className="text-muted-foreground">{option.callingCode}</span></SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <PhoneInput autoFocus className="h-11 rounded-l-none border-l-0" containerClassName="min-w-0 flex-1" country={country} id="trial-phone" limitNationalDigits onChange={(value) => { setPhone(value ?? ""); setError(null); }} value={phone} />
          </div>
          <FieldDescription>{t("phoneNumber.trialPhone.hint")}</FieldDescription>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button className="mt-2 h-11 w-full" disabled={phone.trim().length === 0} loading={send.isPending} loadingLabel={t("phoneNumber.trialPhone.sending")} type="submit">{t("phoneNumber.trialPhone.sendCode")}</Button>
      </FieldGroup>
    </form>
  );
}
