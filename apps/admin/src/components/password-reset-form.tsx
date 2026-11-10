"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ReplacementOnboardingShell } from "./replacement-onboarding-shell";
import { Button } from "./ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { failedPasswordRequirements } from "@/lib/password-policy";
import { cn } from "@/lib/utils";
import { resolveLocale } from "@/lib/locale";
import { localizePublicPath } from "@/lib/locale-path";

// Compatibility for reset links issued before the original email-code flow was restored.
export function PasswordResetForm({ token }: { token: string | null }) {
  const { t, i18n } = useTranslation("auth");
  const loginPath = localizePublicPath("/login", resolveLocale(i18n.resolvedLanguage, i18n.language));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(token ? null : "invalidResetCode");
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hasFocusedPassword, setHasFocusedPassword] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const failed = failedPasswordRequirements(password);
  const passwordCriteria = (["minimumLength", "number", "specialCharacter"] as const).map((requirement) => ({ label: t(`signup.passwordCriteria.${requirement}`), isMet: !failed.includes(requirement) }));
  const passwordError = submitted && !password ? "passwordRequired" : null;
  const passwordInvalid = Boolean(passwordError) || (submitted && failed.length > 0);
  const invalidInputClassName = "border-destructive text-destructive focus-visible:border-destructive focus-visible:ring-destructive/20";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSubmitted(true);
    if (failed.length > 0) { passwordInputRef.current?.focus(); return; }
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
      {!complete ? <form noValidate onSubmit={submit}><FieldGroup className="gap-4">
        <Field data-invalid={passwordInvalid ? true : undefined}>
          <FieldLabel htmlFor="reset-new-password">{t("forgotPassword.newPassword")}</FieldLabel>
          <Input aria-describedby={passwordError ? "reset-password-error" : passwordInvalid ? "reset-password-criteria" : undefined} aria-invalid={passwordInvalid ? true : undefined} autoComplete="new-password" className={cn("h-11", passwordInvalid && invalidInputClassName)} id="reset-new-password" minLength={8} onChange={event => setPassword(event.target.value)} onFocus={() => setHasFocusedPassword(true)} ref={passwordInputRef} required type="password" value={password} />
          {passwordError ? <FieldError className="flex items-center gap-2 font-medium" id="reset-password-error"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{t(`forgotPassword.${passwordError}`)}</span></FieldError> : null}
          {hasFocusedPassword ? <ul aria-live="polite" className="flex flex-col gap-1 pt-0.5 text-sm font-medium" id="reset-password-criteria">{passwordCriteria.map((criterion) => <li className={cn("flex items-center gap-2", criterion.isMet ? "text-emerald-700 dark:text-emerald-400" : passwordInvalid ? "text-destructive" : "text-muted-foreground")} key={criterion.label}>{criterion.isMet ? <Check className="size-4 shrink-0" aria-hidden="true" /> : <X className="size-4 shrink-0" aria-hidden="true" />}<span>{criterion.label}</span></li>)}</ul> : null}
        </Field>
        {error ? <div className="-mt-1 flex flex-col gap-2"><FieldError>{t(`errors.${error}`)}</FieldError></div> : null}
        <div className="mt-2"><Button className="w-full" disabled={!token} loading={loading} loadingLabel={t("forgotPassword.verifySubmitting")} type="submit">{t("forgotPassword.verifySubmit")}</Button></div>
      </FieldGroup></form> : null}
      <p className="text-center text-sm text-muted-foreground"><Link className="font-medium text-foreground underline-offset-4 hover:underline" href={loginPath}>{t("forgotPassword.backToLogin")}</Link></p>
    </div>
  </ReplacementOnboardingShell>;
}
