import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslation } from "react-i18next";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LoadingScreen } from "@/components/loading-screen";
import {
  OnboardingRouteSkeleton,
  WorkspaceRouteSkeleton,
} from "@/components/app-route-skeletons";
import { useObservedAction } from "@/lib/observed-convex";
import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Main } from "@/components/layout/main";
import {
  ConfirmEmailChangePage,
  ForgotPasswordPage,
  LoginPage,
  SignupPage,
} from "@/features/auth/AuthPages";
import { AnalyticsPage } from "@/features/analytics/AnalyticsPage";
import { AgentLayout } from "@/features/agent/AgentLayout";
import { AgentBasicSettingsPage } from "@/features/agent/AgentBasicSettingsPage";
import { AgentKnowledgePage } from "@/features/agent/AgentKnowledgePage";
import { AgentRulesPage } from "@/features/agent/AgentRulesPage";
import { AgentServicesPage } from "@/features/agent/AgentServicesPage";
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
  captureAnalyticsEvent,
  identifyOperator,
  resetAnalyticsIdentity,
  trackPageView,
} from "@/lib/analytics";
import { useResetAuthScopedClientStateOnSignOut } from "@/lib/auth-scoped-client-state";
import { AI_SMS_DASHBOARD_ENABLED } from "@/lib/release-flags";

type ActiveBusiness = {
  _id: Id<"businesses">;
  name: string;
  slug: string;
  onboardingStage?: string;
  websiteUrl?: string;
};

type ActiveBusinessEntry = {
  business: ActiveBusiness;
  membership: {
    role: string;
  };
};

const TENANT_ADMIN_ROLES = new Set(["business_owner", "business_admin", "owner"]);

function hasTenantAdminAccess(role: string | undefined): boolean {
  return role !== undefined && TENANT_ADMIN_ROLES.has(role);
}

function RequireAuth(props: { children: ReactNode }) {
  const auth = useConvexAuth();

  if (auth.isLoading) {
    return <LoadingScreen />;
  }

  if (!auth.isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  return props.children;
}

function PublicOnly(props: { children: ReactNode }) {
  const auth = useConvexAuth();

  if (auth.isLoading) {
    return <LoadingScreen />;
  }

  if (auth.isAuthenticated) {
    return <Navigate replace to="/" />;
  }

  return props.children;
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

/**
 * Map a server-side onboarding stage to its dashboard route. Mirrors the
 * canonical stage→route table in `convex/lib/onboardingStage.ts`.
 */
function onboardingRouteForStage(stage: string | undefined): string | null {
  switch (stage) {
    case "create_business":
      return "/onboarding/business";
    case "website":
      return "/onboarding/website";
    case "knowledge":
      return "/onboarding/knowledge";
    case "greeting":
      return "/onboarding/greeting";
    case "verify_phone":
      return "/onboarding/verify-phone";
    case "verify_phone_code":
      return "/onboarding/verify-phone/code";
    case "phone_number":
    case "phone_number_claiming":
      return "/onboarding/number";
    case "plan":
      return "/onboarding/plan";
    case "attribution":
      return "/onboarding/attribution";
    default:
      return null;
  }
}

const onboardingStageSteps: Record<string, number> = {
  create_business: 2,
  website: 3,
  knowledge: 4,
  greeting: 5,
  verify_phone: 6,
  verify_phone_code: 7,
  phone_number: 8,
  phone_number_claiming: 8,
  plan: 9,
  attribution: 10,
  completed: 11,
};

function canVisitOnboardingStage(
  currentStage: string | undefined,
  targetStage: string,
): boolean {
  const currentStep = currentStage ? onboardingStageSteps[currentStage] : undefined;
  const targetStep = onboardingStageSteps[targetStage];

  return currentStep !== undefined && targetStep !== undefined && targetStep <= currentStep;
}

function onboardingNavigableStep(stage: string | undefined): number {
  return stage ? (onboardingStageSteps[stage] ?? 1) : 1;
}

function hasJustClaimedPhoneNumberState(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    "justClaimedPhoneNumber" in state &&
    (state as { justClaimedPhoneNumber?: unknown }).justClaimedPhoneNumber === true
  );
}

function isPhoneNumberClaimBridgeStage(stage: string | undefined): boolean {
  return stage === "phone_number" || stage === "phone_number_claiming";
}

function isPhoneVerificationStage(stage: string | undefined): boolean {
  return stage === "verify_phone" || stage === "verify_phone_code";
}

function WorkspaceSetupPendingPage(props: { businessName?: string }) {
  const { t } = useTranslation("onboarding");

  return (
    <div className="mx-auto flex min-h-[420px] w-full max-w-2xl flex-col justify-center py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">
          {t("adminRequired.eyebrow")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("adminRequired.title")}
        </h1>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          {props.businessName
            ? t("adminRequired.descriptionWithBusiness", {
                businessName: props.businessName,
              })
            : t("adminRequired.description")}
        </p>
      </div>

      <div className="mt-8 rounded-xl border bg-muted/30 p-6">
        <p className="text-sm font-medium text-foreground">
          {t("adminRequired.statusTitle")}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("adminRequired.statusDescription")}
        </p>
      </div>
    </div>
  );
}

function OnboardingSetupPendingPage(props: {
  businessName?: string;
  onSignOut: () => void;
}) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();

  return (
    <OnboardingShell
      description={
        props.businessName
          ? t("adminRequired.descriptionWithBusiness", {
              businessName: props.businessName,
            })
          : t("adminRequired.description")
      }
      eyebrow={t("adminRequired.eyebrow")}
      onSignOut={props.onSignOut}
      progress={null}
      title={t("adminRequired.title")}
    >
      <div className="rounded-xl border bg-muted/30 p-6 text-left">
        <p className="text-sm font-medium text-foreground">
          {t("adminRequired.statusTitle")}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("adminRequired.statusDescription")}
        </p>
      </div>
      <Button className="mt-6 h-11 w-full" onClick={() => navigate("/")} type="button">
        {t("adminRequired.goToWorkspace")}
      </Button>
    </OnboardingShell>
  );
}

function getNonAdminOnboardingElement(
  activeBusiness: ActiveBusiness,
  canManageTenant: boolean,
  onSignOut: () => void,
): ReactNode | null {
  if (canManageTenant) {
    return null;
  }

  if (!onboardingRouteForStage(activeBusiness.onboardingStage)) {
    return <Navigate replace to="/" />;
  }

  return (
    <OnboardingSetupPendingPage
      businessName={activeBusiness.name}
      onSignOut={onSignOut}
    />
  );
}

function WorkspaceShell() {
  const { signOut } = useAuthActions();
  const location = useLocation();
  const currentUser = useQuery(api.users.current, {});
  const businesses = useQuery(api.businesses.admin.listForCurrentUser, {});
  const activeBusinessEntry = selectActiveBusinessEntry(currentUser, businesses);
  const activeBusiness = activeBusinessEntry?.business ?? null;
  const canManageTenant = hasTenantAdminAccess(activeBusinessEntry?.membership.role);
  const businessId = activeBusiness?._id;
  const billingStatus = useQuery(
    api.billing.getStatus,
    businessId ? { businessId } : "skip",
  );
  const isBootstrapLoading = businesses === undefined || currentUser === undefined;
  const previousBusinessIdRef = useRef<string | null>(null);
  const showUpgradeToPro =
    billingStatus?.hasCheckoutAccess === true &&
    billingStatus.availableCheckoutPlans.includes("pro") &&
    billingStatus.plan === "free_cloud";
  const onboardingTarget = activeBusiness
    ? onboardingRouteForStage(activeBusiness.onboardingStage)
    : null;
  const shouldShowSetupPending =
    !isBootstrapLoading && Boolean(activeBusiness && onboardingTarget && !canManageTenant);
  const shouldBridgeOnboardingCheckoutSuccess =
    !isBootstrapLoading &&
    activeBusiness &&
    canManageTenant &&
    onboardingTarget === "/onboarding/plan" &&
    location.pathname === "/settings/plan" &&
    new URLSearchParams(location.search).get("checkout") === "success";

  async function handleSignOut(): Promise<void> {
    resetAnalyticsIdentity();
    await signOut();
  }

  useEffect(() => {
    if (isBootstrapLoading) {
      return;
    }

    if (!currentUser?._id) {
      return;
    }

    identifyOperator({
      userId: String(currentUser._id),
      ...(businessId ? { businessId: String(businessId) } : {}),
      deploymentMode: import.meta.env.VITE_DEPLOYMENT_MODE ?? "development",
    });
  }, [businessId, currentUser?._id, isBootstrapLoading]);

  useEffect(() => {
    if (isBootstrapLoading) {
      return;
    }

    if (!businessId) {
      return;
    }

    trackPageView(location.pathname, businessId ? String(businessId) : undefined);
  }, [businessId, isBootstrapLoading, location.pathname]);

  useEffect(() => {
    if (isBootstrapLoading) {
      return;
    }

    const nextBusinessId = businessId ? String(businessId) : null;
    const previousBusinessId = previousBusinessIdRef.current;
    previousBusinessIdRef.current = nextBusinessId;

    if (!previousBusinessId || !nextBusinessId || previousBusinessId === nextBusinessId) {
      return;
    }

    captureAnalyticsEvent("web.workspace.business_switched", {
      businessId: nextBusinessId,
      previousBusinessId,
    });
  }, [businessId, isBootstrapLoading]);

  // No business yet → user just signed up. Send them to the very first
  // onboarding step so they can name their business.
  if (!isBootstrapLoading && !activeBusiness) {
    if (location.pathname !== "/onboarding/business") {
      return <Navigate replace to="/onboarding/business" />;
    }
  }

  // Honour the server-side onboarding stage. If the active business hasn't
  // completed onboarding, redirect to the right step.
  if (!isBootstrapLoading && activeBusiness && onboardingTarget && canManageTenant) {
    if (shouldBridgeOnboardingCheckoutSuccess) {
      return (
        <Navigate
          replace
          to={{
            pathname: onboardingTarget,
            search: location.search,
          }}
        />
      );
    }

    const isNumberClaimPlanBridge =
      location.pathname === "/onboarding/plan" &&
      hasJustClaimedPhoneNumberState(location.state) &&
      isPhoneNumberClaimBridgeStage(activeBusiness.onboardingStage);
    if (location.pathname !== onboardingTarget && !isNumberClaimPlanBridge) {
      return <Navigate replace to={onboardingTarget} />;
    }
  }

  const usesFixedMain = AI_SMS_DASHBOARD_ENABLED && location.pathname === "/messages";

  return (
    <AuthenticatedLayout
      isLoading={isBootstrapLoading}
      onSignOut={() => void handleSignOut()}
      {...(businessId ? { businessId } : {})}
      {...(activeBusiness?.name ? { businessName: activeBusiness.name } : {})}
      {...(currentUser?.image ? { operatorAvatar: currentUser.image } : {})}
      {...(currentUser?.email ? { operatorEmail: currentUser.email } : {})}
      {...(
        currentUser?.displayName ?? currentUser?.name
          ? { operatorName: currentUser.displayName ?? currentUser.name! }
          : {}
      )}
      showUpgradeToPro={showUpgradeToPro}
    >
      <Main className="flex flex-1 flex-col" fixed={usesFixedMain}>
        {isBootstrapLoading ? (
          <WorkspaceRouteSkeleton pathname={location.pathname} />
        ) : shouldShowSetupPending ? (
          <WorkspaceSetupPendingPage
            {...(activeBusiness?.name ? { businessName: activeBusiness.name } : {})}
          />
        ) : (
          <Routes>
            <Route element={<HomePage {...(businessId ? { businessId } : {})} />} path="/" />
            <Route element={<CallsPage {...(businessId ? { businessId } : {})} />} path="/calls" />
            <Route
              element={<CallDetailPage {...(businessId ? { businessId } : {})} />}
              path="/calls/:callId"
            />
            {AI_SMS_DASHBOARD_ENABLED && (
              <Route
                element={<MessagesPage {...(businessId ? { businessId } : {})} />}
                path="/messages"
              />
            )}
            <Route
              element={<AnalyticsPage {...(businessId ? { businessId } : {})} />}
              path="/analytics"
            />
            <Route
              element={
                <AgentLayout
                  {...(businessId ? { businessId } : {})}
                  canManageTenant={canManageTenant}
                />
              }
              path="/agent/*"
            >
              <Route
                element={
                  businessId ? (
                    <AgentBasicSettingsPage
                      businessId={businessId}
                      canManageTenant={canManageTenant}
                    />
                  ) : (
                    <Navigate replace to="/agent" />
                  )
                }
                index
              />
              <Route
                element={
                  businessId ? (
                    <AgentBasicSettingsPage
                      businessId={businessId}
                      canManageTenant={canManageTenant}
                    />
                  ) : (
                    <Navigate replace to="/agent" />
                  )
                }
                path="basic-settings"
              />
              <Route
                element={
                  businessId ? (
                    <AgentKnowledgePage
                      businessId={businessId}
                      canManageTenant={canManageTenant}
                      section="knowledge"
                    />
                  ) : (
                    <Navigate replace to="/agent" />
                  )
                }
                path="knowledge"
              />
              <Route
                element={
                  businessId ? (
                    <AgentServicesPage
                      businessId={businessId}
                      canManageTenant={canManageTenant}
                    />
                  ) : (
                    <Navigate replace to="/agent" />
                  )
                }
                path="services"
              />
              <Route
                element={
                  businessId ? (
                    <AgentRulesPage
                      businessId={businessId}
                      canManageTenant={canManageTenant}
                    />
                  ) : (
                    <Navigate replace to="/agent" />
                  )
                }
                path="rules"
              />
              <Route element={<Navigate replace to="/agent" />} path="integrations" />
              <Route element={<Navigate replace to="/agent" />} path="*" />
            </Route>
            <Route
              element={
                businessId ? (
                  <IntegrationsPage businessId={businessId} />
                ) : (
                  <Navigate replace to="/" />
                )
              }
              path="/integrations"
            />
            <Route element={<ContactsPage {...(businessId ? { businessId } : {})} />} path="/contacts" />
            <Route
              element={<ContactDetailPage {...(businessId ? { businessId } : {})} />}
              path="/contacts/:contactId"
            />
            <Route
              element={<SettingsLayout {...(businessId ? { businessId } : {})} />}
              path="/settings"
            >
              <Route element={<Navigate replace to="/settings/usage" />} index />
              <Route
                element={
                  businessId ? (
                    <SettingsBusinessPage
                      businessId={businessId}
                      canManageTenant={canManageTenant}
                    />
                  ) : (
                    <Navigate replace to="/settings/usage" />
                  )
                }
                path="team"
              />
              <Route
                element={
                  businessId ? (
                    <SettingsAppearancePage businessId={businessId} />
                  ) : (
                    <Navigate replace to="/settings" />
                  )
                }
                path="appearance"
              />
              <Route
                element={
                  businessId ? (
                    <SettingsBillingPage businessId={businessId} />
                  ) : (
                    <Navigate replace to="/settings" />
                  )
                }
                path="plan"
              />
              {AI_SMS_DASHBOARD_ENABLED && (
                <Route
                  element={
                    businessId ? (
                      <SettingsBillingCompliancePage businessId={businessId} />
                    ) : (
                      <Navigate replace to="/settings" />
                    )
                  }
                  path="plan/ai-sms-compliance"
                />
              )}
              <Route
                element={
                  businessId ? (
                    <SettingsBillingUsagePage businessId={businessId} />
                  ) : (
                    <Navigate replace to="/settings" />
                  )
                }
                path="usage"
              />
              <Route
                element={
                  businessId ? (
                    <SettingsNotificationsPage businessId={businessId} />
                  ) : (
                    <Navigate replace to="/settings" />
                  )
                }
                path="notifications"
              />
            </Route>
            <Route element={<SettingsAccountPage />} path="/settings/account" />
            <Route element={<Navigate replace to="/" />} path="*" />
          </Routes>
        )}
      </Main>
    </AuthenticatedLayout>
  );
}

/**
 * Wrap an authenticated onboarding route, providing common loading state +
 * sign-out handler. Renders `children` only once Convex auth + the user
 * record + the business list have all loaded.
 */
function useOnboardingContext() {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const currentUser = useQuery(api.users.current, {});
  const businesses = useQuery(api.businesses.admin.listForCurrentUser, {});
  const activeBusinessEntry = selectActiveBusinessEntry(currentUser, businesses);
  const activeBusiness = activeBusinessEntry?.business ?? null;
  const canManageTenant = hasTenantAdminAccess(activeBusinessEntry?.membership.role);
  const businessId = activeBusiness?._id;

  useEffect(() => {
    if (businesses === undefined || currentUser === undefined) {
      return;
    }
    if (!currentUser?._id || !businessId) {
      return;
    }
    identifyOperator({
      userId: String(currentUser._id),
      businessId: String(businessId),
      deploymentMode: import.meta.env.VITE_DEPLOYMENT_MODE ?? "development",
    });
  }, [businessId, currentUser?._id, businesses, currentUser]);

  async function handleSignOut(): Promise<void> {
    resetAnalyticsIdentity();
    await signOut();
  }

  return {
    currentUser,
    businesses,
    activeBusiness,
    canManageTenant,
    isLoading: businesses === undefined || currentUser === undefined,
    onSignOut: () => void handleSignOut(),
    navigate,
  };
}

function OnboardingBusinessRoute() {
  const ctx = useOnboardingContext();

  if (ctx.isLoading) {
    return <OnboardingRouteSkeleton />;
  }

  if (ctx.activeBusiness) {
    const nonAdminElement = getNonAdminOnboardingElement(
      ctx.activeBusiness,
      ctx.canManageTenant,
      ctx.onSignOut,
    );
    if (nonAdminElement) {
      return nonAdminElement;
    }

    const stage = ctx.activeBusiness.onboardingStage;
    if (stage && !canVisitOnboardingStage(stage, "create_business")) {
      const target = onboardingRouteForStage(stage) ?? "/";
      return <Navigate replace to={target} />;
    }
  }

  return (
    <OnboardingBusinessNamePage
      {...(ctx.activeBusiness
        ? {
            businessId: ctx.activeBusiness._id,
            businessName: ctx.activeBusiness.name,
            progressNavigableUntil: onboardingNavigableStep(
              ctx.activeBusiness.onboardingStage,
            ),
          }
        : {})}
      onSignOut={ctx.onSignOut}
    />
  );
}

function OnboardingWebsiteRoute() {
  const ctx = useOnboardingContext();

  if (ctx.isLoading) {
    return <OnboardingRouteSkeleton />;
  }

  if (!ctx.activeBusiness) {
    return <Navigate replace to="/onboarding/business" />;
  }

  const nonAdminElement = getNonAdminOnboardingElement(
    ctx.activeBusiness,
    ctx.canManageTenant,
    ctx.onSignOut,
  );
  if (nonAdminElement) {
    return nonAdminElement;
  }

  if (!canVisitOnboardingStage(ctx.activeBusiness.onboardingStage, "website")) {
    return <Navigate replace to={onboardingRouteForStage(ctx.activeBusiness.onboardingStage) ?? "/"} />;
  }

  return (
    <OnboardingWebsitePage
      businessId={ctx.activeBusiness._id}
      onSignOut={ctx.onSignOut}
      progressNavigableUntil={onboardingNavigableStep(ctx.activeBusiness.onboardingStage)}
      {...(ctx.activeBusiness.websiteUrl
        ? { websiteUrl: ctx.activeBusiness.websiteUrl }
        : {})}
    />
  );
}

function OnboardingKnowledgeRoute() {
  const ctx = useOnboardingContext();

  if (ctx.isLoading) {
    return <OnboardingRouteSkeleton />;
  }

  if (!ctx.activeBusiness) {
    return <Navigate replace to="/onboarding/business" />;
  }

  const nonAdminElement = getNonAdminOnboardingElement(
    ctx.activeBusiness,
    ctx.canManageTenant,
    ctx.onSignOut,
  );
  if (nonAdminElement) {
    return nonAdminElement;
  }

  if (!canVisitOnboardingStage(ctx.activeBusiness.onboardingStage, "knowledge")) {
    return <Navigate replace to={onboardingRouteForStage(ctx.activeBusiness.onboardingStage) ?? "/"} />;
  }

  return (
    <OnboardingKnowledgePage
      businessId={ctx.activeBusiness._id}
      onSignOut={ctx.onSignOut}
      progressNavigableUntil={onboardingNavigableStep(ctx.activeBusiness.onboardingStage)}
    />
  );
}

function OnboardingGreetingRoute() {
  const ctx = useOnboardingContext();

  if (ctx.isLoading) {
    return <OnboardingRouteSkeleton />;
  }

  if (!ctx.activeBusiness) {
    return <Navigate replace to="/onboarding/business" />;
  }

  const nonAdminElement = getNonAdminOnboardingElement(
    ctx.activeBusiness,
    ctx.canManageTenant,
    ctx.onSignOut,
  );
  if (nonAdminElement) {
    return nonAdminElement;
  }

  if (!canVisitOnboardingStage(ctx.activeBusiness.onboardingStage, "greeting")) {
    return <Navigate replace to={onboardingRouteForStage(ctx.activeBusiness.onboardingStage) ?? "/"} />;
  }

  return (
    <OnboardingGreetingPage
      businessId={ctx.activeBusiness._id}
      businessName={ctx.activeBusiness.name}
      onSignOut={ctx.onSignOut}
      progressNavigableUntil={onboardingNavigableStep(ctx.activeBusiness.onboardingStage)}
    />
  );
}

function OnboardingVerifyPhoneRoute() {
  const ctx = useOnboardingContext();
  const navigate = useNavigate();
  const reuseVerifiedPhoneForOnboarding = useObservedAction(
    api.onboarding.phoneVerification.reuseVerifiedPhoneForOnboarding,
  );
  const [isSkipping, setIsSkipping] = useState(false);
  const [hasAttemptedAutoSkip, setHasAttemptedAutoSkip] = useState(false);
  const hasReusableVerifiedPhone = Boolean(
    ctx.currentUser?.phone && ctx.currentUser?.phoneVerificationTime,
  );

  useEffect(() => {
    if (
      ctx.isLoading ||
      !ctx.activeBusiness ||
      !ctx.canManageTenant ||
      ctx.activeBusiness.onboardingStage !== "verify_phone" ||
      !hasReusableVerifiedPhone ||
      hasAttemptedAutoSkip ||
      isSkipping
    ) {
      return;
    }

    let cancelled = false;
    setIsSkipping(true);
    setHasAttemptedAutoSkip(true);
    void reuseVerifiedPhoneForOnboarding({
      businessId: ctx.activeBusiness._id,
    })
      .then(() => {
        if (!cancelled) {
          navigate("/onboarding/number", { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsSkipping(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    ctx.isLoading,
    ctx.activeBusiness,
    ctx.canManageTenant,
    hasReusableVerifiedPhone,
    hasAttemptedAutoSkip,
    isSkipping,
    navigate,
    reuseVerifiedPhoneForOnboarding,
  ]);

  if (ctx.isLoading) {
    return <OnboardingRouteSkeleton />;
  }

  if (!ctx.activeBusiness) {
    return <Navigate replace to="/onboarding/business" />;
  }

  const nonAdminElement = getNonAdminOnboardingElement(
    ctx.activeBusiness,
    ctx.canManageTenant,
    ctx.onSignOut,
  );
  if (nonAdminElement) {
    return nonAdminElement;
  }

  if (!isPhoneVerificationStage(ctx.activeBusiness.onboardingStage)) {
    return <Navigate replace to={onboardingRouteForStage(ctx.activeBusiness.onboardingStage) ?? "/"} />;
  }

  if (isSkipping) {
    return <OnboardingRouteSkeleton />;
  }

  return (
    <OnboardingVerifyPhonePage
      businessId={ctx.activeBusiness._id}
      {...(ctx.currentUser?.phone ? { currentUserPhone: ctx.currentUser.phone } : {})}
      onSignOut={ctx.onSignOut}
      progressNavigableUntil={onboardingNavigableStep(ctx.activeBusiness.onboardingStage)}
    />
  );
}

function OnboardingVerifyPhoneCodeRoute() {
  const ctx = useOnboardingContext();
  const latestAttempt = useQuery(
    api.onboarding.phoneVerificationLookup.getLatestPhoneVerificationAttempt,
    ctx.activeBusiness ? { businessId: ctx.activeBusiness._id } : "skip",
  );

  if (ctx.isLoading) {
    return <OnboardingRouteSkeleton />;
  }

  if (!ctx.activeBusiness) {
    return <Navigate replace to="/onboarding/business" />;
  }

  const nonAdminElement = getNonAdminOnboardingElement(
    ctx.activeBusiness,
    ctx.canManageTenant,
    ctx.onSignOut,
  );
  if (nonAdminElement) {
    return nonAdminElement;
  }

  if (!isPhoneVerificationStage(ctx.activeBusiness.onboardingStage)) {
    return <Navigate replace to={onboardingRouteForStage(ctx.activeBusiness.onboardingStage) ?? "/"} />;
  }

  if (latestAttempt === undefined) {
    return <OnboardingRouteSkeleton />;
  }

  if (!latestAttempt) {
    return <Navigate replace to="/onboarding/verify-phone" />;
  }

  if (latestAttempt.status === "approved") {
    return <Navigate replace to="/onboarding/number" />;
  }

  return (
    <OnboardingVerifyPhoneCodePage
      businessId={ctx.activeBusiness._id}
      onSignOut={ctx.onSignOut}
      phoneE164={latestAttempt.phoneE164}
      progressNavigableUntil={onboardingNavigableStep(ctx.activeBusiness.onboardingStage)}
    />
  );
}

function OnboardingNumberRoute() {
  const ctx = useOnboardingContext();
  const latestAttempt = useQuery(
    api.onboarding.phoneVerificationLookup.getLatestPhoneVerificationAttempt,
    ctx.activeBusiness ? { businessId: ctx.activeBusiness._id } : "skip",
  );

  if (ctx.isLoading) {
    return <OnboardingRouteSkeleton />;
  }

  if (!ctx.activeBusiness) {
    return <Navigate replace to="/onboarding/business" />;
  }

  const nonAdminElement = getNonAdminOnboardingElement(
    ctx.activeBusiness,
    ctx.canManageTenant,
    ctx.onSignOut,
  );
  if (nonAdminElement) {
    return nonAdminElement;
  }

  const canVisitNumber = canVisitOnboardingStage(
    ctx.activeBusiness.onboardingStage,
    "phone_number",
  );
  const canVerifyPhoneCode = canVisitOnboardingStage(
    ctx.activeBusiness.onboardingStage,
    "verify_phone_code",
  );
  const hasApprovedVerification = latestAttempt?.status === "approved";

  if (!canVisitNumber && canVerifyPhoneCode && latestAttempt === undefined) {
    return <OnboardingRouteSkeleton />;
  }

  if (!canVisitNumber && !hasApprovedVerification) {
    return <Navigate replace to={onboardingRouteForStage(ctx.activeBusiness.onboardingStage) ?? "/"} />;
  }

  return (
    <OnboardingNumberPage
      businessId={ctx.activeBusiness._id}
      isComplete={canVisitOnboardingStage(ctx.activeBusiness.onboardingStage, "plan")}
      onSignOut={ctx.onSignOut}
      progressNavigableUntil={Math.max(
        onboardingNavigableStep(ctx.activeBusiness.onboardingStage),
        hasApprovedVerification ? 8 : 1,
      )}
    />
  );
}

function OnboardingPlanRoute() {
  const ctx = useOnboardingContext();
  const location = useLocation();

  if (ctx.isLoading) {
    return <OnboardingRouteSkeleton />;
  }

  if (!ctx.activeBusiness) {
    return <Navigate replace to="/onboarding/business" />;
  }

  const nonAdminElement = getNonAdminOnboardingElement(
    ctx.activeBusiness,
    ctx.canManageTenant,
    ctx.onSignOut,
  );
  if (nonAdminElement) {
    return nonAdminElement;
  }

  const canUseNumberClaimBridge =
    hasJustClaimedPhoneNumberState(location.state) &&
    isPhoneNumberClaimBridgeStage(ctx.activeBusiness.onboardingStage);

  if (
    !canVisitOnboardingStage(ctx.activeBusiness.onboardingStage, "plan") &&
    !canUseNumberClaimBridge
  ) {
    return <Navigate replace to={onboardingRouteForStage(ctx.activeBusiness.onboardingStage) ?? "/"} />;
  }

  return (
    <OnboardingPlanPage
      businessId={ctx.activeBusiness._id}
      onSignOut={ctx.onSignOut}
      progressNavigableUntil={onboardingNavigableStep(ctx.activeBusiness.onboardingStage)}
    />
  );
}

function OnboardingAttributionRoute() {
  const ctx = useOnboardingContext();

  if (ctx.isLoading) {
    return <OnboardingRouteSkeleton />;
  }

  if (!ctx.activeBusiness) {
    return <Navigate replace to="/onboarding/business" />;
  }

  const nonAdminElement = getNonAdminOnboardingElement(
    ctx.activeBusiness,
    ctx.canManageTenant,
    ctx.onSignOut,
  );
  if (nonAdminElement) {
    return nonAdminElement;
  }

  if (!canVisitOnboardingStage(ctx.activeBusiness.onboardingStage, "attribution")) {
    return <Navigate replace to={onboardingRouteForStage(ctx.activeBusiness.onboardingStage) ?? "/"} />;
  }

  return (
    <OnboardingAttributionPage
      businessId={ctx.activeBusiness._id}
      onSignOut={ctx.onSignOut}
      progressNavigableUntil={onboardingNavigableStep(ctx.activeBusiness.onboardingStage)}
    />
  );
}

export default function App() {
  useResetAuthScopedClientStateOnSignOut();

  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route
            element={
              <PublicOnly>
                <LoginPage />
              </PublicOnly>
            }
            path="/login"
          />
          <Route
            element={
              <PublicOnly>
                <SignupPage />
              </PublicOnly>
            }
            path="/signup"
          />
          <Route
            element={
              <PublicOnly>
                <ForgotPasswordPage />
              </PublicOnly>
            }
            path="/forgot-password"
          />
          <Route element={<ConfirmEmailChangePage />} path="/confirm-email-change" />
          <Route
            element={
              <RequireAuth>
                <OnboardingBusinessRoute />
              </RequireAuth>
            }
            path="/onboarding/business"
          />
          <Route
            element={
              <RequireAuth>
                <OnboardingWebsiteRoute />
              </RequireAuth>
            }
            path="/onboarding/website"
          />
          <Route
            element={
              <RequireAuth>
                <OnboardingKnowledgeRoute />
              </RequireAuth>
            }
            path="/onboarding/knowledge"
          />
          <Route
            element={
              <RequireAuth>
                <OnboardingGreetingRoute />
              </RequireAuth>
            }
            path="/onboarding/greeting"
          />
          <Route
            element={
              <RequireAuth>
                <OnboardingVerifyPhoneRoute />
              </RequireAuth>
            }
            path="/onboarding/verify-phone"
          />
          <Route
            element={
              <RequireAuth>
                <OnboardingVerifyPhoneCodeRoute />
              </RequireAuth>
            }
            path="/onboarding/verify-phone/code"
          />
          <Route
            element={
              <RequireAuth>
                <OnboardingNumberRoute />
              </RequireAuth>
            }
            path="/onboarding/number"
          />
          <Route
            element={
              <RequireAuth>
                <OnboardingPlanRoute />
              </RequireAuth>
            }
            path="/onboarding/plan"
          />
          <Route
            element={
              <RequireAuth>
                <OnboardingAttributionRoute />
              </RequireAuth>
            }
            path="/onboarding/attribution"
          />
          <Route
            element={
              <RequireAuth>
                <WorkspaceShell />
              </RequireAuth>
            }
            path="/*"
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
}
