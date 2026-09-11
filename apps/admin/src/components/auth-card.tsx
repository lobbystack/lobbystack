"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";

import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Turnstile } from "@/components/turnstile";
import { recordAuthSuccess } from "@/lib/auth-success-analytics";
import { resolveLocale } from "@/lib/locale";
import { localizeMarketingHref } from "@/lib/marketing-site-url";
import { cn } from "@/lib/utils";
import { captureAffiliateReferralFromUrl, getAffiliateVisitorId } from "@/lib/affiliate-referral";

import { buildAuthPathWithReturnTo, getSafeReturnTo } from "@/lib/auth-return-to";

export function AuthCard({ mode }: { mode: "login" | "signup" }) {
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const { t, i18n } = useTranslation("auth");
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => { setReturnTo(getSafeReturnTo(new URLSearchParams(window.location.search).get("returnTo"))); }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasBlurredEmail, setHasBlurredEmail] = useState(false);
  const [hasFocusedPassword, setHasFocusedPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const pendingChallengeSubmit = useRef(false);

  useEffect(() => {
    if (mode !== "signup") return;
    const referralCode = captureAffiliateReferralFromUrl(new URL(window.location.href));
    if (!referralCode) return;
    void fetch("/api/affiliate/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referralCode, visitorId: getAffiliateVisitorId(), sourceUrl: `${window.location.origin}${window.location.pathname}` }),
    });
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (mode === "signup" && !isSignupReady) return;
    if (mode === "signup" && turnstileSiteKey && !turnstileToken) {
      pendingChallengeSubmit.current = true;
      setError(t("errors.turnstileRequired"));
      return;
    }
    pendingChallengeSubmit.current = false;
    await submitCredentials(turnstileToken);
  }

  async function submitCredentials(verifiedToken: string | null) {
    setError(null);
    setLoading(true);
    try {
      const body = mode === "login" ? { email, password } : { name: email.split("@")[0] || email, email, password, preferredLocale: resolveLocale(i18n.resolvedLanguage, i18n.language), ...(verifiedToken ? { turnstileToken: verifiedToken } : {}) };
      const response = await fetch(`/api/auth/${mode === "login" ? "sign-in/email" : "sign-up/email"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { code?: string } | null;
        const accountExists = ["USER_ALREADY_EXISTS", "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"].includes(failure?.code ?? "");
        throw new Error(mode === "login" ? t("errors.incorrectCredentials") : t(accountExists ? "errors.accountExists" : "errors.signupFailed"));
      }
      recordAuthSuccess(mode === "login" ? "web.auth.login_succeeded" : "web.auth.signup_succeeded");
      window.location.assign(getSafeReturnTo(new URLSearchParams(window.location.search).get("returnTo")) ?? "/");
    } catch (cause) {
      if (mode === "signup") { setTurnstileToken(null); setTurnstileResetKey(key => key + 1); }
      setError(cause instanceof Error ? cause.message : t("errors.signupFailed"));
    } finally {
      setLoading(false);
    }
  }

  const login = mode === "login";
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordCriteria = [
    { label: t("signup.passwordCriteria.minimumLength"), isMet: password.length >= 8 },
    { label: t("signup.passwordCriteria.number"), isMet: /\d/.test(password) },
    { label: t("signup.passwordCriteria.specialCharacter"), isMet: /[^A-Za-z0-9\s]/.test(password) },
  ];
  const isSignupReady = isEmailValid && passwordCriteria.every((criterion) => criterion.isMet);
  const marketingLocale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const legalFooter = !login ? (
    <p className="max-w-full text-center text-xs leading-5 text-muted-foreground sm:whitespace-nowrap">
      {t("signup.legal.prefix")} {" "}
      <a className="underline underline-offset-4 hover:text-foreground" href={localizeMarketingHref(marketingLocale, "/terms")} rel="noreferrer" target="_blank">{t("signup.legal.terms")}</a>{" "}
      {t("signup.legal.and")} {" "}
      <a className="underline underline-offset-4 hover:text-foreground" href={localizeMarketingHref(marketingLocale, "/privacy")} rel="noreferrer" target="_blank">{t("signup.legal.privacy")}</a>
      {t("signup.legal.suffix")}
    </p>
  ) : undefined;
  return (
    <ReplacementOnboardingShell legalFooter={legalFooter} progress={login ? null : { current: 1, total: 10 }} title={login ? t("login.title") : t("signup.title")} width="sm">
      <div className="flex w-full flex-col gap-6">
        <form onSubmit={submit}>
          <FieldGroup className="gap-4">
            <Field data-invalid={hasBlurredEmail && email.length > 0 && !isEmailValid ? true : undefined}><FieldLabel htmlFor="auth-email">{login ? t("login.email") : t("signup.email")}</FieldLabel><Input aria-invalid={hasBlurredEmail && email.length > 0 && !isEmailValid} autoComplete="email" className={cn("h-11", hasBlurredEmail && email.length > 0 && !isEmailValid && "border-destructive text-destructive focus-visible:border-destructive focus-visible:ring-destructive/20")} id="auth-email" onBlur={() => setHasBlurredEmail(true)} onChange={(event) => { setHasBlurredEmail(false); setEmail(event.target.value); }} placeholder={login ? t("login.emailPlaceholder") : t("signup.emailPlaceholder")} required type="email" value={email} />{hasBlurredEmail && email.length > 0 && !isEmailValid ? <FieldError className="flex items-center gap-2 font-medium"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{t(login ? "login.emailInvalid" : "signup.emailInvalid")}</span></FieldError> : null}</Field>
            <Field>
              <div className="flex items-center justify-between gap-3"><FieldLabel htmlFor="auth-password">{login ? t("login.password") : t("signup.password")}</FieldLabel>{login ? <Link className="text-xs font-medium text-muted-foreground hover:text-foreground" href="/forgot-password">{t("login.forgotPassword")}</Link> : null}</div>
              <Input autoComplete={login ? "current-password" : "new-password"} className="h-11" id="auth-password" minLength={8} onChange={(event) => setPassword(event.target.value)} onFocus={() => setHasFocusedPassword(true)} placeholder={login ? t("login.passwordPlaceholder") : t("signup.passwordPlaceholder")} required type="password" value={password} />
              {!login && hasFocusedPassword ? <ul aria-live="polite" className="flex flex-col gap-1 pt-0.5 text-sm font-medium">{passwordCriteria.map((criterion) => <li className={cn("flex items-center gap-2", criterion.isMet ? "text-emerald-700" : "text-muted-foreground")} key={criterion.label}><span aria-hidden="true" className="w-3 text-center">{criterion.isMet ? "✓" : "×"}</span><span>{criterion.label}</span></li>)}</ul> : null}
            </Field>
            {error ? <div className="flex flex-col gap-2 -mt-1"><FieldError>{error}</FieldError></div> : null}
            <Button className="mt-2 h-11 w-full" disabled={!login && !isSignupReady} loading={loading} loadingLabel={login ? t("login.submitting") : t("signup.submitting")} type="submit">{login ? t("login.submit") : t("signup.submit")}</Button>
          </FieldGroup>
        </form>
        {!login && turnstileSiteKey ? <Turnstile key={turnstileResetKey} onError={() => { pendingChallengeSubmit.current = false; setTurnstileToken(null); setLoading(false); setError(t("errors.turnstileFailed")); }} onTokenChange={(token) => {
          setTurnstileToken(token);
          if (!token && pendingChallengeSubmit.current) { pendingChallengeSubmit.current = false; setLoading(false); setError(t("errors.turnstileRequired")); }
          if (token && pendingChallengeSubmit.current) { pendingChallengeSubmit.current = false; void submitCredentials(token); }
        }} siteKey={turnstileSiteKey} /> : null}
        <p className="text-center text-sm text-muted-foreground">{login ? t("login.noAccount") : t("signup.haveAccount")} <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={buildAuthPathWithReturnTo(login ? "/signup" : "/login", returnTo)}>{login ? t("login.createOne") : t("signup.signIn")}</Link></p>
      </div>
    </ReplacementOnboardingShell>
  );
}
