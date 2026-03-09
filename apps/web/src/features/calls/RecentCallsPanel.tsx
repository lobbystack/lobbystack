import { useEffect, useState } from "react";
import { useQuery } from "convex/react";

import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

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
      <Card>
        <CardHeader>
          <CardTitle>Recent Calls</CardTitle>
          <CardDescription>Create a business to review recordings and transcripts.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Calls</CardTitle>
        <CardDescription>
          Voice calls store final transcript segments and, when media is available, a stereo WAV
          recording for download.
        </CardDescription>
      </CardHeader>
      <CardContent className="stack">
        <div className="mini-list">
          {recentCalls.map((call) => (
            <div className="mini-list-item" key={call._id}>
              <div className="stack">
                <strong>{new Date(call.startedAt).toLocaleString()}</strong>
                <span className="muted">
                  {call.status}
                  {call.disposition ? ` • ${call.disposition}` : ""}
                </span>
              </div>
              <div className="inline-actions">
                <Button variant="secondary" onClick={() => setSelectedCallId(call._id)}>
                  View transcript
                </Button>
                {call.recordingUrl ? (
                  <a className="button button-primary" href={call.recordingUrl} target="_blank" rel="noreferrer">
                    Download audio
                  </a>
                ) : (
                  <span className="muted">Recording pending</span>
                )}
              </div>
            </div>
          ))}
          {calls && recentCalls.length === 0 ? (
            <span className="muted">No calls have been captured yet.</span>
          ) : null}
        </div>
        <div className="stack section-divider">
          <span className="kpi-label">Transcript</span>
          {transcriptSegments.map((segment) => (
            <div className="preview-bubble preview-agent" key={segment._id}>
              <strong>{segment.speaker}</strong>
              <div>{segment.text}</div>
            </div>
          ))}
          {selectedCallId && transcript && transcriptSegments.length === 0 ? (
            <span className="muted">No transcript segments recorded for this call.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
