import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession(new Headers(await headers()));
  if (!session) redirect("/login");
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
