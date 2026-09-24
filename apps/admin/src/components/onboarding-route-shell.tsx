"use client";

import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { resolveLocale } from "@/lib/locale";
import { localizePublicPath } from "@/lib/locale-path";

import { requestJson } from "@/lib/request-json";
import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { ReplacementOnboardingShell } from "@/components/replacement-onboarding-shell";

const routes = {
  "/onboarding/business": { key: "businessName", step: 2, width: "md" },
  "/onboarding/website": { key: "website", step: 3, width: "md" },
  "/onboarding/knowledge": { key: "knowledge", step: 4, width: "lg" },
  "/onboarding/greeting": { key: "greeting", step: 5, width: "md" },
  "/onboarding/plan": { key: "plan", step: 6, width: "wide" },
  "/onboarding/number": { key: "number", step: 7, width: "lg" },
  "/onboarding/attribution": { key: "attribution", step: 8, width: "xl" },
} as const;

export function OnboardingRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, i18n } = useTranslation("onboarding");
  const route = routes[pathname as keyof typeof routes] ?? routes["/onboarding/business"];
  const showDescription = !["number", "plan", "attribution"].includes(route.key);
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
  const phones = useQuery({ queryKey: ["onboarding-primary-number", business?.businessId], enabled: route.key === "number" && Boolean(business), queryFn: () => requestJson<{ phoneNumbers: Array<{ id: string; e164: string; reclaimScheduledAt: string | null }> }>(`/api/phone-numbers?businessId=${encodeURIComponent(business!.businessId)}`) });
  const hasPrimaryNumber = Boolean(phones.data?.phoneNumbers.some(number => !number.reclaimScheduledAt));
  const selectedNumber = route.key === "number" && hasPrimaryNumber && ["attribution", "complete"].includes(stage ?? "");
  const navigableUntil = ({ create_business: 2, website: 3, knowledge: 4, greeting: 5, plan: 6, phone_number: 7, phone_number_claiming: 7, attribution: 8, complete: 9 } as Record<string, number>)[stage ?? ""];
  return (
    <ReplacementOnboardingShell
      description={showDescription ? t(`${route.key}.description`) : ""}
      onSignOut={() => void fetch("/api/auth/sign-out", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" }).finally(() => { router.replace(localizePublicPath("/login", resolveLocale(i18n.resolvedLanguage, i18n.language))); router.refresh(); })}
      progress={{ current: route.step, ...(navigableUntil === undefined ? {} : { navigableUntil }), total: 8 }}
      title={t(selectedNumber ? "number.selectedTitle" : `${route.key}.title`)}
      width={route.key === "number" && (!phones.data || hasPrimaryNumber) ? "md" : route.width}
    >
      <NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider>
    </ReplacementOnboardingShell>
  );
}
