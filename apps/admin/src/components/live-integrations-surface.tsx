"use client";

import { useEffect } from "react";
import { Cable, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Integration = { name: string; account: string; status: string; updatedAt: string | null };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load integrations.");
  return await response.json() as T;
}

function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "-";
}

export function LiveIntegrationsSurface() {
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const integrations = useQuery({
    queryKey: ["integrations", business?.businessId],
    queryFn: () => getJson<{ integrations: Integration[] }>(`/api/integrations?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["integrations", business.businessId] });
    source.addEventListener("open", refresh);
    for (const event of ["appointment.updated", "knowledge.progressed"]) source.addEventListener(event, refresh);
    return () => {
      source.removeEventListener("open", refresh);
      for (const event of ["appointment.updated", "knowledge.progressed"]) source.removeEventListener(event, refresh);
      source.close();
    };
  }, [business?.businessId, queryClient]);

  const rows = integrations.data?.integrations ?? [];
  return <PageSurface title="Integrations" description="Connect calendars, messaging providers, billing, and storage without exposing provider credentials to the browser.">
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><Cable className="size-5 text-teal-600" />Workspace integrations</CardTitle>
          <CardDescription>{business ? `${business.name} · provider status from PostgreSQL` : "Choose a workspace to view integrations."}</CardDescription>
        </div>
        <Button variant="ghost" onClick={() => void integrations.refetch()} disabled={integrations.isFetching}><RefreshCw className="size-4" />Refresh</Button>
      </CardHeader>
      <CardContent>
        {businesses.isLoading || integrations.isLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading integrations...</p> : null}
        {businesses.isError || integrations.isError ? <p className="py-12 text-center text-sm text-red-600">Integrations are unavailable.</p> : null}
        {!businesses.isLoading && !integrations.isLoading && !businesses.isError && !integrations.isError ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Integration</th><th className="px-3 py-3 font-semibold">Account</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Last updated</th></tr></thead><tbody>{rows.map((integration) => <tr className="border-b border-slate-50 last:border-0" key={integration.name}><td className="px-3 py-4 font-medium text-slate-800">{integration.name}</td><td className="px-3 py-4 text-slate-600">{integration.account}</td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${integration.status === "connected" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}>{integration.status}</span></td><td className="px-3 py-4 text-slate-600">{formatDate(integration.updatedAt)}</td></tr>)}</tbody></table></div> : null}
      </CardContent>
    </Card>
  </PageSurface>;
}
