"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { BillingPermissions } from "@/components/billing-past-due-banner";
import { useBusinessCan } from "@/components/business-capabilities-provider";
import { DashboardFeedbackDialog } from "@/components/dashboard-feedback-widget";
import { NavUser, type NavUserProps } from "@/components/nav-user";
import { useOpenUpgradePlanDialog } from "@/components/upgrade-plan-dialog-context";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useSignOut } from "@/hooks/use-sign-out";
import { requestJson } from "@/lib/request-json";

export type NavigationUser = { email: string; name: string };

/**
 * What the account menu does, for the sidebar's menu and the phone menu: an
 * upgrade when the plan allows one, the partner console, and leaving a
 * partner's business as the person goes back to the console or signs out.
 */
export function useAccountMenu({ partnerConsole = false }: { partnerConsole?: boolean }): Omit<NavUserProps, "user" | "onFeedback"> {
  const openUpgradePlanDialog = useOpenUpgradePlanDialog();
  const signOut = useSignOut();
  const { business } = useActiveBusiness();
  const can = useBusinessCan();
  const billing = useQuery({ queryKey: ["billing", business?.businessId], enabled: Boolean(business?.businessId) && can("billing"), queryFn: () => requestJson<{ account: { plan: string | null } | null; permissions: BillingPermissions; availableCheckoutPlans: Array<"starter" | "pro">; availableCheckoutIntervals: Record<"starter" | "pro", string[]> }>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`) });
  const showUpgradeToPro = can("billing") && billing.data?.permissions.hasCheckoutAccess === true && (billing.data.account?.plan ?? "free_cloud") === "free_cloud" && (billing.data.availableCheckoutPlans ?? []).some(plan => billing.data?.availableCheckoutIntervals[plan].length);
  // Someone working in a partner's business through an open ends it as they go back to the console or sign out,
  // and the business's audit log records it. The tab reads when its open began once, as it loads, so leaving here
  // doesn't end a newer open another tab started. A tab closed without either leaves the open to expire.
  const visiting = business?.via === "partner" ? business.businessId : null;
  const visit = useQuery({ queryKey: ["partner-visit", visiting], enabled: Boolean(visiting), staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false, queryFn: () => requestJson<{ openedAt: string | null }>(`/api/partner/businesses/leave?businessId=${encodeURIComponent(visiting!)}`) });
  const leave = async () => {
    if (!visiting || !visit.data?.openedAt) return;
    await fetch("/api/partner/businesses/leave", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId: visiting, openedAt: visit.data.openedAt }), keepalive: true }).catch(() => undefined);
  };
  return { onLeaveBusiness: visiting ? () => void leave() : undefined, onSignOut: () => void leave().then(() => signOut()), onUpgradeToPro: openUpgradePlanDialog, showPartnerConsole: partnerConsole, showUpgradeToPro };
}

/**
 * The person's own menu: their account, the partner console, feedback, the
 * Help Center, the affiliate program, the theme, an upgrade and signing out.
 */
export function AccountMenu({ partnerConsole = false, user }: { partnerConsole?: boolean; user: NavigationUser }) {
  const actions = useAccountMenu({ partnerConsole });
  const { business } = useActiveBusiness();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  return <>
    <NavUser {...actions} onFeedback={() => setFeedbackOpen(true)} user={user} />
    <DashboardFeedbackDialog businessId={business?.businessId} onOpenChange={setFeedbackOpen} open={feedbackOpen} />
  </>;
}
