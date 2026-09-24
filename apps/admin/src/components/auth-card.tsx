"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";

import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Turnstile } from "@/components/turnstile";
import { recordAuthSuccess } from "@/lib/auth-success-analytics";
import { resolveLocale } from "@/lib/locale";
import { localizePublicPath } from "@/lib/locale-path";
import { localizeMarketingHref } from "@/lib/marketing-site-url";
import { cn } from "@/lib/utils";
import { captureAffiliateReferralFromUrl, getAffiliateVisitorId } from "@/lib/affiliate-referral";

import { buildAuthPathWithReturnTo, getSafeReturnTo } from "@/lib/auth-return-to";

export function AuthCard({ mode }: { mode: "login" | "signup" }) {
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const { t, i18n } = useTranslation("auth");
  const authLocale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [signupSource, setSignupSource] = useState<"calculator" | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(getSafeReturnTo(params.get("returnTo")));
    setSignupSource(params.get("source") === "calculator" ? "calculator" : null);
  }, []);
  function authPath(path: "/login" | "/signup") {
    const target = buildAuthPathWithReturnTo(path, returnTo, authLocale);
    return signupSource ? `${target}${target.includes("?") ? "&" : "?"}source=${signupSource}` : target;
  }
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendTurnstileToken, setResendTurnstileToken] = useState<string | null>(null);
  const [resendChallengeRequired, setResendChallengeRequired] = useState(false);
  const [resendTurnstileResetKey, setResendTurnstileResetKey] = useState(0);
  const [hasBlurredEmail, setHasBlurredEmail] = useState(false);
  const [hasFocusedPassword, setHasFocusedPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const pendingChallengeSubmit = useRef(false);
  const login = mode === "login";

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
        if (login && failure?.code === "EMAIL_NOT_VERIFIED") {
          setVerificationPending(true);
          return;
        }
        const accountExists = ["USER_ALREADY_EXISTS", "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"].includes(failure?.code ?? "");
        throw new Error(login ? t("errors.incorrectCredentials") : t(accountExists ? "errors.accountExists" : "errors.signupFailed"));
      }
      const result = await response.json() as { token?: string | null };
      if (mode === "signup" && result.token === null) {
        setVerificationPending(true);
        return;
      }
      finishAuthentication();
    } catch (cause) {
      if (mode === "signup") { setTurnstileToken(null); setTurnstileResetKey(key => key + 1); }
      setError(cause instanceof Error ? cause.message : t("errors.signupFailed"));
    } finally {
      setLoading(false);
    }
  }

  function finishAuthentication() {
    const event = login ? "web.auth.login_succeeded" : "web.auth.signup_succeeded";
    if (signupSource) recordAuthSuccess(event, { source: signupSource });
    else recordAuthSuccess(event);
    const safeReturnTo = getSafeReturnTo(new URLSearchParams(window.location.search).get("returnTo")) ?? "/";
    const target = new URL(safeReturnTo, window.location.origin);
    window.location.assign(target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : "/");
  }

  async function requestVerificationCode(challengeToken: string | null) {
    const response = await fetch("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), type: "email-verification", ...(challengeToken ? { turnstileToken: challengeToken } : {}) }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { code?: string } | null;
      if (failure?.code === "CHALLENGE_FAILED") {
        setResendChallengeRequired(true);
        throw new Error(t("errors.turnstileRequired"));
      }
      throw new Error(t(failure?.code === "RATE_LIMITED" ? "errors.verificationCodeRateLimited" : "errors.verificationCodeRequestFailed"));
    }
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verificationCode.length !== 6 || verificationLoading || resendLoading) return;
    setVerificationError(null);
    setVerificationLoading(true);
    try {
      const response = await fetch("/api/auth/email-otp/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: verificationCode }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { code?: string } | null;
        const key = failure?.code === "OTP_EXPIRED"
          ? "verificationCodeExpired"
          : failure?.code === "TOO_MANY_ATTEMPTS"
            ? "verificationCodeTooManyAttempts"
            : "invalidVerificationCode";
        throw new Error(t(`errors.${key}`));
      }
      setEmailVerified(true);
      const signInResponse = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (!signInResponse.ok) throw new Error(t("errors.verificationSignInFailed"));
      finishAuthentication();
    } catch (cause) {
      setVerificationError(cause instanceof Error ? cause.message : t("errors.invalidVerificationCode"));
    } finally {
      setVerificationLoading(false);
    }
  }

  async function resendVerificationCode() {
    if (resendLoading || verificationLoading) return;
    if (resendChallengeRequired && turnstileSiteKey && !resendTurnstileToken) {
      setVerificationError(t("errors.turnstileRequired"));
      return;
    }
    setVerificationError(null);
    setResendStatus(null);
    setVerificationCode("");
    setResendLoading(true);
    try {
      await requestVerificationCode(resendTurnstileToken);
      setResendChallengeRequired(false);
      setResendStatus(t("verifyEmail.codeSent"));
      document.getElementById("verification-code")?.focus();
    } catch (cause) {
      setVerificationError(cause instanceof Error ? cause.message : t("errors.verificationCodeRequestFailed"));
    } finally {
      setResendLoading(false);
      setResendTurnstileToken(null);
      setResendTurnstileResetKey((key) => key + 1);
    }
  }

  if (emailVerified) return (
    <ReplacementOnboardingShell title={t("verifyEmail.verifiedTitle")} description={t("verifyEmail.verifiedDescription")} width="sm">
      <div className="flex flex-col gap-4">
        {verificationLoading ? <p role="status">{t("verifyEmail.verifying")}</p> : <>
          {verificationError ? <FieldError>{verificationError}</FieldError> : null}
          <Link className="text-center font-medium underline" href={authPath("/login")}>{t("signup.signIn")}</Link>
          <Link className="text-center underline" href={localizePublicPath("/forgot-password", authLocale)}>{t("verifyEmail.resetPassword")}</Link>
        </>}
      </div>
    </ReplacementOnboardingShell>
  );
  if (verificationPending) return (
    <ReplacementOnboardingShell description={t(login ? "verifyEmail.codeDescription" : "verifyEmail.codeDescriptionSignup", { email: email.trim().toLowerCase() })} title={t("verifyEmail.codeTitle")} width="sm">
      <div className="flex w-full flex-col gap-6">
        <form onSubmit={verifyEmail}>
          <FieldGroup className="gap-4">
            <Field data-invalid={verificationError ? true : undefined}>
              <FieldLabel htmlFor="verification-code">{t("verifyEmail.codeLabel")}</FieldLabel>
              <InputOTP
                autoComplete="one-time-code"
                autoFocus
                containerClassName="justify-center"
                id="verification-code"
                maxLength={6}
                onChange={(value) => setVerificationCode(value.replace(/\D/g, "").slice(0, 6))}
                value={verificationCode}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((index) => <InputOTPSlot aria-invalid={verificationError ? true : undefined} className="size-12 text-lg" index={index} key={index} />)}
                </InputOTPGroup>
              </InputOTP>
            </Field>
            {verificationError ? <FieldError>{verificationError}</FieldError> : null}
            {resendStatus ? <p className="text-sm text-muted-foreground" role="status">{resendStatus}</p> : null}
            <Button className="mt-2 h-11 w-full" disabled={verificationCode.length !== 6 || resendLoading} loading={verificationLoading} loadingLabel={t("verifyEmail.verifying")} type="submit">{t("verifyEmail.verify")}</Button>
            {resendChallengeRequired && turnstileSiteKey ? <Turnstile key={resendTurnstileResetKey} onError={() => { setResendTurnstileToken(null); setVerificationError(t("errors.turnstileFailed")); }} onTokenChange={setResendTurnstileToken} siteKey={turnstileSiteKey} /> : null}
            <Button className="h-11 w-full" disabled={verificationLoading || Boolean(resendChallengeRequired && turnstileSiteKey && !resendTurnstileToken)} loading={resendLoading} loadingLabel={t("verifyEmail.resending")} onClick={() => void resendVerificationCode()} type="button" variant="outline">{t("verifyEmail.resend")}</Button>
          </FieldGroup>
        </form>
        {!login ? <p className="text-center text-sm text-muted-foreground">{t("verifyEmail.existingAccountHelp")} <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={authPath("/login")}>{t("signup.signIn")}</Link> {t("verifyEmail.or")} <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={localizePublicPath("/forgot-password", authLocale)}>{t("verifyEmail.resetPassword")}</Link>.</p> : null}
        <button className="text-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => { setVerificationPending(false); setVerificationCode(""); setVerificationError(null); setResendStatus(null); }} type="button">{t("verifyEmail.useDifferentEmail")}</button>
      </div>
    </ReplacementOnboardingShell>
  );
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
              <div className="flex items-center justify-between gap-3"><FieldLabel htmlFor="auth-password">{login ? t("login.password") : t("signup.password")}</FieldLabel>{login ? <Link className="text-xs font-medium text-muted-foreground hover:text-foreground" href={localizePublicPath("/forgot-password", authLocale)}>{t("login.forgotPassword")}</Link> : null}</div>
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
        <p className="text-center text-sm text-muted-foreground">{login ? t("login.noAccount") : t("signup.haveAccount")} <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={authPath(login ? "/signup" : "/login")}>{login ? t("login.createOne") : t("signup.signIn")}</Link></p>
      </div>
    </ReplacementOnboardingShell>
  );
}
