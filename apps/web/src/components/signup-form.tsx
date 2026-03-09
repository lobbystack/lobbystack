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
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <IconLayoutRows className="size-5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">Create your workspace</h1>
              <FieldDescription>
                Set up the operator console for your AI receptionist.
              </FieldDescription>
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor="signup-email">Email</FieldLabel>
            <Input
              id="signup-email"
              autoComplete="email"
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="you@business.com"
              required
              type="email"
              value={email}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="signup-password">Password</FieldLabel>
            <Input
              id="signup-password"
              autoComplete="new-password"
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Create a password"
              required
              type="password"
              value={password}
            />
          </Field>

          <Field>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Creating account..." : "Create account"}
            </Button>
          </Field>

          {statusMessage ? <FieldDescription>{statusMessage}</FieldDescription> : null}
          {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
        </FieldGroup>
      </form>

      <FieldDescription className="text-center">
        Already have an account?{" "}
        <Link className="font-medium text-foreground underline underline-offset-4" to="/login">
          Sign in
        </Link>
      </FieldDescription>
    </div>
  );
}
