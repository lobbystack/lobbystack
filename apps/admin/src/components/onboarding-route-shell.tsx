"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { normalizeOnboardingStage, onboardingProgress, onboardingStages, resolveOnboardingRoute, type OnboardingStage } from "@lobbystack/shared";

import { requestJson } from "@/lib/request-json";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useSignOut } from "@/hooks/use-sign-out";
import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { onboardingRoutes as routes, ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";

type Numbers = { phoneNumbers: Array<{ id: string; e164: string; reclaimScheduledAt: string | null }> };

// These steps state their one purpose in their title.
const DESCRIBED = new Set(["brand"]);

// The stage each page belongs to, for keeping a restored browser-back page on
// the step the workspace has reached.
const ROUTE_STAGE: Record<string, OnboardingStage> = { businessName: "create_business", website: "website", language: "language", reading: "verify_phone", verifyPhone: "verify_phone", number: "phone_number", goal: "goal", attribution: "attribution", meet: "meet" };

export function OnboardingRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation("onboarding");
  const signOut = useSignOut();
  const route = routes[pathname as keyof typeof routes] ?? routes["/onboarding/business"];
  const { business } = useActiveBusiness();
  const stage = business?.onboardingStage;
  const phones = useQuery({ queryKey: ["onboarding-primary-number", business?.businessId], enabled: route.key === "number" && Boolean(business), queryFn: () => requestJson<Numbers>(`/api/phone-numbers?businessId=${encodeURIComponent(business!.businessId)}`) });
  const hasPrimaryNumber = Boolean(phones.data?.phoneNumbers.some(number => !number.reclaimScheduledAt));
  const selectedNumber = route.key === "number" && hasPrimaryNumber && ["goal", "attribution", "meet", "complete"].includes(stage ?? "");
  // A browser back may restore an earlier page without asking the server, so
  // send it forward too. The number picker stays open from later steps.
  useEffect(() => {
    if (!stage) return;
    const current = normalizeOnboardingStage(stage);
    const expected = ROUTE_STAGE[route.key];
    if (!expected) return;
    if (route.key === "number" && ["phone_number", "phone_number_claiming", "goal", "attribution", "meet", "complete"].includes(current)) return;
    if (onboardingStages.indexOf(current) > onboardingStages.indexOf(expected)) router.replace(resolveOnboardingRoute(current));
  }, [route.key, router, stage]);
  return (
    <ReplacementOnboardingShell
      description={DESCRIBED.has(route.key) ? t(`${route.key}.description`) : ""}
      legalAgreement="business"
      onSignOut={() => void signOut()}
      progress={onboardingProgress(pathname, business?.partnerAccessLevel)}
      title={t(selectedNumber ? "number.selectedTitle" : `${route.key}.title`)}
      width={route.width}
    >
      <NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider>
    </ReplacementOnboardingShell>
  );
}
