"use client";

import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Rows3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type ForgotPasswordFormProps = {
  className?: string;
  step: "request" | "verify";
  email: string;
  code: string;
  newPassword: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  statusMessage: string | null;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBackToRequest: () => void;
};

export function ForgotPasswordForm({
  className,
  step,
  email,
  code,
  newPassword,
  isSubmitting,
  errorMessage,
  statusMessage,
  onEmailChange,
  onCodeChange,
  onNewPasswordChange,
  onSubmit,
  onBackToRequest,
}: ForgotPasswordFormProps) {
  const { t } = useTranslation("auth");
  const isVerifyStep = step === "verify";

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Rows3 className="size-5" />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {isVerifyStep ? t("forgotPassword.verifyTitle") : t("forgotPassword.title")}
              </h1>
              <FieldDescription>
                {isVerifyStep
                  ? t("forgotPassword.verifySubtitle", { email })
                  : t("forgotPassword.subtitle")}
              </FieldDescription>
            </div>
          </div>

          {isVerifyStep ? (
            <>
              <Field>
                <FieldLabel htmlFor="reset-code">{t("forgotPassword.code")}</FieldLabel>
                <Input
                  id="reset-code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  onChange={(event) => onCodeChange(event.target.value)}
                  placeholder={t("forgotPassword.codePlaceholder")}
                  required
                  type="text"
                  value={code}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="reset-new-password">
                  {t("forgotPassword.newPassword")}
                </FieldLabel>
                <Input
                  id="reset-new-password"
                  autoComplete="new-password"
                  onChange={(event) => onNewPasswordChange(event.target.value)}
                  placeholder={t("forgotPassword.newPasswordPlaceholder")}
                  required
                  type="password"
                  value={newPassword}
                />
              </Field>
            </>
          ) : (
            <Field>
              <FieldLabel htmlFor="reset-email">{t("forgotPassword.email")}</FieldLabel>
              <Input
                id="reset-email"
                autoComplete="email"
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder={t("forgotPassword.emailPlaceholder")}
                required
                type="email"
                value={email}
              />
            </Field>
          )}

          <div className="flex flex-col gap-6">
            {statusMessage || errorMessage ? (
              <div className="flex flex-col gap-2">
                {statusMessage ? <FieldDescription>{statusMessage}</FieldDescription> : null}
                {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
              </div>
            ) : (
              <div aria-hidden="true" className="h-8" />
            )}

            <div className="flex flex-col gap-3">
              <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
                {isSubmitting
                  ? isVerifyStep
                    ? t("forgotPassword.verifySubmitting")
                    : t("forgotPassword.submitting")
                  : isVerifyStep
                    ? t("forgotPassword.verifySubmit")
                    : t("forgotPassword.submit")}
              </Button>

              {isVerifyStep ? (
                <Button
                  className="w-full"
                  disabled={isSubmitting}
                  onClick={onBackToRequest}
                  type="button"
                  variant="outline"
                >
                  {t("forgotPassword.back")}
                </Button>
              ) : null}
            </div>
          </div>
        </FieldGroup>
      </form>

      <FieldDescription className="text-center">
        <Link className="font-medium text-foreground underline underline-offset-4" to="/login">
          {t("forgotPassword.backToLogin")}
        </Link>
      </FieldDescription>
    </div>
  );
}
