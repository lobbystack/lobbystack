"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { onboardingBackRoute, onboardingProgress } from "@lobbystack/shared";

import { requestJson } from "@/lib/request-json";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useSignOut } from "@/hooks/use-sign-out";
import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { onboardingRoutes as routes, ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";

type PhoneCountries = { verifyPhone: boolean };
type Numbers = { phoneNumbers: Array<{ id: string; e164: string; reclaimScheduledAt: string | null }> };

// These steps state their one purpose in their title.
const DESCRIBED = new Set(["brand"]);

export function OnboardingRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation("onboarding");
  const signOut = useSignOut();
  const route = routes[pathname as keyof typeof routes] ?? routes["/onboarding/business"];
  const { business } = useActiveBusiness();
  const stage = business?.onboardingStage;
  const phones = useQuery({ queryKey: ["onboarding-primary-number", business?.businessId], enabled: route.key === "number" && Boolean(business), queryFn: () => requestJson<Numbers>(`/api/phone-numbers?businessId=${encodeURIComponent(business!.businessId)}`) });
  const phoneCountries = useQuery({ queryKey: ["onboarding-number-countries", business?.businessId], enabled: (route.key === "number" || route.key === "meet") && Boolean(business), queryFn: () => requestJson<PhoneCountries>(`/api/onboarding/numbers?businessId=${encodeURIComponent(business!.businessId)}`) });
  const hasPrimaryNumber = Boolean(phones.data?.phoneNumbers.some(number => !number.reclaimScheduledAt));
  const selectedNumber = route.key === "number" && hasPrimaryNumber && ["goal", "attribution", "meet", "complete"].includes(stage ?? "");
  const backHref = business ? onboardingBackRoute(pathname, { stage, partnerAccessLevel: business.partnerAccessLevel, websiteUrl: business.websiteUrl, verifiesPhone: phoneCountries.data?.verifyPhone }) : null;
  return (
    <ReplacementOnboardingShell
      backHref={backHref}
      description={DESCRIBED.has(route.key) ? t(`${route.key}.description`) : ""}
      legalAgreement="business"
      onSignOut={() => void signOut()}
      progress={onboardingProgress(pathname, stage, business?.partnerAccessLevel)}
      title={t(selectedNumber ? "number.selectedTitle" : `${route.key}.title`)}
      width={route.key === "number" && (!phones.data || hasPrimaryNumber) ? "md" : route.width}
    >
      <NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider>
    </ReplacementOnboardingShell>
  );
}
