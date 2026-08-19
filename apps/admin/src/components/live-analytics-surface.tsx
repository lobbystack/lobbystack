"use client";

import { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";
import { Surface } from "./ui/surface";

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

function MetricChart({ data, dataKey, color }: { data: Analytics["series"]; dataKey: "calls" | "appointments" | "messages"; color: string }) {
  return <div className="h-24 w-full"><ResponsiveContainer height="100%" width="100%"><LineChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}><XAxis dataKey="bucket" hide /><YAxis hide domain={[0, "dataMax + 1"]} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }} labelFormatter={(value) => date(String(value))} /><Line dataKey={dataKey} dot={false} stroke={color} strokeWidth={2} type="monotone" /></LineChart></ResponsiveContainer></div>;
}

function BarList({ items, color = "bg-primary" }: { items: Array<{ label: string; value: number }>; color?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return <div className="space-y-4">{items.map((item) => <div className="flex items-center gap-3" key={item.label}><div className="min-w-0 flex-1"><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="truncate text-muted-foreground">{item.label}</span><span className="tabular-nums">{item.value.toLocaleString()}</span></div><div className="h-2.5 rounded-full bg-muted"><div className={`h-2.5 rounded-full ${color}`} style={{ width: `${Math.max(2, Math.round((item.value / max) * 100))}%` }} /></div></div></div>)}</div>;
}

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
  function chooseRange(value: string) { if (value === "custom") { const end = new Date(); const start = new Date(end.getTime() - 30 * 86_400_000); setFromDate(start.toISOString().slice(0, 10)); setToDate(end.toISOString().slice(0, 10)); } else { setFromDate(""); setToDate(""); setPeriodDays(value); } }

  const metrics = data ? [
    { label: "Calls", value: data.calls.current, previous: data.calls.previous, key: "calls" as const, color: "#0f766e" },
    { label: "Messages", value: data.messages.current, previous: data.messages.previous, key: "messages" as const, color: "#2563eb" },
    { label: "Appointments", value: data.appointments.current, previous: data.appointments.previous, key: "appointments" as const, color: "#d97706" },
    { label: "Average response", value: duration(data.averageCallDurationSeconds), previous: null, key: "calls" as const, color: "#7c3aed" },
  ] : [];
  return <PageSurface title="Analytics" description="Understand calls, bookings, response volume, and usage over a bounded reporting period."><div className="flex flex-col gap-4"><div className="flex flex-wrap items-center justify-between gap-3 py-2"><div className="text-sm text-muted-foreground">Reporting period</div><div className="flex flex-wrap items-center justify-end gap-2"><select aria-label="Analytics date range" className="min-h-9 rounded-xl border bg-background px-3 text-sm" value={fromDate && toDate ? "custom" : periodDays} onChange={(event) => chooseRange(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option><option value="custom">Custom range</option></select>{fromDate && toDate ? <><input aria-label="Analytics start date" className="min-h-9 rounded-xl border bg-background px-2 text-sm" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /><input aria-label="Analytics end date" className="min-h-9 rounded-xl border bg-background px-2 text-sm" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></> : null}<select aria-label="Analytics granularity" className="min-h-9 rounded-xl border bg-background px-3 text-sm" value={granularity} onChange={(event) => setGranularity(event.target.value)}><option value="hour">Hourly</option><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Yearly</option></select><Button variant="outline" onClick={() => void analytics.refetch()} disabled={analytics.isFetching}><RefreshCw className="size-4" />Refresh</Button></div></div>{businesses.isLoading || analytics.isLoading ? <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Loading analytics...</CardContent></Card> : null}{businesses.isError || analytics.isError ? <Card><CardContent className="py-16 text-center text-sm text-destructive">Analytics are unavailable.</CardContent></Card> : null}{data ? <><Card><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="size-5 text-primary" />Activity over time</CardTitle><CardDescription>{data.granularity} buckets from {date(data.from)} to {date(data.to)}</CardDescription></CardHeader><CardContent><div className="h-64 w-full"><ResponsiveContainer height="100%" width="100%"><LineChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}><XAxis dataKey="bucket" tickFormatter={(value) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(String(value)))} tickLine={false} axisLine={false} tickMargin={10} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} width={32} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }} labelFormatter={(value) => date(String(value))} /><Line dataKey="calls" name="Calls" stroke="#0f766e" strokeWidth={2} type="monotone" dot={false} /><Line dataKey="appointments" name="Appointments" stroke="#2563eb" strokeWidth={2} type="monotone" dot={false} /><Line dataKey="messages" name="Messages" stroke="#d97706" strokeWidth={2} type="monotone" dot={false} /></LineChart></ResponsiveContainer></div><div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span><i className="mr-1 inline-block size-2 rounded-full bg-teal-600" />Calls</span><span><i className="mr-1 inline-block size-2 rounded-full bg-blue-600" />Appointments</span><span><i className="mr-1 inline-block size-2 rounded-full bg-amber-600" />Messages</span></div></CardContent></Card><Surface className="grid sm:grid-cols-2">{metrics.map((metric) => <section className="border-b p-6 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0" key={metric.label}><h2 className="text-sm font-medium text-muted-foreground">{metric.label}</h2><p className="mt-4 text-4xl font-normal tabular-nums">{typeof metric.value === "number" ? metric.value.toLocaleString() : metric.value}</p>{metric.previous !== null ? <p className="mt-2 text-sm text-muted-foreground">{change(metric.value as number, metric.previous)} from previous period</p> : <p className="mt-2 text-sm text-muted-foreground">Average duration</p>}<div className="mt-5"><MetricChart data={data.series} dataKey={metric.key} color={metric.color} /></div></section>)}</Surface><div className="grid gap-4 lg:grid-cols-7"><Card className="lg:col-span-4"><CardHeader><CardTitle>Call outcomes</CardTitle><CardDescription>Disposition breakdown for the selected period.</CardDescription></CardHeader><CardContent><BarList items={data.outcomes.map((outcome) => ({ label: outcome.outcome.replaceAll("_", " "), value: outcome.count }))} /></CardContent></Card><Card className="lg:col-span-3"><CardHeader><CardTitle>Channels</CardTitle><CardDescription>Conversation volume by channel.</CardDescription></CardHeader><CardContent><BarList color="bg-muted-foreground" items={[{ label: "Voice", value: data.calls.current }, { label: "Messages", value: data.messages.current }, { label: "Appointments", value: data.appointments.current }]} /></CardContent></Card></div></> : null}</div></PageSurface>;
}
