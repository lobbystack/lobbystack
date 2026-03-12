import type { CSSProperties, ReactNode } from "react";
import { FormEvent, useMemo, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  IconChecklist,
  IconClockHour4,
  IconHeadphones,
} from "@tabler/icons-react";

import { demoSnapshot, type BusinessContextSnapshot } from "@ai-receptionist/shared";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSidebar } from "@/components/app-sidebar";
import { LoginForm } from "@/components/login-form";
import { SectionCards } from "@/components/section-cards";
import { SiteHeader } from "@/components/site-header";
import { SignupForm } from "@/components/signup-form";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RecentCallsPanel } from "@/features/calls/RecentCallsPanel";
import { KnowledgeManager } from "@/features/knowledge/KnowledgeManager";
import { PreviewPanel } from "@/features/knowledge/PreviewPanel";
import { BusinessHoursForm } from "@/features/settings/BusinessHoursForm";
import { BookableTeamCard } from "@/features/settings/BookableTeamCard";
import { PhoneNumbersCard } from "@/features/settings/PhoneNumbersCard";
import { BusinessProfileForm } from "@/features/settings/BusinessProfileForm";
import { BusinessSnapshotCard } from "@/features/settings/BusinessSnapshotCard";
import { ServicesCard } from "@/features/settings/ServicesCard";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-6">
      <div className="w-full max-w-sm rounded-3xl border border-border/70 bg-card/90 p-8 text-center shadow-sm">
        <p className="text-sm font-medium tracking-[0.24em] text-muted-foreground uppercase">
          AI Receptionist
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Loading workspace</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Syncing your operator console and receptionist settings.
        </p>
      </div>
    </div>
  );
}

function AuthShell(props: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(24,24,27,0.08),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,244,245,0.94))] px-6 py-10">
      <section className="flex w-full items-center justify-center">
        <div className="w-full max-w-md rounded-[2rem] border border-border/70 bg-card/95 p-8 shadow-xl shadow-black/5">
          {props.children}
        </div>
      </section>
    </div>
  );
}

function getAuthErrorMessage(error: unknown, flow: "signIn" | "signUp"): string {
  const message = error instanceof Error ? error.message : "";

  if (flow === "signIn") {
    if (message.includes("InvalidSecret") || message.includes("Invalid credentials")) {
      return "Incorrect email or password. Please try again.";
    }
    return "Incorrect email or password. Please try again.";
  }

  if (message.includes("already exists")) {
    return "An account with that email already exists. Try signing in instead.";
  }

  if (message.includes("Invalid password")) {
    return "Use a password with at least 8 characters.";
  }

  return "We couldn't create your account. Please try again.";
}

function LoginPage() {
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
        setStatusMessage("Continuing sign-in in a new browser flow...");
        return;
      }

      if (result.signingIn) {
        setStatusMessage("Signed in. Finishing your session...");
        return;
      }

      setStatusMessage("Sign-in completed. Finalizing your session...");
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, "signIn"));
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
        setStatusMessage("Continuing sign-up in a new browser flow...");
        return;
      }

      if (result.signingIn) {
        setStatusMessage("Account created. Finishing your session...");
        return;
      }

      setStatusMessage("Account created. Finalizing your session...");
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, "signUp"));
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

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function BusinessSetupCard() {
  const bootstrapBusiness = useMutation(api.businesses.admin.bootstrapBusiness);
  const [name, setName] = useState("Maple Family Clinic");
  const [slug, setSlug] = useState("maple-family-clinic");
  const [timezone, setTimezone] = useState("America/Toronto");
  const [businessType, setBusinessType] = useState("clinic");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(slugify(value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    setError(null);

    try {
      await bootstrapBusiness({ name, slug, timezone, businessType });
      setStatus("Business created. The receptionist snapshot is refreshing now.");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Failed to create business.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle>Create your first business</CardTitle>
        <CardDescription>
          This bootstraps the tenant, receptionist profile, and the first snapshot used by voice.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                Business name
              </span>
              <Input onChange={(event) => handleNameChange(event.target.value)} value={name} />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                Slug
              </span>
              <Input onChange={(event) => setSlug(slugify(event.target.value))} value={slug} />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                Timezone
              </span>
              <Input onChange={(event) => setTimezone(event.target.value)} value={timezone} />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                Business type
              </span>
              <Select onValueChange={(value) => setBusinessType(value ?? "clinic")} value={businessType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select business type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinic">Clinic</SelectItem>
                  <SelectItem value="repair_shop">Repair shop</SelectItem>
                  <SelectItem value="salon">Salon</SelectItem>
                  <SelectItem value="service_company">Service company</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Creating..." : "Create business"}
            </Button>
            {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
            {error ? <span className="text-sm text-destructive">{error}</span> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function QuickActionsCard(props: {
  businessId: Id<"businesses">;
  businessName: string;
  knowledgeCount: number;
  serviceCount: number;
  configuredDays: number;
  phoneNumberCount: number;
  greeting: string;
}) {
  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
        <CardDescription>
          Keep {props.businessName} ready for calls, SMS, and booking workflows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3">
          <Link className={buttonVariants({ variant: "default" })} to="/settings">
            Configure receptionist profile
          </Link>
          <Link className={buttonVariants({ variant: "outline" })} to="/knowledge">
            Add FAQs and documents
          </Link>
          <Link className={buttonVariants({ variant: "outline" })} to="/inbox">
            Review call inbox
          </Link>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
          <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
            Setup readiness
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            <li>{props.serviceCount} services configured</li>
            <li>{props.configuredDays} days with operating hours</li>
            <li>{props.knowledgeCount} knowledge items indexed</li>
            <li>{props.phoneNumberCount} phone numbers mapped</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
            Current greeting
          </p>
          <p className="mt-3 text-sm leading-6 text-foreground">{props.greeting}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardHome(props: {
  businessId?: Id<"businesses">;
  businessName: string;
  snapshot: BusinessContextSnapshot;
}) {
  const configuration = useQuery(
    api.businesses.catalog.getBusinessConfiguration,
    props.businessId ? { businessId: props.businessId } : "skip",
  );
  const knowledge = useQuery(
    api.ai.context.knowledge.listKnowledge,
    props.businessId ? { businessId: props.businessId } : "skip",
  );
  const recentCalls = useQuery(
    api.voice.runtime.listRecentCalls,
    props.businessId ? { businessId: props.businessId, limit: 6 } : "skip",
  );

  if (!props.businessId) {
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <BusinessSetupCard />
        <BusinessSnapshotCard snapshot={props.snapshot} />
      </div>
    );
  }

  const serviceCount = configuration?.services.length ?? 0;
  const configuredDays = configuration?.hours.length ?? 0;
  const knowledgeCount = (knowledge?.snippets.length ?? 0) + (knowledge?.documents.length ?? 0);
  const phoneNumberCount = configuration?.phoneNumbers.length ?? 0;

  return (
    <div className="space-y-6">
      <SectionCards
        configuredDays={configuredDays}
        knowledgeCount={knowledgeCount}
        recentCallCount={recentCalls?.length ?? 0}
        serviceCount={serviceCount}
        snapshotVersion={props.snapshot.version}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <RecentCallsPanel businessId={props.businessId} />
        <QuickActionsCard
          businessId={props.businessId}
          businessName={props.businessName}
          configuredDays={configuredDays}
          greeting={configuration?.profile?.greeting ?? props.snapshot.greeting}
          knowledgeCount={knowledgeCount}
          phoneNumberCount={phoneNumberCount}
          serviceCount={serviceCount}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
        <PreviewPanel businessId={props.businessId} enabled={Boolean(props.businessId)} />
        <BusinessSnapshotCard snapshot={props.snapshot} />
      </div>
    </div>
  );
}

function InboxPage(props: { businessId?: Id<"businesses"> }) {
  if (!props.businessId) {
    return <BusinessSetupCard />;
  }

  return <RecentCallsPanel businessId={props.businessId} />;
}

function KnowledgePage(props: {
  businessId?: Id<"businesses">;
  snapshot: BusinessContextSnapshot;
}) {
  if (!props.businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
      <KnowledgeManager businessId={props.businessId} />
      <div className="space-y-6">
        <PreviewPanel businessId={props.businessId} enabled />
        <BusinessSnapshotCard snapshot={props.snapshot} />
      </div>
    </div>
  );
}

function SettingsPage(props: {
  businessId?: Id<"businesses">;
  snapshot: BusinessContextSnapshot;
}) {
  if (!props.businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <div className="space-y-6">
        <BusinessProfileForm businessId={props.businessId} />
        <PhoneNumbersCard businessId={props.businessId} />
        <BusinessHoursForm businessId={props.businessId} />
        <ServicesCard businessId={props.businessId} />
        <BookableTeamCard businessId={props.businessId} />
      </div>
      <div className="space-y-6">
        <BusinessSnapshotCard snapshot={props.snapshot} />
        <Card className="border border-border/70 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle>What to do next</CardTitle>
            <CardDescription>
              Tighten the live receptionist behavior before you route real traffic.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/80 p-4">
              <IconChecklist className="mt-0.5 size-4 text-foreground" />
              <span>Set hours, services, and bookable team assignments so booking can suggest real times.</span>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/80 p-4">
              <IconHeadphones className="mt-0.5 size-4 text-foreground" />
              <span>Add transfer rules and a fallback number before handing off urgent calls.</span>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/80 p-4">
              <IconClockHour4 className="mt-0.5 size-4 text-foreground" />
              <span>Refresh your snapshot after major policy changes so voice picks them up quickly.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
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
  const resolvedSnapshot = snapshot ?? demoSnapshot;

  const headerCopy = useMemo(() => {
    const path = location.pathname;
    if (path.startsWith("/inbox")) {
      return {
        title: "Inbox",
        description: "Review captured calls, transcripts, and audio downloads.",
      };
    }
    if (path.startsWith("/knowledge")) {
      return {
        title: "Knowledge",
        description: "Manage FAQs, documents, and preview conversations.",
      };
    }
    if (path.startsWith("/settings")) {
      return {
        title: "Settings",
        description: "Configure the receptionist, hours, services, and transfer policy.",
      };
    }
    return {
      title: "Dashboard",
      description: "Track operational readiness for calls, messages, and booking.",
    };
  }, [location.pathname]);

  if (businesses === undefined) {
    return <LoadingScreen />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "18rem",
          "--header-height": "4.5rem",
        } as CSSProperties
      }
    >
      <AppSidebar
        businessName={activeBusiness?.name ?? "AI Receptionist"}
        businessSlug={activeBusiness?.slug}
        onSignOut={() => void signOut()}
      />
      <SidebarInset>
        <SiteHeader description={headerCopy.description} title={headerCopy.title} />
        <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
          <Routes>
            <Route
              element={
                <DashboardHome
                  businessId={businessId}
                  businessName={activeBusiness?.name ?? resolvedSnapshot.displayName}
                  snapshot={resolvedSnapshot}
                />
              }
              path="/"
            />
            <Route element={<InboxPage businessId={businessId} />} path="/inbox" />
            <Route
              element={<KnowledgePage businessId={businessId} snapshot={resolvedSnapshot} />}
              path="/knowledge"
            />
            <Route
              element={<SettingsPage businessId={businessId} snapshot={resolvedSnapshot} />}
              path="/settings"
            />
            <Route element={<Navigate replace to="/" />} path="*" />
          </Routes>
        </main>
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
