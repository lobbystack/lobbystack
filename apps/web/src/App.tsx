import type { ReactNode } from "react";
import { FormEvent, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslation } from "react-i18next";

import { demoSnapshot, type BusinessContextSnapshot } from "@ai-receptionist/shared";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LoadingScreen } from "@/components/loading-screen";
import { LoginForm } from "@/components/login-form";
import { SignupForm } from "@/components/signup-form";
import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Main } from "@/components/layout/main";
import { AutomationsPage } from "@/features/automations/AutomationsPage";
import { AnalyticsPage } from "@/features/analytics/AnalyticsPage";
import { AgentPage } from "@/features/agent/AgentPage";
import { CallsPage } from "@/features/calls/CallsPage";
import { ContactsPage } from "@/features/contacts/ContactsPage";
import { HomePage } from "@/features/home/HomePage";
import { MessagesPage } from "@/features/messages/MessagesPage";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { SettingsAppearancePage } from "@/features/settings/SettingsAppearancePage";
import { IntegrationsPage } from "@/features/settings/IntegrationsPage";
import { SettingsBusinessPage } from "@/features/settings/SettingsBusinessPage";

function AuthShell(props: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.08),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] px-6 py-10">
      <section className="flex w-full items-center justify-center">
        <div className="w-full max-w-md rounded-[2rem] border border-border/70 bg-card/95 p-8 shadow-xl shadow-black/5">
          {props.children}
        </div>
      </section>
    </div>
  );
}

function getAuthErrorMessage(
  error: unknown,
  flow: "signIn" | "signUp",
  t: (key: string) => string,
): string {
  const message = error instanceof Error ? error.message : "";

  if (flow === "signIn") {
    if (message.includes("InvalidSecret") || message.includes("Invalid credentials")) {
      return t("errors.incorrectCredentials");
    }
    return t("errors.incorrectCredentials");
  }

  if (message.includes("already exists")) {
    return t("errors.accountExists");
  }

  if (message.includes("Invalid password")) {
    return t("errors.invalidPassword");
  }

  return t("errors.signupFailed");
}

function LoginPage() {
  const { t } = useTranslation("auth");
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set("flow", "signIn");
      formData.set("email", email);
      formData.set("password", password);
      const result = await signIn("password", formData);

      if (result.redirect) {
        setStatusMessage(t("status.continuingSignIn"));
        return;
      }

      if (result.signingIn) {
        setStatusMessage(t("status.signedInFinishing"));
        return;
      }

      setStatusMessage(t("status.signInCompleted"));
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, "signIn", t));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <LoginForm
        email={email}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleSubmit}
        password={password}
        statusMessage={statusMessage}
      />
    </AuthShell>
  );
}

function SignupPage() {
  const { t } = useTranslation("auth");
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set("flow", "signUp");
      formData.set("email", email);
      formData.set("password", password);
      const result = await signIn("password", formData);

      if (result.redirect) {
        setStatusMessage(t("status.continuingSignUp"));
        return;
      }

      if (result.signingIn) {
        setStatusMessage(t("status.accountCreatedFinishing"));
        return;
      }

      setStatusMessage(t("status.accountCreatedFinalizing"));
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, "signUp", t));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <SignupForm
        email={email}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleSubmit}
        password={password}
        statusMessage={statusMessage}
      />
    </AuthShell>
  );
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

function WorkspaceShell() {
  const { signOut } = useAuthActions();
  const location = useLocation();
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
            element={<AgentPage {...(businessId ? { businessId } : {})} snapshot={resolvedSnapshot} />}
            path="/agent"
          />
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
