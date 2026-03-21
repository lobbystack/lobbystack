import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { LoginForm } from "@/components/login-form";
import { SignupForm } from "@/components/signup-form";

type AuthErrorFlow = "signIn" | "signUp" | "resetRequest" | "resetVerification";

function AuthShell(props: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.08),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] px-6 py-10">
      <section className="flex w-full items-center justify-center">
        <div className="w-full max-w-md rounded-[2rem] border border-border/70 bg-card/95 p-8 shadow-xl shadow-black/5">
          {props.children}
        </div>
      </section>
    </div>
  );
}

function getAuthErrorMessage(
  error: unknown,
  flow: AuthErrorFlow,
  t: TFunction<"auth">,
): string {
  const message = error instanceof Error ? error.message : "";

  if (flow === "signIn") {
    if (message.includes("InvalidSecret") || message.includes("Invalid credentials")) {
      return t("errors.incorrectCredentials");
    }
    return t("errors.incorrectCredentials");
  }

  if (flow === "signUp") {
    if (message.includes("already exists")) {
      return t("errors.accountExists");
    }

    if (message.includes("Invalid password")) {
      return t("errors.invalidPassword");
    }

    return t("errors.signupFailed");
  }

  if (flow === "resetVerification") {
    if (message.includes("Invalid code") || message.includes("Could not verify code")) {
      return t("errors.invalidResetCode");
    }

    if (message.includes("Invalid password")) {
      return t("errors.invalidPassword");
    }

    return t("errors.passwordResetFailed");
  }

  if (flow === "resetRequest" && message.includes("Missing environment variable `SITE_URL`")) {
    return t("errors.passwordResetMissingSiteUrl");
  }

  return t("errors.passwordResetRequestFailed");
}

function isResetRequestLookupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return message.includes("InvalidAccountId");
}

export function LoginPage() {
  const { t } = useTranslation("auth");
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set("flow", "signIn");
      formData.set("email", email);
      formData.set("password", password);
      const result = await signIn("password", formData);

      if (result.redirect) {
        setStatusMessage(t("status.continuingSignIn"));
        return;
      }

      if (result.signingIn) {
        setStatusMessage(t("status.signedInFinishing"));
        return;
      }

      setStatusMessage(t("status.signInCompleted"));
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, "signIn", t));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <LoginForm
        email={email}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleSubmit}
        password={password}
        statusMessage={statusMessage}
      />
    </AuthShell>
  );
}

export function SignupPage() {
  const { t } = useTranslation("auth");
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set("flow", "signUp");
      formData.set("email", email);
      formData.set("password", password);
      const result = await signIn("password", formData);

      if (result.redirect) {
        setStatusMessage(t("status.continuingSignUp"));
        return;
      }

      if (result.signingIn) {
        setStatusMessage(t("status.accountCreatedFinishing"));
        return;
      }

      setStatusMessage(t("status.accountCreatedFinalizing"));
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, "signUp", t));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <SignupForm
        email={email}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleSubmit}
        password={password}
        statusMessage={statusMessage}
      />
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation("auth");
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set("email", email);

      if (step === "request") {
        formData.set("flow", "reset");
        await signIn("password", formData);
        setStep("verify");
        setStatusMessage(t("status.resetCodeSent"));
        return;
      }

      formData.set("flow", "reset-verification");
      formData.set("code", code);
      formData.set("newPassword", newPassword);
      const result = await signIn("password", formData);

      if (result.redirect) {
        setStatusMessage(t("status.continuingPasswordReset"));
        return;
      }

      if (result.signingIn) {
        setStatusMessage(t("status.passwordResetFinishing"));
        return;
      }

      setStatusMessage(t("status.passwordResetCompleted"));
    } catch (error) {
      if (step === "request" && isResetRequestLookupError(error)) {
        setStep("verify");
        setStatusMessage(t("status.resetCodeSent"));
        return;
      }

      setErrorMessage(
        getAuthErrorMessage(error, step === "request" ? "resetRequest" : "resetVerification", t),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleBackToRequest() {
    setStep("request");
    setCode("");
    setNewPassword("");
    setStatusMessage(null);
    setErrorMessage(null);
  }

  return (
    <AuthShell>
      <ForgotPasswordForm
        code={code}
        email={email}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        newPassword={newPassword}
        onBackToRequest={handleBackToRequest}
        onCodeChange={setCode}
        onEmailChange={setEmail}
        onNewPasswordChange={setNewPassword}
        onSubmit={handleSubmit}
        statusMessage={statusMessage}
        step={step}
      />
    </AuthShell>
  );
}
