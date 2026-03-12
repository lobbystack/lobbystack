import { demoSnapshot, type BusinessContextSnapshot } from "@ai-receptionist/shared";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BusinessSnapshotCardProps = {
  snapshot?: BusinessContextSnapshot | null;
};

export function BusinessSnapshotCard(props: BusinessSnapshotCardProps) {
  const snapshot = props.snapshot ?? demoSnapshot;

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Receptionist Snapshot</CardTitle>
            <CardDescription>
              The voice gateway pulls this business context once when a live call begins.
            </CardDescription>
          </div>
          <Badge variant="outline">{snapshot.version}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              Business
            </dt>
            <dd className="text-sm font-medium text-foreground">{snapshot.displayName}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              Timezone
            </dt>
            <dd className="text-sm font-medium text-foreground">{snapshot.timezone}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              Transfer policy
            </dt>
            <dd className="text-sm font-medium text-foreground">{snapshot.transferPolicy.mode}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              Services in snapshot
            </dt>
            <dd className="text-sm font-medium text-foreground">{snapshot.services.length}</dd>
          </div>
        </dl>
        <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
          <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
            Knowledge digest
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/90">
            {snapshot.knowledgeDigest || "No generated digest yet. Add FAQs or documents to enrich the receptionist."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
