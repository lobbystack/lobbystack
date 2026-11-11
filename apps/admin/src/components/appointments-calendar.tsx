"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasEnded, isCancelled, type Appointment, type TimeOff } from "@/hooks/use-appointments";
import { addDays, addMonths, keyToDate } from "@/lib/calendar-days";
import {
  blockPosition,
  closedSpans,
  dayLength,
  daySegments,
  HOUR_HEIGHT,
  HOUR_PADDING,
  instantAt,
  layoutColumns,
  minutesInDay,
  monthOverflow,
  SLOT_MINUTES,
  slotStarts,
  visibleHours,
  type CalendarView,
  type HoursWindow,
  type Segment,
} from "@/lib/calendar-layout";
import { formatDateTime, formatDateTimeRange, intlLocale } from "@/lib/locale";
import { serviceColorClasses, serviceDotClass } from "@/lib/service-colors";
import { cn } from "@/lib/utils";

export type { CalendarView };

/** A booking being made in the side panel, drawn on the grid until it's saved or dropped. */
export type CalendarDraft = { startsAt: string; endsAt: string; colorKey?: string | undefined };

/** Lines a month cell has room for under its day number. */
export const MONTH_CELL_LINES = 3;
const SEVEN_COLUMNS: CSSProperties = { gridTemplateColumns: "repeat(7, minmax(0, 1fr))" };
const HOUR_LINES: CSSProperties = { backgroundImage: "linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)", backgroundSize: `100% ${HOUR_HEIGHT}px` };

type CalendarProps = {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  /** The day the view is built around, "YYYY-MM-DD" in `timeZone`. */
  anchor: string;
  onAnchorChange: (day: string) => void;
  days: string[];
  today: string;
  /** The business's time zone; every time on the calendar is on its clock. */
  timeZone: string;
  now: number;
  appointments: Appointment[];
  timeOff: TimeOff[];
  hours: HoursWindow[];
  contactName: (appointment: Appointment) => string;
  onOpenAppointment: (id: string) => void;
  /** Absent for roles that can't change time off. */
  onOpenTimeOff?: ((id: string) => void) | undefined;
  /** Absent for roles that can't book. */
  onCreateAt?: ((startsAt: string) => void) | undefined;
  draft?: CalendarDraft | null | undefined;
  /** True while the shown range reloads. */
  busy?: boolean;
  /** Rendered after the Day/Week/Month switch, such as the page's List/Calendar switch. */
  trailing?: ReactNode;
};

/** The calendar's heading: the day, the week's range or the month, in the reader's language. */
export function calendarTitle(view: CalendarView, anchor: string, days: readonly string[], language: string): string {
  const label = (key: string, options: Intl.DateTimeFormatOptions) => formatDateTime(keyToDate(key).toISOString(), language, { ...options, timeZone: "UTC" });
  if (view === "day") return label(anchor, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (view === "month") return label(anchor, { month: "long", year: "numeric" });
  return new Intl.DateTimeFormat(intlLocale(language), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).formatRange(keyToDate(days[0]!), keyToDate(days.at(-1)!));
}

/**
 * The appointments calendar: a time grid for a day or a week, where each
 * booking is a block placed by its time and colored by its service, or a
 * month of days listing their bookings. Closed hours and time off are hatched.
 * Clicking an empty slot starts a booking there.
 */
export function AppointmentsCalendar(props: CalendarProps) {
  const { i18n, t } = useTranslation("common");
  const { view, anchor, days } = props;
  const title = calendarTitle(view, anchor, days, i18n.language);
  const step = (direction: 1 | -1) => props.onAnchorChange(view === "day" ? addDays(anchor, direction) : view === "week" ? addDays(anchor, 7 * direction) : addMonths(anchor, direction));
  const openDay = (day: string) => { props.onAnchorChange(day); props.onViewChange("day"); };

  return (
    <section aria-busy={props.busy || undefined} aria-label={t("appointments.views.calendar")} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Button aria-label={t("appointments.calendarView.previous")} onClick={() => step(-1)} size="icon-sm" variant="outline"><ChevronLeft /></Button>
          <Button onClick={() => props.onAnchorChange(props.today)} size="sm" variant="outline">{t("appointments.calendarView.today")}</Button>
          <Button aria-label={t("appointments.calendarView.next")} onClick={() => step(1)} size="icon-sm" variant="outline"><ChevronRight /></Button>
        </div>
        <h2 aria-live="polite" className="type-section-title min-w-0 flex-1 basis-40 truncate text-base first-letter:uppercase sm:text-xl">{title}</h2>
        <Tabs className="shrink-0" onValueChange={(value) => props.onViewChange(value as CalendarView)} value={view}>
          <TabsList aria-label={t("appointments.calendarView.label")}>
            <TabsTrigger value="day">{t("appointments.calendarView.day")}</TabsTrigger>
            <TabsTrigger value="week">{t("appointments.calendarView.week")}</TabsTrigger>
            <TabsTrigger value="month">{t("appointments.calendarView.month")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {props.trailing}
      </div>
      {view === "month" ? <MonthGrid {...props} onOpenDay={openDay} /> : <TimeGrid {...props} onOpenDay={openDay} />}
    </section>
  );
}

function useLabels(timeZone: string, contactName: (appointment: Appointment) => string) {
  const { i18n, t } = useTranslation("common");
  const time = (value: string) => formatDateTime(value, i18n.language, { hour: "numeric", minute: "2-digit", timeZone });
  const range = (start: string, end: string, withDay = false) => formatDateTimeRange(start, end, i18n.language, { ...(withDay ? { weekday: "short", month: "short", day: "numeric" } : {}), hour: "numeric", minute: "2-digit", timeZone });
  return {
    time,
    range,
    appointment: (appointment: Appointment) => {
      const values = { name: contactName(appointment), service: appointment.serviceName, time: range(appointment.startsAt, appointment.endsAt, true) };
      return isCancelled(appointment) ? t("appointments.calendarView.blockCancelled", values) : t("appointments.calendarView.block", values);
    },
    timeOffTitle: (entry: TimeOff) => entry.staffName ? t("appointments.timeOff.employeeTitle", { employee: entry.staffName, name: entry.name }) : entry.name,
    timeOff: (entry: TimeOff) => {
      const values = { name: entry.name, employee: entry.staffName ?? "", time: range(entry.startsAt, entry.endsAt, true) };
      return entry.staffName ? t("appointments.timeOff.employeeLabel", values) : t("appointments.timeOff.label", values);
    },
  };
}

/** The classes that color a booking: its service's color, faded once it's over, greyed and struck through when cancelled. */
function appointmentClasses(appointment: Appointment, now: number): string {
  if (isCancelled(appointment)) return "border-muted-foreground/40 bg-muted text-muted-foreground line-through";
  return cn(serviceColorClasses(appointment.serviceId ?? appointment.serviceName), hasEnded(appointment, now) && "opacity-60");
}

function TimeGrid(props: CalendarProps & { onOpenDay: (day: string) => void }) {
  const { i18n, t } = useTranslation("common");
  const { days, timeZone, now, appointments, timeOff, hours, draft } = props;
  const labels = useLabels(timeZone, props.contactName);
  const scroller = useRef<HTMLDivElement>(null);
  const appointmentsById = useMemo(() => new Map(appointments.map((appointment) => [appointment.id, appointment])), [appointments]);
  const timeOffById = useMemo(() => new Map(timeOff.map((entry) => [entry.id, entry])), [timeOff]);
  const columns = useMemo(() => days.map((day) => {
    const booked = daySegments(appointments, day, timeZone);
    const off = daySegments(timeOff, day, timeZone);
    return {
      day,
      allDay: booked.filter((segment) => segment.allDay),
      timed: booked.filter((segment) => !segment.allDay),
      closures: off.filter((segment) => !timeOffById.get(segment.id)?.staffId),
      employeeOff: off.filter((segment) => timeOffById.get(segment.id)?.staffId),
      draft: draft ? daySegments([{ id: "draft", startsAt: draft.startsAt, endsAt: draft.endsAt }], day, timeZone)[0] : undefined,
    };
  }), [appointments, days, draft, timeOff, timeOffById, timeZone]);
  const range = visibleHours({ hours, days, segments: columns.flatMap((column) => [...column.timed, ...column.employeeOff, ...(column.draft ? [column.draft] : [])]) });
  const height = (range.end - range.start) * HOUR_HEIGHT;
  const hasAllDay = columns.some((column) => column.allDay.length);
  const template: CSSProperties = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` };
  const todayIndex = days.indexOf(props.today);
  const nowMinutes = todayIndex >= 0 ? minutesInDay(new Date(now).toISOString(), props.today, timeZone) : -1;
  const daysKey = days.join();

  // Opens on now when today is shown, else on the first booking, else at opening time; once per range, after it loads.
  const scrolledFor = useRef<string | null>(null);
  const firstStart = Math.min(...columns.flatMap((column) => column.timed.map((segment) => segment.start)));
  useLayoutEffect(() => {
    if (props.busy || scrolledFor.current === daysKey || !scroller.current) return;
    scrolledFor.current = daysKey;
    const target = nowMinutes >= range.start * 60 && nowMinutes <= range.end * 60 ? nowMinutes - 60 : Number.isFinite(firstStart) ? firstStart - 30 : (range.start + HOUR_PADDING) * 60;
    scroller.current.scrollTop = Math.max(0, ((target - range.start * 60) * HOUR_HEIGHT) / 60);
  }, [daysKey, firstStart, nowMinutes, props.busy, range.end, range.start]);

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="max-h-[min(70svh,44rem)] overflow-auto" data-testid="calendar-time-grid" ref={scroller}>
        <div className={cn(days.length > 1 && "min-w-[40rem]")}>
          <div className="sticky top-0 z-40 grid border-b bg-background" style={template}>
            <div aria-hidden="true" />
            {days.map((day) => {
              const isToday = day === props.today;
              const dayName = formatDateTime(keyToDate(day).toISOString(), i18n.language, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
              const content = <>
                <span className="text-xs font-medium text-muted-foreground capitalize">{formatDateTime(keyToDate(day).toISOString(), i18n.language, { weekday: "short", timeZone: "UTC" })}</span>
                <span className={cn("inline-flex size-7 items-center justify-center rounded-full text-sm tabular-nums", isToday && "bg-primary font-medium text-primary-foreground")}>{formatDateTime(keyToDate(day).toISOString(), i18n.language, { day: "numeric", timeZone: "UTC" })}</span>
              </>;
              return days.length > 1
                ? <button aria-label={dayName} className="flex items-center justify-center gap-1.5 border-l py-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" key={day} onClick={() => props.onOpenDay(day)} type="button">{content}</button>
                : <div className="flex items-center justify-center gap-1.5 border-l py-2" key={day}><span className="sr-only">{dayName}</span><span aria-hidden="true" className="flex items-center gap-1.5">{content}</span></div>;
            })}
            {hasAllDay ? <>
              <div className="flex items-center justify-end border-t pr-2 text-xs text-muted-foreground">{t("appointments.calendarView.allDay")}</div>
              {columns.map((column) => (
                <div className="flex min-w-0 flex-col gap-1 border-t border-l p-1" key={column.day}>
                  {column.allDay.map((segment) => {
                    const appointment = appointmentsById.get(segment.id)!;
                    return <button aria-label={labels.appointment(appointment)} className={cn("truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", appointmentClasses(appointment, now))} key={segment.id} onClick={() => props.onOpenAppointment(appointment.id)} type="button"><span className="ph-mask">{props.contactName(appointment)}</span></button>;
                  })}
                </div>
              ))}
            </> : null}
          </div>
          <div className="grid" style={template}>
            <div aria-hidden="true" className="relative" style={{ height }}>
              {Array.from({ length: range.end - range.start - 1 }, (_, index) => range.start + index + 1).map((hour) => (
                <span className="absolute right-2 -translate-y-1/2 text-xs whitespace-nowrap text-muted-foreground tabular-nums" key={hour} style={{ top: (hour - range.start) * HOUR_HEIGHT }}>
                  {formatDateTime(instantAt(days[0]!, hour * 60, timeZone), i18n.language, { hour: "numeric", timeZone })}
                </span>
              ))}
            </div>
            {columns.map((column, index) => {
              const placed = layoutColumns([...column.timed, ...column.employeeOff]);
              const length = dayLength(column.day, timeZone);
              const inRange = (segment: Pick<Segment, "start" | "end">) => ({ start: Math.max(segment.start, range.start * 60), end: Math.min(segment.end, range.end * 60) });
              return (
                <div className="relative border-l" data-day={column.day} key={column.day} style={{ ...HOUR_LINES, height }}>
                  {closedSpans(column.day, hours, range.start, range.end).map((span) => {
                    const { top, height: spanHeight } = blockPosition(span, range.start);
                    return <div aria-hidden="true" className="calendar-hatch-closed pointer-events-none absolute inset-x-0" key={`closed-${span.start}`} style={{ top, height: spanHeight }} />;
                  })}
                  {props.onCreateAt ? slotStarts(range.start, range.end).filter((start) => start < length && Date.parse(instantAt(column.day, start + SLOT_MINUTES, timeZone)) > now).map((start) => {
                    const startsAt = instantAt(column.day, start, timeZone);
                    return <button aria-label={t("appointments.calendarView.newAt", { time: formatDateTime(startsAt, i18n.language, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }) })} className="absolute inset-x-0 z-0 outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" data-starts-at={startsAt} key={start} onClick={() => props.onCreateAt!(startsAt)} style={{ top: ((start - range.start * 60) * HOUR_HEIGHT) / 60, height: (SLOT_MINUTES * HOUR_HEIGHT) / 60 }} tabIndex={-1} type="button" />;
                  }) : null}
                  {column.closures.map((segment) => {
                    const entry = timeOffById.get(segment.id)!;
                    const { top, height: areaHeight } = blockPosition(inRange(segment), range.start);
                    const className = "calendar-hatch-time-off absolute inset-x-0 z-10 flex items-start overflow-hidden px-2 py-1 text-left text-xs font-medium text-muted-foreground";
                    return props.onOpenTimeOff
                      ? <button aria-label={labels.timeOff(entry)} className={cn(className, "outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset")} key={segment.id} onClick={() => props.onOpenTimeOff!(entry.id)} style={{ top, height: areaHeight }} type="button"><span className="truncate">{entry.name}</span></button>
                      : <div aria-label={labels.timeOff(entry)} className={className} key={segment.id} role="note" style={{ top, height: areaHeight }}><span className="truncate">{entry.name}</span></div>;
                  })}
                  {[...column.timed, ...column.employeeOff].map((segment) => {
                    const { column: slot, columns: share } = placed.get(segment.id)!;
                    const { top, height: blockHeight } = blockPosition(inRange(segment), range.start);
                    const style: CSSProperties = { top, height: blockHeight, left: `calc(${(slot / share) * 100}% + 2px)`, width: `calc(${100 / share}% - 4px)` };
                    const appointment = appointmentsById.get(segment.id);
                    if (!appointment) {
                      const entry = timeOffById.get(segment.id)!;
                      const className = "calendar-hatch-time-off absolute z-10 overflow-hidden rounded-md border border-dashed border-muted-foreground/30 px-1.5 py-1 text-left text-xs text-muted-foreground";
                      const body = <><span className="block truncate font-medium">{entry.staffName}</span><span className="block truncate">{entry.name}</span></>;
                      return props.onOpenTimeOff
                        ? <button aria-label={labels.timeOff(entry)} className={cn(className, "outline-none focus-visible:ring-2 focus-visible:ring-ring")} key={segment.id} onClick={() => props.onOpenTimeOff!(entry.id)} style={style} type="button">{body}</button>
                        : <div aria-label={labels.timeOff(entry)} className={className} key={segment.id} role="note" style={style}>{body}</div>;
                    }
                    const compact = blockHeight < 40;
                    return (
                      <button aria-label={labels.appointment(appointment)} className={cn("absolute z-20 flex flex-col overflow-hidden rounded-md border-l-[3px] px-1.5 text-left text-xs leading-4 shadow-xs outline-none hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background", compact ? "justify-center" : "py-1", appointmentClasses(appointment, now))} data-appointment-id={appointment.id} key={segment.id} onClick={() => props.onOpenAppointment(appointment.id)} style={style} type="button">
                        {compact ? <span className="truncate"><span className="font-medium tabular-nums">{labels.time(appointment.startsAt)}</span> <span className="ph-mask">{props.contactName(appointment)}</span></span> : <>
                          <span className="ph-mask truncate font-medium">{props.contactName(appointment)}</span>
                          <span className="truncate">{appointment.serviceName}</span>
                          {blockHeight >= 56 ? <span className="truncate tabular-nums opacity-80">{labels.range(appointment.startsAt, appointment.endsAt)}</span> : null}
                        </>}
                      </button>
                    );
                  })}
                  {column.draft ? (() => {
                    const { top, height: draftHeight } = blockPosition(inRange(column.draft), range.start);
                    return (
                      <div className={cn("pointer-events-none absolute inset-x-0.5 z-30 flex flex-col overflow-hidden rounded-md border-2 border-dashed px-1.5 py-0.5 text-xs leading-4 shadow-md", draft?.colorKey ? serviceColorClasses(draft.colorKey) : "border-primary bg-background text-foreground")} data-testid="calendar-draft" style={{ top, height: draftHeight }}>
                        <span className="truncate font-medium">{t("appointments.create.title")}</span>
                        <span className="truncate tabular-nums">{labels.range(draft!.startsAt, draft!.endsAt)}</span>
                      </div>
                    );
                  })() : null}
                  {index === todayIndex && nowMinutes >= range.start * 60 && nowMinutes <= range.end * 60 ? (
                    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-30 h-0.5 bg-destructive" data-testid="calendar-now" style={{ top: ((nowMinutes - range.start * 60) * HOUR_HEIGHT) / 60 }}>
                      <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-destructive" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

type MonthItem = { kind: "appointment"; appointment: Appointment } | { kind: "timeOff"; entry: TimeOff };

function MonthGrid(props: CalendarProps & { onOpenDay: (day: string) => void }) {
  const { i18n, t } = useTranslation("common");
  const { days, timeZone, now, anchor } = props;
  const labels = useLabels(timeZone, props.contactName);
  const month = anchor.slice(0, 7);
  const grid = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(anchor);
  useEffect(() => { setFocused(anchor); }, [anchor]);
  const byDay = useMemo(() => new Map(days.map((day) => {
    const offIds = new Set(daySegments(props.timeOff, day, timeZone).map((segment) => segment.id));
    const bookedIds = new Set(daySegments(props.appointments, day, timeZone).map((segment) => segment.id));
    const items: MonthItem[] = [
      ...props.timeOff.filter((entry) => offIds.has(entry.id)).map((entry) => ({ kind: "timeOff" as const, entry })),
      ...props.appointments.filter((appointment) => bookedIds.has(appointment.id)).map((appointment) => ({ kind: "appointment" as const, appointment })),
    ];
    return [day, items];
  })), [days, props.appointments, props.timeOff, timeZone]);
  const label = (key: string, options: Intl.DateTimeFormatOptions) => formatDateTime(keyToDate(key).toISOString(), i18n.language, { ...options, timeZone: "UTC" });

  // Arrow keys move between days, a week up or down; only the focused day is in the tab order.
  const move = (event: KeyboardEvent, day: string) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    const next = addDays(day, document.dir === "rtl" && Math.abs(offset) === 1 ? -offset : offset);
    if (!days.includes(next)) return;
    event.preventDefault();
    setFocused(next);
    grid.current?.querySelector<HTMLButtonElement>(`[data-day-number="${next}"]`)?.focus();
  };

  return (
    <div className="overflow-hidden rounded-xl border" ref={grid}>
      <div aria-hidden="true" className="grid border-b" style={SEVEN_COLUMNS}>
        {days.slice(0, 7).map((day) => <div className="px-2 py-2 text-center text-xs font-medium text-muted-foreground capitalize md:text-left" key={day}><span className="md:hidden">{label(day, { weekday: "narrow" })}</span><span className="hidden md:inline">{label(day, { weekday: "short" })}</span></div>)}
      </div>
      <div className="grid" style={SEVEN_COLUMNS}>
        {days.map((day, index) => {
          const items = byDay.get(day) ?? [];
          const { shown, more } = monthOverflow(items.length, MONTH_CELL_LINES);
          const outside = day.slice(0, 7) !== month;
          const count = items.filter((item) => item.kind === "appointment").length;
          return (
            <div className={cn("flex min-w-0 flex-col gap-0.5 p-1 md:h-32", index % 7 !== 6 && "border-r", index < days.length - 7 && "border-b", outside && "bg-muted/40")} key={day}>
              <button
                aria-label={`${label(day, { weekday: "long", month: "long", day: "numeric" })}, ${t("appointments.calendarView.count", { count })}`}
                className={cn("inline-flex size-7 shrink-0 items-center justify-center self-center rounded-full text-sm tabular-nums outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring md:self-start", day === props.today && "bg-primary font-medium text-primary-foreground hover:bg-primary/90", outside && day !== props.today && "text-muted-foreground")}
                data-day-number={day}
                onClick={() => props.onOpenDay(day)}
                onFocus={() => setFocused(day)}
                onKeyDown={(event) => move(event, day)}
                tabIndex={day === focused ? 0 : -1}
                type="button"
              >
                {label(day, { day: "numeric" })}
              </button>
              {/* Phones: a dot per item, the day number opens the day. */}
              <div aria-hidden="true" className="flex h-3 items-center justify-center gap-0.5 md:hidden">
                {items.slice(0, 3).map((item) => <span className={cn("size-1.5 rounded-full", item.kind === "timeOff" ? "bg-muted-foreground/40" : isCancelled(item.appointment) ? "bg-muted-foreground/40" : serviceDotClass(item.appointment.serviceId ?? item.appointment.serviceName))} key={item.kind === "timeOff" ? item.entry.id : item.appointment.id} />)}
              </div>
              <div className="hidden min-w-0 flex-col gap-0.5 md:flex">
                {items.slice(0, shown).map((item) => item.kind === "timeOff" ? (
                  props.onOpenTimeOff
                    ? <button aria-label={labels.timeOff(item.entry)} className="calendar-hatch-time-off truncate rounded-md px-1.5 py-0.5 text-left text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" key={item.entry.id} onClick={() => props.onOpenTimeOff!(item.entry.id)} type="button">{labels.timeOffTitle(item.entry)}</button>
                    : <span aria-label={labels.timeOff(item.entry)} className="calendar-hatch-time-off truncate rounded-md px-1.5 py-0.5 text-xs text-muted-foreground" key={item.entry.id} role="note">{labels.timeOffTitle(item.entry)}</span>
                ) : (
                  <button aria-label={labels.appointment(item.appointment)} className={cn("flex min-w-0 items-center gap-1 rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring", appointmentClasses(item.appointment, now))} data-appointment-id={item.appointment.id} key={item.appointment.id} onClick={() => props.onOpenAppointment(item.appointment.id)} type="button">
                    <span className="shrink-0 font-medium tabular-nums">{labels.time(item.appointment.startsAt)}</span>
                    <span className="ph-mask truncate">{props.contactName(item.appointment)}</span>
                  </button>
                ))}
                {more ? <button className="w-fit rounded-md px-1.5 py-0.5 text-left text-xs font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={() => props.onOpenDay(day)} type="button">{t("appointments.calendarView.more", { count: more })}</button> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
