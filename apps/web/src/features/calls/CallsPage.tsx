import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, Phone, Play, Search as SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/locale";
import { cn } from "@/lib/utils";

type CallsPageProps = {
  businessId?: Id<"businesses">;
};

type CallRow = Doc<"calls"> & {
  recordingUrl: string | null;
  transcriptReady: boolean;
  transcriptPreview: string | null;
  contactName: string | null;
  contactPhone: string | null;
};

type TranscriptSegment = Doc<"transcripts">;

function initials(value: string | null, fallback: string): string {
  if (!value) {
    return fallback.slice(0, 2).toUpperCase();
  }

  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatStatusLabel(value: string): string {
  if (value.length === 0) {
    return value;
  }

  const normalized = value.replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatSpeakerLabel(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isAgentSpeaker(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return ["assistant", "agent", "receptionist", "system", "ai"].some((token) =>
    normalized.includes(token),
  );
}

export function CallsPage({ businessId }: CallsPageProps) {
  const { i18n, t } = useTranslation("calls");
  const calls = useQuery(api.voice.runtime.listRecentCalls, businessId ? { businessId, limit: 50 } : "skip");
  const [selectedCallId, setSelectedCallId] = useState<Id<"calls"> | undefined>();
  const [mobileSelectedCallId, setMobileSelectedCallId] = useState<Id<"calls"> | undefined>();
  const [searchValue, setSearchValue] = useState("");

  const transcript = useQuery(
    api.voice.runtime.getCallTranscript,
    businessId && selectedCallId ? { businessId, callId: selectedCallId } : "skip",
  ) as Array<TranscriptSegment> | undefined;

  const rows = (calls ?? []) as Array<CallRow>;
  const filteredRows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return rows.filter((call) => {
      const haystack = [
        call.contactName,
        call.contactPhone,
        call.transcriptPreview,
        call.disposition,
        call.status,
        call.twilioCallSid,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return query.length === 0 || haystack.includes(query);
    });
  }, [rows, searchValue]);

  useEffect(() => {
    if (!selectedCallId && filteredRows[0]?._id) {
      setSelectedCallId(filteredRows[0]._id);
      setMobileSelectedCallId(filteredRows[0]._id);
    }
  }, [filteredRows, selectedCallId]);

  const selectedCall = filteredRows.find((call) => call._id === selectedCallId) ??
    rows.find((call) => call._id === selectedCallId);

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <section className="flex min-h-0 flex-1 gap-6">
      <div className="flex min-h-0 w-full flex-col gap-4 sm:w-56 lg:w-72 2xl:w-80">
        <div className="sticky top-0 z-10 -mx-4 bg-background px-4 pb-4 shadow-md sm:static sm:z-auto sm:mx-0 sm:p-0 sm:shadow-none">
          <div className="flex items-center gap-2 py-3">
            <h1 className="text-2xl font-bold">{t("page.title")}</h1>
            <Phone className="size-5" />
          </div>
          <label
            className={cn(
              "focus-within:ring-1 focus-within:ring-ring focus-within:outline-hidden",
              "flex h-10 w-full items-center space-x-0 rounded-md border border-border ps-3",
            )}
          >
            <SearchIcon className="me-2 stroke-slate-500" size={15} />
            <span className="sr-only">{t("filters.searchPlaceholder")}</span>
            <input
              className="w-full flex-1 bg-inherit text-sm focus-visible:outline-hidden"
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t("filters.searchPlaceholder")}
              type="text"
              value={searchValue}
            />
          </label>
        </div>

        <div className="-mx-3 no-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
          {filteredRows.map((call) => {
            const isActive = call._id === selectedCallId;
            const preview =
              call.transcriptPreview ??
              call.disposition ??
              formatStatusLabel(call.status) ??
              t("page.emptyPreview");

            return (
              <Fragment key={String(call._id)}>
                <button
                  className={cn(
                    "group hover:bg-accent hover:text-accent-foreground flex w-full rounded-md px-2 py-2 text-start text-sm",
                    isActive && "sm:bg-muted",
                  )}
                  onClick={() => {
                    setSelectedCallId(call._id);
                    setMobileSelectedCallId(call._id);
                  }}
                  type="button"
                >
                  <div className="flex gap-2">
                    <Avatar>
                      <AvatarFallback>
                        {initials(call.contactName, call.contactPhone ?? t("page.unknownShort"))}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <span className="block font-semibold">
                        {call.contactName ??
                          call.contactPhone ??
                          t("table.unknownCaller")}
                      </span>
                      <span className="line-clamp-2 text-ellipsis text-muted-foreground group-hover:text-accent-foreground/90">
                        {preview}
                      </span>
                    </div>
                  </div>
                </button>
                <Separator className="my-1" />
              </Fragment>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "absolute inset-0 start-full z-50 hidden min-h-0 w-full flex-1 flex-col border bg-background shadow-xs sm:static sm:z-auto sm:flex sm:rounded-md",
          mobileSelectedCallId && "start-0 flex",
        )}
      >
        {selectedCall ? (
          <>
            <div className="mb-4 flex flex-none justify-between bg-card p-4 shadow-lg sm:rounded-t-md">
              <div className="flex gap-3">
                <Button
                  className="-ms-2 h-full sm:hidden"
                  onClick={() => setMobileSelectedCallId(undefined)}
                  size="icon"
                  variant="ghost"
                >
                  <ArrowLeft className="rtl:rotate-180" />
                </Button>
                <div className="flex items-center gap-2 lg:gap-4">
                  <Avatar className="size-9 lg:size-11">
                    <AvatarFallback>
                      {initials(selectedCall.contactName, selectedCall.contactPhone ?? t("page.unknownShort"))}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <span className="block text-sm font-semibold lg:text-base">
                      {selectedCall.contactName ??
                        selectedCall.contactPhone ??
                        t("table.unknownCaller")}
                    </span>
                    <span className="block max-w-48 line-clamp-1 text-xs text-ellipsis text-muted-foreground lg:max-w-none lg:text-sm">
                      {selectedCall.contactPhone ??
                        formatDateTime(selectedCall.startedAt, i18n.language, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="-me-1 flex items-center gap-1 lg:gap-2">
                {selectedCall.recordingUrl ? (
                  <Button
                    className="size-8 rounded-full sm:inline-flex lg:size-10"
                    render={
                      <a href={selectedCall.recordingUrl} rel="noreferrer" target="_blank" />
                    }
                    size="icon"
                    title={t("actions.listen")}
                    variant="ghost"
                  >
                    <Play className="stroke-muted-foreground" size={22} />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col rounded-md px-4 pb-4">
              <div className="flex min-h-0 flex-1">
                <div className="relative -me-4 flex min-h-0 flex-1 flex-col overflow-y-hidden">
                  <div className="flex min-h-0 w-full flex-1 flex-col-reverse justify-start gap-4 overflow-y-auto py-4 pe-4">
                    {[...(transcript ?? [])].reverse().map((segment) => {
                      const outbound = isAgentSpeaker(segment.speaker);

                      return (
                        <div
                          className={cn(
                            "max-w-72 px-3 py-2 wrap-break-word shadow-lg",
                            outbound
                              ? "self-end rounded-[16px_16px_0_16px] bg-primary/90 text-primary-foreground"
                              : "self-start rounded-[16px_16px_16px_0] bg-muted",
                          )}
                          key={String(segment._id)}
                        >
                          <span
                            className={cn(
                              "mb-1 block text-[11px] font-semibold tracking-[0.16em] uppercase",
                              outbound
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground",
                            )}
                          >
                            {formatSpeakerLabel(segment.speaker)}
                          </span>
                          <p>{segment.text}</p>
                        </div>
                      );
                    })}

                    {transcript && transcript.length === 0 ? (
                      <div className="self-center rounded-xl border border-dashed px-6 py-4 text-sm text-muted-foreground">
                        {t("transcript.noSegments")}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {t("page.selectCall")}
          </div>
        )}
      </div>
    </section>
  );
}
