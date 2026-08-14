import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AuthenticatedOnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession(new Headers(await headers()));
  if (!session) redirect("/login");
  return children;
}
