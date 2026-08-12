"use client";

import { useEffect } from "react";
import { RefreshCw, Radio } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Call = {
  id: string;
  providerCallId: string;
  status: string;
  disposition: string | null;
  startedAt: string;
  endedAt: string | null;
  providerDurationSeconds: number | null;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load live call data.");
  return await response.json() as T;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "-";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function LiveCallsSurface() {
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const calls = useQuery({
    queryKey: ["calls", business?.businessId],
    queryFn: () => getJson<{ calls: Call[] }>(`/api/calls?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["calls", business.businessId] });
    const events = ["call.started", "call.updated", "call.completed", "transcript.upserted", "recording.available"];
    source.addEventListener("open", refresh);
    for (const event of events) source.addEventListener(event, refresh);
    return () => {
      source.removeEventListener("open", refresh);
      for (const event of events) source.removeEventListener(event, refresh);
      source.close();
    };
  }, [business?.businessId, queryClient]);

  const rows = calls.data?.calls ?? [];
  return <PageSurface title="Calls" description="Review conversations, outcomes, recordings, and transcripts.">
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><Radio className="size-5 text-teal-600" />Live call activity</CardTitle>
          <CardDescription>{business ? `${business.name} · updates arrive through authenticated SSE` : "Choose a workspace to view calls."}</CardDescription>
        </div>
        <Button variant="ghost" onClick={() => void calls.refetch()} disabled={calls.isFetching}><RefreshCw className="size-4" />Refresh</Button>
      </CardHeader>
      <CardContent>
        {businesses.isLoading || calls.isLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading calls...</p> : null}
        {businesses.isError || calls.isError ? <p className="py-12 text-center text-sm text-red-600">Live call data is unavailable.</p> : null}
        {!businesses.isLoading && !calls.isLoading && !businesses.isError && !calls.isError ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Call</th><th className="px-3 py-3 font-semibold">Time</th><th className="px-3 py-3 font-semibold">Outcome</th><th className="px-3 py-3 font-semibold">Duration</th><th className="px-3 py-3 font-semibold">Status</th></tr></thead><tbody>{rows.length > 0 ? rows.map((call) => <tr className="border-b border-slate-50 last:border-0" key={call.id}><td className="px-3 py-4 font-medium text-slate-800">{call.providerCallId}</td><td className="px-3 py-4 text-slate-600">{formatTime(call.startedAt)}</td><td className="px-3 py-4 text-slate-600">{call.disposition ?? "-"}</td><td className="px-3 py-4 text-slate-600">{formatDuration(call.providerDurationSeconds)}</td><td className="px-3 py-4"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium capitalize text-teal-700">{call.status}</span></td></tr>) : <tr><td className="px-3 py-12 text-center text-slate-500" colSpan={5}>No calls yet.</td></tr>}</tbody></table></div> : null}
      </CardContent>
    </Card>
  </PageSurface>;
}
