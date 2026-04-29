import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  type XAxisTickContentProps,
} from "recharts";
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
  granularity?: "daily" | "hourly" | "monthly" | "weekly" | "yearly";
};

export function AnalyticsChart({ data, granularity = "daily" }: AnalyticsChartProps) {
  const { i18n, t } = useTranslation("dashboard");
  const chartData = data.map((item) => ({
    name: formatChartLabel(item.dayStart, granularity, i18n.language),
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
      <AreaChart data={chartData} margin={{ left: 0, right: 4, top: 8 }}>
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
          interval={0}
          stroke="#888888"
          tick={renderXAxisTick}
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          fontSize={12}
          stroke="#888888"
          tick={{ dx: 32 }}
          tickLine={false}
          width={0}
        />
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

function renderXAxisTick({
  index,
  payload,
  visibleTicksCount,
  x,
  y,
}: XAxisTickContentProps) {
  const xPosition = toSvgNumber(x);
  const yPosition = toSvgNumber(y) + 16;
  const textAnchor =
    index === 0 ? "start" : index === visibleTicksCount - 1 ? "end" : "middle";

  return (
    <text
      fill="#888888"
      fontSize={12}
      textAnchor={textAnchor}
      x={xPosition}
      y={yPosition}
    >
      {payload.value}
    </text>
  );
}

function toSvgNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function formatChartLabel(
  value: string,
  granularity: NonNullable<AnalyticsChartProps["granularity"]>,
  locale: string,
): string {
  if (granularity === "hourly") {
    return formatDateTime(value, locale, {
      hour: "numeric",
      timeZone: "UTC",
    });
  }

  if (granularity === "monthly") {
    return formatDateTime(value, locale, {
      month: "short",
      timeZone: "UTC",
    });
  }

  if (granularity === "yearly") {
    return formatDateTime(value, locale, {
      timeZone: "UTC",
      year: "numeric",
    });
  }

  return formatDateTime(value, locale, {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}
