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

type LoginFormProps = {
  className?: string;
  email: string;
  password: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function LoginForm({
  className,
  email,
  password,
  isSubmitting,
  errorMessage,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginFormProps) {
  const { t } = useTranslation("auth");

  return (
    <div className={cn("flex w-full flex-col gap-6", className)}>
      <form onSubmit={onSubmit}>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="login-email">{t("login.email")}</FieldLabel>
            <Input
              id="login-email"
              autoComplete="email"
              className="h-11"
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder={t("login.emailPlaceholder")}
              required
              type="email"
              value={email}
            />
          </Field>

          <Field>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor="login-password">{t("login.password")}</FieldLabel>
              <Link
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
                to="/forgot-password"
              >
                {t("login.forgotPassword")}
              </Link>
            </div>
            <Input
              id="login-password"
              autoComplete="current-password"
              className="h-11"
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder={t("login.passwordPlaceholder")}
              required
              type="password"
              value={password}
            />
          </Field>

          {errorMessage ? (
            <div className="flex flex-col gap-2 -mt-1">
              <FieldError>{errorMessage}</FieldError>
            </div>
          ) : null}

          <Button className="mt-2 h-11 w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                <span className="sr-only">{t("login.submitting")}</span>
              </>
            ) : (
              t("login.submit")
            )}
          </Button>
        </FieldGroup>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t("login.noAccount")}{" "}
        <Link className="font-medium text-foreground underline-offset-4 hover:underline" to="/signup">
          {t("login.createOne")}
        </Link>
      </p>
    </div>
  );
}
