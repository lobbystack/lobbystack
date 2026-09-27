"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DateTime, Interval } from "luxon";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { calendarRange, layoutBlocks, shiftCalendarDate, visibleHours, type CalendarView } from "@/lib/calendar-view";
import { subscribeRealtimeQuery } from "@/lib/realtime-query";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";
import { BusinessPage } from "./business-page";
import { staffQueryKey } from "./staff-surface";

type Appointment = { id: string; startsAt: string; endsAt: string; status: string; contactName: string | null; serviceName: string; staffId: string; staffName: string };
type Column = { key: string; label: string; day: DateTime; appointments: Appointment[] };

/**
 * The business calendar, in day or week view. With staff turned on, the day
 * view has one column per staff member.
 */
export function CalendarSurface() {
  const { i18n, t } = useTranslation("receptionists");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const navigation = useNavigationSnapshot();
  const businessId = navigation?.businessId;
  const timezone = navigation?.timezone ?? "UTC";
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const view: CalendarView = params.get("view") === "week" ? "week" : "day";
  const range = useMemo(() => calendarRange(view, params.get("date"), timezone), [view, params, timezone]);

  const appointments = useQuery({
    queryKey: ["calendar", businessId, range.start.toISO(), range.end.toISO()],
    enabled: Boolean(businessId),
    queryFn: () => requestJson<{ appointments: Appointment[] }>(`/api/appointments?businessId=${encodeURIComponent(businessId!)}&from=${encodeURIComponent(range.start.toUTC().toISO()!)}&to=${encodeURIComponent(range.end.toUTC().toISO()!)}`),
  });
  const staff = useQuery({
    queryKey: staffQueryKey(businessId),
    enabled: Boolean(businessId && navigation?.staffEnabled),
    queryFn: () => requestJson<{ staff: Array<{ id: string; name: string; active: boolean }> }>(`/api/staff?businessId=${encodeURIComponent(businessId!)}`),
  });

  useEffect(() => {
    if (!businessId) return;
    return subscribeRealtimeQuery(queryClient, businessId, ["calendar", businessId], ["appointment.updated"]);
  }, [businessId, queryClient]);

  const setParams = (updates: Record<string, string | null>) => {
    // Read the live URL so two quick changes don't overwrite each other.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) { if (value) next.set(key, value); else next.delete(key); }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const rows = appointments.data?.appointments ?? [];
  const { startHour, endHour } = visibleHours(rows, timezone);
  const staffColumns = view === "day" && navigation?.staffEnabled;
  const columns: Column[] = staffColumns
    ? (staff.data?.staff ?? []).filter((member) => member.active || rows.some((row) => row.staffId === member.id)).map((member) => ({ key: member.id, label: member.name, day: range.start, appointments: rows.filter((row) => row.staffId === member.id) }))
    : range.days.map((day) => ({ key: day.toISODate()!, label: day.setLocale(locale).toFormat(view === "week" ? "ccc d" : "cccc d LLLL"), day, appointments: rows }));
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
  const title = view === "week"
    ? Interval.fromDateTimes(range.start.setLocale(locale), range.end.minus({ days: 1 }).setLocale(locale)).toLocaleString({ month: "long", day: "numeric", year: "numeric" })
    : range.start.setLocale(locale).toLocaleString(DateTime.DATE_HUGE);

  return (
    <BusinessPage title={t("nav.calendar")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button aria-label={t("calendar.previous")} onClick={() => setParams({ date: shiftCalendarDate(range, -1) })} size="icon-sm" variant="outline"><ChevronLeft /></Button>
          <Button onClick={() => setParams({ date: null })} size="sm" variant="outline">{t("calendar.today")}</Button>
          <Button aria-label={t("calendar.next")} onClick={() => setParams({ date: shiftCalendarDate(range, 1) })} size="icon-sm" variant="outline"><ChevronRight /></Button>
          <h2 className="ml-2 text-base font-medium" data-testid="calendar-title">{title}</h2>
          <div aria-label={t("calendar.view")} className="ml-auto flex items-center gap-1 rounded-full bg-muted p-1" role="group">
            {(["day", "week"] as const).map((option) => (
              <button aria-pressed={view === option} className={cn("h-7 rounded-full px-3 text-sm font-medium", view === option ? "bg-background text-foreground shadow-xs" : "text-muted-foreground")} key={option} onClick={() => setParams({ view: option === "day" ? null : option })} type="button">{t(`calendar.views.${option}`)}</button>
            ))}
          </div>
        </div>
        {appointments.isLoading ? <Skeleton className="h-[32rem] w-full rounded-xl" /> : (
          <div className="overflow-x-auto rounded-xl border" data-testid="calendar-grid" data-view={view} data-columns={staffColumns ? "staff" : "days"}>
            <div className="grid min-w-[40rem]" style={{ gridTemplateColumns: `4rem repeat(${Math.max(columns.length, 1)}, minmax(8rem, 1fr))` }}>
              <div className="border-b" />
              {columns.map((column) => <div className="ph-mask truncate border-b border-l px-3 py-2 text-sm font-medium" key={column.key}>{column.label}</div>)}
              <div className="relative">
                {hours.map((hour) => <div className="h-14 border-b pr-2 text-right text-xs text-muted-foreground" key={hour}>{range.start.set({ hour }).setLocale(locale).toLocaleString(DateTime.TIME_SIMPLE)}</div>)}
              </div>
              {columns.map((column) => (
                <div className="relative border-l" data-testid="calendar-column" key={column.key} style={{ height: `${hours.length * 3.5}rem` }}>
                  {hours.map((hour) => <div className="h-14 border-b" key={hour} />)}
                  {layoutBlocks(column.appointments, column.day, startHour, endHour).map(({ item, top, height }) => (
                    <div
                      className="absolute inset-x-1 overflow-hidden rounded-xl bg-primary/10 px-2 py-1 text-xs text-foreground ring-1 ring-primary/20"
                      data-testid="calendar-appointment"
                      key={item.id}
                      style={{ top: `${top}%`, height: `${height}%` }}
                      title={`${item.serviceName} · ${item.contactName ?? ""}`}
                    >
                      <p className="font-medium">{DateTime.fromISO(item.startsAt).setZone(timezone).setLocale(locale).toLocaleString(DateTime.TIME_SIMPLE)} {item.serviceName}</p>
                      <p className="ph-mask truncate text-muted-foreground">{item.contactName ?? t("inbox.unknownContact")}{navigation?.staffEnabled && !staffColumns ? ` · ${item.staffName}` : ""}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        {!appointments.isLoading && rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("calendar.empty")}</p> : null}
      </div>
    </BusinessPage>
  );
}
