import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { MessageSquareText, PhoneCall, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type UnitEconomicsProps = {
  businessId: Id<"businesses">;
};

type UnitEconomicsSummary = {
  monthKey: string;
  rollup: {
    providerCostUsd: number;
    aiCostUsd: number;
    infraCostUsd: number;
    voiceCostUsd: number;
    smsCostUsd: number;
    alertSmsCostUsd: number;
    voiceCallCount: number;
    voiceMinutes: number;
    outboundSmsCount: number;
    smsThreadCount: number;
    activeUserCount: number;
    priceFloorInputs: {
      voiceCallUsd: number;
      outboundSmsUsd: number;
      activeUserUsd: number;
    };
    channelMix: Array<{
      key: "voice" | "sms" | "alerts";
      value: number;
    }>;
  } | null;
};

function formatCurrency(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(value);
}

function UnitEconomicsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-1">
        {Array.from({ length: 1 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((__, innerIndex) => (
                <Skeleton className="h-10 w-full" key={innerIndex} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function UnitEconomics({ businessId }: UnitEconomicsProps) {
  const { i18n, t } = useTranslation("dashboard");
  const refreshMonth = useMutation(api.unitEconomics.refreshMonth);
  const summary = useQuery(api.unitEconomics.getSummary, {
    businessId,
  }) as UnitEconomicsSummary | undefined;

  useEffect(() => {
    void refreshMonth({ businessId }).catch(() => undefined);
  }, [businessId, refreshMonth]);

  if (!summary?.rollup) {
    return <UnitEconomicsSkeleton />;
  }

  const rollup = summary.rollup;

  const cards = [
    {
      key: "voiceCall",
      title: t("analyticsPage.unitEconomics.cards.voiceCall"),
      value: formatCurrency(rollup.priceFloorInputs.voiceCallUsd, i18n.language),
      description: t("analyticsPage.unitEconomics.cards.voiceCallHint", {
        count: rollup.voiceCallCount,
        formattedCount: formatNumber(rollup.voiceCallCount, i18n.language),
      }),
      icon: PhoneCall,
    },
    {
      key: "outboundSms",
      title: t("analyticsPage.unitEconomics.cards.outboundSms"),
      value: formatCurrency(rollup.priceFloorInputs.outboundSmsUsd, i18n.language),
      description: t("analyticsPage.unitEconomics.cards.outboundSmsHint", {
        count: rollup.outboundSmsCount,
        formattedCount: formatNumber(rollup.outboundSmsCount, i18n.language),
      }),
      icon: MessageSquareText,
    },
    {
      key: "activeUser",
      title: t("analyticsPage.unitEconomics.cards.activeUser"),
      value: formatCurrency(rollup.priceFloorInputs.activeUserUsd, i18n.language),
      description: t("analyticsPage.unitEconomics.cards.activeUserHint", {
        count: rollup.activeUserCount,
        formattedCount: formatNumber(rollup.activeUserCount, i18n.language),
      }),
      icon: Users,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold tracking-tight">{card.value}</div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>{t("analyticsPage.unitEconomics.channelMix.title")}</CardTitle>
            <CardDescription>{t("analyticsPage.unitEconomics.channelMix.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rollup.channelMix.map((item) => (
              <div className="flex items-center justify-between gap-4" key={item.key}>
                <span className="text-sm text-muted-foreground">
                  {t(`analyticsPage.unitEconomics.channelMix.labels.${item.key}`)}
                </span>
                <span className="font-medium">{formatCurrency(item.value, i18n.language)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
