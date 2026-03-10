import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { IconDownload, IconFileText, IconPhoneCall } from "@tabler/icons-react";

import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type RecentCallsPanelProps = {
  businessId: Id<"businesses"> | undefined;
};

export function RecentCallsPanel(props: RecentCallsPanelProps) {
  const calls = useQuery(
    api.voice.runtime.listRecentCalls,
    props.businessId ? { businessId: props.businessId, limit: 12 } : "skip",
  );
  const [selectedCallId, setSelectedCallId] = useState<Id<"calls"> | undefined>(undefined);
  const transcript = useQuery(
    api.voice.runtime.getCallTranscript,
    props.businessId && selectedCallId
      ? { businessId: props.businessId, callId: selectedCallId }
      : "skip",
  );
  const recentCalls = (calls ?? []) as Array<Doc<"calls"> & { recordingUrl: string | null }>;
  const transcriptSegments = (transcript ?? []) as Array<Doc<"transcripts">>;

  useEffect(() => {
    if (!recentCalls || recentCalls.length === 0) {
      setSelectedCallId(undefined);
      return;
    }
    if (!selectedCallId) {
      setSelectedCallId(recentCalls[0]?._id);
    }
  }, [recentCalls, selectedCallId]);

  if (!props.businessId) {
    return (
      <Card className="border border-dashed border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>Recent Calls</CardTitle>
          <CardDescription>Create a business to review recordings and transcripts.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Recent Calls</CardTitle>
            <CardDescription>
              Final transcript segments and audio downloads for the latest handled calls.
            </CardDescription>
          </div>
          <Badge variant="outline">{recentCalls.length} captured</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          {recentCalls.map((call) => (
            <div
              className="flex w-full flex-col gap-3 rounded-2xl border border-border/70 bg-background/70 p-4 text-left transition-colors hover:bg-muted/40"
              key={call._id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <IconPhoneCall className="size-4 text-muted-foreground" />
                    {new Date(call.startedAt).toLocaleString()}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {call.status}
                    {call.disposition ? ` • ${call.disposition}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedCallId === call._id ? <Badge>Selected</Badge> : null}
                  {call.recordingUrl ? <Badge variant="outline">Audio ready</Badge> : <Badge variant="secondary">Processing</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSelectedCallId(call._id)}>
                  <IconFileText className="size-4" />
                  View transcript
                </Button>
                {call.recordingUrl ? (
                  <Button
                    render={
                      <a href={call.recordingUrl} rel="noreferrer" target="_blank" />
                    }
                    size="sm"
                    variant="outline"
                  >
                    <IconDownload className="size-4" />
                    Download audio
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">Recording pending</span>
                )}
              </div>
            </div>
          ))}
          {calls && recentCalls.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              No calls have been captured yet.
            </div>
          ) : null}
        </div>
        <Separator />
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              Transcript
            </p>
            <p className="text-sm text-muted-foreground">
              Select a call to inspect the saved conversation.
            </p>
          </div>
          <div className="space-y-3">
            {transcriptSegments.map((segment) => (
              <div
                className="rounded-2xl border border-border/70 bg-muted/25 p-4"
                key={segment._id}
              >
                <div className="mb-2 text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                  {segment.speaker}
                </div>
                <div className="text-sm leading-6 text-foreground">{segment.text}</div>
              </div>
            ))}
            {selectedCallId && transcript && transcriptSegments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
                No transcript segments recorded for this call.
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
