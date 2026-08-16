"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";

import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { captureAffiliateReferralFromUrl, getAffiliateVisitorId } from "@/lib/affiliate-referral";

declare global {
  interface Window {
    turnstile?: {
      render(element: HTMLElement, options: { sitekey: string; callback(token: string): void; "expired-callback"(): void; "error-callback"(): void }): string;
      reset(widgetId?: string): void;
    };
  }
}

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function AuthCard({ mode }: { mode: "login" | "signup" }) {
  const { t } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  function renderTurnstile() {
    if (mode !== "signup" || !turnstileSiteKey || !turnstileRef.current || !window.turnstile || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: turnstileSiteKey,
      callback: setTurnstileToken,
      "expired-callback": () => setTurnstileToken(null),
      "error-callback": () => setTurnstileToken(null),
    });
  }

  useEffect(() => () => {
    if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
  }, []);

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
    if (mode === "signup" && turnstileSiteKey && !turnstileToken) {
      setError(t("errors.turnstileFailed"));
      return;
    }
    setLoading(true);
    try {
      const body = mode === "login" ? { email, password } : { name: email.split("@")[0] || email, email, password, ...(turnstileToken ? { turnstileToken } : {}) };
      const response = await fetch(`/api/auth/${mode === "login" ? "sign-in/email" : "sign-up/email"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(mode === "login" ? t("errors.incorrectCredentials") : t("errors.signupFailed"));
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.signupFailed"));
    } finally {
      setLoading(false);
    }
  }

  const login = mode === "login";
  return (
    <>
      {!login && turnstileSiteKey ? <Script onLoad={renderTurnstile} src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" /> : null}
      <ReplacementOnboardingShell progress={null} title={login ? t("login.title") : t("signup.title")} width="sm">
        <form onSubmit={submit}>
          <FieldGroup className="gap-4">
            <Field><FieldLabel htmlFor="auth-email">{login ? t("login.email") : t("signup.email")}</FieldLabel><Input autoComplete="email" className="h-11" id="auth-email" onChange={(event) => setEmail(event.target.value)} placeholder={login ? t("login.emailPlaceholder") : t("signup.emailPlaceholder")} required type="email" value={email} /></Field>
            <Field>
              <div className="flex items-center justify-between gap-3"><FieldLabel htmlFor="auth-password">{login ? t("login.password") : t("signup.password")}</FieldLabel>{login ? <Link className="text-xs font-medium text-muted-foreground hover:text-foreground" href="/forgot-password">{t("login.forgotPassword")}</Link> : null}</div>
              <Input autoComplete={login ? "current-password" : "new-password"} className="h-11" id="auth-password" minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder={login ? t("login.passwordPlaceholder") : t("signup.passwordPlaceholder")} required type="password" value={password} />
            </Field>
            {!login && turnstileSiteKey ? <div aria-label="Security verification" ref={turnstileRef} /> : null}
            {error ? <FieldError className="flex items-center gap-2 font-medium"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{error}</span></FieldError> : null}
            <Button className="mt-2 h-11 w-full" loading={loading} loadingLabel={login ? t("login.submitting") : t("signup.submitting")} type="submit">{login ? t("login.submit") : t("signup.submit")}</Button>
          </FieldGroup>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">{login ? t("login.noAccount") : t("signup.haveAccount")} <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={login ? "/signup" : "/login"}>{login ? t("login.createOne") : t("signup.signIn")}</Link></p>
      </ReplacementOnboardingShell>
    </>
  );
}
