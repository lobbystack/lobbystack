import { IconBook2, IconClockHour4, IconPhone, IconSettingsAutomation } from "@tabler/icons-react";

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

const cardMeta = [
  {
    key: "calls",
    title: "Calls handled",
    icon: IconPhone,
    footer: "Latest inbound activity available in the inbox.",
  },
  {
    key: "services",
    title: "Services configured",
    icon: IconSettingsAutomation,
    footer: "These feed both the receptionist and the booking engine.",
  },
  {
    key: "hours",
    title: "Open days set",
    icon: IconClockHour4,
    footer: "Structured hours stay authoritative over documents.",
  },
  {
    key: "knowledge",
    title: "Knowledge items",
    icon: IconBook2,
    footer: "FAQs and documents strengthen preview and SMS responses.",
  },
] as const;

export function SectionCards({
  recentCallCount,
  serviceCount,
  configuredDays,
  knowledgeCount,
  snapshotVersion,
}: SectionCardsProps) {
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
                  {item.key === "calls" ? "Live" : "Configured"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-2 text-sm text-muted-foreground">
              <div>{item.footer}</div>
              <div className="text-xs font-medium tracking-[0.24em] uppercase">
                Snapshot {snapshotVersion}
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
