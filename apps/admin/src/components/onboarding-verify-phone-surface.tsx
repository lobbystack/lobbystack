"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, LoaderCircle } from "lucide-react";
import type { Country } from "react-phone-number-input/input";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useTelemetry } from "@/components/product-analytics";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { formatPhoneNumberDisplay, getDefaultPhoneCountry, getLocalePhoneCountry, getPhoneCountryOptions } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";
import { useStepNavigation } from "@/lib/use-step-navigation";

type NumberCountries = { countries: string[]; trialCountries: string[]; suggestedCountry: string | null; verifyPhone: boolean };
type CheckResult = { approved: boolean; status: string; remainingAttempts?: number };

/**
 * The "verify you're real" step. The owner's mobile and the country they pick
 * for it decide where their number comes from. In a country without numbers
 * they can join the waitlist and carry on without one. A partner's business
 * gets its numbers from its partner, so verifying finishes its owner's
 * onboarding, and the host offers no waitlist there.
 */
export function OnboardingVerifyPhoneSurface() {
  const { i18n, t } = useTranslation("onboarding");
  const { navigate, navigating, prefetch } = useStepNavigation();
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const partnerBusiness = Boolean(business?.partnerAccessLevel);
  // Where the owner goes once the phone is done: the number step, or for a partner's business, the dashboard.
  const next = partnerBusiness ? { stage: "complete", route: "/" } : { stage: "phone_number", route: "/onboarding/number" };
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const options = useMemo(() => getPhoneCountryOptions(locale), [locale]);
  const numbers = useQuery({ queryKey: ["onboarding-number-countries", business?.businessId], enabled: Boolean(business), queryFn: () => requestJson<NumberCountries>(`/api/onboarding/numbers?businessId=${encodeURIComponent(business!.businessId)}`) });
  const [country, setCountry] = useState<Country | null>(null);
  const [phone, setPhone] = useState("");
  const [attempt, setAttempt] = useState<{ id: string; phoneE164: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const submittedCode = useRef("");
  useEffect(() => { prefetch(next.route); }, [prefetch, next.route]);
  // Start on the country the business's time zone points to, else the browser's region.
  useEffect(() => {
    if (country || !numbers.data) return;
    const browser = typeof navigator === "undefined" ? undefined : getLocalePhoneCountry(navigator.language);
    setCountry((numbers.data.suggestedCountry ?? browser ?? getDefaultPhoneCountry(locale)) as Country);
  }, [country, numbers.data, locale]);
  const selected = options.find((option) => option.code === country);
  const sellsNumbers = Boolean(country && numbers.data?.countries.includes(country));
  const countryName = selected?.label ?? country ?? "";

  const send = useMutation({
    mutationFn: () => requestJson<{ attemptId: string; phoneE164: string }>(`/api/onboarding/phone-verification?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ phoneNumber: phone, countryCode: country, locale }) }),
    onSuccess: (result) => { setAttempt({ id: result.attemptId, phoneE164: result.phoneE164 }); setCode(""); submittedCode.current = ""; },
    meta: { inlineError: true },
  });
  const check = useMutation({
    mutationFn: (value: string) => requestJson<CheckResult>(`/api/onboarding/phone-verification/check?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ attemptId: attempt!.id, code: value }) }),
    onSuccess: async (result) => {
      if (result.approved) {
        if (business) telemetry.track("web.onboarding.phone_verified", { businessId: business.businessId, countryCode: country ?? "" });
        await queryClient.invalidateQueries({ queryKey: ["businesses"] });
        navigate(next.route);
        return;
      }
      setError(result.status === "invalid" && result.remainingAttempts !== undefined ? t("verifyPhone.code.invalid", { count: result.remainingAttempts }) : result.status === "expired" ? t("verifyPhone.code.expired") : t("verifyPhone.code.locked"));
    },
    onError: (cause) => setError(getSafeOnboardingErrorMessage(cause, t, "verifyPhone.code.failed")),
    meta: { inlineError: true },
  });
  const waitlist = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/numbers?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ countryCode: country }) }),
    onSuccess: () => { setJoined(true); if (business) telemetry.track("web.onboarding.number_waitlist_joined", { businessId: business.businessId, countryCode: country ?? "" }); },
    onError: (cause) => setError(getSafeOnboardingErrorMessage(cause, t, "verifyPhone.unavailable.failed")),
    meta: { inlineError: true },
  });
  const skip = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: partnerBusiness ? "complete" : "attribution" }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["businesses"] }); navigate(partnerBusiness ? "/" : "/onboarding/attribution"); },
    onError: (cause) => setError(getSafeOnboardingErrorMessage(cause, t, "verifyPhone.unavailable.failed")),
    meta: { inlineError: true },
  });
  // A self-hosted install has no free trial to guard, so it goes straight to the number step, or finishes a partner's business.
  const passOn = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: next.stage }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["businesses"] }); navigate(next.route); },
  });
  const passOnNeeded = numbers.data?.verifyPhone === false;
  useEffect(() => { if (passOnNeeded && passOn.isIdle) passOn.mutate(); }, [passOnNeeded, passOn]);

  useEffect(() => {
    if (attempt && code.length === 6 && submittedCode.current !== code && !check.isPending) {
      submittedCode.current = code;
      setError(null);
      check.mutate(code);
    }
  }, [attempt, code, check]);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try { await send.mutateAsync(); } catch (cause) { setError(getSafeOnboardingErrorMessage(cause, t, "verifyPhone.sendFailed")); }
  }

  if (passOn.isError) return <FieldError>{getSafeOnboardingErrorMessage(passOn.error, t, "verifyPhone.unavailable.failed")}</FieldError>;
  if (!country || numbers.isLoading || passOnNeeded) return <div className="flex justify-center p-6"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>;

  if (attempt) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-center text-sm text-muted-foreground">{t("verifyPhone.code.sentTo", { phone: formatPhoneNumberDisplay(attempt.phoneE164) })}</p>
        <InputOTP autoFocus disabled={check.isPending || navigating} maxLength={6} onChange={setCode} value={code}>
          <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((index) => <InputOTPSlot className="size-12 text-lg" index={index} key={index} />)}</InputOTPGroup>
        </InputOTP>
        {check.isPending ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("verifyPhone.code.checking")}</div> : null}
        {error ? <FieldError>{error}</FieldError> : null}
        <div className="mt-2 flex flex-col items-center gap-4">
          <button className="text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50" disabled={send.isPending || check.isPending} onClick={() => { setError(null); send.mutate(); }} type="button">{send.isPending ? t("verifyPhone.sending") : t("verifyPhone.code.resend")}</button>
          <button className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => { setAttempt(null); setError(null); }} type="button"><ChevronLeft className="size-4" />{t("verifyPhone.code.changeNumber")}</button>
        </div>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void sendCode(event)}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="onboarding-phone">{t("verifyPhone.fields.mobileNumber")}</FieldLabel>
          <div className="flex min-w-0">
            <Select onValueChange={(value) => { if (value && value !== country) { setCountry(value as Country); setPhone(""); setJoined(false); setError(null); } }} value={country}>
              <SelectTrigger aria-label={t("verifyPhone.fields.country")} className="h-11 w-24 shrink-0 rounded-l-4xl rounded-r-none px-4 font-medium text-muted-foreground data-[size=default]:h-11"><span>{selected?.callingCode ?? ""}</span></SelectTrigger>
              <SelectContent className="min-w-72"><SelectGroup>{options.map((option) => <SelectItem key={option.code} value={option.code}><span>{option.label}</span><span className="text-muted-foreground">{option.callingCode}</span></SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <PhoneInput autoFocus className="h-11 rounded-l-none border-l-0" containerClassName="min-w-0 flex-1" country={country} disabled={!sellsNumbers} id="onboarding-phone" limitNationalDigits onChange={(value) => setPhone(value ?? "")} value={phone} />
          </div>
          {sellsNumbers ? <FieldDescription>{t("verifyPhone.hint")}</FieldDescription> : null}
        </Field>
        {sellsNumbers ? null : (
          partnerBusiness ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border p-4 text-left">
              <p className="text-sm font-medium text-foreground">{t("verifyPhone.unavailable.partnerTitle", { country: countryName })}</p>
              <p className="text-sm text-muted-foreground">{t("verifyPhone.unavailable.partnerBody")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-border p-4 text-left">
              <p className="text-sm font-medium text-foreground">{t("verifyPhone.unavailable.title", { country: countryName })}</p>
              <p className="text-sm text-muted-foreground">{t("verifyPhone.unavailable.body", { country: countryName })}</p>
              {joined ? <p className="text-sm text-foreground">{t("verifyPhone.unavailable.joined")}</p> : <Button disabled={waitlist.isPending || !business} onClick={() => waitlist.mutate()} type="button" variant="outline">{t("verifyPhone.unavailable.notify")}</Button>}
            </div>
          )
        )}
        {error ? <FieldError>{error}</FieldError> : null}
        {sellsNumbers ? (
          <Button className="mt-2 h-11 w-full" disabled={!business || phone.trim().length === 0 || send.isPending || navigating} type="submit">{send.isPending ? <><LoaderCircle className="size-4 animate-spin" />{t("verifyPhone.sending")}</> : t("verifyPhone.sendCode")}</Button>
        ) : (
          <Button className="mt-2 h-11 w-full" disabled={!business || skip.isPending || navigating} onClick={() => skip.mutate()} type="button">{t(partnerBusiness ? "verifyPhone.unavailable.partnerContinue" : "verifyPhone.unavailable.continue")}</Button>
        )}
      </FieldGroup>
    </form>
  );
}
