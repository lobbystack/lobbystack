"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { selectActiveBusiness } from "@/lib/active-business";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { PageSurface } from "./page-surface";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Appointment = { id: string; startsAt: string; endsAt: string; timezone: string; status: string; sourceChannel: string; calendarSyncState: string; contactName: string | null; serviceName: string; staffName: string };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load appointments.");
  return await response.json() as T;
}

function formatDate(appointment: Appointment): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: appointment.timezone }).format(new Date(appointment.startsAt));
}

export function LiveAppointmentsSurface() {
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const appointments = useQuery({ queryKey: ["appointments", business?.businessId], queryFn: () => getJson<{ appointments: Appointment[] }>(`/api/appointments?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business) });

  useEffect(() => {
    if (!business) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["appointments", business.businessId] });
    source.addEventListener("appointment.updated", refresh);
    return () => { source.removeEventListener("appointment.updated", refresh); source.close(); };
  }, [business, queryClient]);

  const rows = appointments.data?.appointments ?? [];
  return <PageSurface description="" title="Appointments"><div className="flex w-full flex-col gap-6">
    <div className="flex items-center justify-between gap-4"><p className="type-section-description">{business ? `${business.name} · ${rows.length} upcoming appointments` : "Choose a workspace to view appointments."}</p><Button disabled={appointments.isFetching} onClick={() => void appointments.refetch()} variant="outline"><RefreshCw className={appointments.isFetching ? "animate-spin" : ""} />Refresh</Button></div>
    <TableCard><Table className="min-w-[60rem] w-full table-fixed"><colgroup><col className="w-[22%]" /><col className="w-[20%]" /><col className="w-[20%]" /><col className="w-[14%]" /><col className="w-[12%]" /><col className="w-[12%]" /></colgroup><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Customer</TableHead><TableHead>Service</TableHead><TableHead>Staff</TableHead><TableHead>Status</TableHead><TableHead>Calendar</TableHead></TableRow></TableHeader><TableBody>{businesses.isLoading || appointments.isLoading ? <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>Loading appointments…</TableCell></TableRow> : businesses.isError || appointments.isError ? <TableRow><TableCell className="h-24 text-center text-destructive" colSpan={6}>Appointments are unavailable.</TableCell></TableRow> : rows.length ? rows.map((appointment) => <TableRow className="h-12" key={appointment.id}><TableCell className="font-medium">{formatDate(appointment)}</TableCell><TableCell className="text-muted-foreground">{appointment.contactName ?? "Unknown contact"}</TableCell><TableCell className="text-muted-foreground">{appointment.serviceName}</TableCell><TableCell className="text-muted-foreground">{appointment.staffName}</TableCell><TableCell><Badge variant="secondary">{appointment.status}</Badge></TableCell><TableCell className="capitalize text-muted-foreground">{appointment.calendarSyncState.replaceAll("_", " ")}</TableCell></TableRow>) : <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>No upcoming appointments.</TableCell></TableRow>}</TableBody></Table></TableCard>
  </div></PageSurface>;
}
