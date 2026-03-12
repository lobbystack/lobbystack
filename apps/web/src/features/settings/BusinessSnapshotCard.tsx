import type { BusinessContextSnapshot } from "@ai-receptionist/shared";
import { demoSnapshot } from "@ai-receptionist/testing";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BusinessSnapshotCardProps = {
  snapshot?: BusinessContextSnapshot | null;
};

export function BusinessSnapshotCard(props: BusinessSnapshotCardProps) {
  const { t } = useTranslation("settings");
  const snapshot = props.snapshot ?? demoSnapshot;

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>{t("snapshot.title")}</CardTitle>
            <CardDescription>{t("snapshot.description")}</CardDescription>
          </div>
          <Badge variant="outline">{snapshot.version}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              {t("snapshot.business")}
            </dt>
            <dd className="text-sm font-medium text-foreground">{snapshot.displayName}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              {t("snapshot.timezone")}
            </dt>
            <dd className="text-sm font-medium text-foreground">{snapshot.timezone}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              {t("snapshot.transferPolicy")}
            </dt>
            <dd className="text-sm font-medium text-foreground">{snapshot.transferPolicy.mode}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              {t("snapshot.services")}
            </dt>
            <dd className="text-sm font-medium text-foreground">{snapshot.services.length}</dd>
          </div>
        </dl>
        <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
          <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
            {t("snapshot.knowledgeDigest")}
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/90">
            {snapshot.knowledgeDigest || t("snapshot.emptyDigest")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
