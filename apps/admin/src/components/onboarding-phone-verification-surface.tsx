"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Country } from "react-phone-number-input/input";
import { useTranslation } from "react-i18next";

import { Button } from "./ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./ui/input-otp";
import { PhoneInput } from "./ui/phone-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "./ui/select";
import { getDefaultPhoneCountry, getSupportedOnboardingPhoneCountryOptions, normalizeOnboardingPhoneCountry } from "@/lib/phone";

type Business = { businessId: string; name: string; active: boolean };
type Attempt = { id: string; phoneE164: string; countryCode: string; status: string; expiresAt: string; attemptCount: number };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

function useActiveBusiness() {
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  return { businesses, business: businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0] };
}

function maskPhone(phone: string): string {
  if (phone.length < 4) return phone;
  const last = phone.slice(-4);
  return `${phone.slice(0, Math.max(2, phone.length - 8))}${"•".repeat(Math.max(2, phone.length - 6))}${last}`;
}

export function OnboardingPhoneVerificationSurface() {
  const { i18n, t } = useTranslation("onboarding");
  const router = useRouter();
  const { businesses, business } = useActiveBusiness();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const defaultCountry = normalizeOnboardingPhoneCountry(getDefaultPhoneCountry(locale)) as Country;
  const countries = useMemo(() => getSupportedOnboardingPhoneCountryOptions(locale), [locale]);
  const [country, setCountry] = useState<Country>(defaultCountry);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const start = useMutation({ mutationFn: () => requestJson<{ attemptId: string }>(`/api/onboarding/phone-verification/start?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ phoneNumber: phone }) }), onSuccess: () => router.push("/onboarding/verify-phone/code") });
  const reuse = useMutation({ mutationFn: () => requestJson(`/api/onboarding/phone-verification/reuse?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST" }), onSuccess: () => router.push("/onboarding/plan") });
  const selected = countries.find((option) => option.code === country) ?? countries[0];

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    try { await start.mutateAsync(); } catch (cause) { setError(cause instanceof Error ? cause.message : t("verifyPhone.sendFailed")); }
  }

  return <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}><FieldGroup className="gap-4"><Field><FieldLabel htmlFor="onboarding-phone">{t("verifyPhone.fields.mobileNumber")}</FieldLabel><div className="flex min-w-0"><Select onValueChange={(value) => { if (value) { setCountry(value as Country); setPhone(""); } }} value={country}><SelectTrigger aria-label={t("verifyPhone.fields.region")} className="h-11 w-20 shrink-0 rounded-l-4xl rounded-r-none px-4 font-medium text-muted-foreground data-[size=default]:h-11"><span>{selected?.callingCode ?? ""}</span></SelectTrigger><SelectContent className="min-w-72"><SelectGroup>{countries.map((option) => <SelectItem key={option.code} value={option.code}><span>{option.label}</span><span className="text-muted-foreground">{option.callingCode}</span></SelectItem>)}</SelectGroup></SelectContent></Select><PhoneInput autoFocus className="h-11 rounded-l-none border-l-0" containerClassName="min-w-0 flex-1" country={country} id="onboarding-phone" onChange={(value) => setPhone(value ?? "")} value={phone} /></div><FieldDescription>{t("verifyPhone.hint")}</FieldDescription></Field>{error ? <FieldError>{error}</FieldError> : null}<Button className="mt-2 h-11 w-full" disabled={!business || businesses.isLoading || phone.trim().length === 0 || start.isPending} type="submit">{start.isPending ? <><LoaderCircle className="size-4 animate-spin" />{t("verifyPhone.sending")}</> : t("verifyPhone.sendCode")}</Button>{business ? <button className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50" disabled={reuse.isPending} onClick={() => reuse.mutate()} type="button">{t("verifyPhone.reuse")}</button> : null}{reuse.isError ? <FieldError>{t("verifyPhone.reuseFailed")}</FieldError> : null}</FieldGroup></form>;
}

export function OnboardingPhoneVerificationCodeSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const { business } = useActiveBusiness();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submittedCodeRef = useRef("");
  const attempt = useQuery({ queryKey: ["phone-verification", business?.businessId], queryFn: () => requestJson<{ attempt: Attempt | null }>(`/api/onboarding/phone-verification?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business), refetchInterval: (query) => ["queued", "processing"].includes(query.state.data?.attempt?.status ?? "") ? 1000 : false });
  const current = attempt.data?.attempt;
  const check = useMutation({ mutationFn: (value: string) => requestJson<{ approved: boolean; status: string }>(`/api/onboarding/phone-verification/check?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ attemptId: current!.id, code: value }) }), onSuccess: (result) => { if (result.approved) router.replace("/onboarding/plan"); else setError(t("verifyPhoneCode.invalidCode")); }, onError: () => setError(t("verifyPhoneCode.failed")) });
  const resend = useMutation({ mutationFn: () => requestJson(`/api/onboarding/phone-verification/resend?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST" }), onSuccess: () => void attempt.refetch(), onError: () => setError(t("verifyPhoneCode.resendFailed")) });
  const waiting = current?.status === "queued" || current?.status === "processing";

  useEffect(() => {
    if (code.length === 6 && submittedCodeRef.current !== code && current?.status === "pending") {
      submittedCodeRef.current = code;
      setError(null);
      check.mutate(code);
    }
  }, [code, current?.status, check]);

  if (attempt.isLoading || waiting) return <div className="flex justify-center p-6"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>;
  if (!current) return <div className="flex flex-col items-center gap-4"><FieldError>{t("verifyPhoneCode.startAgain")}</FieldError><Button onClick={() => router.push("/onboarding/verify-phone")}>{t("verifyPhoneCode.changeNumber")}</Button></div>;

  return <div className="flex flex-col items-center gap-4"><p className="text-sm text-muted-foreground">{t("verifyPhoneCode.description", { phone: maskPhone(current.phoneE164) })}</p><InputOTP autoFocus maxLength={6} onChange={setCode} value={code}><InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((index) => <InputOTPSlot className="size-12 text-lg" index={index} key={index} />)}</InputOTPGroup></InputOTP>{check.isPending ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("verifyPhoneCode.verifying")}</div> : null}{error ? <FieldError>{error}</FieldError> : null}<div className="flex flex-col items-center gap-4"><p className="text-sm text-muted-foreground">{t("verifyPhoneCode.didntGet")}{" "}<button className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50" disabled={resend.isPending || check.isPending} onClick={() => { setError(null); resend.mutate(); }} type="button">{resend.isPending ? t("verifyPhoneCode.resending") : t("verifyPhoneCode.resend")}</button></p><Link className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" href="/onboarding/verify-phone"><ChevronLeft className="size-4" />{t("verifyPhoneCode.changeNumber")}</Link></div></div>;
}
