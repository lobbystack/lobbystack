"use client";

import { subscribeRealtimeQuery } from "@/lib/realtime-query";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
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

function formatDate(appointment: Appointment, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: appointment.timezone }).format(new Date(appointment.startsAt));
}

export function LiveAppointmentsSurface() {
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const appointments = useQuery({ queryKey: ["appointments", business?.businessId], queryFn: () => getJson<{ appointments: Appointment[] }>(`/api/appointments?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business) });

  useEffect(() => {
    if (!business?.businessId) return;
    return subscribeRealtimeQuery(queryClient, business?.businessId, ["appointments", business?.businessId], ["appointment.updated"]);
  }, [business?.businessId, queryClient]);

  const rows = appointments.data?.appointments ?? [];
  return <PageSurface description="" title={t("appointments.title")}><div className="flex w-full flex-col gap-6">
    <div className="flex items-center justify-between gap-4"><p className="type-section-description">{business ? t("appointments.summary", { name: business.name, count: rows.length }) : t("appointments.chooseWorkspace")}</p><Button disabled={!business || appointments.isFetching} onClick={() => void appointments.refetch()} variant="outline"><RefreshCw className={appointments.isFetching ? "animate-spin" : ""} />{t("appointments.refresh")}</Button></div>
    <TableCard><Table className="min-w-[60rem] w-full table-fixed"><colgroup><col className="w-[22%]" /><col className="w-[20%]" /><col className="w-[20%]" /><col className="w-[14%]" /><col className="w-[12%]" /><col className="w-[12%]" /></colgroup><TableHeader><TableRow><TableHead>{t("appointments.time")}</TableHead><TableHead>{t("appointments.customer")}</TableHead><TableHead>{t("appointments.service")}</TableHead><TableHead>{t("appointments.staff")}</TableHead><TableHead>{t("appointments.status")}</TableHead><TableHead>{t("appointments.calendar")}</TableHead></TableRow></TableHeader><TableBody>{businesses.isLoading || appointments.isLoading ? <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>{t("appointments.loading")}</TableCell></TableRow> : businesses.isError || appointments.isError ? <TableRow><TableCell className="h-24 text-center text-destructive" colSpan={6}>{t("appointments.unavailable")}</TableCell></TableRow> : rows.length ? rows.map((appointment) => <TableRow className="h-12" key={appointment.id}><TableCell className="font-medium">{formatDate(appointment, i18n.language)}</TableCell><TableCell className="ph-mask text-muted-foreground">{appointment.contactName ?? t("appointments.unknownContact")}</TableCell><TableCell className="text-muted-foreground">{appointment.serviceName}</TableCell><TableCell className="text-muted-foreground">{appointment.staffName}</TableCell><TableCell><Badge variant="secondary">{t(`appointments.statuses.${appointment.status}`, { defaultValue: appointment.status })}</Badge></TableCell><TableCell className="capitalize text-muted-foreground">{t(`appointments.calendarStates.${appointment.calendarSyncState}`, { defaultValue: appointment.calendarSyncState.replaceAll("_", " ") })}</TableCell></TableRow>) : <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>{t("appointments.empty")}</TableCell></TableRow>}</TableBody></Table></TableCard>
  </div></PageSurface>;
}
