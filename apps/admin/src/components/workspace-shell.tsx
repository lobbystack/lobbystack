// @ts-nocheck
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { redactSensitiveUrlValue } from "@lobbystack/telemetry";

import { LoadingScreen } from "@/components/loading-screen";
import {
  OnboardingRouteSkeleton,
  WorkspaceRouteSkeleton,
} from "@/components/app-route-skeletons";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";
import {
  buildAuthPathWithReturnTo,
  getSafeReturnTo,
} from "@/lib/auth-return-to";
import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { Button } from "@/components/ui/button";
import { Main } from "@/components/layout/main";
import { AnalyticsPage } from "@/features/analytics/AnalyticsPage";
import { ClaimDemoPage } from "@/features/demos/ClaimDemoPage";
import { ProspectDemoPage } from "@/features/demos/ProspectDemoPage";
import { AgentLayout } from "@/features/agent/AgentLayout";
import { AgentBasicSettingsPage } from "@/features/agent/AgentBasicSettingsPage";
import { AgentKnowledgePage } from "@/features/agent/AgentKnowledgePage";
import { AgentRulesPage } from "@/features/agent/AgentRulesPage";
import { AgentServicesPage } from "@/features/agent/AgentServicesPage";
import { AffiliatePage } from "@/features/affiliate/AffiliatePage";
import { CallDetailPage } from "@/features/calls/CallDetailPage";
import { CallsPage } from "@/features/calls/CallsPage";
import { ContactsPage } from "@/features/contacts/ContactsPage";
import { ContactDetailPage } from "@/features/contacts/ContactDetailPage";
import { HomePage } from "@/features/home/HomePage";
import { MessagesPage } from "@/features/messages/MessagesPage";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { SettingsAppearancePage } from "@/features/settings/SettingsAppearancePage";
import { IntegrationsPage } from "@/features/settings/IntegrationsPage";
import { SettingsBusinessPage } from "@/features/settings/SettingsBusinessPage";
import { SettingsPhoneNumberPage } from "@/features/settings/SettingsPhoneNumberPage";
import {
  SettingsBillingCompliancePage,
  SettingsBillingPage,
  SettingsBillingUsagePage,
} from "@/features/settings/SettingsBillingPage";
import { SettingsAccountPage } from "@/features/settings/SettingsAccountPage";
import { SettingsNotificationsPage } from "@/features/settings/SettingsNotificationsPage";
import { OnboardingAttributionPage } from "@/features/onboarding/OnboardingAttributionPage";
import { OnboardingBusinessNamePage } from "@/features/onboarding/OnboardingBusinessNamePage";
import { OnboardingGreetingPage } from "@/features/onboarding/OnboardingGreetingPage";
import { OnboardingKnowledgePage } from "@/features/onboarding/OnboardingKnowledgePage";
import { OnboardingNumberPage } from "@/features/onboarding/OnboardingNumberPage";
import { OnboardingPlanPage } from "@/features/onboarding/OnboardingPlanPage";
import { OnboardingVerifyPhoneCodePage } from "@/features/onboarding/OnboardingVerifyPhoneCodePage";
import { OnboardingVerifyPhonePage } from "@/features/onboarding/OnboardingVerifyPhonePage";
import { OnboardingWebsitePage } from "@/features/onboarding/OnboardingWebsitePage";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import {
  canVisitOnboardingStage,
  getPhoneVerificationApprovedRedirect,
  getOnboardingRouteForStage,
  onboardingNavigableStep,
  onboardingStageNeedsBillingPlan,
} from "@/features/onboarding/onboardingNavigation";
import { SetupGuidePage } from "@/features/setup/SetupGuidePage";
import {
  captureAnalyticsEvent,
  identifyOperator,
  resetAnalyticsIdentity,
  syncAnalyticsSessionRecording,
  trackPageView,
} from "@/lib/analytics";
import {
  clearAffiliateReferralCode,
  getAffiliateVisitorId,
  getStoredAffiliateReferralCode,
  normalizeClientReferralCode,
  storeAffiliateReferralCode,
} from "@/lib/affiliate-referral";
import { useResetAuthScopedClientStateOnSignOut } from "@/lib/auth-scoped-client-state";
import { AI_SMS_DASHBOARD_ENABLED } from "@/lib/release-flags";
import { api } from "@/lib/convex-compat/api";
import type { Id } from "@/lib/convex-compat/dataModel";
import { useQuery } from "@/lib/convex-compat/react";
import { useBusinessRealtime } from "@/lib/realtime";

type ActiveBusiness = {
  _id: Id<"businesses">;
  name: string;
  slug: string;
  onboardingStage?: string;
  websiteUrl?: string;
  phoneNumberReplacementUsedAt?: string;
};

type ActiveBusinessEntry = {
  business: ActiveBusiness;
  membership: { role: string };
};

const TENANT_ADMIN_ROLES = new Set(["business_owner", "business_admin", "owner"]);

function hasTenantAdminAccess(role: string | undefined): boolean {
  return role !== undefined && TENANT_ADMIN_ROLES.has(role);
}

function selectActiveBusinessEntry(
  currentUser: { activeBusinessId?: Id<"businesses"> } | undefined | null,
  businesses: Array<ActiveBusinessEntry> | undefined,
): ActiveBusinessEntry | null {
  const activeBusinessId = currentUser?.activeBusinessId;
  if (!businesses || businesses.length === 0) {
    return null;
  }
  return (
    businesses.find((entry) => entry.business._id === activeBusinessId) ??
    businesses[0] ??
    null
  );
}

export function WorkspaceShell({ children }: { children?: ReactNode }) {
  useResetAuthScopedClientStateOnSignOut();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentUser = useQuery(api.users.current, {});
  const businesses = useQuery(api.businesses.admin.listForCurrentUser, {});
  const activeBusinessEntry = selectActiveBusinessEntry(currentUser, businesses as ActiveBusinessEntry[] | undefined);
  const activeBusiness = activeBusinessEntry?.business ?? null;
  const canManageTenant = hasTenantAdminAccess(activeBusinessEntry?.membership.role);
  const businessId = activeBusiness?._id;
  const billingStatus = useQuery(api.billing.getStatus, businessId ? { businessId } : "skip");
  const isBootstrapLoading = businesses === undefined || currentUser === undefined;
  const isOnboardingBillingPlanLoading = Boolean(
    activeBusiness &&
      canManageTenant &&
      onboardingStageNeedsBillingPlan(activeBusiness.onboardingStage) &&
      billingStatus === undefined,
  );
  const isWorkspaceLoading = isBootstrapLoading || isOnboardingBillingPlanLoading;
  const onboardingTarget = activeBusiness
    ? getOnboardingRouteForStage(activeBusiness.onboardingStage, (billingStatus as { plan?: string } | undefined)?.plan)
    : null;
  const showSetupGuide = !isBootstrapLoading && Boolean(businessId && canManageTenant && !onboardingTarget);
  const shouldShowSetupPending =
    !isBootstrapLoading && Boolean(activeBusiness && onboardingTarget && !canManageTenant);
  const usesFixedMain = AI_SMS_DASHBOARD_ENABLED && pathname === "/messages";

  useBusinessRealtime(businessId ? String(businessId) : undefined);

  async function handleSignOut(): Promise<void> {
    resetAnalyticsIdentity();
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    if (!isBootstrapLoading && currentUser?._id) {
      identifyOperator({
        userId: String(currentUser._id),
        ...(businessId ? { businessId: String(businessId) } : {}),
        deploymentMode: process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? "development",
      });
    }
  }, [businessId, currentUser?._id, isBootstrapLoading]);

  useEffect(() => {
    if (!isBootstrapLoading && businessId) {
      trackPageView(pathname, String(businessId));
    }
  }, [businessId, isBootstrapLoading, pathname]);

  if (!isWorkspaceLoading && !activeBusiness && !pathname.startsWith("/onboarding")) {
    router.replace("/onboarding/business");
    return <LoadingScreen />;
  }

  if (
    !isWorkspaceLoading &&
    activeBusiness &&
    onboardingTarget &&
    canManageTenant &&
    pathname !== onboardingTarget &&
    !pathname.startsWith("/settings")
  ) {
    router.replace(onboardingTarget);
    return <LoadingScreen />;
  }

  return (
    <AuthenticatedLayout
      {...(billingStatus ? { billingStatus } : {})}
      isLoading={isWorkspaceLoading}
      onSignOut={() => void handleSignOut()}
      {...(businessId ? { businessId } : {})}
      {...(activeBusiness?.name ? { businessName: activeBusiness.name } : {})}
      {...(activeBusiness?.slug ? { businessSlug: activeBusiness.slug } : {})}
      {...(currentUser?.image ? { operatorAvatar: String(currentUser.image) } : {})}
      {...(currentUser?.email ? { operatorEmail: String(currentUser.email) } : {})}
      {...(
        currentUser?.displayName ?? currentUser?.name
          ? { operatorName: String(currentUser.displayName ?? currentUser.name) }
          : {}
      )}
      showUpgradeToPro={false}
      showSetupGuide={showSetupGuide}
    >
      <Main className="flex flex-1 flex-col" fixed={usesFixedMain}>
        {isWorkspaceLoading ? (
          <WorkspaceRouteSkeleton pathname={pathname} />
        ) : shouldShowSetupPending ? (
          <div className="mx-auto flex min-h-[420px] w-full max-w-2xl flex-col justify-center py-16">
            <p className="text-sm text-muted-foreground">Workspace setup is pending admin completion.</p>
          </div>
        ) : (
          children
        )}
      </Main>
    </AuthenticatedLayout>
  );
}

export { Link, usePathname, useRouter, useSearchParams };
