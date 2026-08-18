"use client";

import { useEffect } from "react";
import { CheckCircle2, CircleHelp, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Step = { name: string; description: string; status: string };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load setup status.");
  return await response.json() as T;
}

export function LiveSetupGuideSurface() {
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const setup = useQuery({
    queryKey: ["setup", business?.businessId],
    queryFn: () => getJson<{ steps: Step[] }>(`/api/setup?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["setup", business.businessId] });
    source.addEventListener("open", refresh);
    for (const event of ["appointment.updated", "knowledge.progressed", "document.progressed"]) source.addEventListener(event, refresh);
    return () => {
      source.removeEventListener("open", refresh);
      for (const event of ["appointment.updated", "knowledge.progressed", "document.progressed"]) source.removeEventListener(event, refresh);
      source.close();
    };
  }, [business?.businessId, queryClient]);

  const rows = setup.data?.steps ?? [];
  const completed = rows.filter((step) => step.status === "complete" || step.status === "completed").length;
  const progress = rows.length ? Math.round((completed / rows.length) * 100) : 0;
  return <PageSurface title="Setup guide" description="Work through the core configuration steps before sending live calls.">
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3 text-muted-foreground"><span className="relative grid size-10 place-items-center rounded-full border-4 border-muted text-xs font-semibold text-foreground"><span>{progress}%</span><span className="absolute inset-[-4px] rounded-full border-4 border-primary border-b-transparent border-l-transparent" style={{ transform: `rotate(${45 + progress * 3.6}deg)` }} /></span><p className="text-sm">{completed} of {rows.length} setup steps complete</p></div><Button onClick={() => window.location.assign("/")} variant="outline">Skip setup</Button></div>
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><CircleHelp className="size-5 text-teal-600" />Configuration checklist</CardTitle>
          <CardDescription>{business ? `${business.name} · status is read from the active workspace` : "Choose a workspace to view setup status."}</CardDescription>
        </div>
        <Button variant="ghost" onClick={() => void setup.refetch()} disabled={setup.isFetching}><RefreshCw className="size-4" />Refresh</Button>
      </CardHeader>
      <CardContent>
        {businesses.isLoading || setup.isLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading setup status...</p> : null}
        {businesses.isError || setup.isError ? <p className="py-12 text-center text-sm text-red-600">Setup status is unavailable.</p> : null}
        {!businesses.isLoading && !setup.isLoading && !businesses.isError && !setup.isError ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Step</th><th className="px-3 py-3 font-semibold">Description</th><th className="px-3 py-3 font-semibold">Status</th></tr></thead><tbody>{rows.map((step) => <tr className="border-b border-slate-50 last:border-0" key={step.name}><td className="px-3 py-4 font-medium text-slate-800">{step.name}</td><td className="px-3 py-4 text-slate-600">{step.description}</td><td className="px-3 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${step.status === "complete" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>{step.status === "complete" ? <CheckCircle2 className="size-3.5" /> : null}{step.status}</span></td></tr>)}</tbody></table></div> : null}
      </CardContent>
    </Card>
  </PageSurface>;
}
