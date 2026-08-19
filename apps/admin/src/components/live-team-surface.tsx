"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { selectActiveBusiness } from "@/lib/active-business";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "./ui/item";
import { Surface } from "./ui/surface";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; active: boolean; role: string; timezone?: string; businessType?: string };
type Member = { membershipId: string; userId: string; name: string | null; email: string; role: string; status: string };
type Invitation = { invitationId: string; email: string; role: string; status: string; expiresAt: string };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function LiveTeamSurface() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [businessName, setBusinessName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canMutate = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const members = useQuery({ queryKey: ["team", business?.businessId], queryFn: () => requestJson<{ members: Member[]; invitations: Invitation[] }>(`/api/team?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["team", business?.businessId] });
  const update = useMutation({ mutationFn: (input: { method: "PATCH" | "DELETE"; membershipId: string; role?: string }) => requestJson(`/api/team?businessId=${encodeURIComponent(business!.businessId)}`, { method: input.method, body: JSON.stringify({ membershipId: input.membershipId, ...(input.role ? { role: input.role } : {}) }) }), onSuccess: invalidate });
  const revoke = useMutation({ mutationFn: (invitationId: string) => requestJson(`/api/team?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE", body: JSON.stringify({ invitationId }) }), onSuccess: invalidate });
  const invite = useMutation({ mutationFn: () => requestJson<{ invitationId: string }>("/api/team", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, email, role }) }), onSuccess: async () => { setEmail(""); await invalidate(); } });
  const saveBusiness = useMutation({ mutationFn: () => requestJson(`/api/businesses?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ name: businessName || business!.name, timezone: timezone || business!.timezone, businessType: businessType || business!.businessType }) }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["businesses"] }) });

  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); try { await invite.mutateAsync(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to send invitation."); } }

  if (businesses.isLoading || members.isLoading) return <p className="text-sm text-slate-500">Loading team...</p>;
  if (businesses.isError || members.isError) return <p className="text-sm text-red-600">Team data is unavailable.</p>;
  if (!business) return <p className="text-sm text-slate-500">Create a workspace before managing the team.</p>;
  return <PageSurface eyebrow={business.name} title="Team" description="Manage workspace details, members, and role-scoped invitations."><div className="w-full overflow-y-auto pb-12"><ItemGroup spacing="section" className="gap-8">{!canMutate ? <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Viewer access is read-only.</p> : null}<section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Workspace details</h2><Surface><Item className="rounded-none border-0" variant="default"><ItemContent><ItemTitle>Business profile</ItemTitle><ItemDescription>Keep the business details used by the receptionist current.</ItemDescription><form className="mt-3 grid gap-3 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); saveBusiness.mutate(); }}><input aria-label="Business name" className="min-h-10 rounded-xl border bg-transparent px-3" disabled={!canMutate} value={businessName || business.name} onChange={(event) => setBusinessName(event.target.value)} /><input aria-label="Timezone" className="min-h-10 rounded-xl border bg-transparent px-3" disabled={!canMutate} value={(timezone || business.timezone) ?? ""} onChange={(event) => setTimezone(event.target.value)} placeholder="Timezone" /><input aria-label="Business type" className="min-h-10 rounded-xl border bg-transparent px-3" disabled={!canMutate} value={(businessType || business.businessType) ?? ""} onChange={(event) => setBusinessType(event.target.value)} placeholder="Business type" /><Button className="md:col-span-3 w-fit" disabled={!canMutate || saveBusiness.isPending} type="submit">{saveBusiness.isPending ? "Saving..." : "Save details"}</Button></form></ItemContent></Item></Surface></section><section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Invite teammate</h2><Surface><Item className="rounded-none border-0" variant="default"><ItemContent><ItemTitle>Send an invitation</ItemTitle><ItemDescription>Invitations expire after seven days.</ItemDescription><form className="mt-3 grid gap-3 md:grid-cols-[1fr_220px_auto]" onSubmit={submit}><input aria-label="Invite email" className="min-h-10 rounded-xl border bg-transparent px-3" disabled={!canMutate} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" required /><select aria-label="Invite role" className="min-h-10 rounded-xl border bg-transparent px-3" disabled={!canMutate} value={role} onChange={(event) => setRole(event.target.value)}><option value="business_admin">Business admin</option><option value="scheduler">Scheduler</option><option value="viewer">Viewer</option></select><Button type="submit" disabled={!canMutate || invite.isPending}>{invite.isPending ? "Sending..." : "Send invite"}</Button></form>{error ? <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}</ItemContent></Item></Surface></section><section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Members</h2><TableCard><Table className="min-w-[52rem]"><TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{members.data?.members.map((member) => <TableRow key={member.membershipId}><TableCell className="font-medium">{member.name ?? "Unnamed member"}</TableCell><TableCell className="text-muted-foreground">{member.email}</TableCell><TableCell><select aria-label={`Role for ${member.email}`} className="min-h-9 rounded-xl border bg-transparent px-2 text-sm capitalize" disabled={!canMutate || member.role === "business_owner" || update.isPending} value={member.role} onChange={(event) => update.mutate({ method: "PATCH", membershipId: member.membershipId, role: event.target.value })}><option value="business_admin">Business admin</option><option value="scheduler">Scheduler</option><option value="viewer">Viewer</option></select></TableCell><TableCell><Badge variant="secondary">{member.status}</Badge></TableCell><TableCell><Button disabled={!canMutate || member.role === "business_owner" || update.isPending} onClick={() => update.mutate({ method: "DELETE", membershipId: member.membershipId })} size="sm" variant="ghost">Remove</Button></TableCell></TableRow>)}</TableBody></Table></TableCard></section>{members.data?.invitations.some((invitation) => invitation.status === "pending") ? <section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Pending invitations</h2><Surface className="flex flex-col">{members.data.invitations.filter((invitation) => invitation.status === "pending").map((invitation) => <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-0" key={invitation.invitationId} variant="default"><ItemContent><ItemTitle>{invitation.email}</ItemTitle><ItemDescription className="capitalize">{invitation.role} · expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(invitation.expiresAt))}</ItemDescription></ItemContent><Button disabled={!canMutate || revoke.isPending} onClick={() => revoke.mutate(invitation.invitationId)} size="sm" variant="ghost">Revoke</Button></Item>)}</Surface></section> : null}</ItemGroup></div></PageSurface>;
}
