import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveOnboardingState, resolveOnboardingRoute } from "@lobbystack/domain";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSession } from "@/lib/auth";
import { getAppDatabase } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession(new Headers(await headers()));
  if (!session) redirect("/login");
  const onboarding = await getActiveOnboardingState(getAppDatabase().db, session.user.id);
  if (onboarding.stage !== "complete") redirect(resolveOnboardingRoute(onboarding.stage));
  return (
    <DashboardShell
      user={{
        email: session.user.email ?? "",
        name: session.user.name ?? session.user.email ?? "",
      }}
    >
      {children}
    </DashboardShell>
  );
}
