"use client";

import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { requestJson } from "@/lib/request-json";
import { maskPhone } from "@/lib/onboarding-phone";
import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";

const routes = {
  "/onboarding/business": { key: "businessName", step: 2, width: "md" },
  "/onboarding/website": { key: "website", step: 3, width: "md" },
  "/onboarding/knowledge": { key: "knowledge", step: 4, width: "lg" },
  "/onboarding/greeting": { key: "greeting", step: 5, width: "md" },
  "/onboarding/verify-phone": { key: "verifyPhone", step: 6, width: "md" },
  "/onboarding/verify-phone/code": { key: "verifyPhoneCode", step: 7, width: "md" },
  "/onboarding/plan": { key: "plan", step: 8, width: "wide" },
  "/onboarding/number": { key: "number", step: 9, width: "lg" },
  "/onboarding/attribution": { key: "attribution", step: 10, width: "xl" },
} as const;

export function OnboardingRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation("onboarding");
  const route = routes[pathname as keyof typeof routes] ?? routes["/onboarding/business"];
  const showDescription = !["number", "plan", "attribution", "verifyPhoneCode"].includes(route.key);
  const businesses = useQuery({
    queryKey: ["businesses"],
    queryFn: async () => {
      const response = await fetch("/api/businesses", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load onboarding progress.");
      return await response.json() as { businesses: Array<{ businessId: string; active: boolean; onboardingStage?: string }> };
    },
  });
  const business = businesses.data?.businesses.find((business) => business.active) ?? businesses.data?.businesses[0];
  const stage = business?.onboardingStage;
  const verification = useQuery({ queryKey: ["phone-verification", business?.businessId], enabled: route.key === "verifyPhoneCode" && Boolean(business), queryFn: async () => {
    const response = await fetch(`/api/onboarding/phone-verification?businessId=${encodeURIComponent(business!.businessId)}`, { credentials: "include" });
    if (!response.ok) throw new Error("Could not load phone verification.");
    return await response.json() as { attempt: { phoneE164: string } | null };
  } });
  const phones = useQuery({ queryKey: ["onboarding-primary-number", business?.businessId], enabled: route.key === "number" && Boolean(business), queryFn: () => requestJson<{ phoneNumbers: Array<{ id: string; e164: string; reclaimScheduledAt: string | null }> }>(`/api/phone-numbers?businessId=${encodeURIComponent(business!.businessId)}`) });
  const hasPrimaryNumber = Boolean(phones.data?.phoneNumbers.some(number => !number.reclaimScheduledAt));
  const selectedNumber = route.key === "number" && hasPrimaryNumber && ["attribution", "complete"].includes(stage ?? "");
  const navigableUntil = ({ create_business: 2, website: 3, knowledge: 4, greeting: 5, verify_phone: 6, verify_phone_code: 7, plan: 8, phone_number: 9, phone_number_claiming: 9, attribution: 10, complete: 11 } as Record<string, number>)[stage ?? ""];
  return (
    <ReplacementOnboardingShell
      description={route.key === "verifyPhoneCode" && verification.data?.attempt ? t("verifyPhoneCode.description", { phone: maskPhone(verification.data.attempt.phoneE164) }) : showDescription ? t(`${route.key}.description`) : ""}
      onSignOut={() => void fetch("/api/auth/sign-out", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" }).finally(() => { router.replace("/login"); router.refresh(); })}
      progress={{ current: route.step, ...(navigableUntil === undefined ? {} : { navigableUntil }), total: 10 }}
      title={t(selectedNumber ? "number.selectedTitle" : `${route.key}.title`)}
      width={route.key === "number" && (!phones.data || hasPrimaryNumber) ? "md" : route.width}
    >
      <NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider>
    </ReplacementOnboardingShell>
  );
}
