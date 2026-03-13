import type { CSSProperties, ReactNode } from "react";
import { FormEvent, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslation } from "react-i18next";

import { demoSnapshot } from "@ai-receptionist/shared";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSidebar } from "@/components/app-sidebar";
import { LoadingScreen } from "@/components/loading-screen";
import { LoginForm } from "@/components/login-form";
import { SignupForm } from "@/components/signup-form";
import { SiteHeader } from "@/components/site-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Main } from "@/components/layout/main";
import { AutomationsPage } from "@/features/automations/AutomationsPage";
import { AgentPage } from "@/features/agent/AgentPage";
import { CallsPage } from "@/features/calls/CallsPage";
import { ContactsPage } from "@/features/contacts/ContactsPage";
import { HomePage } from "@/features/home/HomePage";
import { MessagesPage } from "@/features/messages/MessagesPage";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
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
  const businesses = useQuery(api.businesses.admin.listForCurrentUser, {});
  const activeBusiness = businesses?.[0]?.business;
  const businessId = activeBusiness?._id;
  const snapshot = useQuery(
    api.ai.context.snapshots.getForDashboard,
    businessId ? { businessId } : "skip",
  );
  const resolvedSnapshot = snapshot ?? demoSnapshot;

  if (businesses === undefined) {
    return <LoadingScreen />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
        } as CSSProperties
      }
    >
      <AppSidebar
        businessName={activeBusiness?.name ?? "AI Receptionist"}
        businessSlug={activeBusiness?.slug}
        onSignOut={() => void signOut()}
      />
      <SidebarInset className="@container/content">
        <SiteHeader onSignOut={() => void signOut()} />
        <Main className="flex flex-1 flex-col" fixed>
          <Routes>
            <Route element={<HomePage businessId={businessId} snapshot={resolvedSnapshot} />} path="/" />
            <Route element={<CallsPage businessId={businessId} />} path="/calls" />
            <Route element={<MessagesPage businessId={businessId} />} path="/messages" />
            <Route element={<AutomationsPage businessId={businessId} />} path="/automations" />
            <Route
              element={<AgentPage businessId={businessId} snapshot={resolvedSnapshot} />}
              path="/agent"
            />
            <Route element={<ContactsPage businessId={businessId} />} path="/contacts" />
            <Route
              element={<SettingsLayout businessId={businessId} />}
              path="/settings/*"
            >
              <Route
                element={<SettingsBusinessPage businessId={businessId as Id<"businesses">} snapshot={resolvedSnapshot} />}
                index
              />
              <Route
                element={<IntegrationsPage businessId={businessId as Id<"businesses">} />}
                path="integrations"
              />
            </Route>
            <Route element={<Navigate replace to="/" />} path="*" />
          </Routes>
        </Main>
      </SidebarInset>
    </SidebarProvider>
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
