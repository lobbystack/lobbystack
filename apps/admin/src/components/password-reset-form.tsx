"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ReplacementOnboardingShell } from "./replacement-onboarding-shell";
import { Button } from "./ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { meetsPasswordRequirements } from "@/lib/password-policy";

// Compatibility for reset links issued before the original email-code flow was restored.
export function PasswordResetForm({ token }: { token: string | null }) {
  const { t } = useTranslation("auth");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(token ? null : "invalidResetCode");
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (!meetsPasswordRequirements(password)) { setError("invalidPassword"); return; }
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword: password, token }),
      });
      if (!response.ok) { setError("invalidResetCode"); return; }
      setComplete(true);
    } catch { setError("passwordResetFailed"); }
    finally { setLoading(false); }
  }

  return <ReplacementOnboardingShell title={t("forgotPassword.newPassword")} description={complete ? t("forgotPassword.resetComplete") : undefined} progress={null} width="sm">
    <div className="flex w-full flex-col gap-6">
      {!complete ? <form onSubmit={submit}><FieldGroup className="gap-4">
        <Field><FieldLabel htmlFor="reset-new-password">{t("forgotPassword.newPassword")}</FieldLabel><Input autoComplete="new-password" className="h-11" id="reset-new-password" onChange={event => setPassword(event.target.value)} placeholder={t("forgotPassword.newPasswordPlaceholder")} required type="password" value={password} /></Field>
        {error ? <div className="-mt-1 flex flex-col gap-2"><FieldError>{t(`errors.${error}`)}</FieldError></div> : null}
        <div className="mt-2"><Button className="h-11 w-full" disabled={!token} loading={loading} loadingLabel={t("forgotPassword.verifySubmitting")} type="submit">{t("forgotPassword.verifySubmit")}</Button></div>
      </FieldGroup></form> : null}
      <p className="text-center text-sm text-muted-foreground"><Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/login">{t("forgotPassword.backToLogin")}</Link></p>
    </div>
  </ReplacementOnboardingShell>;
}
