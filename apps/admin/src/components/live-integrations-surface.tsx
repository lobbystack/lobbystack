"use client";

import { useEffect, useState } from "react";
import { Cable, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { selectActiveBusiness } from "@/lib/active-business";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type StaffOption = { id: string; name: string };
type CalendarOption = { id: string; summary: string; primary: boolean; accessRole?: string; selected: boolean };
type Integration = {
  name: string;
  account: string;
  status: string;
  updatedAt: string | null;
  connectionId: string | null;
  staffId?: string | null;
  selectedCalendarId: string | null;
  lastSyncError: string | null;
  calendarOptions?: CalendarOption[];
  discoveryError?: string | null;
};
type IntegrationsResponse = { integrations: Integration[]; staff: StaffOption[] };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Integration update failed.");
  return await response.json() as T;
}

function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
}

export function LiveIntegrationsSurface() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canMutate = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const integrations = useQuery({
    queryKey: ["integrations", business?.businessId],
    queryFn: () => requestJson<IntegrationsResponse>(`/api/integrations?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });
  const action = useMutation({
    mutationFn: (input: { method: "PATCH" | "POST" | "DELETE"; connectionId: string; calendarId?: string; staffId?: string | null }) => requestJson(
      `/api/integrations?businessId=${encodeURIComponent(business!.businessId)}${input.method === "DELETE" ? `&connectionId=${encodeURIComponent(input.connectionId)}` : ""}`,
      {
        method: input.method,
        ...(input.method === "PATCH" || input.method === "POST" ? { body: JSON.stringify({ connectionId: input.connectionId, ...(input.calendarId ? { calendarId: input.calendarId } : {}), ...(input.staffId !== undefined ? { staffId: input.staffId } : {}) }) } : {}),
      },
    ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["integrations", business?.businessId] }),
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Integration update failed."),
  });

  async function connectGoogleCalendar() {
    if (!business || !canMutate) return;
    setError(null);
    try {
      const result = await requestJson<{ url: string }>(`/api/calendar/google/start?businessId=${encodeURIComponent(business.businessId)}`);
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Calendar could not be connected.");
    }
  }

  useEffect(() => {
    if (!business?.businessId) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["integrations", business.businessId] });
    source.addEventListener("open", refresh);
    for (const event of ["appointment.updated", "calendar.updated"]) source.addEventListener(event, refresh);
    return () => {
      source.removeEventListener("open", refresh);
      for (const event of ["appointment.updated", "calendar.updated"]) source.removeEventListener(event, refresh);
      source.close();
    };
  }, [business?.businessId, queryClient]);

  const rows = integrations.data?.integrations ?? [];
  const staffOptions = integrations.data?.staff ?? [];
  return <PageSurface title="Integrations" description="Connect calendars, messaging providers, billing, and storage without exposing provider credentials to the browser.">
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><Cable className="size-5 text-teal-600" />Workspace integrations</CardTitle>
          <CardDescription>{business ? `${business.name} · provider status from PostgreSQL` : "Choose a workspace to view integrations."}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void connectGoogleCalendar()} disabled={!canMutate}><Cable className="size-4" />{rows.some((row) => row.name === "Google Calendar" && row.connectionId) ? "Reconnect Google" : "Connect Google"}</Button>
          <Button variant="ghost" onClick={() => void integrations.refetch()} disabled={integrations.isFetching}><RefreshCw className="size-4" />Refresh</Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
        {businesses.isLoading || integrations.isLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading integrations...</p> : null}
        {businesses.isError || integrations.isError ? <p className="py-12 text-center text-sm text-red-600">Integrations are unavailable.</p> : null}
        {!businesses.isLoading && !integrations.isLoading && !businesses.isError && !integrations.isError ? <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Integration</th><th className="px-3 py-3 font-semibold">Account</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Last updated</th><th className="px-3 py-3 font-semibold">Calendar</th><th className="px-3 py-3 font-semibold">Staff</th><th className="px-3 py-3 font-semibold">Actions</th></tr></thead>
            <tbody>{rows.map((integration) => <tr className="border-b border-slate-50 align-top last:border-0" key={integration.name}>
              <td className="px-3 py-4 font-medium text-slate-800">{integration.name}</td>
              <td className="px-3 py-4 text-slate-600">{integration.account}{integration.lastSyncError || integration.discoveryError ? <p className="mt-1 max-w-64 text-xs text-red-600">{integration.lastSyncError ?? integration.discoveryError}</p> : null}</td>
              <td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${integration.status === "connected" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}>{integration.status.replaceAll("_", " ")}</span></td>
              <td className="px-3 py-4 text-slate-600">{formatDate(integration.updatedAt)}</td>
              <td className="px-3 py-4">{integration.connectionId ? integration.calendarOptions?.length ? <select aria-label={`${integration.name} calendar`} className="min-h-9 min-w-52 rounded-xl border bg-background px-2 text-xs" disabled={!canMutate || action.isPending} value={integration.selectedCalendarId ?? integration.calendarOptions.find((option) => option.selected)?.id ?? ""} onChange={(event) => action.mutate({ method: "PATCH", connectionId: integration.connectionId!, calendarId: event.target.value })}>{integration.calendarOptions.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? " (primary)" : ""}</option>)}</select> : <span className="text-slate-500">Discovery unavailable</span> : "-"}</td>
              <td className="px-3 py-4">{integration.connectionId ? <select aria-label={`${integration.name} staff`} className="min-h-9 min-w-44 rounded-xl border bg-background px-2 text-xs" disabled={!canMutate || action.isPending} value={integration.staffId ?? ""} onChange={(event) => action.mutate({ method: "PATCH", connectionId: integration.connectionId!, staffId: event.target.value || null })}><option value="">All staff</option>{staffOptions.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select> : "-"}</td>
              <td className="px-3 py-4">{integration.connectionId ? <div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={!canMutate || action.isPending} onClick={() => action.mutate({ method: "POST", connectionId: integration.connectionId! })}>Refresh</Button><Button variant="ghost" disabled={!canMutate || action.isPending} onClick={() => action.mutate({ method: "DELETE", connectionId: integration.connectionId! })}>Disconnect</Button></div> : "-"}</td>
            </tr>)}</tbody>
          </table>
        </div> : null}
      </CardContent>
    </Card>
  </PageSurface>;
}
