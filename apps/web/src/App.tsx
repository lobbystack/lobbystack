import { FormEvent, useMemo, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";

import { buildVoiceSystemPrompt } from "@ai-receptionist/ai";
import type { BusinessContextSnapshot } from "@ai-receptionist/shared";
import { demoSnapshot } from "@ai-receptionist/testing";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { RecentCallsPanel } from "./features/calls/RecentCallsPanel";
import { KnowledgeManager } from "./features/knowledge/KnowledgeManager";
import { PreviewPanel } from "./features/knowledge/PreviewPanel";
import { BusinessSnapshotCard } from "./features/settings/BusinessSnapshotCard";
import { BusinessHoursForm } from "./features/settings/BusinessHoursForm";
import { BusinessProfileForm } from "./features/settings/BusinessProfileForm";
import { ServicesCard } from "./features/settings/ServicesCard";

function AuthCard() {
  const { signIn, signOut } = useAuthActions();
  const auth = useConvexAuth();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("flow", flow);
    void signIn("password", formData);
  }

  if (auth.isAuthenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="stack">
          <span className="pill">Authenticated</span>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use Convex Auth email and password to access the workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="stack" onSubmit={handleSubmit}>
          <input className="prompt-preview" name="email" type="email" placeholder="Email" required />
          <input className="prompt-preview" name="password" type="password" placeholder="Password" required />
          <input name="flow" type="hidden" value={flow} />
          <Button type="submit">{flow === "signIn" ? "Sign in" : "Sign up"}</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
          >
            {flow === "signIn" ? "Create account instead" : "Use existing account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function OnboardingCard() {
  const bootstrapBusiness = useMutation(api.businesses.admin.bootstrapBusiness);
  const [name, setName] = useState("Maple Family Clinic");
  const [slug, setSlug] = useState("maple-family-clinic");
  const [timezone, setTimezone] = useState("America/Toronto");
  const [businessType, setBusinessType] = useState("clinic");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await bootstrapBusiness({ name, slug, timezone, businessType });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a Business</CardTitle>
        <CardDescription>
          Bootstraps the tenant, default receptionist profile, and the first snapshot.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
          <input className="prompt-preview" value={name} onChange={(event) => setName(event.target.value)} />
          <input className="prompt-preview" value={slug} onChange={(event) => setSlug(event.target.value)} />
          <input className="prompt-preview" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          <select className="prompt-preview" value={businessType} onChange={(event) => setBusinessType(event.target.value)}>
            <option value="clinic">Clinic</option>
            <option value="repair_shop">Repair shop</option>
            <option value="salon">Salon</option>
            <option value="service_company">Service company</option>
            <option value="other">Other</option>
          </select>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create business"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Dashboard(props: {
  snapshot: BusinessContextSnapshot;
  businessId?: Id<"businesses"> | undefined;
  isAuthenticated: boolean;
}) {
  const promptPreview = useMemo(() => buildVoiceSystemPrompt(props.snapshot), [props.snapshot]);

  return (
    <div className="page-grid">
      <section className="stack">
        <Card>
          <CardHeader>
            <CardTitle>Receptionist Overview</CardTitle>
            <CardDescription>
              This dashboard is wired around snapshot-based personalization for live voice
              and shared business context for SMS, preview, and workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="stack">
            <div className="kpi-grid">
              <div className="kpi">
                <span className="kpi-label">Voice runtime</span>
                <strong>Snapshot loaded at call start</strong>
              </div>
              <div className="kpi">
                <span className="kpi-label">Knowledge layer</span>
                <strong>Structured facts + RAG</strong>
              </div>
              <div className="kpi">
                <span className="kpi-label">Primary backend</span>
                <strong>Convex</strong>
              </div>
            </div>
            <pre className="prompt-preview">{promptPreview}</pre>
          </CardContent>
        </Card>
        {props.businessId ? (
          <>
            <BusinessProfileForm businessId={props.businessId} />
            <BusinessHoursForm businessId={props.businessId} />
            <ServicesCard businessId={props.businessId} />
          </>
        ) : null}
      </section>
      <section className="stack">
        <BusinessSnapshotCard snapshot={props.snapshot} />
        {props.businessId ? <KnowledgeManager businessId={props.businessId} /> : null}
        <PreviewPanel
          businessId={props.businessId}
          enabled={props.isAuthenticated && Boolean(props.businessId)}
        />
      </section>
    </div>
  );
}

function Inbox(props: { businessId?: Id<"businesses"> }) {
  return (
    <RecentCallsPanel businessId={props.businessId} />
  );
}

function AppShell() {
  const auth = useConvexAuth();
  const businesses = useQuery(
    api.businesses.admin.listForCurrentUser,
    auth.isAuthenticated ? {} : "skip",
  );
  const activeBusinessId = businesses?.[0]?.business._id;
  const snapshot = useQuery(
    api.ai.context.snapshots.getForDashboard,
    activeBusinessId ? { businessId: activeBusinessId } : "skip",
  );
  const resolvedSnapshot = snapshot ?? demoSnapshot;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="eyebrow">AI Receptionist</span>
          <h1>Operator Console</h1>
          <p>Convex-backed admin dashboard for voice, SMS, booking, and knowledge.</p>
        </div>
        <nav className="nav">
          <NavLink className="nav-link" to="/">
            Dashboard
          </NavLink>
          <NavLink className="nav-link" to="/inbox">
            Inbox
          </NavLink>
        </nav>
        <AuthCard />
        {auth.isAuthenticated && businesses && businesses.length === 0 ? <OnboardingCard /> : null}
      </aside>
      <main className="main">
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                snapshot={resolvedSnapshot}
                businessId={activeBusinessId}
                isAuthenticated={auth.isAuthenticated}
              />
            }
          />
          <Route path="/inbox" element={<Inbox businessId={activeBusinessId} />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
