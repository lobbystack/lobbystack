"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { CalendarCheck2, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasEnded, type Appointment } from "@/hooks/use-appointments";
import { addDays, addMonths, dayKey, firstDayOfWeek, keyToDate, monthGrid, weekDays } from "@/lib/calendar-days";
import { formatDateTime, intlLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

export type CalendarView = "week" | "month";

const WEEK_PREVIEW = 4;
// Inline so the seven columns never depend on a generated utility class.
const SEVEN_COLUMNS: CSSProperties = { gridTemplateColumns: "repeat(7, minmax(0, 1fr))" };
const DOT: CSSProperties = { width: 6, height: 6 };

/**
 * Upcoming appointments on a week or month grid. Selecting a day hands it to
 * the page, which lists that day's appointments under the grid. Phones get a
 * compact grid with a dot per busy day instead of booking previews.
 */
export function AppointmentsCalendar({ appointments, onSelectDay, onViewChange, selectedDay, timeZone, today, contactName, view }: {
  appointments: Appointment[];
  onSelectDay: (day: string) => void;
  onViewChange: (view: CalendarView) => void;
  selectedDay: string;
  timeZone: string;
  today: string;
  contactName: (appointment: Appointment) => string;
  view: CalendarView;
}) {
  const { i18n, t } = useTranslation("common");
  const locale = intlLocale(i18n.language);
  const firstDay = firstDayOfWeek(locale);
  const [anchor, setAnchor] = useState(selectedDay);

  const byDay = useMemo(() => {
    const days = new Map<string, Appointment[]>();
    for (const appointment of appointments) {
      const key = dayKey(appointment.startsAt, timeZone);
      days.set(key, [...(days.get(key) ?? []), appointment]);
    }
    return days;
  }, [appointments, timeZone]);

  const days = view === "week" ? weekDays(anchor, firstDay) : monthGrid(anchor, firstDay);
  const month = anchor.slice(0, 7);
  const label = (key: string, options: Intl.DateTimeFormatOptions) => formatDateTime(keyToDate(key).toISOString(), i18n.language, { ...options, timeZone: "UTC" });
  const title = view === "month"
    ? label(anchor, { month: "long", year: "numeric" })
    : `${label(days[0]!, { month: "short", day: "numeric" })} – ${label(days[6]!, { month: "short", day: "numeric" })}`;
  const step = (direction: 1 | -1) => setAnchor((current) => view === "week" ? addDays(current, 7 * direction) : addMonths(current, direction));
  const select = (key: string) => { onSelectDay(key); if (view === "month" && key.slice(0, 7) !== month) setAnchor(key); };
  const dayLabel = (key: string) => `${label(key, { weekday: "long", month: "long", day: "numeric" })}, ${t("appointments.calendarView.count", { count: byDay.get(key)?.length ?? 0 })}`;
  const muted = (key: string) => (view === "month" && key.slice(0, 7) !== month) || key < today;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button aria-label={t("appointments.calendarView.previous")} onClick={() => step(-1)} size="icon-sm" variant="outline"><ChevronLeft /></Button>
        <Button aria-label={t("appointments.calendarView.next")} onClick={() => step(1)} size="icon-sm" variant="outline"><ChevronRight /></Button>
        <h2 aria-live="polite" className="type-section-title min-w-0 flex-1 truncate text-base capitalize sm:text-xl">{title}</h2>
        <Button aria-label={t("appointments.calendarView.today")} className="sm:hidden" onClick={() => { setAnchor(today); onSelectDay(today); }} size="icon-sm" variant="outline"><CalendarCheck2 /></Button>
        <Button className="hidden sm:inline-flex" onClick={() => { setAnchor(today); onSelectDay(today); }} size="sm" variant="outline">{t("appointments.calendarView.today")}</Button>
        <Tabs className="shrink-0" onValueChange={(value) => { onViewChange(value as CalendarView); setAnchor(selectedDay); }} value={view}>
          <TabsList>
            <TabsTrigger value="week">{t("appointments.calendarView.week")}</TabsTrigger>
            <TabsTrigger value="month">{t("appointments.calendarView.month")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Phones: weekday initials, then each day's number with a dot when it has bookings. */}
      <div className="rounded-xl border p-2 md:hidden" role="grid">
        <div className="grid" style={SEVEN_COLUMNS}>
          {days.slice(0, 7).map((key) => (
            <div className="py-1 text-center text-xs font-medium text-muted-foreground" key={`head-${key}`} role="columnheader">
              <abbr className="no-underline" title={label(key, { weekday: "long" })}>{label(key, { weekday: "narrow" })}</abbr>
            </div>
          ))}
          {days.map((key) => {
            const count = byDay.get(key)?.length ?? 0;
            return (
              <button
                aria-label={dayLabel(key)}
                aria-selected={key === selectedDay}
                className={cn("flex h-12 flex-col items-center justify-center gap-1 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", key === selectedDay && "bg-muted", muted(key) && "text-muted-foreground")}
                key={key}
                onClick={() => select(key)}
                role="gridcell"
                type="button"
              >
                <span className={cn("inline-flex size-7 items-center justify-center rounded-full text-sm tabular-nums", key === today && "bg-primary font-medium text-primary-foreground")}>{label(key, { day: "numeric" })}</span>
                <span aria-hidden="true" className={cn("block shrink-0 rounded-full", count ? "bg-foreground" : "bg-transparent")} style={DOT} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <div className="grid min-w-[42rem]" role="grid" style={SEVEN_COLUMNS}>
          {days.slice(0, 7).map((key) => (
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground capitalize" key={`head-${key}`} role="columnheader">
              {label(key, { weekday: "short" })}
            </div>
          ))}
          {days.map((key, index) => {
            const dayAppointments = byDay.get(key) ?? [];
            return (
              <button
                aria-label={dayLabel(key)}
                aria-selected={key === selectedDay}
                className={cn(
                  "flex min-w-0 flex-col gap-1.5 border-b p-2 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
                  index % 7 !== 6 && "border-r",
                  index >= days.length - 7 && "border-b-0",
                  view === "week" ? "min-h-48" : "min-h-24",
                  key === selectedDay && "bg-muted",
                  muted(key) && "text-muted-foreground",
                )}
                key={key}
                onClick={() => select(key)}
                role="gridcell"
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={cn("inline-flex size-7 items-center justify-center rounded-full text-sm tabular-nums", key === today && "bg-primary font-medium text-primary-foreground")}>
                    {label(key, { day: "numeric" })}
                  </span>
                  {view === "month" && dayAppointments.length ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-foreground tabular-nums">{dayAppointments.length}</span>
                  ) : null}
                </span>
                {view === "week" ? (
                  <span className="flex min-w-0 flex-col gap-1">
                    {dayAppointments.slice(0, WEEK_PREVIEW).map((appointment) => (
                      <span className={cn("min-w-0 truncate rounded-md bg-muted px-1.5 py-1 text-xs", hasEnded(appointment) && "line-through opacity-50")} key={appointment.id}>
                        <span className="font-medium tabular-nums">{formatDateTime(appointment.startsAt, i18n.language, { hour: "numeric", minute: "2-digit", timeZone })}</span>{" "}
                        <span className="ph-mask text-muted-foreground">{contactName(appointment)}</span>
                      </span>
                    ))}
                    {dayAppointments.length > WEEK_PREVIEW ? <span className="px-1.5 text-xs text-muted-foreground">{t("appointments.calendarView.more", { count: dayAppointments.length - WEEK_PREVIEW })}</span> : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
