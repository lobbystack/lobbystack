"use client";

import { useQuery } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { AccountSecurityForms } from "./account-security-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Account = { user: { id: string; name?: string | null; email?: string | null }; session: { id: string; expiresAt: string }; businesses: Array<{ businessId: string; name: string; role: string; active: boolean }> };

async function getAccount(): Promise<Account> {
  const response = await fetch("/api/account", { credentials: "include" });
  if (!response.ok) throw new Error("Account data is unavailable.");
  return await response.json() as Account;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function LiveAccountSurface() {
  const account = useQuery({ queryKey: ["account"], queryFn: getAccount });
  if (account.isLoading) return <p className="text-sm text-slate-500">Loading account...</p>;
  if (account.isError || !account.data) return <p className="text-sm text-red-600">Account data is unavailable.</p>;
  const { user, session, businesses } = account.data;
  return <PageSurface title="Account" description="Review the signed-in account, session expiry, and workspace access.">
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Signed-in account</CardTitle><CardDescription>Identity data comes from Better Auth.</CardDescription></CardHeader><CardContent className="space-y-4 text-sm"><div><p className="text-slate-500">Name</p><p className="mt-1 font-medium text-slate-900">{user.name ?? "Not set"}</p></div><div><p className="text-slate-500">Email</p><p className="mt-1 font-medium text-slate-900">{user.email ?? "Not set"}</p></div><div><p className="text-slate-500">User ID</p><p className="mt-1 break-all font-mono text-xs text-slate-700">{user.id}</p></div><a className="inline-block" href="/api/auth/sign-out"><Button variant="outline">Sign out</Button></a></CardContent></Card>
      <Card><CardHeader><CardTitle>Session and access</CardTitle><CardDescription>Current session and tenant memberships.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="text-sm"><p className="text-slate-500">Session expires</p><p className="mt-1 font-medium text-slate-900">{formatDate(session.expiresAt)}</p></div><div className="space-y-3">{businesses.map((business) => <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3" key={business.businessId}><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{business.name}</p><p className="text-xs capitalize text-slate-500">{business.role.replaceAll("_", " ")}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${business.active ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}>{business.active ? "Active" : "Available"}</span></div>)}{!businesses.length ? <p className="text-sm text-slate-500">No workspace memberships.</p> : null}</div></CardContent></Card>
      <AccountSecurityForms currentEmail={user.email} />
    </div>
  </PageSurface>;
}
