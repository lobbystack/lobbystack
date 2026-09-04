"use client";

import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type AnalyticsChartPoint = { label: string; calls: number; messages: number; appointments: number; agentResponseSeconds: number };

const tooltipStyle = { background: "var(--background)", border: "1px solid var(--border)", borderRadius: "0.75rem", boxShadow: "var(--shadow-lg)", fontSize: 12 };

export function AnalyticsOverviewChart({ data }: { data: AnalyticsChartPoint[] }) {
  return <div className="h-[300px] w-full"><ResponsiveContainer height="100%" width="100%"><AreaChart data={data} margin={{ left: 0, right: 4, top: 8 }}><defs><linearGradient id="fill-analytics-calls" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.35} /><stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.06} /></linearGradient><linearGradient id="fill-analytics-messages" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} /><stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} /></linearGradient></defs><CartesianGrid stroke="var(--border)" strokeOpacity={0.55} vertical={false} /><Tooltip contentStyle={tooltipStyle} cursor={false} /><XAxis axisLine={false} dataKey="label" fontSize={12} interval="preserveStartEnd" tickLine={false} tickMargin={12} /><YAxis axisLine={false} fontSize={12} tickLine={false} width={28} /><Area dataKey="calls" dot={false} fill="url(#fill-analytics-calls)" name="Calls" stroke="var(--chart-2)" type="monotone" /><Area dataKey="messages" dot={false} fill="url(#fill-analytics-messages)" name="Messages" stroke="var(--chart-1)" type="monotone" /></AreaChart></ResponsiveContainer></div>;
}

export function AnalyticsMetricChart({ data, dataKey }: { data: AnalyticsChartPoint[]; dataKey: keyof Omit<AnalyticsChartPoint, "label"> }) {
  return <div className="h-40 w-full"><ResponsiveContainer height="100%" width="100%"><LineChart data={data} margin={{ bottom: 8, left: 0, right: 0, top: 8 }}><CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="4 6" vertical /><XAxis axisLine={false} dataKey="label" height={28} interval="preserveStartEnd" tickLine={false} tickMargin={8} /><YAxis domain={[0, (maximum: number) => Math.max(maximum, 1)]} hide padding={{ bottom: 16, top: 8 }} /><Tooltip contentStyle={tooltipStyle} cursor={false} /><Line dataKey={dataKey} dot={false} stroke="var(--chart-1)" strokeWidth={2} type="natural" /></LineChart></ResponsiveContainer></div>;
}
