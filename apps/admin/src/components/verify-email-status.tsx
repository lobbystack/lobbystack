"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ReplacementOnboardingShell } from "./replacement-onboarding-shell";

export function VerifyEmailStatus() {
  const { t } = useTranslation("auth");
  return <ReplacementOnboardingShell title={t("verifyEmail.invalidTitle")} description={t("verifyEmail.missingToken")} progress={null} width="sm">
    <p className="text-center text-sm"><Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/login">{t("verifyEmail.backToLogin")}</Link></p>
  </ReplacementOnboardingShell>;
}
