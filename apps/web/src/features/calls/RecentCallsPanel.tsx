import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { Download, FileText, MessageCircle, PhoneCall } from "lucide-react";

import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { formatDateTime } from "@/lib/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type RecentCallsPanelProps = {
  businessId: Id<"businesses"> | undefined;
};

type RecentCall = Doc<"calls"> & {
  recordingUrl: string | null;
  transcriptReady: boolean;
};

export function RecentCallsPanel(props: RecentCallsPanelProps) {
  const { i18n, t } = useTranslation(["calls", "common"]);
  const calls = useQuery(
    api.voice.runtime.listRecentCalls,
    props.businessId ? { businessId: props.businessId, limit: 12 } : "skip",
  );
  const [selectedCallId, setSelectedCallId] = useState<Id<"calls"> | undefined>(undefined);
  const [transcriptSheetOpen, setTranscriptSheetOpen] = useState(false);

  const transcript = useQuery(
    api.voice.runtime.getCallTranscript,
    props.businessId && selectedCallId
      ? { businessId: props.businessId, callId: selectedCallId }
      : "skip",
  );

  const recentCalls = (calls ?? []) as Array<RecentCall>;
  const transcriptSegments = (transcript ?? []) as Array<Doc<"transcripts">>;
  const selectedCall = useMemo(
    () => recentCalls.find((call) => call._id === selectedCallId),
    [recentCalls, selectedCallId],
  );

  if (!props.businessId) {
    return (
      <Card className="border border-dashed border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>{t("calls:panel.noBusinessTitle")}</CardTitle>
          <CardDescription>{t("calls:panel.noBusinessDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function openTranscript(callId: Id<"calls">) {
    setSelectedCallId(callId);
    setTranscriptSheetOpen(true);
  }

  return (
    <>
      <Card className="border border-border/70 bg-card/90 shadow-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>{t("calls:panel.title")}</CardTitle>
              <CardDescription>{t("calls:panel.description")}</CardDescription>
            </div>
            <Badge variant="outline">{t("calls:panel.captured", { count: recentCalls.length })}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentCalls.map((call) => (
            <div
              className="rounded-3xl border border-border/70 bg-background/70 p-4 shadow-sm"
              key={call._id}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <PhoneCall className="size-4 text-muted-foreground" />
                    {formatDateTime(call.startedAt, i18n.language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {call.status}
                    {call.disposition ? ` • ${call.disposition}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {call.transcriptReady ? (
                    <Badge variant="outline">{t("calls:panel.transcriptReady")}</Badge>
                  ) : (
                    <Badge variant="secondary">{t("calls:panel.transcriptPending")}</Badge>
                  )}
                  {call.recordingUrl ? (
                    <Badge variant="outline">{t("calls:panel.audioReady")}</Badge>
                  ) : (
                    <Badge variant="secondary">{t("calls:panel.recordingPending")}</Badge>
                  )}
                </div>
              </div>

              <Separator className="my-4" />

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => openTranscript(call._id)}>
                  <FileText className="size-4" />
                  {t("calls:panel.viewTranscript")}
                </Button>
                {call.recordingUrl ? (
                  <Button
                    render={
                      <a href={call.recordingUrl} rel="noreferrer" target="_blank" />
                    }
                    size="sm"
                    variant="outline"
                  >
                    <Download className="size-4" />
                    {t("calls:panel.downloadAudio")}
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {t("calls:panel.recordingPending")}
                  </span>
                )}
              </div>
            </div>
          ))}

          {calls && recentCalls.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              {t("calls:panel.noCalls")}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Sheet onOpenChange={setTranscriptSheetOpen} open={transcriptSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl" side="right">
          <SheetHeader>
            <SheetTitle>{t("calls:transcript.title")}</SheetTitle>
            <SheetDescription>
              {selectedCall
                ? t("calls:transcript.descriptionWithDate", {
                    date: formatDateTime(selectedCall.startedAt, i18n.language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })
                : t("calls:transcript.descriptionEmpty")}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-6">
            {selectedCall ? (
              <div className="flex flex-wrap items-center gap-2">
                {selectedCall.transcriptReady ? (
                  <Badge variant="outline">{t("calls:panel.transcriptReady")}</Badge>
                ) : (
                  <Badge variant="secondary">{t("calls:panel.transcriptPending")}</Badge>
                )}
                {selectedCall.recordingUrl ? (
                  <Badge variant="outline">{t("calls:panel.audioReady")}</Badge>
                ) : (
                  <Badge variant="secondary">{t("calls:panel.recordingPending")}</Badge>
                )}
              </div>
            ) : null}

            <div className="space-y-3">
              {transcriptSegments.map((segment) => (
                <div
                  className="rounded-2xl border border-border/70 bg-muted/25 p-4"
                  key={segment._id}
                >
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <MessageCircle className="size-3.5" />
                    {segment.speaker}
                  </div>
                  <div className="text-sm leading-6 text-foreground">{segment.text}</div>
                </div>
              ))}

              {selectedCallId && transcript && transcriptSegments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
                  {t("calls:transcript.noSegments")}
                </div>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
