"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, TriangleAlert, X } from "lucide-react";
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
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { failedPasswordRequirements } from "@/lib/password-policy";

// Better Auth's email OTP default, which the server leaves unchanged.
const RESET_CODE_LENGTH = 6;

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
  // Each step is a fresh form: its problems show only after its first send attempt. These are keyed by step, not reset in an effect, so the next step never renders once with the last step's flags.
  const [submittedStep, setSubmittedStep] = useState<typeof step | null>(null);
  const [blurredEmailStep, setBlurredEmailStep] = useState<typeof step | null>(null);
  const [focusedPasswordStep, setFocusedPasswordStep] = useState<typeof step | null>(null);
  const submitted = submittedStep === step;
  const hasBlurredEmail = blurredEmailStep === step;
  const hasFocusedPassword = focusedPasswordStep === step;
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (step === "verify") codeInputRef.current?.focus(); }, [step]);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordCriteria = (["minimumLength", "number", "specialCharacter"] as const).map((requirement) => ({
    label: t(`signup.passwordCriteria.${requirement}`),
    isMet: !failedPasswordRequirements(newPassword).includes(requirement),
  }));
  const emailError = !email.trim() ? (submitted ? "emailRequired" : null) : (submitted || hasBlurredEmail) && !isEmailValid ? "emailInvalid" : null;
  const codeError = submitted && code.length !== RESET_CODE_LENGTH ? "codeRequired" : null;
  const passwordError = submitted && !newPassword ? "passwordRequired" : null;
  const passwordInvalid = Boolean(passwordError) || (submitted && Boolean(newPassword) && passwordCriteria.some((criterion) => !criterion.isMet));
  const invalidInputClassName = "border-destructive text-destructive focus-visible:border-destructive focus-visible:ring-destructive/20";

  function submit(event: FormEvent<HTMLFormElement>) {
    setSubmittedStep(step);
    const invalidField = isVerifyStep
      ? code.length !== RESET_CODE_LENGTH ? codeInputRef : !newPassword || passwordCriteria.some((criterion) => !criterion.isMet) ? passwordInputRef : null
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
                <InputOTP
                  id="reset-code"
                  aria-describedby={codeError ? "reset-code-error" : undefined}
                  autoComplete="one-time-code"
                  containerClassName="w-full"
                  disabled={isSubmitting}
                  maxLength={RESET_CODE_LENGTH}
                  onChange={(value) => onCodeChange(value.replace(/\D/g, "").slice(0, RESET_CODE_LENGTH))}
                  ref={codeInputRef}
                  value={code}
                >
                  <InputOTPGroup className="w-full">
                    {Array.from({ length: RESET_CODE_LENGTH }, (_, index) => <InputOTPSlot aria-invalid={codeError ? true : undefined} className="size-auto h-12 flex-1 text-lg" index={index} key={index} />)}
                  </InputOTPGroup>
                </InputOTP>
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
                  onFocus={() => setFocusedPasswordStep(step)}
                  ref={passwordInputRef}
                  required
                  type="password"
                  value={newPassword}
                />
                {passwordError ? <FieldError className="flex items-center gap-2 font-medium" id="reset-password-error"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{t(`forgotPassword.${passwordError}`)}</span></FieldError> : null}
                {hasFocusedPassword ? <ul aria-live="polite" className="flex flex-col gap-1 pt-0.5 text-sm font-medium" id="reset-password-criteria">{passwordCriteria.map((criterion) => <li className={cn("flex items-center gap-2", criterion.isMet ? "text-emerald-700 dark:text-emerald-400" : passwordInvalid ? "text-destructive" : "text-muted-foreground")} key={criterion.label}>{criterion.isMet ? <Check className="size-4 shrink-0" aria-hidden="true" /> : <X className="size-4 shrink-0" aria-hidden="true" />}<span>{criterion.label}</span></li>)}</ul> : null}
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
                onBlur={() => setBlurredEmailStep(step)}
                onChange={(event) => { setBlurredEmailStep(null); onEmailChange(event.target.value); }}
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
