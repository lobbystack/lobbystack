"use client";

import type { FormEvent, Ref } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Turnstile, type TurnstileHandle } from "@/components/turnstile";
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
  turnstileResetKey?: number;
  turnstileSiteKey?: string;
  turnstileRef?: Ref<TurnstileHandle>;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTurnstileError?: () => void;
  onTurnstileTokenChange?: (token: string | null) => void;
};

export function SignupForm({
  className,
  email,
  password,
  isSubmitting,
  errorMessage,
  turnstileResetKey = 0,
  turnstileSiteKey,
  turnstileRef,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onTurnstileError,
  onTurnstileTokenChange,
}: SignupFormProps) {
  const { t } = useTranslation("auth");

  return (
    <div className={cn("flex w-full flex-col gap-6", className)}>
      <form onSubmit={onSubmit}>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="signup-email">{t("signup.email")}</FieldLabel>
            <Input
              id="signup-email"
              autoComplete="email"
              className="h-11"
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder={t("signup.emailPlaceholder")}
              required
              type="email"
              value={email}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="signup-password">{t("signup.password")}</FieldLabel>
            <Input
              id="signup-password"
              autoComplete="new-password"
              className="h-11"
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder={t("signup.passwordPlaceholder")}
              required
              type="password"
              value={password}
            />
            <FieldDescription>{t("signup.passwordHint")}</FieldDescription>
          </Field>

          {turnstileSiteKey ? (
            <div className="-mt-1">
              <Turnstile
                key={turnstileResetKey}
                ref={turnstileRef}
                onTokenChange={onTurnstileTokenChange ?? (() => {})}
                siteKey={turnstileSiteKey}
                {...(onTurnstileError ? { onError: onTurnstileError } : {})}
              />
            </div>
          ) : null}

          {errorMessage ? (
            <div className="flex flex-col gap-2 -mt-1">
              <FieldError>{errorMessage}</FieldError>
            </div>
          ) : null}

          <Button className="mt-2 h-11 w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                <span className="sr-only">{t("signup.submitting")}</span>
              </>
            ) : (
              t("signup.submit")
            )}
          </Button>
        </FieldGroup>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t("signup.haveAccount")}{" "}
        <Link className="font-medium text-foreground underline-offset-4 hover:underline" to="/login">
          {t("signup.signIn")}
        </Link>
      </p>
    </div>
  );
}
