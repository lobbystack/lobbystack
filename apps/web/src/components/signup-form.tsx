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

type SignupFormProps = {
  className?: string;
  email: string;
  password: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  statusMessage: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function SignupForm({
  className,
  email,
  password,
  isSubmitting,
  errorMessage,
  statusMessage,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: SignupFormProps) {
  const { t } = useTranslation("auth");

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Rows3 className="size-5" />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="type-section-title">{t("signup.title")}</h1>
              <FieldDescription>{t("signup.subtitle")}</FieldDescription>
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor="signup-email">{t("signup.email")}</FieldLabel>
            <Input
              id="signup-email"
              autoComplete="email"
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder={t("signup.emailPlaceholder")}
              required
              type="email"
              value={email}
            />
          </Field>

          <div className="flex flex-col gap-6">
            <Field>
              <FieldLabel htmlFor="signup-password">{t("signup.password")}</FieldLabel>
              <Input
                id="signup-password"
                autoComplete="new-password"
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder={t("signup.passwordPlaceholder")}
                required
                type="password"
                value={password}
              />
            </Field>

            {statusMessage || errorMessage ? (
              <div className="flex flex-col gap-2">
                {statusMessage ? <FieldDescription>{statusMessage}</FieldDescription> : null}
                {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
              </div>
            ) : (
              <div aria-hidden="true" className="h-8" />
            )}

            <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
              {isSubmitting ? t("signup.submitting") : t("signup.submit")}
            </Button>
          </div>
        </FieldGroup>
      </form>

      <FieldDescription className="text-center">
        {t("signup.haveAccount")}{" "}
        <Link className="font-medium text-foreground underline underline-offset-4" to="/login">
          {t("signup.signIn")}
        </Link>
      </FieldDescription>
    </div>
  );
}
