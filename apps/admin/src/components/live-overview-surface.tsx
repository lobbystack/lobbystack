"use client";

import { useEffect } from "react";
import { ArrowUpRight, CheckCircle2, Clock3, PhoneCall, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Dashboard = { calls: number; appointments: number; messages: number; openConversations: number };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load dashboard data.");
  return await response.json() as T;
}

export function LiveOverviewSurface() {
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const dashboard = useQuery({
    queryKey: ["dashboard", business?.businessId],
    queryFn: () => getJson<Dashboard>(`/api/dashboard?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["dashboard", business.businessId] });
    for (const event of ["call.started", "call.updated", "call.completed", "message.upserted", "conversation.updated", "appointment.updated"]) source.addEventListener(event, refresh);
    source.addEventListener("open", refresh);
    return () => {
      source.removeEventListener("open", refresh);
      for (const event of ["call.started", "call.updated", "call.completed", "message.upserted", "conversation.updated", "appointment.updated"]) source.removeEventListener(event, refresh);
      source.close();
    };
  }, [business?.businessId, queryClient]);

  const metrics = dashboard.data ? [
    { label: "Calls", value: dashboard.data.calls, change: "All recorded calls", icon: PhoneCall, tone: "teal" },
    { label: "Appointments", value: dashboard.data.appointments, change: "All recorded bookings", icon: Clock3, tone: "blue" },
    { label: "Messages", value: dashboard.data.messages, change: "All inbound messages", icon: ArrowUpRight, tone: "amber" },
    { label: "Open conversations", value: dashboard.data.openConversations, change: "Awaiting resolution", icon: CheckCircle2, tone: "violet" },
  ] as const : [];

  return <PageSurface {...(business ? { eyebrow: business.name } : {})} title="Good morning, Raphael" description="Here is what is happening across your front desk today.">
    <div className="flex items-center justify-between gap-4 rounded-xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm text-teal-800"><span>Live workspace metrics update as calls, messages, and appointments change.</span><Button variant="ghost" onClick={() => void dashboard.refetch()} disabled={dashboard.isFetching}><RefreshCw className="size-4" />Refresh</Button></div>
    {businesses.isLoading || dashboard.isLoading ? <Card><CardContent className="py-16 text-center text-sm text-slate-500">Loading workspace metrics...</CardContent></Card> : null}
    {businesses.isError || dashboard.isError ? <Card><CardContent className="py-16 text-center text-sm text-red-600">Workspace metrics are unavailable.</CardContent></Card> : null}
    {!businesses.isLoading && !dashboard.isLoading && !businesses.isError && !dashboard.isError ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, change, icon: Icon, tone }) => <Card key={label}><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-2 text-xs font-medium text-slate-500">{change}</p></div><span className={`grid size-10 place-items-center rounded-full ${tone === "teal" ? "bg-teal-50 text-teal-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-violet-50 text-violet-700"}`}><Icon className="size-5" /></span></div></CardContent></Card>)}</div> : null}
    <Card><CardHeader><CardTitle>Workspace pulse</CardTitle><CardDescription>Counts are tenant-scoped and sourced from the replacement API.</CardDescription></CardHeader><CardContent><div className="grid gap-4 text-sm sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-slate-500">Realtime transport</p><p className="mt-1 font-medium text-slate-900">Authenticated SSE</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-slate-500">Data source</p><p className="mt-1 font-medium text-slate-900">PostgreSQL + RLS</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-slate-500">Workspace</p><p className="mt-1 truncate font-medium text-slate-900">{business?.name ?? "Not selected"}</p></div></div></CardContent></Card>
  </PageSurface>;
}
