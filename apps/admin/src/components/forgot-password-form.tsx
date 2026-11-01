"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { resolveLocale } from "@/lib/locale";
import { localizePublicPath } from "@/lib/locale-path";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { failedPasswordRequirements } from "@/lib/password-policy";

type ForgotPasswordFormProps = {
  className?: string;
  step: "request" | "verify";
  email: string;
  code: string;
  newPassword: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBackToRequest: () => void;
  /** Where "Back to sign in" goes. The dashboard's sign-in by default. */
  loginPath?: string | undefined;
};

export function ForgotPasswordForm({
  className,
  step,
  email,
  code,
  newPassword,
  isSubmitting,
  errorMessage,
  onEmailChange,
  onCodeChange,
  onNewPasswordChange,
  onSubmit,
  onBackToRequest,
  loginPath: givenLoginPath,
}: ForgotPasswordFormProps) {
  const { t, i18n } = useTranslation("auth");
  const loginPath = givenLoginPath ?? localizePublicPath("/login", resolveLocale(i18n?.resolvedLanguage, i18n?.language));
  const isVerifyStep = step === "verify";
  const [submitted, setSubmitted] = useState(false);
  const [hasBlurredEmail, setHasBlurredEmail] = useState(false);
  const [hasFocusedPassword, setHasFocusedPassword] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  // Each step is a fresh form: its problems show only after its first send attempt.
  useEffect(() => { setSubmitted(false); setHasBlurredEmail(false); setHasFocusedPassword(false); }, [step]);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordCriteria = (["minimumLength", "number", "specialCharacter"] as const).map((requirement) => ({
    label: t(`signup.passwordCriteria.${requirement}`),
    isMet: !failedPasswordRequirements(newPassword).includes(requirement),
  }));
  const emailError = !email.trim() ? (submitted ? "emailRequired" : null) : (submitted || hasBlurredEmail) && !isEmailValid ? "emailInvalid" : null;
  const codeError = submitted && !code.trim() ? "codeRequired" : null;
  const passwordError = submitted && !newPassword ? "passwordRequired" : null;
  const passwordInvalid = Boolean(passwordError) || (submitted && Boolean(newPassword) && passwordCriteria.some((criterion) => !criterion.isMet));
  const invalidInputClassName = "border-destructive text-destructive focus-visible:border-destructive focus-visible:ring-destructive/20";

  function submit(event: FormEvent<HTMLFormElement>) {
    setSubmitted(true);
    const invalidField = isVerifyStep
      ? !code.trim() ? codeInputRef : !newPassword || passwordCriteria.some((criterion) => !criterion.isMet) ? passwordInputRef : null
      : !isEmailValid ? emailInputRef : null;
    if (invalidField) {
      event.preventDefault();
      invalidField.current?.focus();
      return;
    }
    onSubmit(event);
  }

  return (
    <div className={cn("flex w-full flex-col gap-6", className)}>
      <form noValidate onSubmit={submit}>
        <FieldGroup className="gap-4">
          {isVerifyStep ? (
            <>
              <Field data-invalid={codeError ? true : undefined}>
                <FieldLabel htmlFor="reset-code">{t("forgotPassword.code")}</FieldLabel>
                <Input
                  id="reset-code"
                  aria-describedby={codeError ? "reset-code-error" : undefined}
                  aria-invalid={codeError ? true : undefined}
                  autoComplete="one-time-code"
                  className={cn("h-11", codeError && invalidInputClassName)}
                  inputMode="numeric"
                  onChange={(event) => onCodeChange(event.target.value)}
                  placeholder={t("forgotPassword.codePlaceholder")}
                  ref={codeInputRef}
                  required
                  type="text"
                  value={code}
                />
                {codeError ? <FieldError className="flex items-center gap-2 font-medium" id="reset-code-error"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{t(`forgotPassword.${codeError}`)}</span></FieldError> : null}
              </Field>

              <Field data-invalid={passwordInvalid ? true : undefined}>
                <FieldLabel htmlFor="reset-new-password">
                  {t("forgotPassword.newPassword")}
                </FieldLabel>
                <Input
                  id="reset-new-password"
                  aria-describedby={passwordError ? "reset-password-error" : passwordInvalid ? "reset-password-criteria" : undefined}
                  aria-invalid={passwordInvalid ? true : undefined}
                  autoComplete="new-password"
                  className={cn("h-11", passwordInvalid && invalidInputClassName)}
                  minLength={8}
                  onChange={(event) => onNewPasswordChange(event.target.value)}
                  onFocus={() => setHasFocusedPassword(true)}
                  ref={passwordInputRef}
                  required
                  type="password"
                  value={newPassword}
                />
                {passwordError ? <FieldError className="flex items-center gap-2 font-medium" id="reset-password-error"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{t(`forgotPassword.${passwordError}`)}</span></FieldError> : null}
                {hasFocusedPassword ? <ul aria-live="polite" className="flex flex-col gap-1 pt-0.5 text-sm font-medium" id="reset-password-criteria">{passwordCriteria.map((criterion) => <li className={cn("flex items-center gap-2", criterion.isMet ? "text-emerald-700" : passwordInvalid ? "text-destructive" : "text-muted-foreground")} key={criterion.label}><span aria-hidden="true" className="w-3 text-center">{criterion.isMet ? "✓" : "×"}</span><span>{criterion.label}</span></li>)}</ul> : null}
              </Field>
            </>
          ) : (
            <Field data-invalid={emailError ? true : undefined}>
              <FieldLabel htmlFor="reset-email">{t("forgotPassword.email")}</FieldLabel>
              <Input
                id="reset-email"
                aria-describedby={emailError ? "reset-email-error" : undefined}
                aria-invalid={emailError ? true : undefined}
                autoComplete="email"
                className={cn("h-11", emailError && invalidInputClassName)}
                onBlur={() => setHasBlurredEmail(true)}
                onChange={(event) => { setHasBlurredEmail(false); onEmailChange(event.target.value); }}
                placeholder={t("forgotPassword.emailPlaceholder")}
                ref={emailInputRef}
                required
                type="email"
                value={email}
              />
              {emailError ? <FieldError className="flex items-center gap-2 font-medium" id="reset-email-error"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{t(`forgotPassword.${emailError}`)}</span></FieldError> : null}
            </Field>
          )}

          {errorMessage ? (
            <div className="flex flex-col gap-2 -mt-1">
              <FieldError>{errorMessage}</FieldError>
            </div>
          ) : null}

          <div className="mt-2 flex flex-col gap-3">
            <Button
              className="h-11 w-full"
              loading={isSubmitting}
              loadingLabel={
                isVerifyStep
                  ? t("forgotPassword.verifySubmitting")
                  : t("forgotPassword.submitting")
              }
              type="submit"
            >
              {isVerifyStep ? t("forgotPassword.verifySubmit") : t("forgotPassword.submit")}
            </Button>

            {isVerifyStep ? (
              <Button
                className="h-11 w-full"
                disabled={isSubmitting}
                onClick={onBackToRequest}
                type="button"
                variant="outline"
              >
                {t("forgotPassword.back")}
              </Button>
            ) : null}
          </div>
        </FieldGroup>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={loginPath}>
          {t("forgotPassword.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
