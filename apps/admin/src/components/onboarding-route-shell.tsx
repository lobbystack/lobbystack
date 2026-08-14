"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";

const routes = {
  "/onboarding/business": { key: "businessName", step: 2, width: "sm" },
  "/onboarding/website": { key: "website", step: 3, width: "sm" },
  "/onboarding/knowledge": { key: "knowledge", step: 4, width: "xl" },
  "/onboarding/greeting": { key: "greeting", step: 5, width: "sm" },
  "/onboarding/verify-phone": { key: "verifyPhone", step: 6, width: "sm" },
  "/onboarding/verify-phone/code": { key: "verifyPhoneCode", step: 7, width: "sm" },
  "/onboarding/plan": { key: "plan", step: 8, width: "wide" },
  "/onboarding/number": { key: "number", step: 9, width: "wide" },
  "/onboarding/attribution": { key: "attribution", step: 10, width: "sm" },
} as const;

export function OnboardingRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation("onboarding");
  const route = routes[pathname as keyof typeof routes] ?? routes["/onboarding/business"];
  return (
    <ReplacementOnboardingShell
      description={t(`${route.key}.description`)}
      progress={{ current: route.step, total: 10 }}
      title={t(`${route.key}.title`)}
      width={route.width}
    >
      <NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider>
    </ReplacementOnboardingShell>
  );
}
