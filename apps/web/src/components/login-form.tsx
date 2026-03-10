"use client";

import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { IconLayoutRows } from "@tabler/icons-react";

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
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <IconLayoutRows className="size-5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
              <FieldDescription>Sign in to your account to continue.</FieldDescription>
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor="login-email">Email</FieldLabel>
            <Input
              id="login-email"
              autoComplete="email"
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="you@business.com"
              required
              type="email"
              value={email}
            />
          </Field>

          <div>
            <Field>
              <FieldLabel htmlFor="login-password">Password</FieldLabel>
              <Input
                id="login-password"
                autoComplete="current-password"
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="••••••••"
                required
                type="password"
                value={password}
              />
            </Field>

            {statusMessage || errorMessage ? (
              <div className="mb-7 mt-2 space-y-1">
                {statusMessage ? <FieldDescription>{statusMessage}</FieldDescription> : null}
                {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
              </div>
            ) : (
              <div aria-hidden="true" className="h-7" />
            )}

            <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </div>
        </FieldGroup>
      </form>

      <FieldDescription className="text-center">
        Don't have an account?{" "}
        <Link className="font-medium text-foreground underline underline-offset-4" to="/signup">
          Create one
        </Link>
      </FieldDescription>
    </div>
  );
}
