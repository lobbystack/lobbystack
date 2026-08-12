"use client";

import { useEffect } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Metric = { current: number; previous: number };
type Analytics = { periodDays: number; calls: Metric; appointments: Metric; messages: Metric; averageCallDurationSeconds: number };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load analytics.");
  return await response.json() as T;
}

function change(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "-" : "New";
  const percent = ((current - previous) / previous) * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function LiveAnalyticsSurface() {
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const analytics = useQuery({
    queryKey: ["analytics", business?.businessId],
    queryFn: () => getJson<Analytics>(`/api/analytics?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["analytics", business.businessId] });
    source.addEventListener("open", refresh);
    for (const event of ["call.started", "call.completed", "message.upserted", "appointment.updated"]) source.addEventListener(event, refresh);
    return () => {
      source.removeEventListener("open", refresh);
      for (const event of ["call.started", "call.completed", "message.upserted", "appointment.updated"]) source.removeEventListener(event, refresh);
      source.close();
    };
  }, [business?.businessId, queryClient]);

  const rows = analytics.data ? [
    ["Calls", String(analytics.data.calls.current), String(analytics.data.calls.previous), change(analytics.data.calls.current, analytics.data.calls.previous)],
    ["Appointments booked", String(analytics.data.appointments.current), String(analytics.data.appointments.previous), change(analytics.data.appointments.current, analytics.data.appointments.previous)],
    ["Messages", String(analytics.data.messages.current), String(analytics.data.messages.previous), change(analytics.data.messages.current, analytics.data.messages.previous)],
    ["Average call duration", duration(analytics.data.averageCallDurationSeconds), "Current period", "-"],
  ] : [];

  return <PageSurface title="Analytics" description="Understand calls, bookings, response volume, and usage over the last 30 days.">
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="size-5 text-teal-600" />Workspace analytics</CardTitle>
          <CardDescription>{business ? `${business.name} · live tenant-scoped metrics` : "Choose a workspace to view analytics."}</CardDescription>
        </div>
        <Button variant="ghost" onClick={() => void analytics.refetch()} disabled={analytics.isFetching}><RefreshCw className="size-4" />Refresh</Button>
      </CardHeader>
      <CardContent>
        {businesses.isLoading || analytics.isLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading analytics...</p> : null}
        {businesses.isError || analytics.isError ? <p className="py-12 text-center text-sm text-red-600">Analytics are unavailable.</p> : null}
        {!businesses.isLoading && !analytics.isLoading && !businesses.isError && !analytics.isError ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Metric</th><th className="px-3 py-3 font-semibold">This period</th><th className="px-3 py-3 font-semibold">Previous period</th><th className="px-3 py-3 font-semibold">Change</th></tr></thead><tbody>{rows.map((row) => <tr className="border-b border-slate-50 last:border-0" key={row[0]}>{row.map((cell, index) => <td className={`px-3 py-4 ${index === 0 ? "font-medium text-slate-800" : "text-slate-600"}`} key={`${row[0]}-${index}`}>{cell}</td>)}</tr>)}</tbody></table></div> : null}
      </CardContent>
    </Card>
  </PageSurface>;
}
