"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { AppointmentRowsSkeleton, AppointmentsCalendarSkeleton, TableSearchSkeleton, TabsListSkeleton } from "./loading-skeletons";
import { TableSearch } from "./data-table/table-search";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { CancelAppointmentButton } from "./cancel-appointment-button";
import { MoveAppointmentButton } from "./move-appointment-dialog";
import { AppointmentDetailsSheet } from "./appointment-details-sheet";
import { AppointmentsCalendar, calendarTitle, type CalendarDraft } from "./appointments-calendar";
import type { AppointmentDraft } from "./appointment-form";
import { NewAppointmentDialog } from "./new-appointment-dialog";
import { NewAppointmentPopover, NewAppointmentSheet } from "./new-appointment-panel";
import { PageSurface } from "./page-surface";
import { TIME_OFF_ROLES, TimeOffDialog } from "./time-off-dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableActionsColumn, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { APPOINTMENT_ROLES } from "./cancel-appointment-button";
import { hasEnded, useAppointments, useAppointmentsBetween, useOpeningHours, useTimeOffBetween, type Appointment, type TimeOff } from "@/hooks/use-appointments";
import { useIsMobile } from "@/hooks/use-mobile";
import { markAppointmentsSeen } from "@/lib/appointments-seen";
import { dayKey, firstDayOfWeek } from "@/lib/calendar-days";
import { calendarDays, closedSpans, instantAt, minutesInDay, overlapping, rangeBounds, SLOT_MINUTES, type CalendarView } from "@/lib/calendar-layout";
import { getContactDisplayName } from "@/lib/contact-display";
import { formatDateTime, intlLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { Status } from "@/components/ui/status";
import { appointmentStatusVariant, calendarSyncVariant } from "@/lib/status-variants";
import { CalendarClock, CalendarOff, CalendarX2, Ellipsis, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

type View = "list" | "calendar";
type When = "upcoming" | "past";

const ALL_EMPLOYEES = "all";

function formatDate(appointment: Appointment, locale: string): string {
  return formatDateTime(appointment.startsAt, locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: appointment.timezone });
}

const staffKey = (appointment: Appointment) => appointment.staffId ?? appointment.staffName;

const subscribeNothing = () => () => {};
const CALENDAR_VIEWS = ["day", "week", "month"] as const;

/** The clock, ticking each minute, for the now line and fading what's over. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The next half hour today that's inside the opening hours and outside any closure, or null when today has none left. */
function nextOpenSlot(input: { today: string; timeZone: string; now: number; hours: Array<{ dayOfWeek: number; openMinutes: number; closeMinutes: number }>; closures: TimeOff[] }): string | null {
  const closed = closedSpans(input.today, input.hours, 0, 24);
  const from = Math.ceil((minutesInDay(new Date(input.now).toISOString(), input.today, input.timeZone) + 1) / SLOT_MINUTES) * SLOT_MINUTES;
  for (let start = from; start + SLOT_MINUTES <= 24 * 60; start += SLOT_MINUTES) {
    if (closed.some((span) => start < span.end && start + SLOT_MINUTES > span.start)) continue;
    const startsAt = instantAt(input.today, start, input.timeZone);
    if (!overlapping(startsAt, new Date(Date.parse(startsAt) + SLOT_MINUTES * 60_000).toISOString(), input.closures)) return startsAt;
  }
  return null;
}

export function LiveAppointmentsSurface() {
  const { t, i18n } = useTranslation("common");
  const { businesses, business, appointments } = useAppointments();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim());
  // ?view=list, &range=day|week|month and &employee=<staff id>; the defaults (calendar, Week, or Day on phones, everyone) stay out of the URL.
  const view: View = searchParams.get("view") === "list" ? "list" : "calendar";
  const defaultRange: CalendarView = isMobile ? "day" : "week";
  const requestedRange = searchParams.get("range");
  const range: CalendarView = CALENDAR_VIEWS.find((option) => option === requestedRange) ?? defaultRange;
  const when: When = searchParams.get("when") === "past" ? "past" : "upcoming";
  const setParam = (name: string, value: string, defaultValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultValue) params.delete(name);
    else params.set(name, value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  // The calendar needs the browser's clock, so it isn't rendered on the server.
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const now = useNow();
  const [anchor, setAnchor] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  // A booking from a clicked slot. It outlives `slotOpen`, so the popover keeps its form while it closes.
  const [slotBooking, setSlotBooking] = useState<{ key: number; startsAt: string } | null>(null);
  const [slotOpen, setSlotOpen] = useState(false);
  const [slotElement, setSlotElement] = useState<HTMLElement | null>(null);
  const [draftElement, setDraftElement] = useState<HTMLDivElement | null>(null);
  const [dialogBooking, setDialogBooking] = useState<{ key: number; startsAt: string | null } | null>(null);
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const [timeOffDialog, setTimeOffDialog] = useState<{ entry?: TimeOff } | null>(null);
  const businessId = business?.businessId;
  const canBook = Boolean(business && APPOINTMENT_ROLES.includes(business.role));
  const canManageTimeOff = Boolean(business && TIME_OFF_ROLES.includes(business.role));

  const openingHours = useOpeningHours(businessId);
  const rows = useMemo(() => appointments.data?.appointments ?? [], [appointments.data]);
  // Every time on the page is on the business's clock.
  const timeZone = business?.timezone ?? openingHours.data?.timezone ?? rows[0]?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = dayKey(new Date(now), timeZone);
  const day = anchor ?? today;
  const days = calendarDays(range, day, firstDayOfWeek(intlLocale(i18n.language)));
  const bounds = rangeBounds(days, timeZone);
  const calendarBusiness = view === "calendar" ? businessId : undefined;
  const calendarAppointments = useAppointmentsBetween(calendarBusiness, bounds.from, bounds.to);
  const timeOff = useTimeOffBetween(calendarBusiness, bounds.from, bounds.to);
  const loading = businesses.isLoading || appointments.isLoading;
  const calendarLoading = businesses.isLoading || (Boolean(businessId) && (calendarAppointments.isLoading || timeOff.isLoading || openingHours.isLoading));

  // Looking at the page clears the sidebar's new-bookings badge, including bookings that arrive while it's open.
  useEffect(() => { if (businessId && appointments.data) markAppointmentsSeen(businessId); }, [businessId, appointments.data]);

  const calendarRows = useMemo(() => calendarAppointments.data?.appointments ?? [], [calendarAppointments.data]);
  const staff = useMemo(() => [...new Map([...rows, ...calendarRows].map((appointment) => [staffKey(appointment), appointment.staffName])).entries()], [calendarRows, rows]);
  const requestedEmployee = searchParams.get("employee") ?? ALL_EMPLOYEES;
  // A link to someone with no bookings left shows everyone rather than an empty page.
  const employee = (appointments.data || calendarAppointments.data) && !staff.some(([key]) => key === requestedEmployee) ? ALL_EMPLOYEES : requestedEmployee;
  const byEmployee = employee === ALL_EMPLOYEES ? rows : rows.filter((appointment) => staffKey(appointment) === employee);
  const calendarByEmployee = employee === ALL_EMPLOYEES ? calendarRows : calendarRows.filter((appointment) => staffKey(appointment) === employee);
  const timeOffRows = useMemo(() => timeOff.data?.timeOff ?? [], [timeOff.data]);
  const shownTimeOff = employee === ALL_EMPLOYEES ? timeOffRows : timeOffRows.filter((entry) => !entry.staffId || entry.staffId === employee);
  const closures = useMemo(() => timeOffRows.filter((entry) => !entry.staffId), [timeOffRows]);
  const hours = useMemo(() => openingHours.data?.hours ?? [], [openingHours.data]);
  // Past appointments read newest first.
  const timeRows = when === "past" ? byEmployee.filter((appointment) => hasEnded(appointment)).reverse() : byEmployee.filter((appointment) => !hasEnded(appointment));
  const needle = query.toLowerCase();
  const listRows = needle ? timeRows.filter((appointment) => [appointment.contactName, appointment.contactPhone, appointment.contactEmail, appointment.serviceName, appointment.staffName, appointment.employeeName].some((value) => value?.toLowerCase().includes(needle))) : timeRows;
  // An empty list drops its minimum width, so its message stays centered instead of scrolling sideways; below the lg breakpoint, where the sidebar leaves too little room for its headers, it hides them too.
  // Without a connected calendar every booking is not_required, so the column would say nothing.
  const showCalendar = rows.some((appointment) => appointment.calendarSyncState && appointment.calendarSyncState !== "not_required");
  const columns = showCalendar ? 7 : 6;
  const listHasRows = loading || (listRows.length > 0 && !businesses.isError && !appointments.isError);
  const contactName = (appointment: Appointment) => getContactDisplayName({ name: appointment.contactName, phone: appointment.contactPhone, email: appointment.contactEmail, channels: [appointment.sourceChannel] }, i18n.language, t);
  // Looked up by id, so the panel follows live changes and closes once its appointment is gone.
  const details = detailsId ? calendarRows.find((appointment) => appointment.id === detailsId) ?? rows.find((appointment) => appointment.id === detailsId) : undefined;

  const closePanel = useCallback(() => { setSlotOpen(false); setDraft(null); }, []);
  const unavailable = useCallback((startsAt: string, endsAt: string) => overlapping(startsAt, endsAt, closures)?.name ?? null, [closures]);
  // Another slot while one is open moves that booking, keeping what's been filled in.
  const startBooking = (startsAt: string, slot: HTMLElement) => {
    setSlotElement(slot);
    setSlotBooking((current) => ({ key: slotOpen && current ? current.key : Date.now(), startsAt }));
    setSlotOpen(true);
  };
  const calendarDraft: CalendarDraft | null = slotOpen && draft?.startsAt ? { startsAt: draft.startsAt, endsAt: new Date(Date.parse(draft.startsAt) + draft.durationMinutes * 60_000).toISOString(), colorKey: draft.serviceId ?? undefined } : null;

  const viewTabs = <Tabs onValueChange={(value) => setParam("view", value as View, "calendar")} value={view}>
    <TabsList aria-label={t("appointments.views.label")}>
      <TabsTrigger value="list">{t("appointments.views.list")}</TabsTrigger>
      <TabsTrigger value="calendar">{t("appointments.views.calendar")}</TabsTrigger>
    </TabsList>
  </Tabs>;
  const employeeFilter = staff.length > 1 ? <Select items={[{ value: ALL_EMPLOYEES, label: t("appointments.filter.all") }, ...staff.map(([value, label]) => ({ value, label }))]} onValueChange={(value) => setParam("employee", value ?? ALL_EMPLOYEES, ALL_EMPLOYEES)} value={employee}>
    <SelectTrigger aria-label={t("appointments.filter.label")} className="w-full sm:w-44"><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup><SelectItem value={ALL_EMPLOYEES}>{t("appointments.filter.all")}</SelectItem>{staff.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
  </Select> : null;
  const whenTabs = view === "list" ? <Tabs onValueChange={(value) => setParam("when", value as When, "upcoming")} value={when}>
    <TabsList aria-label={t("appointments.when.label")}>
      <TabsTrigger value="upcoming">{t("appointments.when.upcoming")}</TabsTrigger>
      <TabsTrigger value="past">{t("appointments.when.past")}</TabsTrigger>
    </TabsList>
  </Tabs> : null;

  // The calendar needs the browser's clock, so the server render and the first client render show this too, with a
  // stand-in title: the server's clock and time zone could name another day.
  const viewLabels = [t("appointments.views.list"), t("appointments.views.calendar")];
  const calendarSkeleton = <AppointmentsCalendarSkeleton days={range === "day" ? 1 : 7} label={t("appointments.loading")} labels={{ today: t("appointments.calendarView.today"), title: isClient ? calendarTitle(range, day, days, i18n.language) : t("appointments.views.calendar") }} tabs={{ range: [t("appointments.calendarView.day"), t("appointments.calendarView.week"), t("appointments.calendarView.month")], view: viewLabels }} view={range} />;
  const actions = <div className="flex flex-wrap items-center gap-2">
    {canManageTimeOff ? <Button onClick={() => setTimeOffDialog({})} variant="outline"><CalendarOff data-icon="inline-start" />{t("appointments.timeOff.action")}</Button> : null}
    {canBook ? <Button onClick={() => { closePanel(); setDialogBooking({ key: Date.now(), startsAt: nextOpenSlot({ today, timeZone, now, hours, closures }) }); }}><Plus data-icon="inline-start" />{t("appointments.create.action")}</Button> : null}
  </div>;

  return <PageSurface actions={actions} title={t("appointments.title")}><div className="flex w-full flex-col gap-6">
    {!business && !businesses.isLoading ? <p className="type-section-description">{t("appointments.chooseWorkspace")}</p> : whenTabs || employeeFilter || view === "list" ? <div className="flex flex-wrap items-center justify-end gap-2">{loading && view === "list" ? <><TabsListSkeleton labels={[t("appointments.when.upcoming"), t("appointments.when.past")]} /><TabsListSkeleton labels={viewLabels} /></> : <>{whenTabs}{employeeFilter}{view === "list" ? viewTabs : null}</>}</div> : null}
    <div className="min-w-0">
        {view === "calendar" ? !isClient || calendarLoading ? calendarSkeleton : calendarAppointments.isError && !calendarAppointments.data ? <p className="rounded-xl border border-dashed p-10 text-center text-destructive">{t("appointments.unavailable")}</p> : <AppointmentsCalendar
          anchor={day}
          appointments={calendarByEmployee}
          busy={calendarAppointments.isPlaceholderData || timeOff.isPlaceholderData}
          contactName={contactName}
          days={days}
          draft={calendarDraft}
          draftRef={setDraftElement}
          hours={hours}
          now={now}
          onAnchorChange={setAnchor}
          onCreateAt={canBook ? startBooking : undefined}
          onOpenAppointment={(id) => { closePanel(); setDetailsId(id); }}
          onOpenTimeOff={canManageTimeOff ? (id) => { closePanel(); setTimeOffDialog({ entry: timeOffRows.find((entry) => entry.id === id)! }); } : undefined}
          onViewChange={(next) => setParam("range", next, defaultRange)}
          timeOff={shownTimeOff}
          timeZone={timeZone}
          today={today}
          trailing={viewTabs}
          view={range}
        /> : <div className="flex flex-col gap-6">{loading ? <TableSearchSkeleton /> : <TableSearch label={t("tableSearch.appointments")} onValueChange={setSearch} value={search} />}<TableCard><Table className={cn("w-full table-fixed", listHasRows && "min-w-[60rem]")}><colgroup>{showCalendar ? <><col className="w-[21%]" /><col className="w-[19%]" /><col className="w-[19%]" /><col className="w-[14%]" /><col className="w-[13%]" /><col className="w-[14%]" /></> : <><col className="w-[25%]" /><col className="w-[22%]" /><col className="w-[22%]" /><col className="w-[17%]" /><col className="w-[14%]" /></>}<TableActionsColumn /></colgroup><TableHeader empty={!listHasRows}><TableRow><TableHead>{t("appointments.time")}</TableHead><TableHead>{t("appointments.customer")}</TableHead><TableHead>{t("appointments.service")}</TableHead><TableHead>{t("appointments.staff")}</TableHead><TableHead>{t("appointments.status")}</TableHead>{showCalendar ? <TableHead>{t("appointments.calendar")}</TableHead> : null}<TableHead><span className="sr-only">{t("appointments.actions")}</span></TableHead></TableRow></TableHeader><TableBody>{loading ? <AppointmentRowsSkeleton label={t("appointments.loading")} /> : businesses.isError || appointments.isError ? <TableRow><TableCell className="h-24 text-center whitespace-normal text-destructive" colSpan={columns}>{t("appointments.unavailable")}</TableCell></TableRow> : listRows.length ? listRows.map((appointment) => { const name = contactName(appointment); const ended = hasEnded(appointment); return <TableRow className="cursor-pointer" key={appointment.id} onClick={() => setDetailsId(appointment.id)}><TableCell className="type-item-title"><button className="text-left underline-offset-4 outline-none hover:underline focus-visible:underline" onClick={() => setDetailsId(appointment.id)} type="button">{formatDate(appointment, i18n.language)}</button></TableCell><TableCell className="ph-mask max-w-0 truncate text-muted-foreground" title={name}>{name}</TableCell><TableCell className="max-w-0 truncate text-muted-foreground" title={appointment.serviceName}>{appointment.serviceName}</TableCell><TableCell className="max-w-0 truncate text-muted-foreground" title={appointment.staffName}>{appointment.staffName}</TableCell><TableCell><Status variant={appointmentStatusVariant(appointment.status)}>{t(`appointments.statuses.${appointment.status}`, { defaultValue: appointment.status })}</Status></TableCell>{showCalendar ? <TableCell>{appointment.calendarSyncState === "not_required" ? <span className="text-muted-foreground">—</span> : <Status variant={calendarSyncVariant(appointment.calendarSyncState)}>{t(`appointments.calendarStates.${appointment.calendarSyncState}`, { defaultValue: appointment.calendarSyncState })}</Status>}</TableCell> : null}<TableCell className="text-right" onClick={(event) => event.stopPropagation()}>{ended ? null : <CancelAppointmentButton appointment={{ ...appointment, contactName: name }} renderTrigger={(openCancel) => <MoveAppointmentButton appointment={{ ...appointment, contactName: name }} renderTrigger={(openMove) => <div className="flex justify-end" data-slot="data-table-row-actions"><DropdownMenu>
      <DropdownMenuTrigger render={<Button aria-label={t("appointments.rowActions", { time: formatDate(appointment, i18n.language) })} size="icon-sm" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={openMove}><CalendarClock />{t("appointments.move.action")}</DropdownMenuItem>
        <DropdownMenuItem onClick={openCancel} variant="destructive"><CalendarX2 />{t("appointments.cancel.action")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu></div>} />} />}</TableCell></TableRow>; }) : <TableRow><TableCell className="h-24 text-center whitespace-normal text-muted-foreground" colSpan={columns}>{query ? t("tableSearch.noResults", { query }) : t(when === "past" ? "appointments.when.pastEmpty" : "appointments.empty")}</TableCell></TableRow>}</TableBody></Table></TableCard></div>}
    </div>
    {businessId && isMobile && slotOpen && slotBooking ? <NewAppointmentSheet businessId={businessId} key={slotBooking.key} onClose={closePanel} onDraftChange={setDraft} startsAt={slotBooking.startsAt} timeZone={timeZone} unavailable={unavailable} /> : null}
    {businessId && !isMobile ? <NewAppointmentPopover anchor={draftElement ?? slotElement} businessId={businessId} formKey={slotBooking?.key} onClose={closePanel} onDraftChange={setDraft} open={slotOpen && Boolean(slotBooking)} returnFocus={slotElement} startsAt={slotBooking?.startsAt ?? null} timeZone={timeZone} unavailable={unavailable} /> : null}
    {dialogBooking && businessId ? <NewAppointmentDialog businessId={businessId} key={dialogBooking.key} onOpenChange={(open) => { if (!open) setDialogBooking(null); }} startsAt={dialogBooking.startsAt} timeZone={timeZone} unavailable={unavailable} /> : null}
    <AppointmentDetailsSheet appointment={details} contactName={details ? contactName(details) : ""} onOpenChange={(open) => { if (!open) setDetailsId(null); }} />
    {timeOffDialog && businessId ? <TimeOffDialog businessId={businessId} day={day < today ? today : day} entry={timeOffDialog.entry} onOpenChange={(open) => { if (!open) setTimeOffDialog(null); }} timeZone={timeZone} /> : null}
  </div></PageSurface>;
}
