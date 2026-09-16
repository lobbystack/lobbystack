"use client";

import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export type AnalyticsChartPoint = { label: string; calls: number; messages: number; appointments: number; agentResponseSeconds: number };

export function AnalyticsOverviewChart({ data }: { data: AnalyticsChartPoint[] }) {
  const { t } = useTranslation("dashboard");

  return (
    <ChartContainer className="aspect-auto h-[300px] w-full" config={{ calls: { label: t("home.metrics.calls.title"), color: "var(--chart-2)" }, messages: { label: t("home.metrics.messages.title"), color: "var(--chart-1)" } }}>
      <AreaChart data={data} margin={{ left: 0, right: 4, top: 8 }}>
        <defs>
          <linearGradient id="fillCalls" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-calls)" stopOpacity={0.35} /><stop offset="95%" stopColor="var(--color-calls)" stopOpacity={0.06} /></linearGradient>
          <linearGradient id="fillMessages" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-messages)" stopOpacity={0.3} /><stop offset="95%" stopColor="var(--color-messages)" stopOpacity={0.05} /></linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        <XAxis axisLine={false} dataKey="label" fontSize={12} interval={0} stroke="#888888" tick={renderXAxisTick} tickLine={false} />
        <YAxis axisLine={false} fontSize={12} stroke="#888888" tick={{ dx: 32 }} tickLine={false} width={0} />
        <Area activeDot={{ r: 6, stroke: "var(--background)", strokeWidth: 4, fill: "var(--color-calls)" }} dataKey="calls" dot={false} fill="url(#fillCalls)" stroke="var(--color-calls)" type="monotone" />
        <Area activeDot={{ r: 6, stroke: "var(--background)", strokeWidth: 4, fill: "var(--color-messages)" }} dataKey="messages" dot={false} fill="url(#fillMessages)" stroke="var(--color-messages)" type="monotone" />
        <ChartLegend content={<ChartLegendContent />} verticalAlign="bottom" />
      </AreaChart>
    </ChartContainer>
  );
}

function renderXAxisTick({ index, payload, visibleTicksCount, x, y }: { index: number; payload: { value: string }; visibleTicksCount: number; x: number | string; y: number | string }) {
  const xPosition = typeof x === "number" ? x : Number(x);
  const yPosition = (typeof y === "number" ? y : Number(y)) + 16;
  return <text fill="#888888" fontSize={12} textAnchor={index === 0 ? "start" : index === visibleTicksCount - 1 ? "end" : "middle"} x={xPosition} y={yPosition}>{payload.value}</text>;
}

export function AnalyticsMetricChart({ data, dataKey }: { data: AnalyticsChartPoint[]; dataKey: keyof Omit<AnalyticsChartPoint, "label"> }) {
  return (
    <ChartContainer className="aspect-auto h-40 w-full" config={{ [dataKey]: { label: dataKey, color: "var(--chart-1)" } }}>
      <LineChart accessibilityLayer data={data} margin={{ bottom: 8, left: 0, right: 0, top: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="4 6" vertical />
        <XAxis axisLine={false} dataKey="label" height={28} interval="preserveStartEnd" tickLine={false} tickMargin={8} />
        <YAxis domain={[0, (maximum: number) => Math.max(maximum, 1)]} hide padding={{ bottom: 16, top: 8 }} />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={false} />
        <Line dataKey={dataKey} dot={false} stroke={`var(--color-${dataKey})`} strokeWidth={2} type="natural" />
      </LineChart>
    </ChartContainer>
  );
}
