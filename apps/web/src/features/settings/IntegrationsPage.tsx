import { useQuery } from "convex/react";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type IntegrationsPageProps = {
  businessId: Id<"businesses">;
};

export function IntegrationsPage({ businessId }: IntegrationsPageProps) {
  const { t } = useTranslation("settings");
  const connections = useQuery(api.integrations.calendar.listCalendarConnections, {
    businessId,
  }) as Array<Doc<"calendar_connections">> | undefined;
  const summary = useQuery(api.integrations.calendar.getCalendarReconciliationSummary, { businessId });

  const googleConnected = (connections ?? []).some(
    (connection: Doc<"calendar_connections">) => connection.provider === "google",
  );
  const microsoftConnected = (connections ?? []).some(
    (connection: Doc<"calendar_connections">) => connection.provider === "microsoft",
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <div className="grid gap-6 md:grid-cols-2">
        {[
          {
            key: "google",
            connected: googleConnected,
            description: t("integrations.providers.google"),
          },
          {
            key: "microsoft",
            connected: microsoftConnected,
            description: t("integrations.providers.microsoft"),
          },
        ].map((provider) => (
          <Card key={provider.key}>
            <CardHeader>
              <div className="mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CalendarDays className="size-5" />
              </div>
              <CardTitle>{t(`integrations.cards.${provider.key}.title`)}</CardTitle>
              <CardDescription>{provider.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {provider.connected
                ? t("integrations.status.connected")
                : t("integrations.status.notConnected")}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("integrations.summary.title")}</CardTitle>
          <CardDescription>{t("integrations.summary.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span>{t("integrations.summary.connectedCalendars")}</span>
            <span className="font-medium">{connections?.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("integrations.summary.openIssues")}</span>
            <span className="font-medium">{summary?.openIssueCount ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("integrations.summary.syncedAppointments")}</span>
            <span className="font-medium">{summary?.counts.synced ?? 0}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
