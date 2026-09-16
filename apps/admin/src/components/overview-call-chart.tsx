"use client";

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

export function OverviewCallChart({ data }: { data: Array<{ name: string; total: number }> }) {
  return <ResponsiveContainer height={350} width="100%"><BarChart data={data}><XAxis axisLine={false} dataKey="name" fontSize={12} stroke="#888888" tickLine={false} /><YAxis axisLine={false} direction="ltr" fontSize={12} stroke="#888888" tickLine={false} /><Bar className="fill-primary" dataKey="total" fill="currentColor" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>;
}
