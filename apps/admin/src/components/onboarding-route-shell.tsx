"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { requestJson } from "@/lib/request-json";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useSignOut } from "@/hooks/use-sign-out";
import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { onboardingRoutes as routes, ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";

// A partner's business skips creating it, the number and attribution, and at
// the activity level everything but the owner's phone, as onboardingSteps in
// packages/domain decides. The dots then count only the owner's own steps.
const PARTNER_ROUTES = ["/onboarding/website", "/onboarding/knowledge", "/onboarding/greeting", "/onboarding/test-call", "/onboarding/verify-phone"] as const;
const STAGE_ROUTES: Record<string, string> = { website: "/onboarding/website", knowledge: "/onboarding/knowledge", greeting: "/onboarding/greeting", test_call: "/onboarding/test-call", verify_phone: "/onboarding/verify-phone" };

type Progress = { current: number; navigableUntil?: number; total: number; routes?: readonly string[] } | null;

/** The step dots for a partner's business, or null at the activity level, whose owner has one step. */
function partnerProgress(pathname: string, stage: string | undefined, accessLevel: "full" | "activity"): Progress {
  if (accessLevel === "activity") return null;
  const current = PARTNER_ROUTES.indexOf(pathname as (typeof PARTNER_ROUTES)[number]) + 1;
  if (current === 0) return null;
  const reached = stage === "complete" ? PARTNER_ROUTES.length : PARTNER_ROUTES.indexOf((STAGE_ROUTES[stage ?? ""] ?? "") as (typeof PARTNER_ROUTES)[number]) + 1;
  return { current, total: PARTNER_ROUTES.length, routes: PARTNER_ROUTES, ...(reached > 0 ? { navigableUntil: reached } : {}) };
}

export function OnboardingRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation("onboarding");
  const signOut = useSignOut();
  const route = routes[pathname as keyof typeof routes] ?? routes["/onboarding/business"];
  const showDescription = !["testCall", "verifyPhone", "number", "attribution"].includes(route.key);
  const { business } = useActiveBusiness();
  const stage = business?.onboardingStage;
  const phones = useQuery({ queryKey: ["onboarding-primary-number", business?.businessId], enabled: route.key === "number" && Boolean(business), queryFn: () => requestJson<{ phoneNumbers: Array<{ id: string; e164: string; reclaimScheduledAt: string | null }> }>(`/api/phone-numbers?businessId=${encodeURIComponent(business!.businessId)}`) });
  const hasPrimaryNumber = Boolean(phones.data?.phoneNumbers.some(number => !number.reclaimScheduledAt));
  const selectedNumber = route.key === "number" && hasPrimaryNumber && ["attribution", "complete"].includes(stage ?? "");
  const navigableUntil = ({ create_business: 2, website: 3, knowledge: 4, greeting: 5, test_call: 6, verify_phone: 7, phone_number: 8, phone_number_claiming: 8, attribution: 9, complete: 10 } as Record<string, number>)[stage ?? ""];
  return (
    <ReplacementOnboardingShell
      description={showDescription ? t(`${route.key}.description`) : ""}
      legalAgreement="business"
      onSignOut={() => void signOut()}
      progress={business?.partnerAccessLevel ? partnerProgress(pathname, stage, business.partnerAccessLevel) : { current: route.step, ...(navigableUntil === undefined ? {} : { navigableUntil }), total: 9 }}
      title={t(selectedNumber ? "number.selectedTitle" : `${route.key}.title`)}
      width={route.key === "number" && (!phones.data || hasPrimaryNumber) ? "md" : route.width}
    >
      <NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider>
    </ReplacementOnboardingShell>
  );
}
