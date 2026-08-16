"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@web/components/page-header";
import { TableCardSkeleton } from "@web/components/loading-skeletons";
import { Input } from "@web/components/ui/input";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@web/components/ui/table";
import { formatDateTime } from "@/lib/locale";
import { Button } from "@web/components/ui/button";

type Business = { businessId: string; active: boolean };
type Call = { id: string; providerCallId: string; status: string; disposition: string | null; startedAt: string; providerDurationSeconds: number | null; contactName: string | null; contactPhone: string | null; recordingState: "available" | "pending" | "expired" | "missing"; transcriptPreview: string | null };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load live call data.");
  return await response.json() as T;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function LiveCallsSurface() {
  const { i18n, t } = useTranslation("calls");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const calls = useQuery({ queryKey: ["calls", business?.businessId, search, offset], queryFn: () => getJson<{ calls: Call[]; pagination: { hasNext: boolean } }>(`/api/calls?limit=50&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ""}`), enabled: Boolean(business) });

  useEffect(() => {
    if (!business) return;
    const source = new EventSource("/api/realtime");
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["calls", business.businessId] });
    for (const event of ["call.started", "call.updated", "call.completed", "recording.available"]) source.addEventListener(event, refresh);
    return () => source.close();
  }, [business, queryClient]);

  const rows = calls.data?.calls ?? [];

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader actions={<div className="inline-flex shrink-0 items-center gap-2"><span className="text-base font-semibold leading-none">{(calls.data?.calls.filter((call) => call.status === "started").length ?? 0).toLocaleString(i18n.language)}</span><span className="relative flex size-2.5 shrink-0"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/45" /><span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" /></span></div>} title={t("page.title")} />
       <div className="relative max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" onChange={(event) => { setOffset(0); setSearch(event.target.value); }} placeholder={t("filters.searchPlaceholder")} value={search} /></div>
      {businesses.isLoading || calls.isLoading ? <TableCardSkeleton columns={5} /> : (
        <TableCard>
          <Table className="min-w-[56rem]">
             <TableHeader><TableRow><TableHead>{t("table.caller")}</TableHead><TableHead>{t("table.number")}</TableHead><TableHead className="min-w-80">{t("table.purpose")}</TableHead><TableHead className="min-w-72">Transcript</TableHead><TableHead className="text-right">{t("table.time")}</TableHead><TableHead className="text-right">{t("table.status")}</TableHead><TableHead className="text-right">{t("table.audio")}</TableHead></TableRow></TableHeader>
             <TableBody>{rows.length ? rows.map((call) => <TableRow key={call.id}><TableCell className="font-medium"><Link href={`/calls/${call.id}`}>{call.contactName ?? t("table.unknownCaller")}</Link></TableCell><TableCell>{call.contactPhone ?? t("table.noNumber")}</TableCell><TableCell className="type-body-muted">{call.disposition ?? call.status}</TableCell><TableCell className="max-w-72 truncate text-muted-foreground">{call.transcriptPreview ?? "No transcript yet"}</TableCell><TableCell className="text-right">{formatDateTime(call.startedAt, i18n.language, { dateStyle: "medium", timeStyle: "short" })}</TableCell><TableCell className="text-right">{formatDuration(call.providerDurationSeconds)}</TableCell><TableCell className="text-right capitalize"><Link href={`/calls/${call.id}`}>{call.recordingState === "available" ? t("actions.listen") : call.recordingState === "pending" ? t("actions.audioPending") : call.recordingState === "expired" ? t("actions.audioExpired") : t("actions.audioUnavailable")}</Link></TableCell></TableRow>) : <TableRow><TableCell className="h-32 text-center text-muted-foreground" colSpan={7}>{t("table.empty")}</TableCell></TableRow>}</TableBody>
          </Table>
         </TableCard>
      )}
      <div className="flex justify-end gap-2"><Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))} size="sm" variant="outline">Previous</Button><Button disabled={!calls.data?.pagination.hasNext} onClick={() => setOffset(offset + 50)} size="sm" variant="outline">Next</Button></div>
    </div>
  );
}
