import { useTranslation } from "react-i18next";
import { BookOpenText, Clock4, Phone, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SectionCardsProps = {
  recentCallCount: number;
  serviceCount: number;
  configuredDays: number;
  knowledgeCount: number;
  snapshotVersion: string;
};

export function SectionCards({
  recentCallCount,
  serviceCount,
  configuredDays,
  knowledgeCount,
  snapshotVersion,
}: SectionCardsProps) {
  const { t } = useTranslation(["common", "dashboard"]);
  const cardMeta = [
    {
      key: "calls",
      title: t("dashboard:cards.calls.title"),
      icon: Phone,
      footer: t("dashboard:cards.calls.footer"),
    },
    {
      key: "services",
      title: t("dashboard:cards.services.title"),
      icon: Workflow,
      footer: t("dashboard:cards.services.footer"),
    },
    {
      key: "hours",
      title: t("dashboard:cards.hours.title"),
      icon: Clock4,
      footer: t("dashboard:cards.hours.footer"),
    },
    {
      key: "knowledge",
      title: t("dashboard:cards.knowledge.title"),
      icon: BookOpenText,
      footer: t("dashboard:cards.knowledge.footer"),
    },
  ] as const;

  const values = {
    calls: recentCallCount,
    services: serviceCount,
    hours: configuredDays,
    knowledge: knowledgeCount,
  } as const;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cardMeta.map((item) => {
        const value = values[item.key];
        return (
          <Card
            className="border border-border/70 bg-card/90 shadow-sm"
            key={item.key}
            size="sm"
          >
            <CardHeader>
              <CardDescription>{item.title}</CardDescription>
              <CardTitle className="text-3xl font-semibold tracking-tight">{value}</CardTitle>
              <CardAction>
                <Badge variant="outline">
                  <item.icon className="size-4" />
                  {item.key === "calls"
                    ? t("common:badges.live")
                    : t("common:badges.configured")}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-2 text-sm text-muted-foreground">
              <div>{item.footer}</div>
              <div className="text-xs font-medium tracking-[0.24em] uppercase">
                {t("dashboard:cards.snapshot", { version: snapshotVersion })}
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
