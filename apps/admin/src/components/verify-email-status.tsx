"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ReplacementOnboardingShell } from "./replacement-onboarding-shell";
import { resolveLocale } from "@/lib/locale";
import { localizePublicPath } from "@/lib/locale-path";

export function VerifyEmailStatus() {
  const { t, i18n } = useTranslation("auth");
  const loginPath = localizePublicPath("/login", resolveLocale(i18n.resolvedLanguage, i18n.language));
  return <ReplacementOnboardingShell title={t("verifyEmail.invalidTitle")} description={t("verifyEmail.missingToken")} progress={null} width="sm">
    <p className="text-center text-sm"><Link className="font-medium text-foreground underline-offset-4 hover:underline" href={loginPath}>{t("verifyEmail.backToLogin")}</Link></p>
  </ReplacementOnboardingShell>;
}
