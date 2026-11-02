"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, TriangleAlert } from "lucide-react";

import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Turnstile } from "@/components/turnstile";
import { recordAuthSuccess } from "@/lib/auth-success-analytics";
import { takeInvitedEmail } from "@/lib/invited-email";
import { resolveLocale } from "@/lib/locale";
import { localizePublicPath } from "@/lib/locale-path";
import { cn } from "@/lib/utils";
import { captureAffiliateReferralFromUrl, getAffiliateVisitorId } from "@/lib/affiliate-referral";

import { buildAuthPathWithReturnTo, buildPartnerAuthPath, getSafeReturnTo } from "@/lib/auth-return-to";
import googleIcon from "@iconify-icons/logos/google-icon";
import { Icon } from "@iconify/react/offline";

function GoogleLogo() {
  return <Icon aria-hidden="true" icon={googleIcon} id="google-logo" ssr />;
}

/** White Label's own sign-in and sign-up: they link to each other and land back in the partner console. */
export type PartnerAuth = { returnTo: string };

export function AuthCard({ mode, google = false, passkey = false, partner }: { mode: "login" | "signup"; google?: boolean; passkey?: boolean; partner?: PartnerAuth | undefined }) {
  const router = useRouter();
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const { t, i18n } = useTranslation("auth");
  const authLocale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [signupSource, setSignupSource] = useState<"calculator" | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(getSafeReturnTo(params.get("returnTo")) ?? partner?.returnTo ?? null);
    setSignupSource(params.get("source") === "calculator" ? "calculator" : null);
    // Better Auth sends a failed Google sign-in back here with ?error=.
    const googleFailure = params.get("error");
    if (googleFailure) setGoogleError(googleFailure === "account_not_linked" ? "errors.googleAccountNotLinked" : "errors.googleFailed");
  }, [partner?.returnTo]);
  // A White Label visitor who resets their password comes back to the partner console, not the dashboard.
  const forgotPasswordPath = partner ? `${localizePublicPath("/forgot-password", authLocale)}?returnTo=${encodeURIComponent(getSafeReturnTo(returnTo) ?? partner.returnTo)}` : localizePublicPath("/forgot-password", authLocale);
  function authPath(path: "/login" | "/signup") {
    if (partner) return buildPartnerAuthPath(path, returnTo);
    const target = buildAuthPathWithReturnTo(path, returnTo, authLocale);
    return signupSource ? `${target}${target.includes("?") ? "&" : "?"}source=${signupSource}` : target;
  }
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
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
  const [submitted, setSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const pendingChallengeSubmit = useRef(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const autoGoogleStarted = useRef(false);
  const login = mode === "login";
  // Passkeys are for signing in; a new account has none yet. A partner's host offers email and password only.
  const offerPasskey = login && passkey && !partner;

  // The marketing site's "Sign up with Google" button links here with
  // ?provider=google, since Google sign-in has to start from this origin.
  useEffect(() => {
    if (!google || autoGoogleStarted.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("provider") !== "google" || params.get("error")) return;
    autoGoogleStarted.current = true;
    void continueWithGoogle();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on arrival
  }, [google]);

  // An invitation's accept page leaves the address it was sent to.
  useEffect(() => {
    const invited = takeInvitedEmail();
    if (invited) setEmail((current) => current || invited);
  }, []);

  useEffect(() => {
    if (mode !== "login") return;
    try {
      const saved = sessionStorage.getItem("auth-verification-recovery");
      sessionStorage.removeItem("auth-verification-recovery");
      if (!saved) return;
      const recovery = JSON.parse(saved) as { email?: unknown; expires?: number };
      if (typeof recovery.email === "string" && (recovery.expires ?? 0) > Date.now()) {
        setEmail(recovery.email);
        setError(t("errors.verificationSignInFailed"));
      }
    } catch { /* Storage can be unavailable; the login form still works. */ }
  }, [mode, t]);

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

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitted(true);
    if (!isEmailValid || !password || isPasswordWeak) {
      (isEmailValid ? passwordInputRef : emailInputRef).current?.focus();
      return;
    }
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

  async function continueWithGoogle() {
    setGoogleError(null);
    setGoogleLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
      for (const stale of ["google", "provider", "error", "error_description"]) params.delete(stale);
      // Google returns to this page with every query param (returnTo, source, plan). The marker
      // tells GuestAuthCard which event to record; Better Auth picks the signup one for new users.
      const back = (marker?: "login" | "signup") => {
        const query = new URLSearchParams(params);
        if (marker) query.set("google", marker);
        return `${window.location.pathname}?${query}`;
      };
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: back("login"), newUserCallbackURL: back("signup"), errorCallbackURL: back(), additionalData: { preferredLocale: authLocale } }),
      });
      const result = response.ok ? await response.json() as { url?: unknown } : null;
      if (typeof result?.url !== "string") throw new Error("Google sign-in did not start.");
      window.location.assign(result.url);
    } catch {
      setGoogleError("errors.googleFailed");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function signInWithPasskey(autoFill = false) {
    if (!autoFill) { setPasskeyError(null); setPasskeyLoading(true); }
    try {
      const { authClient } = await import("@/lib/auth-client");
      const result = await authClient.signIn.passkey(autoFill ? { autoFill: true } : undefined);
      if (result?.error) {
        // Closing the browser's prompt, or a newer prompt replacing it, is not a failure to report.
        const code = String((result.error as { code?: unknown }).code);
        if (autoFill || ["AUTH_CANCELLED", "ERROR_CEREMONY_ABORTED"].includes(code)) return;
        // The browser throws "not allowed" when the person closes its prompt, it times out, or no passkey exists for this site.
        // The browser refuses a passkey for another address than the one it was made for, such as a tunnel's.
        setPasskeyError(code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" ? "errors.passkeyNotChosen" : code === "ERROR_INVALID_RP_ID" ? "errors.passkeyWrongAddress" : "errors.passkeyFailed");
        return;
      }
      finishAuthentication("passkey");
    } catch {
      if (!autoFill) setPasskeyError("errors.passkeyFailed");
    } finally {
      if (!autoFill) setPasskeyLoading(false);
    }
  }

  // Lets the browser offer a saved passkey in the email field's suggestions.
  useEffect(() => {
    if (!offerPasskey) return;
    let active = true;
    void (async () => {
      const available = await window.PublicKeyCredential?.isConditionalMediationAvailable?.().catch(() => false);
      if (active && available) await signInWithPasskey(true);
    })();
    return () => { active = false; };
  }, [offerPasskey]);

  function finishAuthentication(method: "email" | "passkey" = "email") {
    const event = login ? "web.auth.login_succeeded" : "web.auth.signup_succeeded";
    recordAuthSuccess(event, { method, ...(signupSource ? { source: signupSource } : {}) });
    const safeReturnTo = getSafeReturnTo(new URLSearchParams(window.location.search).get("returnTo")) ?? partner?.returnTo ?? "/";
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

  async function verifyEmail(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verificationCode.length !== 6 || verificationLoading || resendLoading) return;
    setVerificationError(null);
    setVerificationLoading(true);
    let verified = false;
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
      verified = true;
      const signInResponse = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (!signInResponse.ok) throw new Error(t("errors.verificationSignInFailed"));
      finishAuthentication();
    } catch (cause) {
      if (verified) {
        if (login) {
          setVerificationPending(false);
          setVerificationLoading(false);
          setPassword("");
          setError(t("errors.verificationSignInFailed"));
        } else {
          try {
            sessionStorage.setItem("auth-verification-recovery", JSON.stringify({ email: email.trim().toLowerCase(), expires: Date.now() + 10 * 60_000 }));
          } catch { /* Navigation must work even when storage is blocked. */ }
          router.replace(authPath("/login"));
        }
      } else {
        setVerificationError(cause instanceof Error ? cause.message : t("errors.invalidVerificationCode"));
        setVerificationLoading(false);
      }
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

  if (verificationPending) return (
    <ReplacementOnboardingShell description={t(login ? "verifyEmail.codeDescription" : "verifyEmail.codeDescriptionSignup", { email: email.trim().toLowerCase() })} title={t("verifyEmail.codeTitle")} width="sm">
      <div className="flex w-full flex-col gap-6">
        <form onSubmit={verifyEmail}>
          <FieldGroup className="gap-4">
            <Field data-invalid={verificationError ? true : undefined}>
              <FieldLabel htmlFor="verification-code">{t("verifyEmail.codeLabel")}</FieldLabel>
              <InputOTP
                disabled={verificationLoading}
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
        {!login ? <p className="text-center text-sm text-muted-foreground">{t("verifyEmail.existingAccountHelp")} <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={authPath("/login")}>{t("signup.signIn")}</Link> {t("verifyEmail.or")} <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={forgotPasswordPath}>{t("verifyEmail.resetPassword")}</Link>.</p> : null}
        <button disabled={verificationLoading} className="text-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => { setVerificationPending(false); setVerificationCode(""); setVerificationError(null); setResendStatus(null); }} type="button">{t("verifyEmail.useDifferentEmail")}</button>
      </div>
    </ReplacementOnboardingShell>
  );
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordCriteria = [
    { label: t("signup.passwordCriteria.minimumLength"), isMet: password.length >= 8 },
    { label: t("signup.passwordCriteria.number"), isMet: /\d/.test(password) },
    { label: t("signup.passwordCriteria.specialCharacter"), isMet: /[^A-Za-z0-9\s]/.test(password) },
  ];
  const isPasswordWeak = !login && !passwordCriteria.every((criterion) => criterion.isMet);
  const emailError = !email.trim() ? (submitted ? "emailRequired" : null) : (submitted || hasBlurredEmail) && !isEmailValid ? "emailInvalid" : null;
  const passwordError = submitted && !password ? "passwordRequired" : null;
  const passwordInvalid = Boolean(passwordError) || (submitted && Boolean(password) && isPasswordWeak);
  const invalidInputClassName = "border-destructive text-destructive focus-visible:border-destructive focus-visible:ring-destructive/20";
  return (
    <ReplacementOnboardingShell {...(partner ? { eyebrow: t("partner.eyebrow") } : {})} legalAgreement={login ? "login" : "signup"} progress={login || partner ? null : { current: 1, total: 9 }} title={login ? t("login.title") : t("signup.title")} width="sm">
      <div className="flex w-full flex-col gap-6">
        {google || offerPasskey ? <>
          <div className="flex flex-col gap-2">
            {google ? <Button className="h-11 w-full" loading={googleLoading} loadingLabel={t("google.redirecting")} onClick={() => void continueWithGoogle()} type="button" variant="outline"><GoogleLogo />{t("google.continue")}</Button> : null}
            {offerPasskey ? <Button className="h-11 w-full" loading={passkeyLoading} loadingLabel={t("passkey.waiting")} onClick={() => void signInWithPasskey()} type="button" variant="outline"><KeyRound />{t("passkey.signIn")}</Button> : null}
            {googleError ? <FieldError>{t(googleError)}</FieldError> : null}
            {passkeyError ? <FieldError>{t(passkeyError)}</FieldError> : null}
          </div>
          <FieldSeparator>{t("google.or")}</FieldSeparator>
        </> : null}
        <form noValidate onSubmit={submit}>
          <FieldGroup className="gap-4">
            <Field data-invalid={emailError ? true : undefined}><FieldLabel htmlFor="auth-email">{login ? t("login.email") : t("signup.email")}</FieldLabel><Input aria-describedby={emailError ? "auth-email-error" : undefined} aria-invalid={emailError ? true : undefined} autoComplete={offerPasskey ? "username webauthn" : "email"} className={cn("h-11", emailError && invalidInputClassName)} id="auth-email" onBlur={() => setHasBlurredEmail(true)} onChange={(event) => { setHasBlurredEmail(false); setEmail(event.target.value); }} placeholder={login ? t("login.emailPlaceholder") : t("signup.emailPlaceholder")} ref={emailInputRef} required type="email" value={email} />{emailError ? <FieldError className="flex items-center gap-2 font-medium" id="auth-email-error"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{t(`${login ? "login" : "signup"}.${emailError}`)}</span></FieldError> : null}</Field>
            <Field data-invalid={passwordInvalid ? true : undefined}>
              <div className="flex items-center justify-between gap-3"><FieldLabel htmlFor="auth-password">{login ? t("login.password") : t("signup.password")}</FieldLabel>{login ? <Link className="text-xs font-medium text-muted-foreground hover:text-foreground" href={forgotPasswordPath}>{t("login.forgotPassword")}</Link> : null}</div>
              <Input aria-describedby={passwordError ? "auth-password-error" : passwordInvalid ? "auth-password-criteria" : undefined} aria-invalid={passwordInvalid ? true : undefined} autoComplete={login ? "current-password" : "new-password"} className={cn("h-11", passwordInvalid && invalidInputClassName)} id="auth-password" minLength={8} onChange={(event) => setPassword(event.target.value)} onFocus={() => setHasFocusedPassword(true)} ref={passwordInputRef} required type="password" value={password} />
              {passwordError ? <FieldError className="flex items-center gap-2 font-medium" id="auth-password-error"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{t(`${login ? "login" : "signup"}.${passwordError}`)}</span></FieldError> : null}
              {!login && hasFocusedPassword ? <ul aria-live="polite" className="flex flex-col gap-1 pt-0.5 text-sm font-medium" id="auth-password-criteria">{passwordCriteria.map((criterion) => <li className={cn("flex items-center gap-2", criterion.isMet ? "text-emerald-700" : passwordInvalid ? "text-destructive" : "text-muted-foreground")} key={criterion.label}><span aria-hidden="true" className="w-3 text-center">{criterion.isMet ? "✓" : "×"}</span><span>{criterion.label}</span></li>)}</ul> : null}
            </Field>
            {error ? <div className="flex flex-col gap-2 -mt-1"><FieldError>{error}</FieldError></div> : null}
            <Button className="mt-2 h-11 w-full" loading={loading} loadingLabel={login ? t("login.submitting") : t("signup.submitting")} type="submit">{login ? t("login.submit") : t("signup.submit")}</Button>
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
