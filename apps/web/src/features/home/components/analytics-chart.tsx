import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatDateTime } from "@/lib/locale";

type AnalyticsChartProps = {
  data: Array<{
    dayStart: string;
    calls: number;
    messages: number;
  }>;
};

export function AnalyticsChart({ data }: AnalyticsChartProps) {
  const { i18n, t } = useTranslation("dashboard");
  const chartData = data.map((item) => ({
    name: formatDateTime(item.dayStart, i18n.language, {
      weekday: "short",
      timeZone: "UTC",
    }),
    calls: item.calls,
    messages: item.messages,
  }));

  return (
    <ChartContainer
      className="aspect-auto h-[300px] w-full"
      config={{
        calls: {
          label: t("home.metrics.calls.title"),
          color: "var(--chart-2)",
        },
        messages: {
          label: t("home.metrics.messages.title"),
          color: "var(--chart-1)",
        },
      }}
    >
      <AreaChart data={chartData} margin={{ left: 4, right: 4, top: 8 }}>
        <defs>
          <linearGradient id="fillCalls" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-calls)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-calls)" stopOpacity={0.06} />
          </linearGradient>
          <linearGradient id="fillMessages" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-messages)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-messages)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <XAxis
          axisLine={false}
          dataKey="name"
          fontSize={12}
          stroke="#888888"
          tickLine={false}
        />
        <YAxis axisLine={false} fontSize={12} stroke="#888888" tickLine={false} />
        <Area
          activeDot={{
            r: 6,
            stroke: "var(--background)",
            strokeWidth: 4,
          fill: "var(--color-calls)",
        }}
        dataKey="calls"
        dot={false}
        fill="url(#fillCalls)"
        stroke="var(--color-calls)"
        type="monotone"
      />
        <Area
          activeDot={{
            r: 6,
            stroke: "var(--background)",
            strokeWidth: 4,
          fill: "var(--color-messages)",
        }}
        dataKey="messages"
        dot={false}
        fill="url(#fillMessages)"
        stroke="var(--color-messages)"
        type="monotone"
      />
        <ChartLegend content={<ChartLegendContent />} verticalAlign="bottom" />
      </AreaChart>
    </ChartContainer>
  );
}
