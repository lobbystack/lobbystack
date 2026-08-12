"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string };
type Member = { membershipId: string; userId: string; name: string | null; email: string; role: string; status: string };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function LiveTeamSurface() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses[0];
  const members = useQuery({ queryKey: ["team", business?.businessId], queryFn: () => requestJson<{ members: Member[] }>(`/api/team?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const invite = useMutation({
    mutationFn: () => requestJson<{ invitationId: string }>("/api/team", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, email, role }) }),
    onSuccess: async () => {
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: ["team", business?.businessId] });
    },
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await invite.mutateAsync();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send invitation.");
    }
  }

  if (businesses.isLoading || members.isLoading) return <p className="text-sm text-slate-500">Loading team...</p>;
  if (businesses.isError || members.isError) return <p className="text-sm text-red-600">Team data is unavailable.</p>;
  if (!business) return <p className="text-sm text-slate-500">Create a workspace before managing the team.</p>;

  return <PageSurface eyebrow={business.name} title="Team" description="Manage workspace members and send role-scoped invitations.">
    <div className="space-y-6">
      <Card><CardHeader><CardTitle>Invite a teammate</CardTitle><CardDescription>Invitations expire after seven days and are delivered through the worker email queue.</CardDescription></CardHeader><CardContent><form className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end" onSubmit={submit}><label className="space-y-2 text-sm font-medium text-slate-700">Email<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" required /></label><label className="space-y-2 text-sm font-medium text-slate-700">Role<select className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal" value={role} onChange={(event) => setRole(event.target.value)}><option value="business_admin">Business admin</option><option value="scheduler">Scheduler</option><option value="viewer">Viewer</option></select></label><Button type="submit" disabled={invite.isPending}>{invite.isPending ? "Sending..." : "Send invite"}</Button></form>{error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}</CardContent></Card>
      <Card><CardHeader><CardTitle>Members</CardTitle><CardDescription>{members.data?.members.length ?? 0} active or invited member{members.data?.members.length === 1 ? "" : "s"}.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Member</th><th className="px-3 py-3 font-semibold">Email</th><th className="px-3 py-3 font-semibold">Role</th><th className="px-3 py-3 font-semibold">Status</th></tr></thead><tbody>{members.data?.members.map((member) => <tr className="border-b border-slate-50 last:border-0" key={member.membershipId}><td className="px-3 py-4 font-medium text-slate-800">{member.name ?? "Unnamed member"}</td><td className="px-3 py-4 text-slate-600">{member.email}</td><td className="px-3 py-4 capitalize text-slate-600">{member.role.replaceAll("_", " ")}</td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${member.status === "active" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>{member.status}</span></td></tr>)}{!members.data?.members.length ? <tr><td className="px-3 py-12 text-center text-slate-500" colSpan={4}>No members yet.</td></tr> : null}</tbody></table></div></CardContent></Card>
    </div>
  </PageSurface>;
}
