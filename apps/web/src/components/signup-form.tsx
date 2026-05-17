"use client";

import { useState, type FormEvent, type Ref } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Turnstile, type TurnstileHandle } from "@/components/turnstile";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type PasswordCriterion = {
  label: string;
  isMet: boolean;
};

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
  const [shouldReserveTurnstileSpace, setShouldReserveTurnstileSpace] =
    useState(false);
  const [hasFocusedPassword, setHasFocusedPassword] = useState(false);
  const passwordCriteria: PasswordCriterion[] = [
    { label: t("signup.passwordCriteria.minimumLength"), isMet: password.length >= 8 },
    { label: t("signup.passwordCriteria.number"), isMet: /\d/.test(password) },
    {
      label: t("signup.passwordCriteria.specialCharacter"),
      isMet: /[^A-Za-z0-9\s]/.test(password),
    },
  ];

  return (
    <div className={cn("flex w-full flex-col gap-6", className)}>
      <form className="relative" onSubmit={onSubmit}>
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
              onFocus={() => setHasFocusedPassword(true)}
              placeholder={t("signup.passwordPlaceholder")}
              required
              type="password"
              value={password}
            />
            {hasFocusedPassword ? (
              <ul className="flex flex-col gap-1 pt-0.5 text-sm font-medium" aria-live="polite">
                {passwordCriteria.map((criterion) => (
                  <li
                    key={criterion.label}
                    className={cn(
                      "flex items-center gap-2",
                      criterion.isMet ? "text-emerald-700" : "text-muted-foreground",
                    )}
                  >
                    <span className="w-3 text-center" aria-hidden="true">
                      {criterion.isMet ? "✓" : "×"}
                    </span>
                    <span>{criterion.label}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Field>

          {turnstileSiteKey ? (
            <div
              className={
                shouldReserveTurnstileSpace
                  ? "-mt-1"
                  : "pointer-events-none absolute left-0 top-0 h-0 w-full overflow-hidden"
              }
            >
              <Turnstile
                key={turnstileResetKey}
                ref={turnstileRef}
                onReserveSpaceChange={setShouldReserveTurnstileSpace}
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
