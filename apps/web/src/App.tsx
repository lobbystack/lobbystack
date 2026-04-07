import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LoadingScreen } from "@/components/loading-screen";
import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
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
import { HomePage } from "@/features/home/HomePage";
import { MessagesPage } from "@/features/messages/MessagesPage";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { SettingsAppearancePage } from "@/features/settings/SettingsAppearancePage";
import { IntegrationsPage } from "@/features/settings/IntegrationsPage";
import { SettingsBusinessPage } from "@/features/settings/SettingsBusinessPage";
import { OnboardingNumberPage } from "@/features/onboarding/OnboardingNumberPage";
import { OnboardingVerifyPhonePage } from "@/features/onboarding/OnboardingVerifyPhonePage";
import {
  captureAnalyticsEvent,
  identifyOperator,
  resetAnalyticsIdentity,
  trackPageView,
} from "@/lib/analytics";

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

function selectActiveBusiness(
  currentUser: { activeBusinessId?: Id<"businesses"> } | undefined | null,
  businesses:
    | Array<{
        business: {
          _id: Id<"businesses">;
          onboardingStage?: string;
          name: string;
          slug: string;
        };
      }>
    | undefined,
) {
  const activeBusinessId = currentUser?.activeBusinessId;
  if (!businesses || businesses.length === 0) {
    return null;
  }

  return (
    businesses.find((entry) => entry.business._id === activeBusinessId)?.business ??
    businesses[0]?.business ??
    null
  );
}

function WorkspaceShell() {
  const { signOut } = useAuthActions();
  const location = useLocation();
  const currentUser = useQuery(api.users.current, {});
  const businesses = useQuery(api.businesses.admin.listForCurrentUser, {});
  const activeBusiness = selectActiveBusiness(currentUser, businesses);
  const businessId = activeBusiness?._id;
  const previousBusinessIdRef = useRef<string | null>(null);

  async function handleSignOut(): Promise<void> {
    resetAnalyticsIdentity();
    await signOut();
  }

  useEffect(() => {
    if (!currentUser?._id) {
      return;
    }

    identifyOperator({
      userId: String(currentUser._id),
      ...(businessId ? { businessId: String(businessId) } : {}),
      deploymentMode: import.meta.env.VITE_DEPLOYMENT_MODE ?? "development",
    });
  }, [businessId, currentUser?._id]);

  useEffect(() => {
    if (!businessId) {
      return;
    }

    trackPageView(location.pathname, businessId ? String(businessId) : undefined);
  }, [businessId, location.pathname]);

  useEffect(() => {
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
  }, [businessId]);

  if (businesses === undefined || currentUser === undefined) {
    return <LoadingScreen />;
  }

  if (
    activeBusiness?.onboardingStage === "phone_number" &&
    !currentUser?.phoneVerificationTime &&
    location.pathname !== "/onboarding/verify-phone"
  ) {
    return <Navigate replace to="/onboarding/verify-phone" />;
  }

  if (activeBusiness?.onboardingStage === "verify_phone") {
    if (location.pathname !== "/onboarding/verify-phone") {
      return <Navigate replace to="/onboarding/verify-phone" />;
    }
  } else if (
    (activeBusiness?.onboardingStage === "phone_number" ||
      activeBusiness?.onboardingStage === "phone_number_claiming") &&
    location.pathname !== "/onboarding/number"
  ) {
    return <Navigate replace to="/onboarding/number" />;
  }

  const usesFixedMain =
    location.pathname === "/messages" || location.pathname === "/calls";

  return (
    <AuthenticatedLayout
      businessName={activeBusiness?.name ?? "AI Receptionist"}
      onSignOut={() => void handleSignOut()}
      {...(currentUser?.image ? { operatorAvatar: currentUser.image } : {})}
      {...(currentUser?.email ? { operatorEmail: currentUser.email } : {})}
      {...(
        currentUser?.displayName ?? currentUser?.name
          ? { operatorName: currentUser.displayName ?? currentUser.name! }
          : {}
      )}
    >
      <Main className="flex flex-1 flex-col" fixed={usesFixedMain}>
        <Routes>
          <Route element={<HomePage {...(businessId ? { businessId } : {})} />} path="/" />
          <Route element={<CallsPage {...(businessId ? { businessId } : {})} />} path="/calls" />
          <Route
            element={<CallDetailPage {...(businessId ? { businessId } : {})} />}
            path="/calls/:callId"
          />
          <Route
            element={<MessagesPage {...(businessId ? { businessId } : {})} />}
            path="/messages"
          />
          <Route
            element={<AnalyticsPage {...(businessId ? { businessId } : {})} />}
            path="/analytics"
          />
          <Route
            element={<AgentLayout {...(businessId ? { businessId } : {})} />}
            path="/agent/*"
          >
            <Route
              element={
                businessId ? (
                  <AgentBasicSettingsPage businessId={businessId} />
                ) : (
                  <Navigate replace to="/agent" />
                )
              }
              index
            />
            <Route
              element={
                businessId ? (
                  <AgentBasicSettingsPage businessId={businessId} />
                ) : (
                  <Navigate replace to="/agent" />
                )
              }
              path="basic-settings"
            />
            <Route
              element={
                businessId ? (
                  <AgentKnowledgePage businessId={businessId} section="knowledge" />
                ) : (
                  <Navigate replace to="/agent" />
                )
              }
              path="knowledge"
            />
            <Route
              element={
                businessId ? (
                  <AgentServicesPage businessId={businessId} />
                ) : (
                  <Navigate replace to="/agent" />
                )
              }
              path="services"
            />
            <Route
              element={
                businessId ? (
                  <AgentRulesPage businessId={businessId} />
                ) : (
                  <Navigate replace to="/agent" />
                )
              }
              path="rules"
            />
            <Route element={<Navigate replace to="/agent" />} path="*" />
          </Route>
          <Route element={<ContactsPage {...(businessId ? { businessId } : {})} />} path="/contacts" />
          <Route
            element={<SettingsLayout {...(businessId ? { businessId } : {})} />}
            path="/settings/*"
          >
            <Route
              element={
                businessId ? (
                  <SettingsBusinessPage businessId={businessId} />
                ) : (
                  <Navigate replace to="/settings" />
                )
              }
              index
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
                  <IntegrationsPage businessId={businessId} />
                ) : (
                  <Navigate replace to="/settings" />
                )
              }
              path="integrations"
            />
          </Route>
          <Route element={<Navigate replace to="/" />} path="*" />
        </Routes>
      </Main>
    </AuthenticatedLayout>
  );
}

function OnboardingNumberRoute() {
  const { signOut } = useAuthActions();
  const currentUser = useQuery(api.users.current, {});
  const businesses = useQuery(api.businesses.admin.listForCurrentUser, {});
  const activeBusiness = selectActiveBusiness(currentUser, businesses);

  async function handleSignOut(): Promise<void> {
    resetAnalyticsIdentity();
    await signOut();
  }

  useEffect(() => {
    if (!currentUser?._id || !activeBusiness?._id) {
      return;
    }

    identifyOperator({
      userId: String(currentUser._id),
      businessId: String(activeBusiness._id),
      deploymentMode: import.meta.env.VITE_DEPLOYMENT_MODE ?? "development",
    });
  }, [activeBusiness?._id, currentUser?._id]);

  if (businesses === undefined || currentUser === undefined) {
    return <LoadingScreen />;
  }

  if (!activeBusiness) {
    return <Navigate replace to="/" />;
  }

  if (
    activeBusiness.onboardingStage !== "phone_number" &&
    activeBusiness.onboardingStage !== "phone_number_claiming"
  ) {
    return <Navigate replace to="/" />;
  }

  return (
    <OnboardingNumberPage
      businessId={activeBusiness._id}
      {...(currentUser?.email ? { currentUserEmail: currentUser.email } : {})}
      onSignOut={() => void handleSignOut()}
    />
  );
}

function OnboardingVerifyPhoneRoute() {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const currentUser = useQuery(api.users.current, {});
  const businesses = useQuery(api.businesses.admin.listForCurrentUser, {});
  const reuseVerifiedPhoneForOnboarding = useAction(
    api.onboarding.phoneVerification.reuseVerifiedPhoneForOnboarding,
  );
  const activeBusiness = selectActiveBusiness(currentUser, businesses);
  const [isSkippingVerification, setIsSkippingVerification] = useState(false);
  const [hasAttemptedAutoSkip, setHasAttemptedAutoSkip] = useState(false);
  const hasReusableVerifiedPhone = Boolean(currentUser?.phone && currentUser?.phoneVerificationTime);

  async function handleSignOut(): Promise<void> {
    resetAnalyticsIdentity();
    await signOut();
  }

  useEffect(() => {
    if (!currentUser?._id || !activeBusiness?._id) {
      return;
    }

    identifyOperator({
      userId: String(currentUser._id),
      businessId: String(activeBusiness._id),
      deploymentMode: import.meta.env.VITE_DEPLOYMENT_MODE ?? "development",
    });
  }, [activeBusiness?._id, currentUser?._id]);

  useEffect(() => {
    if (
      businesses === undefined ||
      currentUser === undefined ||
      !activeBusiness ||
      activeBusiness.onboardingStage !== "verify_phone" ||
      !hasReusableVerifiedPhone ||
      isSkippingVerification ||
      hasAttemptedAutoSkip
    ) {
      return;
    }

    let cancelled = false;
    setIsSkippingVerification(true);
    setHasAttemptedAutoSkip(true);

    void reuseVerifiedPhoneForOnboarding({
      businessId: activeBusiness._id,
    })
      .then(() => {
        if (!cancelled) {
          navigate("/onboarding/number", { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsSkippingVerification(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeBusiness,
    businesses,
    currentUser,
    hasReusableVerifiedPhone,
    hasAttemptedAutoSkip,
    isSkippingVerification,
    navigate,
    reuseVerifiedPhoneForOnboarding,
  ]);

  if (businesses === undefined || currentUser === undefined) {
    return <LoadingScreen />;
  }

  if (!activeBusiness) {
    return <Navigate replace to="/" />;
  }

  const requiresPhoneVerification =
    activeBusiness.onboardingStage === "verify_phone" ||
    (activeBusiness.onboardingStage === "phone_number" && !hasReusableVerifiedPhone);

  if (
    isSkippingVerification &&
    activeBusiness.onboardingStage === "verify_phone" &&
    hasReusableVerifiedPhone
  ) {
    return <LoadingScreen />;
  }

  if (!requiresPhoneVerification) {
    return <Navigate replace to="/" />;
  }

  return (
    <OnboardingVerifyPhonePage
      businessId={activeBusiness._id}
      {...(currentUser?.email ? { currentUserEmail: currentUser.email } : {})}
      {...(currentUser?.phone ? { currentUserPhone: currentUser.phone } : {})}
      onSignOut={() => void handleSignOut()}
    />
  );
}

export default function App() {
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
                <OnboardingVerifyPhoneRoute />
              </RequireAuth>
            }
            path="/onboarding/verify-phone"
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
