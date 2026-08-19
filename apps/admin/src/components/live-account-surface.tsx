"use client";

import { useQuery } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { AccountSecurityForms } from "./account-security-forms";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "./ui/item";
import { Surface } from "./ui/surface";
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
  if (account.isLoading) return <PageSurface title="Account" description=""><p className="text-sm text-muted-foreground">Loading account...</p></PageSurface>;
  if (account.isError || !account.data) return <PageSurface title="Account" description=""><p className="text-sm text-destructive">Account data is unavailable.</p></PageSurface>;
  const { user, session, businesses } = account.data;
  return <PageSurface title="Account" description="Review the signed-in account, session expiry, and workspace access.">
    <div className="w-full overflow-y-auto pb-12"><ItemGroup spacing="section" className="gap-8"><section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Profile</h2><Surface className="flex flex-col"><Item className="rounded-none border-x-0 border-t-0 border-b border-border" variant="default"><ItemContent><ItemTitle>Name</ItemTitle><ItemDescription>{user.name ?? "Not set"}</ItemDescription></ItemContent></Item><Item className="rounded-none border-x-0 border-t-0 border-b border-border" variant="default"><ItemContent><ItemTitle>Email</ItemTitle><ItemDescription>{user.email ?? "Not set"}</ItemDescription></ItemContent></Item><Item className="rounded-none border-0" variant="default"><ItemContent><ItemTitle>User ID</ItemTitle><ItemDescription className="break-all font-mono text-xs">{user.id}</ItemDescription></ItemContent></Item></Surface></section><section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Session and access</h2><Surface className="flex flex-col"><Item className="rounded-none border-x-0 border-t-0 border-b border-border" variant="default"><ItemContent><ItemTitle>Session expires</ItemTitle><ItemDescription>{formatDate(session.expiresAt)}</ItemDescription></ItemContent></Item>{businesses.map((business) => <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-0" key={business.businessId} variant="default"><ItemContent><ItemTitle>{business.name}</ItemTitle><ItemDescription className="capitalize">{business.role.replaceAll("_", " ")}</ItemDescription></ItemContent><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{business.active ? "Active" : "Available"}</span></Item>)}{!businesses.length ? <Item className="rounded-none border-0" variant="default"><ItemContent><ItemDescription>No workspace memberships.</ItemDescription></ItemContent></Item> : null}</Surface></section><section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Account security</h2><AccountSecurityForms currentEmail={user.email} /></section><div><a href="/api/auth/sign-out"><Button variant="outline">Sign out</Button></a></div></ItemGroup></div>
  </PageSurface>;
}
