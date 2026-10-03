"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, LoaderCircle } from "lucide-react";
import type { Country } from "react-phone-number-input/input";
import { useTranslation } from "react-i18next";

import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "./ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./ui/input-otp";
import { PhoneInput } from "./ui/phone-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "./ui/select";
import { formatPhoneNumberDisplay, getDefaultPhoneCountry, getPhoneCountryOptions, inferPhoneCountry } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";

type AttemptStatus = "sending" | "sent" | "approved" | "expired" | "failed" | "canceled";
type CheckResult = { approved: boolean; status: "approved" | "invalid" | "locked" | "expired" | "unavailable"; remainingAttempts?: number };
type Step = { kind: "confirm" } | { kind: "phone" } | { kind: "code"; attemptId: string; phoneE164: string };

const startErrorKeys: Record<string, string> = {
  phone_number_invalid: "invalidNumber",
  phone_unreachable: "unreachable",
  sms_sender_missing: "senderMissing",
  verification_cooldown: "cooldown",
  verification_rate_limited: "rateLimited",
};
const checkErrorKeys: Record<Exclude<CheckResult["status"], "approved">, string> = { invalid: "wrongCode", locked: "locked", expired: "expired", unavailable: "unavailable" };
const attemptErrorKeys: Partial<Record<AttemptStatus, string>> = { failed: "deliveryFailed", expired: "expired", canceled: "unavailable" };

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
}

/**
 * Verifies the signed-in operator's mobile number before SMS alerts turn on.
 * Screen one asks for the number; screen two takes the 6-digit code with the
 * same input the onboarding phone check used. An operator whose phone is
 * already verified only confirms the consent, unless they change the number.
 */
export function SmsPhoneVerificationDialog({ businessId, open, onOpenChange, onVerified, onConsent, phoneVerified = false }: { businessId: string; open: boolean; onOpenChange: (open: boolean) => void; onVerified: () => void; onConsent?: () => void; phoneVerified?: boolean }) {
  const { i18n, t } = useTranslation("settings");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const defaultCountry = getDefaultPhoneCountry(locale) as Country;
  const countries = useMemo(() => getPhoneCountryOptions(locale), [locale]);
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [country, setCountry] = useState<Country>(defaultCountry);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const submittedCodeRef = useRef("");
  const query = `businessId=${encodeURIComponent(businessId)}`;

  useEffect(() => {
    if (!open) return;
    setStep(phoneVerified ? { kind: "confirm" } : { kind: "phone" }); setCode(""); setError(null); setLocked(false); submittedCodeRef.current = "";
  }, [open, phoneVerified]);

  const start = useMutation({
    mutationFn: (phoneNumber: string) => requestJson<{ attemptId: string; phoneE164: string }>(`/api/account/phone-verification?${query}`, { method: "POST", body: JSON.stringify({ phoneNumber, locale }) }),
    onSuccess: (result) => { setStep({ kind: "code", attemptId: result.attemptId, phoneE164: result.phoneE164 }); setCode(""); setLocked(false); submittedCodeRef.current = ""; },
    onError: (cause) => setError(t(`notifications.phoneVerification.errors.${startErrorKeys[errorCode(cause) ?? ""] ?? "sendFailed"}`)),
  });
  const attemptId = step.kind === "code" ? step.attemptId : null;
  const attempt = useQuery({
    queryKey: ["phone-verification", businessId, attemptId],
    queryFn: () => requestJson<{ attempt: { id: string; status: AttemptStatus } }>(`/api/account/phone-verification?${query}&attemptId=${encodeURIComponent(attemptId!)}`),
    enabled: open && Boolean(attemptId),
    refetchInterval: (current) => current.state.data?.attempt.status === "sending" ? 1000 : false,
  });
  const attemptStatus = attempt.data?.attempt.id === attemptId ? attempt.data?.attempt.status : undefined;
  const check = useMutation({
    mutationFn: (value: string) => requestJson<CheckResult>(`/api/account/phone-verification/check?${query}`, { method: "POST", body: JSON.stringify({ attemptId, code: value }) }),
    onSuccess: (result) => {
      if (result.approved) { onVerified(); return; }
      if (result.status === "locked" || result.status === "expired") setLocked(true);
      // The code may still be on its way: reload the attempt and leave the input open.
      if (result.status === "unavailable" || result.status === "approved") void attempt.refetch();
      setError(t(`notifications.phoneVerification.errors.${checkErrorKeys[result.status === "approved" ? "unavailable" : result.status]}`));
    },
    onError: () => setError(t("notifications.phoneVerification.errors.checkFailed")),
  });
  const attemptError = attemptStatus ? attemptErrorKeys[attemptStatus] : undefined;
  const codeDisabled = locked || Boolean(attemptError) || check.isPending;

  useEffect(() => {
    if (step.kind !== "code" || code.length !== 6 || submittedCodeRef.current === code || codeDisabled) return;
    submittedCodeRef.current = code;
    setError(null);
    check.mutate(code);
  }, [check, code, codeDisabled, step.kind]);

  function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    start.mutate(phone);
  }

  function resend() {
    if (step.kind !== "code") return;
    setError(null);
    start.mutate(step.phoneE164);
  }

  function changeNumber() {
    if (step.kind === "code") {
      const inferred = inferPhoneCountry(step.phoneE164, country);
      if (inferred) setCountry(inferred as Country);
      setPhone(step.phoneE164);
    }
    setStep({ kind: "phone" }); setCode(""); setError(null); setLocked(false); submittedCodeRef.current = "";
  }

  const selected = countries.find((option) => option.code === country) ?? countries[0];
  const shownError = error ?? (attemptError ? t(`notifications.phoneVerification.errors.${attemptError}`) : null);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      {step.kind === "confirm" ? <div className="flex flex-col gap-6">
        <DialogHeader><DialogTitle>{t("notifications.phoneVerification.confirm.title")}</DialogTitle></DialogHeader>
        <div className="flex flex-col items-start gap-4">
          <p className="text-xs text-muted-foreground">{t("notifications.phoneVerification.confirm.consent")}</p>
          <button className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => setStep({ kind: "phone" })} type="button">{t("notifications.phoneVerification.code.changeNumber")}</button>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">{t("notifications.phoneVerification.cancel")}</Button>
          <Button onClick={onConsent} type="button">{t("notifications.phoneVerification.confirm.turnOn")}</Button>
        </DialogFooter>
      </div> : step.kind === "phone" ? <form className="flex flex-col gap-6" onSubmit={sendCode}>
        <DialogHeader><DialogTitle>{t("notifications.phoneVerification.phone.title")}</DialogTitle></DialogHeader>
        <FieldGroup className="gap-4">
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel className="sr-only" htmlFor="sms-alert-phone">{t("notifications.phoneVerification.fields.mobileNumber")}</FieldLabel>
            <div className="flex min-w-0">
              <Select onValueChange={(value) => { if (value && value !== country) { setCountry(value as Country); setPhone(""); } }} value={country}>
                <SelectTrigger aria-label={t("notifications.phoneVerification.fields.country")} className="h-11 w-20 shrink-0 rounded-l-4xl rounded-r-none px-4 font-medium text-muted-foreground data-[size=default]:h-11" data-phone-country-prefix><span>{selected?.callingCode ?? ""}</span></SelectTrigger>
                <SelectContent className="min-w-72"><SelectGroup>{countries.map((option) => <SelectItem key={option.code} value={option.code}><span>{option.label}</span><span className="text-muted-foreground">{option.callingCode}</span></SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <PhoneInput autoFocus className="h-11 rounded-l-none border-l-0" containerClassName="min-w-0 flex-1" country={country} id="sms-alert-phone" limitNationalDigits onChange={(value) => { setPhone(value ?? ""); setError(null); }} onRawValueChange={(raw) => { if (raw.trim().startsWith("+")) { const inferred = inferPhoneCountry(raw, country); if (inferred && inferred !== country) setCountry(inferred as Country); } }} value={phone} />
            </div>
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <p className="text-xs text-muted-foreground">{t("notifications.phoneVerification.phone.consent")}</p>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">{t("notifications.phoneVerification.cancel")}</Button>
          <Button disabled={phone.length === 0} loading={start.isPending} loadingLabel={t("notifications.phoneVerification.sending")} type="submit">{t("notifications.phoneVerification.sendCode")}</Button>
        </DialogFooter>
      </form> : <div className="flex flex-col gap-6">
        <DialogHeader><DialogTitle>{t("notifications.phoneVerification.code.title")}</DialogTitle><DialogDescription>{t("notifications.phoneVerification.code.description", { phone: formatPhoneNumberDisplay(step.phoneE164, locale) })}</DialogDescription></DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <InputOTP aria-label={t("notifications.phoneVerification.code.title")} autoComplete="one-time-code" autoFocus containerClassName="justify-center" disabled={codeDisabled} maxLength={6} onChange={(value) => { const next = value.replace(/\D/g, "").slice(0, 6); if (next.length < 6) submittedCodeRef.current = ""; setCode(next); if (!locked) setError(null); }} value={code}>
            <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((index) => <InputOTPSlot aria-invalid={shownError ? true : undefined} className="size-12 text-lg" index={index} key={index} />)}</InputOTPGroup>
          </InputOTP>
          {check.isPending ? <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin" />{t("notifications.phoneVerification.code.verifying")}</div> : null}
          {shownError ? <FieldError className="text-center">{shownError}</FieldError> : null}
          <div className="mt-2 flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground">{t("notifications.phoneVerification.code.didntGet")}{" "}<button className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50" disabled={start.isPending || check.isPending} onClick={resend} type="button">{start.isPending ? t("notifications.phoneVerification.code.resending") : t("notifications.phoneVerification.code.resend")}</button></p>
            <button className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={check.isPending} onClick={changeNumber} type="button"><ChevronLeft className="size-4" />{t("notifications.phoneVerification.code.changeNumber")}</button>
          </div>
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}
