"use client";

import { useTranslation } from "react-i18next";

import { OnboardingBrandSkeleton } from "@/components/loading-skeletons";

/** The brand form while the server decides whether the step applies and which fields it asks. */
export default function OnboardingBrandLoading() {
  const { t } = useTranslation("onboarding");
  return (
    <OnboardingBrandSkeleton
      labels={{
        name: t("brand.nameLabel"),
        nameHint: t("brand.nameHint"),
        logo: t("brand.logoLabel"),
        logoChoose: t("brand.logoChoose"),
        logoHint: t("brand.logoHint"),
        preview: t("brand.preview"),
        continue: t("brand.continue"),
        skip: t("brand.skip"),
      }}
    />
  );
}
