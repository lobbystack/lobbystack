"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { VerticalCoordinatesGenerator } from "recharts/types/cartesian/CartesianGrid";
import { useTranslation } from "react-i18next";

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { intlLocale } from "@/lib/locale";

export type AnalyticsChartPoint = { label: string; calls: number; messages: number; appointments: number; agentResponseSeconds: number };

// Hourly labels repeat across days ("10 AM"), and the tooltip finds a point by its x value, so each point gets a unique slot.
type SlottedPoint = AnalyticsChartPoint & { slot: number };

function pointLabel(_label: unknown, payload: ReadonlyArray<{ payload?: unknown }>): string {
  return (payload[0]?.payload as SlottedPoint | undefined)?.label ?? "";
}

export function AnalyticsOverviewChart({ data }: { data: AnalyticsChartPoint[] }) {
  const { t } = useTranslation("dashboard");
  const axis = useEvenDateAxis(data, OVERVIEW_RIGHT_MARGIN);
  const points = axis.points;

  return (
    <div ref={axis.measure}>
    <ChartContainer className="aspect-auto h-[300px] w-full" config={{ calls: { label: t("home.metrics.calls.title"), color: "var(--chart-2)" }, messages: { label: t("home.metrics.messages.title"), color: "var(--chart-1)" } }}>
      <AreaChart data={points} margin={{ left: 0, right: OVERVIEW_RIGHT_MARGIN, top: 8 }}>
        <defs>
          <linearGradient id="fillCalls" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-calls)" stopOpacity={0.35} /><stop offset="95%" stopColor="var(--color-calls)" stopOpacity={0.06} /></linearGradient>
          <linearGradient id="fillMessages" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-messages)" stopOpacity={0.3} /><stop offset="95%" stopColor="var(--color-messages)" stopOpacity={0.05} /></linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={pointLabel} />} />
        <XAxis axisLine={false} dataKey="slot" fontSize={12} interval={0} stroke="#888888" tick={axis.tick} tickLine={false} />
        <YAxis axisLine={false} fontSize={12} stroke="#888888" tick={{ dx: 32 }} tickLine={false} width={0} />
        <Area activeDot={{ r: 6, stroke: "var(--background)", strokeWidth: 4, fill: "var(--color-calls)" }} dataKey="calls" dot={false} fill="url(#fillCalls)" stroke="var(--color-calls)" type="monotone" />
        <Area activeDot={{ r: 6, stroke: "var(--background)", strokeWidth: 4, fill: "var(--color-messages)" }} dataKey="messages" dot={false} fill="url(#fillMessages)" stroke="var(--color-messages)" type="monotone" />
        <ChartLegend content={<ChartLegendContent />} verticalAlign="bottom" />
      </AreaChart>
    </ChartContainer>
    </div>
  );
}

// Rough width of a 12px label character; a little generous so labels never touch.
const LABEL_CHARACTER_WIDTH = 7;
const LABEL_GAP = 12;
const OVERVIEW_RIGHT_MARGIN = 4;

function labelWidth(label: string): number {
  return label.length * LABEL_CHARACTER_WIDTH;
}

/** Measures the chart and picks which date labels (and grid lines) to draw so they never overlap. */
function useEvenDateAxis(data: AnalyticsChartPoint[], rightMargin: number) {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const measure = useCallback((element: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!element) return;
    observer.current = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.current.observe(element);
  }, []);
  const span = Math.max(0, width - rightMargin);
  const points = useMemo<SlottedPoint[]>(() => data.map((point, slot) => ({ ...point, slot })), [data]);
  const labels = useMemo(() => data.map((point) => point.label), [data]);
  const shown = useMemo(() => evenlySpacedTicks(labels, span), [labels, span]);
  const tick = useCallback((props: XAxisTickProps) => renderXAxisTick(props, labels, shown, span), [labels, shown, span]);
  const gridX: VerticalCoordinatesGenerator = useCallback(({ offset }) => {
    const count = labels.length;
    if (count < 2) return [offset.left];
    return [...shown].map((index) => offset.left + (index * offset.width) / (count - 1));
  }, [labels.length, shown]);
  return { measure, tick, gridX, points };
}

/**
 * Indices of the dates to label. Every label sits one constant step from the next, counted back from the newest
 * date, so the gaps are identical and the most recent date is always readable. The oldest date is labelled only
 * when the step lands on it. The step is the smallest that keeps labels apart.
 */
export function evenlySpacedTicks(labels: string[], span: number): Set<number> {
  const count = labels.length;
  if (count === 0) return new Set();
  if (span <= 0 || count === 1) return new Set(labels.keys());
  const longest = Math.max(...labels.map(labelWidth));
  // Too narrow for two labels side by side: the newest one wins.
  if (span < 2 * longest + LABEL_GAP) return new Set([count - 1]);
  // The newest label reaches a whole label width inward, not half, so its neighbor needs that much more room.
  const edgeRoom = longest * 1.5 + LABEL_GAP;
  const gaps = count - 1;
  const step = Math.max(1, Math.ceil(edgeRoom / (span / gaps)));
  const shown = new Set<number>();
  for (let index = count - 1; index >= 0; index -= step) shown.add(index);
  return shown;
}

type XAxisTickProps = { index: number; x: number | string; y: number | string };

function renderXAxisTick({ index, x, y }: XAxisTickProps, labels: string[], shown: Set<number>, span: number) {
  const label = labels[index];
  if (!shown.has(index) || label === undefined) return <g />;
  const pointX = typeof x === "number" ? x : Number(x);
  const yPosition = (typeof y === "number" ? y : Number(y)) + 16;
  // The first date starts at its dot and the newest ends at its dot, so both stay inside the chart.
  const anchor = labels.length > 1 && index === 0 ? "start" : labels.length > 1 && index === labels.length - 1 ? "end" : "middle";
  const half = labelWidth(label) / 2;
  const xPosition = anchor === "middle" && span > 0 ? Math.min(Math.max(pointX, half), span - half) : pointX;
  return <text fill="#888888" fontSize={12} textAnchor={anchor} x={xPosition} y={yPosition}>{label}</text>;
}

export function AnalyticsMetricChart({ data, dataKey, label, formatValue }: { data: AnalyticsChartPoint[]; dataKey: keyof Omit<AnalyticsChartPoint, "label">; label: string; formatValue?: (value: number) => string }) {
  const { i18n } = useTranslation();
  const format = formatValue ?? ((value: number) => value.toLocaleString(intlLocale(i18n.language)));
  const axis = useEvenDateAxis(data, 0);
  const points = axis.points;
  return (
    <div ref={axis.measure}>
    <ChartContainer className="aspect-auto h-40 w-full" config={{ [dataKey]: { label, color: "var(--chart-1)" } }}>
      <LineChart accessibilityLayer data={points} margin={{ bottom: 8, left: 0, right: 0, top: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="4 6" vertical verticalCoordinatesGenerator={axis.gridX} />
        <XAxis axisLine={false} dataKey="slot" fontSize={12} height={28} interval={0} tick={axis.tick} tickLine={false} />
        <YAxis domain={[0, (maximum: number) => Math.max(maximum, 1)]} hide padding={{ bottom: 2, top: 8 }} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" labelFormatter={pointLabel} formatter={(value) => <MetricTooltipRow label={label} value={format(Number(value))} />} />} cursor={false} />
        <Line dataKey={dataKey} dot={false} stroke={`var(--color-${dataKey})`} strokeWidth={2} type="natural" />
      </LineChart>
    </ChartContainer>
    </div>
  );
}

// Same layout as the default tooltip row, for values that need custom formatting.
function MetricTooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className="size-2.5 shrink-0 rounded-xs bg-(--color-bg)" style={{ "--color-bg": "var(--chart-1)" } as React.CSSProperties} />
      <div className="flex flex-1 items-center justify-between gap-4 leading-none">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium text-foreground tabular-nums">{value}</span>
      </div>
    </>
  );
}
