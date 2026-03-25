import { Bot, CalendarClock, Sparkles, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AutomationsPageProps = {
  businessId?: Id<"businesses">;
};

const cards = [
  { key: "followups", icon: Workflow },
  { key: "reminders", icon: CalendarClock },
  { key: "handoffs", icon: Bot },
];

export function AutomationsPage({ businessId }: AutomationsPageProps) {
  const { t } = useTranslation("automations");

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader description={t("page.description")} title={t("page.title")} />

      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.key}>
            <CardHeader>
              <div className="mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <card.icon className="size-5" />
              </div>
              <CardTitle>{t(`cards.${card.key}.title`)}</CardTitle>
              <CardDescription>{t(`cards.${card.key}.description`)}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          <CardTitle>{t("empty.title")}</CardTitle>
          <CardDescription>{t("empty.description")}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("empty.body")}
        </CardContent>
      </Card>
    </div>
  );
}
