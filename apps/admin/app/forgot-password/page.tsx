"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";

export default function ForgotPasswordPage() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    let signingIn = false;
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await fetch(`/api/auth/email-otp/${step === "request" ? "request-password-reset" : "reset-password"}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(step === "request" ? { email: normalizedEmail } : { email: normalizedEmail, otp: code.trim(), password: newPassword }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        const key = step === "request" ? "passwordResetRequestFailed"
          : failure.code === "INVALID_PASSWORD" || failure.code === "PASSWORD_TOO_SHORT" || failure.code === "PASSWORD_TOO_LONG" ? "invalidPassword"
          : failure.code === "USER_NOT_FOUND" || failure.code === "INVALID_OTP" || failure.code === "OTP_EXPIRED" || failure.code === "TOO_MANY_ATTEMPTS" ? "invalidResetCode" : "passwordResetFailed";
        throw new Error(t(`errors.${key}`));
      }
      if (step === "request") { setStep("verify"); return; }
      const login = await fetch("/api/auth/sign-in/email", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password: newPassword }),
      });
      // The password has changed even if a transient login/rate-limit error occurs.
      signingIn = true;
      router.replace(login.ok ? "/" : "/login");
      router.refresh();
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : t("errors.passwordResetFailed"));
    } finally { if (!signingIn) setIsSubmitting(false); }
  }

  return <ReplacementOnboardingShell description={step === "verify" ? t("forgotPassword.verifySubtitle", { email }) : t("forgotPassword.subtitle")} progress={null} title={step === "verify" ? t("forgotPassword.verifyTitle") : t("forgotPassword.title")} width="sm">
    <ForgotPasswordForm step={step} email={email} code={code} newPassword={newPassword} isSubmitting={isSubmitting} errorMessage={errorMessage} onEmailChange={setEmail} onCodeChange={setCode} onNewPasswordChange={setNewPassword} onSubmit={submit} onBackToRequest={() => { setStep("request"); setCode(""); setNewPassword(""); setErrorMessage(null); }} />
  </ReplacementOnboardingShell>;
}
