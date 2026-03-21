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

type LoginFormProps = {
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

export function LoginForm({
  className,
  email,
  password,
  isSubmitting,
  errorMessage,
  statusMessage,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginFormProps) {
  const { t } = useTranslation("auth");

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Rows3 className="size-5" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold tracking-tight">{t("login.title")}</h1>
              <FieldDescription>{t("login.subtitle")}</FieldDescription>
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor="login-email">{t("login.email")}</FieldLabel>
            <Input
              id="login-email"
              autoComplete="email"
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder={t("login.emailPlaceholder")}
              required
              type="email"
              value={email}
            />
          </Field>

          <div>
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="login-password">{t("login.password")}</FieldLabel>
                <Link
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                  to="/forgot-password"
                >
                  {t("login.forgotPassword")}
                </Link>
              </div>
              <Input
                id="login-password"
                autoComplete="current-password"
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder={t("login.passwordPlaceholder")}
                required
                type="password"
                value={password}
              />
            </Field>

            {statusMessage || errorMessage ? (
              <div className="mb-6 mt-2 space-y-2">
                {statusMessage ? <FieldDescription>{statusMessage}</FieldDescription> : null}
                {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
              </div>
            ) : (
              <div aria-hidden="true" className="h-8" />
            )}

            <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
              {isSubmitting ? t("login.submitting") : t("login.submit")}
            </Button>
          </div>
        </FieldGroup>
      </form>

      <FieldDescription className="text-center">
        {t("login.noAccount")}{" "}
        <Link className="font-medium text-foreground underline underline-offset-4" to="/signup">
          {t("login.createOne")}
        </Link>
      </FieldDescription>
    </div>
  );
}
