"use client";

import { readPublicAuthSession } from "@/lib/public-auth-session";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { ReplacementOnboardingShell } from "./replacement-onboarding-shell";
import { Button } from "./ui/button";

export function ConfirmEmailChangeSurface() {
  const { t } = useTranslation("auth");
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token")?.trim() ?? "");
    setEmail(params.get("email")?.trim().toLowerCase() ?? "");
    const sessionController = new AbortController();
    void readPublicAuthSession(sessionController.signal).then((session) => setIsAuthenticated(Boolean(session?.user))).catch(() => undefined);
    return () => sessionController.abort();
  }, []);

  const valid = token.length > 0 && email.length > 0;
  const description = valid ? t("confirmEmailChange.subtitle", { email }) : t("confirmEmailChange.invalidLink");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    if (!valid) { setErrorMessage(t("confirmEmailChange.invalidLink")); return; }
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { credentials: "include" });
      const result = await response.json();
      if (!response.ok || !result.status || typeof result.user?.email !== "string") throw new Error("Invalid confirmation");
      setStatusMessage(t("confirmEmailChange.success", { email: result.user.email }));
    } catch { setErrorMessage(t("confirmEmailChange.invalidLink")); }
    finally { setIsSubmitting(false); }
  }

  return <div className="ph-no-capture"><ReplacementOnboardingShell description={description} progress={null} title={t("confirmEmailChange.title")} width="sm"><div className="flex flex-col gap-6">
    {statusMessage ? <p className="text-center text-sm text-muted-foreground">{statusMessage}</p> : null}
    {errorMessage ? <p className="text-center text-sm text-destructive">{errorMessage}</p> : null}
    <form className="flex flex-col" onSubmit={submit}><Button className="h-11 w-full" disabled={!valid || isSubmitting || statusMessage !== null} type="submit">{isSubmitting ? t("confirmEmailChange.submitting") : t("confirmEmailChange.submit")}</Button></form>
    <p className="text-center text-sm"><Link className="font-medium text-foreground underline-offset-4 hover:underline" href={isAuthenticated ? "/settings/usage" : "/login"}>{isAuthenticated ? t("confirmEmailChange.backToSettings") : t("confirmEmailChange.backToLogin")}</Link></p>
  </div></ReplacementOnboardingShell></div>;
}
