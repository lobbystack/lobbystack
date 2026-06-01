"use client";

import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
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
  onEmailChange,
  onCodeChange,
  onNewPasswordChange,
  onSubmit,
  onBackToRequest,
}: ForgotPasswordFormProps) {
  const { t } = useTranslation("auth");
  const isVerifyStep = step === "verify";

  return (
    <div className={cn("flex w-full flex-col gap-6", className)}>
      <form onSubmit={onSubmit}>
        <FieldGroup className="gap-4">
          {isVerifyStep ? (
            <>
              <Field>
                <FieldLabel htmlFor="reset-code">{t("forgotPassword.code")}</FieldLabel>
                <Input
                  id="reset-code"
                  autoComplete="one-time-code"
                  className="h-11"
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
                  className="h-11"
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
                className="h-11"
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder={t("forgotPassword.emailPlaceholder")}
                required
                type="email"
                value={email}
              />
            </Field>
          )}

          {errorMessage ? (
            <div className="flex flex-col gap-2 -mt-1">
              <FieldError>{errorMessage}</FieldError>
            </div>
          ) : null}

          <div className="mt-2 flex flex-col gap-3">
            <Button className="h-11 w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  <span className="sr-only">
                    {isVerifyStep
                      ? t("forgotPassword.verifySubmitting")
                      : t("forgotPassword.submitting")}
                  </span>
                </>
              ) : isVerifyStep ? (
                t("forgotPassword.verifySubmit")
              ) : (
                t("forgotPassword.submit")
              )}
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
        <Link className="font-medium text-foreground underline-offset-4 hover:underline" to="/login">
          {t("forgotPassword.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
