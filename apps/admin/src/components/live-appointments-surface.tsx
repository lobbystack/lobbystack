"use client";

import { useEffect } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
  sourceChannel: string;
  calendarSyncState: string;
  contactName: string | null;
  serviceName: string;
  staffName: string;
};

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
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const appointments = useQuery({
    queryKey: ["appointments", business?.businessId],
    queryFn: () => getJson<{ appointments: Appointment[] }>(`/api/appointments?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["appointments", business.businessId] });
    source.addEventListener("open", refresh);
    source.addEventListener("appointment.updated", refresh);
    return () => {
      source.removeEventListener("open", refresh);
      source.removeEventListener("appointment.updated", refresh);
      source.close();
    };
  }, [business?.businessId, queryClient]);

  const rows = appointments.data?.appointments ?? [];
  return <PageSurface title="Appointments" description="See upcoming bookings, staff assignments, and calendar synchronization state.">
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-teal-600" />Upcoming bookings</CardTitle>
          <CardDescription>{business ? `${business.name} · ${rows.length} upcoming appointments` : "Choose a workspace to view appointments."}</CardDescription>
        </div>
        <Button variant="ghost" onClick={() => void appointments.refetch()} disabled={appointments.isFetching}><RefreshCw className="size-4" />Refresh</Button>
      </CardHeader>
      <CardContent>
        {businesses.isLoading || appointments.isLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading appointments...</p> : null}
        {businesses.isError || appointments.isError ? <p className="py-12 text-center text-sm text-red-600">Appointments are unavailable.</p> : null}
        {!businesses.isLoading && !appointments.isLoading && !businesses.isError && !appointments.isError ? <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Time</th><th className="px-3 py-3 font-semibold">Customer</th><th className="px-3 py-3 font-semibold">Service</th><th className="px-3 py-3 font-semibold">Staff</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Calendar</th></tr></thead><tbody>{rows.length > 0 ? rows.map((appointment) => <tr className="border-b border-slate-50 last:border-0" key={appointment.id}><td className="px-3 py-4 font-medium text-slate-800">{formatDate(appointment)}</td><td className="px-3 py-4 text-slate-600">{appointment.contactName ?? "Unknown contact"}</td><td className="px-3 py-4 text-slate-600">{appointment.serviceName}</td><td className="px-3 py-4 text-slate-600">{appointment.staffName}</td><td className="px-3 py-4"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium capitalize text-teal-700">{appointment.status}</span></td><td className="px-3 py-4 capitalize text-slate-600">{appointment.calendarSyncState.replaceAll("_", " ")}</td></tr>) : <tr><td className="px-3 py-12 text-center text-slate-500" colSpan={6}>No upcoming appointments.</td></tr>}</tbody></table></div> : null}
      </CardContent>
    </Card>
  </PageSurface>;
}
