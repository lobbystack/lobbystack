"use client";

import { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Metric = { current: number; previous: number };
type Analytics = { periodDays: number; from: string; to: string; granularity: string; calls: Metric; appointments: Metric; messages: Metric; averageCallDurationSeconds: number; series: Array<{ bucket: string; calls: number; appointments: number; messages: number }>; outcomes: Array<{ outcome: string; count: number }>; unitEconomics: { totalCostUsd: number; costPerVoiceCallUsd: number; costPerActiveUserUsd: number } | null };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load analytics.");
  return await response.json() as T;
}

function change(current: number, previous: number): string { if (previous === 0) return current === 0 ? "-" : "New"; return `${current >= previous ? "+" : ""}${(((current - previous) / previous) * 100).toFixed(1)}%`; }
function duration(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
function date(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }

export function LiveAnalyticsSurface() {
  const queryClient = useQueryClient();
  const [periodDays, setPeriodDays] = useState("30");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [granularity, setGranularity] = useState("day");
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const analytics = useQuery({
    queryKey: ["analytics", business?.businessId, periodDays, fromDate, toDate, granularity],
    queryFn: () => {
      const params = new URLSearchParams({ businessId: business!.businessId, granularity });
      if (fromDate && toDate) { params.set("from", fromDate); params.set("to", `${toDate}T23:59:59.999Z`); } else params.set("days", periodDays);
      return getJson<Analytics>(`/api/analytics?${params.toString()}`);
    },
    enabled: Boolean(business?.businessId),
  });
  useEffect(() => {
    if (!business?.businessId) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["analytics", business.businessId] });
    source.addEventListener("open", refresh);
    for (const event of ["call.started", "call.completed", "message.upserted", "appointment.updated"]) source.addEventListener(event, refresh);
    return () => { source.removeEventListener("open", refresh); for (const event of ["call.started", "call.completed", "message.upserted", "appointment.updated"]) source.removeEventListener(event, refresh); source.close(); };
  }, [business?.businessId, queryClient]);
  const data = analytics.data;
  const rows = data ? [["Calls", String(data.calls.current), String(data.calls.previous), change(data.calls.current, data.calls.previous)], ["Appointments booked", String(data.appointments.current), String(data.appointments.previous), change(data.appointments.current, data.appointments.previous)], ["Messages", String(data.messages.current), String(data.messages.previous), change(data.messages.current, data.messages.previous)], ["Average call duration", duration(data.averageCallDurationSeconds), "Current period", "-"], ...(data.unitEconomics ? [["Unit economics", new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(data.unitEconomics.totalCostUsd), `Voice call ${new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(data.unitEconomics.costPerVoiceCallUsd)}`, `Active user ${new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(data.unitEconomics.costPerActiveUserUsd)}`]] : [])] : [];
  const seriesMaximum = Math.max(1, ...(data?.series.flatMap((point) => [point.calls, point.appointments, point.messages]) ?? [0]));
  function chooseRange(value: string) { if (value === "custom") { const end = new Date(); const start = new Date(end.getTime() - 30 * 86_400_000); setFromDate(start.toISOString().slice(0, 10)); setToDate(end.toISOString().slice(0, 10)); } else { setFromDate(""); setToDate(""); setPeriodDays(value); } }

  return <PageSurface title="Analytics" description="Understand calls, bookings, response volume, and usage over a bounded reporting period."><Card><CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><BarChart3 className="size-5 text-teal-600" />Workspace analytics</CardTitle><CardDescription>{business ? `${business.name} · live tenant-scoped metrics` : "Choose a workspace to view analytics."}</CardDescription></div><div className="flex flex-wrap items-center justify-end gap-2"><select aria-label="Analytics date range" className="min-h-10 rounded-xl border bg-background px-3 text-sm" value={fromDate && toDate ? "custom" : periodDays} onChange={(event) => chooseRange(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option><option value="custom">Custom range</option></select>{fromDate && toDate ? <><input aria-label="Analytics start date" className="min-h-10 rounded-xl border bg-background px-2 text-sm" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /><input aria-label="Analytics end date" className="min-h-10 rounded-xl border bg-background px-2 text-sm" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></> : null}<select aria-label="Analytics granularity" className="min-h-10 rounded-xl border bg-background px-3 text-sm" value={granularity} onChange={(event) => setGranularity(event.target.value)}><option value="hour">Hourly</option><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Yearly</option></select><Button variant="ghost" onClick={() => void analytics.refetch()} disabled={analytics.isFetching}><RefreshCw className="size-4" />Refresh</Button></div></CardHeader><CardContent className="space-y-6">{businesses.isLoading || analytics.isLoading ? <p className="py-12 text-center text-sm text-muted-foreground">Loading analytics...</p> : null}{businesses.isError || analytics.isError ? <p className="py-12 text-center text-sm text-destructive">Analytics are unavailable.</p> : null}{data ? <><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-[0.12em] text-muted-foreground"><th className="px-3 py-3 font-semibold">Metric</th><th className="px-3 py-3 font-semibold">This period</th><th className="px-3 py-3 font-semibold">Previous period</th><th className="px-3 py-3 font-semibold">Change</th></tr></thead><tbody>{rows.map((row) => <tr className="border-b last:border-0" key={row[0]}>{row.map((cell, index) => <td className={`px-3 py-4 ${index === 0 ? "font-medium" : "text-muted-foreground"}`} key={`${row[0]}-${index}`}>{cell}</td>)}</tr>)}</tbody></table></div><div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]"><Card><CardHeader><CardTitle>Activity over time</CardTitle><CardDescription>{data.granularity} buckets from {date(data.from)} to {date(data.to)}</CardDescription></CardHeader><CardContent><div className="flex min-h-48 items-end gap-2 overflow-x-auto border-b border-l p-4">{data.series.map((point) => <div className="flex min-w-8 flex-1 flex-col items-center justify-end gap-2" key={point.bucket} title={`${point.calls} calls, ${point.appointments} appointments, ${point.messages} messages`}><div className="flex h-40 items-end gap-0.5"><span className="w-2 rounded-t bg-teal-600" style={{ height: `${Math.max(3, point.calls / seriesMaximum * 100)}%` }} /><span className="w-2 rounded-t bg-sky-500" style={{ height: `${Math.max(3, point.appointments / seriesMaximum * 100)}%` }} /><span className="w-2 rounded-t bg-amber-500" style={{ height: `${Math.max(3, point.messages / seriesMaximum * 100)}%` }} /></div><span className="max-w-16 truncate text-[10px] text-muted-foreground">{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(point.bucket))}</span></div>)}</div><div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span><i className="mr-1 inline-block size-2 rounded-full bg-teal-600" />Calls</span><span><i className="mr-1 inline-block size-2 rounded-full bg-sky-500" />Appointments</span><span><i className="mr-1 inline-block size-2 rounded-full bg-amber-500" />Messages</span></div></CardContent></Card><Card><CardHeader><CardTitle>Call outcomes</CardTitle><CardDescription>Disposition breakdown for the selected period.</CardDescription></CardHeader><CardContent className="space-y-3">{data.outcomes.length ? data.outcomes.map((outcome) => <div className="flex items-center justify-between gap-3 text-sm" key={outcome.outcome}><span className="capitalize text-muted-foreground">{outcome.outcome.replaceAll("_", " ")}</span><span className="font-semibold">{outcome.count.toLocaleString()}</span></div>) : <p className="text-sm text-muted-foreground">No call outcomes recorded.</p>}</CardContent></Card></div></> : null}</CardContent></Card></PageSurface>;
}
