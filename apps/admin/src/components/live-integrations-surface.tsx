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
  const google = rows.find((row) => row.name === "Google Calendar");
  const microsoft = rows.find((row) => row.name === "Microsoft Outlook");
  return <PageSurface title="Integrations" description="Connect calendars and other services to your workspace.">
    <div className="flex flex-col gap-6">
      {error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}
      {businesses.isLoading || integrations.isLoading ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading integrations...</CardContent></Card> : null}
      {businesses.isError || integrations.isError ? <Card><CardContent className="py-12 text-center text-sm text-destructive">Integrations are unavailable.</CardContent></Card> : null}
      {!businesses.isLoading && !integrations.isLoading && !businesses.isError && !integrations.isError ? <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <li className="overflow-hidden rounded-xl border border-border bg-card p-4"><div className="mb-8 flex items-center justify-between gap-3"><div className="flex size-10 items-center justify-center text-primary"><Cable className="size-7" /></div>{google?.connectionId ? <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">Connected</span> : null}</div><h2 className="font-heading text-base font-medium">Google Calendar</h2><p className="mt-1 text-sm text-muted-foreground">Sync appointments and availability with Google Calendar.</p><p className="mt-4 text-sm text-muted-foreground">{google?.account ?? "No account connected"}</p><Button className="mt-6 w-full" disabled={!canMutate} onClick={() => void connectGoogleCalendar()} variant={google?.connectionId ? "outline" : "default"}>{google?.connectionId ? "Reconnect Google" : "Connect Google"}</Button>{google?.connectionId ? <div className="mt-4 space-y-3 border-t border-border pt-4"><label className="grid gap-1.5 text-sm"><span className="font-medium">Calendar</span><select aria-label="Google Calendar" className="min-h-9 rounded-xl border bg-transparent px-2 text-sm" disabled={!canMutate || action.isPending} value={google.selectedCalendarId ?? google.calendarOptions?.find((option) => option.selected)?.id ?? ""} onChange={(event) => action.mutate({ method: "PATCH", connectionId: google.connectionId!, calendarId: event.target.value })}>{(google.calendarOptions ?? []).map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? " (primary)" : ""}</option>)}</select></label><label className="grid gap-1.5 text-sm"><span className="font-medium">Staff</span><select aria-label="Google Calendar staff" className="min-h-9 rounded-xl border bg-transparent px-2 text-sm" disabled={!canMutate || action.isPending} value={google.staffId ?? ""} onChange={(event) => action.mutate({ method: "PATCH", connectionId: google.connectionId!, staffId: event.target.value || null })}><option value="">All staff</option>{staffOptions.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><div className="flex items-center gap-2"><Button disabled={!canMutate || action.isPending} onClick={() => action.mutate({ method: "POST", connectionId: google.connectionId! })} size="sm" variant="outline"><RefreshCw className="size-4" />Refresh</Button><Button disabled={!canMutate || action.isPending} onClick={() => action.mutate({ method: "DELETE", connectionId: google.connectionId! })} size="sm" variant="ghost">Disconnect</Button></div></div> : null}</li>
        <li className="overflow-hidden rounded-xl border border-border bg-card p-4"><div className="mb-8 flex items-center justify-between gap-3"><div className="flex size-10 items-center justify-center text-muted-foreground"><Cable className="size-7" /></div></div><h2 className="font-heading text-base font-medium">Microsoft Outlook</h2><p className="mt-1 text-sm text-muted-foreground">Connect an Outlook calendar for scheduling.</p><p className="mt-4 text-sm text-muted-foreground">{microsoft?.status === "connected" ? microsoft.account : "Coming soon"}</p><Button className="mt-6 w-full" disabled variant="outline">Connect Outlook</Button></li>
      </ul> : null}
    </div>
  </PageSurface>;
}
