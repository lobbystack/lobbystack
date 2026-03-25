import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";

import { demoSnapshot, type BusinessContextSnapshot } from "@ai-receptionist/shared";

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
import { AutomationsPage } from "@/features/automations/AutomationsPage";
import { AnalyticsPage } from "@/features/analytics/AnalyticsPage";
import { AgentLayout } from "@/features/agent/AgentLayout";
import { AgentBasicSettingsPage } from "@/features/agent/AgentBasicSettingsPage";
import { AgentKnowledgePage } from "@/features/agent/AgentKnowledgePage";
import { AgentRulesPage } from "@/features/agent/AgentRulesPage";
import { AgentServicesPage } from "@/features/agent/AgentServicesPage";
import { CallsPage } from "@/features/calls/CallsPage";
import { ContactsPage } from "@/features/contacts/ContactsPage";
import { HomePage } from "@/features/home/HomePage";
import { MessagesPage } from "@/features/messages/MessagesPage";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { SettingsAppearancePage } from "@/features/settings/SettingsAppearancePage";
import { IntegrationsPage } from "@/features/settings/IntegrationsPage";

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

function WorkspaceShell() {
  const { signOut } = useAuthActions();
  const location = useLocation();
  const currentUser = useQuery(api.users.current, {});
  const businesses = useQuery(api.businesses.admin.listForCurrentUser, {});
  const activeBusiness = businesses?.[0]?.business;
  const businessId = activeBusiness?._id;
  const snapshot = useQuery(
    api.ai.context.snapshots.getForDashboard,
    businessId ? { businessId } : "skip",
  );
  const resolvedSnapshot: BusinessContextSnapshot =
    snapshot == null
      ? demoSnapshot
      : {
          ...demoSnapshot,
          ...snapshot,
          defaultLocale:
            snapshot.defaultLocale === "en" || snapshot.defaultLocale === "fr"
              ? snapshot.defaultLocale
              : demoSnapshot.defaultLocale,
          businessType:
            snapshot.businessType === "clinic" ||
            snapshot.businessType === "repair_shop" ||
            snapshot.businessType === "salon" ||
            snapshot.businessType === "service_company" ||
            snapshot.businessType === "other"
              ? snapshot.businessType
              : demoSnapshot.businessType,
          transferPolicy: {
            ...demoSnapshot.transferPolicy,
            ...(snapshot.transferPolicy ?? {}),
            mode:
              snapshot.transferPolicy?.mode === "never" ||
              snapshot.transferPolicy?.mode === "always" ||
              snapshot.transferPolicy?.mode === "on_request" ||
              snapshot.transferPolicy?.mode === "on_urgent" ||
              snapshot.transferPolicy?.mode === "during_business_hours"
                ? snapshot.transferPolicy.mode
                : demoSnapshot.transferPolicy.mode,
          },
          contactChannels: {
            ...demoSnapshot.contactChannels,
            ...(snapshot.contactChannels ?? {}),
          },
        };

  if (businesses === undefined) {
    return <LoadingScreen />;
  }

  const usesFixedMain =
    location.pathname === "/messages" || location.pathname === "/calls";

  return (
    <AuthenticatedLayout
      businessName={activeBusiness?.name ?? "AI Receptionist"}
      {...(activeBusiness?.slug ? { businessSlug: activeBusiness.slug } : {})}
      onSignOut={() => void signOut()}
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
          <Route
            element={<HomePage {...(businessId ? { businessId } : {})} snapshot={resolvedSnapshot} />}
            path="/"
          />
          <Route element={<CallsPage {...(businessId ? { businessId } : {})} />} path="/calls" />
          <Route
            element={<MessagesPage {...(businessId ? { businessId } : {})} />}
            path="/messages"
          />
          <Route
            element={<AutomationsPage {...(businessId ? { businessId } : {})} />}
            path="/automations"
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
            <Route element={<Navigate replace to="/settings/appearance" />} index />
            <Route
              element={
                businessId ? (
                  <SettingsAppearancePage businessId={businessId} />
                ) : (
                  <Navigate replace to="/settings/appearance" />
                )
              }
              path="appearance"
            />
            <Route
              element={
                businessId ? (
                  <IntegrationsPage businessId={businessId} />
                ) : (
                  <Navigate replace to="/settings/appearance" />
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
