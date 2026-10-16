"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { Badge } from "./ui/badge";
import { CancelAppointmentButton } from "./cancel-appointment-button";
import { AppointmentDetailsSheet } from "./appointment-details-sheet";
import { AppointmentsCalendar, type CalendarView } from "./appointments-calendar";
import { PageSurface } from "./page-surface";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Surface } from "./ui/surface";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { hasEnded, useAppointments, type Appointment } from "@/hooks/use-appointments";
import { markAppointmentsSeen } from "@/lib/appointments-seen";
import { dayKey, keyToDate } from "@/lib/calendar-days";
import { getContactDisplayName } from "@/lib/contact-display";
import { formatDateTime } from "@/lib/locale";
import { cn } from "@/lib/utils";

type View = "list" | "calendar";
type When = "upcoming" | "past";

const ALL_EMPLOYEES = "all";

function formatDate(appointment: Appointment, locale: string): string {
  return formatDateTime(appointment.startsAt, locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: appointment.timezone });
}

const staffKey = (appointment: Appointment) => appointment.staffId ?? appointment.staffName;

const subscribeNothing = () => () => {};

export function LiveAppointmentsSurface() {
  const { t, i18n } = useTranslation("common");
  const { businesses, business, appointments } = useAppointments();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // ?view=calendar, &range=month and &employee=<staff id>; the defaults (list, week, all) stay out of the URL.
  const view: View = searchParams.get("view") === "calendar" ? "calendar" : "list";
  const range: CalendarView = searchParams.get("range") === "month" ? "month" : "week";
  const when: When = searchParams.get("when") === "past" ? "past" : "upcoming";
  const setParam = (name: string, value: string, defaultValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultValue) params.delete(name);
    else params.set(name, value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  // The calendar needs the browser's clock and time zone, so it isn't rendered on the server.
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const businessId = business?.businessId;

  // Looking at the page clears the sidebar's new-bookings badge, including bookings that arrive while it's open.
  useEffect(() => { if (businessId && appointments.data) markAppointmentsSeen(businessId); }, [businessId, appointments.data]);

  const rows = useMemo(() => appointments.data?.appointments ?? [], [appointments.data]);
  const staff = useMemo(() => [...new Map(rows.map((appointment) => [staffKey(appointment), appointment.staffName])).entries()], [rows]);
  const requestedEmployee = searchParams.get("employee") ?? ALL_EMPLOYEES;
  // A link to someone with no upcoming bookings left shows everyone rather than an empty page.
  const employee = appointments.data && !staff.some(([key]) => key === requestedEmployee) ? ALL_EMPLOYEES : requestedEmployee;
  const filtered = employee === ALL_EMPLOYEES ? rows : rows.filter((appointment) => staffKey(appointment) === employee);
  // Past appointments read newest first.
  const listRows = when === "past" ? filtered.filter((appointment) => hasEnded(appointment)).reverse() : filtered.filter((appointment) => !hasEnded(appointment));
  const contactName = (appointment: Appointment) => getContactDisplayName({ name: appointment.contactName, phone: appointment.contactPhone, email: appointment.contactEmail, channels: [appointment.sourceChannel] }, i18n.language, t);
  const timeZone = rows[0]?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = dayKey(new Date(), timeZone);
  const day = selectedDay ?? today;
  const dayAppointments = filtered.filter((appointment) => dayKey(appointment.startsAt, timeZone) === day);
  // Looked up by id, so the panel closes by itself once its appointment is cancelled.
  const details = detailsId ? rows.find((appointment) => appointment.id === detailsId) : undefined;

  return <PageSurface title={t("appointments.title")}><div className="flex w-full flex-col gap-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="type-section-description">{business ? t("appointments.summary", { name: business.name, count: rows.filter((appointment) => !hasEnded(appointment)).length }) : t("appointments.chooseWorkspace")}</p>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        {staff.length > 1 ? <Select items={[{ value: ALL_EMPLOYEES, label: t("appointments.filter.all") }, ...staff.map(([value, label]) => ({ value, label }))]} onValueChange={(value) => setParam("employee", value ?? ALL_EMPLOYEES, ALL_EMPLOYEES)} value={employee}>
          <SelectTrigger aria-label={t("appointments.filter.label")} className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value={ALL_EMPLOYEES}>{t("appointments.filter.all")}</SelectItem>{staff.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select> : null}
        <Tabs onValueChange={(value) => setParam("view", value as View, "list")} value={view}>
          <TabsList>
            <TabsTrigger value="list">{t("appointments.views.list")}</TabsTrigger>
            <TabsTrigger value="calendar">{t("appointments.views.calendar")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
    {view === "calendar" ? isClient ? <>
      <AppointmentsCalendar appointments={filtered} contactName={contactName} onSelectDay={setSelectedDay} onViewChange={(next) => setParam("range", next, "week")} selectedDay={day} timeZone={timeZone} today={today} view={range} />
      <section aria-live="polite" className="flex flex-col gap-3">
        <h2 className="type-section-title px-1 first-letter:uppercase">{formatDateTime(keyToDate(day).toISOString(), i18n.language, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</h2>
        {dayAppointments.length ? <Surface className="p-0">
          <ul className="divide-y">
            {dayAppointments.map((appointment) => {
              const name = contactName(appointment);
              const time = (value: string) => formatDateTime(value, i18n.language, { hour: "numeric", minute: "2-digit", timeZone: appointment.timezone });
              const ended = hasEnded(appointment);
              return <li className="p-1" key={appointment.id}>
                {/* The button's ::after stretches over the row; Cancel sits above it. */}
                <div className="relative flex items-center gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-muted/50 has-[>button:focus-visible]:ring-[3px] has-[>button:focus-visible]:ring-ring/50">
                <button className={cn("flex min-w-0 flex-1 items-start gap-4 text-left outline-none after:absolute after:inset-0 after:rounded-lg", ended && "line-through opacity-50")} onClick={() => setDetailsId(appointment.id)} type="button">
                {/* Wide enough for "11:30 AM" in 12-hour locales; times never wrap. */}
                <div className="flex w-20 shrink-0 flex-col whitespace-nowrap tabular-nums">
                  <span className="type-item-title">{time(appointment.startsAt)}</span>
                  <span className="text-sm leading-6 text-muted-foreground">{time(appointment.endsAt)}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="type-item-title ph-mask truncate">{name}</p>
                    {/* Confirmed is the normal state; only flag the others. */}
                    {appointment.status !== "confirmed" ? <Badge className="shrink-0" variant="secondary">{t(`appointments.statuses.${appointment.status}`, { defaultValue: appointment.status })}</Badge> : null}
                  </div>
                  <p className="type-body-muted truncate">{appointment.serviceName}</p>
                  {appointment.employeeName ? <p className="type-body-muted truncate">{t("appointments.calendarView.with", { name: appointment.employeeName })}</p> : null}
                </div>
                </button>
                {ended ? null : <div className="relative shrink-0"><CancelAppointmentButton appointment={{ ...appointment, contactName: name }} variant="destructive" /></div>}
                </div>
              </li>;
            })}
          </ul>
        </Surface> : <div className="rounded-xl border border-dashed p-10 text-center"><p className="type-empty-description">{t("appointments.calendarView.dayEmpty")}</p></div>}
      </section>
    </> : null : <><Tabs className="self-start" onValueChange={(value) => setParam("when", value as When, "upcoming")} value={when}>
      <TabsList aria-label={t("appointments.when.label")}>
        <TabsTrigger value="upcoming">{t("appointments.when.upcoming")}</TabsTrigger>
        <TabsTrigger value="past">{t("appointments.when.past")}</TabsTrigger>
      </TabsList>
    </Tabs><TableCard><Table className="min-w-[60rem] w-full table-fixed"><colgroup><col className="w-[20%]" /><col className="w-[18%]" /><col className="w-[18%]" /><col className="w-[13%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[9%]" /></colgroup><TableHeader><TableRow><TableHead>{t("appointments.time")}</TableHead><TableHead>{t("appointments.customer")}</TableHead><TableHead>{t("appointments.service")}</TableHead><TableHead>{t("appointments.staff")}</TableHead><TableHead>{t("appointments.status")}</TableHead><TableHead>{t("appointments.calendar")}</TableHead><TableHead><span className="sr-only">{t("appointments.actions")}</span></TableHead></TableRow></TableHeader><TableBody>{businesses.isLoading || appointments.isLoading ? <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={7}>{t("appointments.loading")}</TableCell></TableRow> : businesses.isError || appointments.isError ? <TableRow><TableCell className="h-24 text-center text-destructive" colSpan={7}>{t("appointments.unavailable")}</TableCell></TableRow> : listRows.length ? listRows.map((appointment) => { const name = contactName(appointment); const ended = hasEnded(appointment); return <TableRow className="h-12 cursor-pointer" key={appointment.id} onClick={() => setDetailsId(appointment.id)}><TableCell className="font-medium"><button className="text-left underline-offset-4 outline-none hover:underline focus-visible:underline" onClick={() => setDetailsId(appointment.id)} type="button">{formatDate(appointment, i18n.language)}</button></TableCell><TableCell className="ph-mask max-w-0 truncate text-muted-foreground" title={name}>{name}</TableCell><TableCell className="max-w-0 truncate text-muted-foreground" title={appointment.serviceName}>{appointment.serviceName}</TableCell><TableCell className="max-w-0 truncate text-muted-foreground" title={appointment.staffName}>{appointment.staffName}</TableCell><TableCell><Badge variant="secondary">{t(`appointments.statuses.${appointment.status}`, { defaultValue: appointment.status })}</Badge></TableCell><TableCell className="capitalize text-muted-foreground">{t(`appointments.calendarStates.${appointment.calendarSyncState}`, { defaultValue: appointment.calendarSyncState.replaceAll("_", " ") })}</TableCell><TableCell className="text-right" onClick={(event) => event.stopPropagation()}>{ended ? null : <CancelAppointmentButton appointment={{ ...appointment, contactName: name }} variant="destructive" />}</TableCell></TableRow>; }) : <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={7}>{t(when === "past" ? "appointments.when.pastEmpty" : "appointments.empty")}</TableCell></TableRow>}</TableBody></Table></TableCard></>}
    <AppointmentDetailsSheet appointment={details} contactName={details ? contactName(details) : ""} onOpenChange={(open) => { if (!open) setDetailsId(null); }} />
  </div></PageSurface>;
}
