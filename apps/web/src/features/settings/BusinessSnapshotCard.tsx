import type { BusinessContextSnapshot } from "@ai-receptionist/shared";
import { demoSnapshot } from "@ai-receptionist/testing";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

type BusinessSnapshotCardProps = {
  snapshot?: BusinessContextSnapshot | null;
};

export function BusinessSnapshotCard(props: BusinessSnapshotCardProps) {
  const snapshot = props.snapshot ?? demoSnapshot;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Context Snapshot</CardTitle>
        <CardDescription>
          Generated snapshot data that the voice gateway will fetch once per live call.
        </CardDescription>
      </CardHeader>
      <CardContent className="stack">
        <dl className="details-grid">
          <div>
            <dt>Business</dt>
            <dd>{snapshot.displayName}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{snapshot.version}</dd>
          </div>
          <div>
            <dt>Timezone</dt>
            <dd>{snapshot.timezone}</dd>
          </div>
          <div>
            <dt>Transfer mode</dt>
            <dd>{snapshot.transferPolicy.mode}</dd>
          </div>
          <div>
            <dt>Knowledge digest</dt>
            <dd>{snapshot.knowledgeDigest || "Not generated yet."}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
