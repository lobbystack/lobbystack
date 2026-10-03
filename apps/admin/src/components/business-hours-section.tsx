"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Plus, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { BookingMode, HoursWindow } from "@lobbystack/shared";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { useTelemetry } from "@/components/product-analytics";
import { intlLocale } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";

export type HoursSource = "none" | "generated" | "operator";
export type BusinessHoursState = { timezone: string; hoursSource: HoursSource; bookingMode: BookingMode; hours: HoursWindow[] };

/** Where the dashboard edits opening hours. */
export const HOURS_EDITOR_HREF = "/agent/basic-settings#opening-hours";
// Opens the editor when the link is followed on the page that already shows it, where nothing remounts.
const OPEN_HOURS_EDITOR_EVENT = "lobbystack:open-hours-editor";
const MAX_WINDOWS_PER_DAY = 4;
// Monday first; dayOfWeek counts from Sunday.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
// A Sunday, so 2024-01-07 plus dayOfWeek days falls on that weekday.
const SUNDAY = Date.UTC(2024, 0, 7, 12);

type Window = { open: string; close: string };

export function businessHoursQueryKey(businessId: string) {
  return ["business-hours", businessId] as const;
}

export function useBusinessHours(businessId: string) {
  const query = useQuery({
    queryKey: businessHoursQueryKey(businessId),
    queryFn: () => requestJson<BusinessHoursState>(`/api/hours?businessId=${encodeURIComponent(businessId)}`),
    enabled: Boolean(businessId),
  });
  // Ignore anything that isn't an hours response, so a failed or odd reply never shows a false warning.
  const data = query.data && Array.isArray(query.data.hours) ? query.data : undefined;
  return { ...query, data };
}

/** True when instant booking is on but nothing is bookable, because the business has no opening hours. */
export function needsHoursForBooking(state: BusinessHoursState | undefined): boolean {
  return Boolean(state && state.bookingMode === "instant" && state.hours.length === 0);
}

const clock = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function minutesOf(value: string, closing: boolean): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  // A time input can't show 24:00, so midnight as a closing time means the end of the day.
  return closing && minutes === 0 ? 1440 : minutes;
}

function toDays(hours: HoursWindow[]): Window[][] {
  const days: Window[][] = Array.from({ length: 7 }, () => []);
  for (const window of hours) days[window.dayOfWeek]?.push({ open: clock(window.openMinutes), close: clock(window.closeMinutes) });
  return days;
}

/** The windows to save, or the first day whose windows don't close after they open or overlap. */
export function windowsForSave(days: Window[][]): { ok: true; hours: HoursWindow[] } | { ok: false; dayOfWeek: number } {
  const hours: HoursWindow[] = [];
  for (const dayOfWeek of DAY_ORDER) {
    const windows = (days[dayOfWeek] ?? []).map((window) => ({ dayOfWeek, openMinutes: minutesOf(window.open, false), closeMinutes: minutesOf(window.close, true) }));
    const sorted = windows.slice().sort((left, right) => (left.openMinutes ?? 0) - (right.openMinutes ?? 0));
    const valid = sorted.every((window, index) => window.openMinutes !== undefined && window.closeMinutes !== undefined && window.closeMinutes > window.openMinutes && (index === 0 || window.openMinutes >= (sorted[index - 1]!.closeMinutes ?? 0)));
    if (!valid) return { ok: false, dayOfWeek };
    hours.push(...sorted as HoursWindow[]);
  }
  return { ok: true, hours };
}

/** "Mon–Thu 09:00–17:00, Fri 09:00–16:00": open days, consecutive days with the same hours grouped. */
export function summarizeHours(days: Window[][], shortDayNames: string[]): string {
  const key = (dayOfWeek: number) => (days[dayOfWeek] ?? []).map((window) => `${window.open}–${window.close}`).join(", ");
  const groups: Array<{ first: number; last: number; hours: string }> = [];
  for (const dayOfWeek of DAY_ORDER) {
    const hours = key(dayOfWeek);
    const previous = groups.at(-1);
    if (previous && previous.hours === hours && DAY_ORDER.indexOf(previous.last) === DAY_ORDER.indexOf(dayOfWeek) - 1) previous.last = dayOfWeek;
    else groups.push({ first: dayOfWeek, last: dayOfWeek, hours });
  }
  return groups.filter((group) => group.hours).map((group) => `${shortDayNames[group.first]}${group.first === group.last ? "" : `–${shortDayNames[group.last]}`} ${group.hours}`).join(", ");
}

export function BookingWithoutHoursAlert({ className }: { className?: string }) {
  const { t } = useTranslation("agent");
  return (
    <Alert className={className}>
      <AlertTitle className="flex items-center gap-2"><CalendarClock aria-hidden="true" className="size-4" />{t("hours.noHoursAlert.title")}</AlertTitle>
      <AlertDescription>{t("hours.noHoursAlert.description")}</AlertDescription>
      <div className="pt-2">
        <Button nativeButton={false} render={<Link href={HOURS_EDITOR_HREF} onClick={() => window.dispatchEvent(new Event(OPEN_HOURS_EDITOR_EVENT))} />} size="sm" variant="outline">{t("hours.noHoursAlert.action")}</Button>
      </div>
    </Alert>
  );
}

export function BusinessHoursSection({ businessId, canManage }: { businessId: string; canManage: boolean }) {
  const { i18n, t } = useTranslation("agent");
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const query = useBusinessHours(businessId);
  const state = query.data;
  const [days, setDays] = useState<Window[][]>(() => toDays([]));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Collapsed to a one-line summary unless a link points here, such as the no-hours warning.
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!canManage) return;
    const open = () => setEditing(true);
    if (window.location.hash === "#opening-hours") open();
    window.addEventListener(OPEN_HOURS_EDITOR_EVENT, open);
    return () => window.removeEventListener(OPEN_HOURS_EDITOR_EVENT, open);
  }, [canManage]);
  useEffect(() => { if (state) setDays(toDays(state.hours)); }, [state]);
  const [dayNames, shortDayNames] = useMemo(() => (["long", "short"] as const).map((weekday) => {
    const format = new Intl.DateTimeFormat(intlLocale(i18n.language), { weekday, timeZone: "UTC" });
    return Array.from({ length: 7 }, (_, day) => format.format(new Date(SUNDAY + day * 86_400_000)));
  }), [i18n.language]) as [string[], string[]];
  const loading = !businessId || query.isLoading;
  const disabled = !canManage || saving || !state;

  function update(dayOfWeek: number, windows: Window[]) {
    setDays((current) => current.map((day, index) => (index === dayOfWeek ? windows : day)));
    setStatus(null);
    setError(null);
  }

  async function save() {
    const result = windowsForSave(days);
    if (!result.ok) {
      setError(t("hours.invalid", { day: dayNames[result.dayOfWeek] }));
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const saved = await requestJson<BusinessHoursState>(`/api/hours?businessId=${encodeURIComponent(businessId)}`, { method: "PUT", body: JSON.stringify({ hours: result.hours }) });
      queryClient.setQueryData(businessHoursQueryKey(businessId), saved);
      telemetry.track("web.agent.settings_saved", { businessId, setting: "hours" });
      setStatus(t("actions.saved"));
      setEditing(false);
    } catch {
      toast.error(t("actions.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const note = state?.hoursSource === "generated" ? t("hours.generated") : state && !state.hours.length ? t("hours.empty") : null;
  const savedDays = useMemo(() => toDays(state?.hours ?? []), [state]);
  function close() {
    setEditing(false);
    setError(null);
    if (state) setDays(toDays(state.hours));
  }
  return (
    <section className="flex scroll-mt-6 flex-col gap-3" id="opening-hours">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-sm leading-snug font-medium">{t("hours.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("hours.description")}</p>
      </div>
      {note ? <p className="text-sm text-muted-foreground" data-testid="hours-note">{note}</p> : null}
      <Surface className="flex flex-col">
        <Item variant="default">
          <ItemContent>
            {loading ? <Skeleton className="h-5 w-64 rounded-md" /> : <ItemDescription data-testid="hours-summary">{summarizeHours(savedDays, shortDayNames) || t("hours.notSet")}</ItemDescription>}
          </ItemContent>
          <ItemActions>
            {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
            <Button disabled={!canManage || loading} onClick={() => { setEditing(true); setStatus(null); }} size="sm" type="button" variant="outline">{t("hours.edit")}</Button>
          </ItemActions>
        </Item>
      </Surface>
      <Dialog onOpenChange={(open) => { if (!open && !saving) close(); }} open={editing}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("hours.title")}</DialogTitle></DialogHeader>
          <div className="-mx-1 flex flex-col overflow-y-auto px-1">
            {DAY_ORDER.map((dayOfWeek) => {
              const windows = days[dayOfWeek] ?? [];
              const day = dayNames[dayOfWeek] ?? "";
              return (
                <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-b-0" key={dayOfWeek}>
                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-sm font-medium">{day}</span>
                    {windows.length ? (
                      <div className="flex flex-col gap-2">
                        {windows.map((window, index) => (
                          <div className="flex items-center gap-2" key={index}>
                            <Input aria-label={t("hours.opensAt", { day })} className="w-28" disabled={disabled} onChange={(event) => update(dayOfWeek, windows.map((item, position) => (position === index ? { ...item, open: event.target.value } : item)))} type="time" value={window.open} />
                            <span aria-hidden="true" className="text-muted-foreground">–</span>
                            <Input aria-label={t("hours.closesAt", { day })} className="w-28" disabled={disabled} onChange={(event) => update(dayOfWeek, windows.map((item, position) => (position === index ? { ...item, close: event.target.value } : item)))} type="time" value={window.close} />
                            {windows.length > 1 ? <Button aria-label={t("hours.removeWindow")} disabled={disabled} onClick={() => update(dayOfWeek, windows.filter((_, position) => position !== index))} size="icon-sm" type="button" variant="ghost"><X /></Button> : null}
                          </div>
                        ))}
                        {windows.length < MAX_WINDOWS_PER_DAY ? (
                          <Button className="w-fit" disabled={disabled} onClick={() => update(dayOfWeek, [...windows, { open: windows.at(-1)?.close ?? "13:00", close: "17:00" }])} size="sm" type="button" variant="ghost"><Plus />{t("hours.addWindow")}</Button>
                        ) : null}
                      </div>
                    ) : <span className="text-sm text-muted-foreground">{t("hours.closed")}</span>}
                  </div>
                  <Switch aria-label={t("hours.openOn", { day })} checked={windows.length > 0} disabled={disabled} onCheckedChange={(checked) => update(dayOfWeek, checked ? [{ open: "09:00", close: "17:00" }] : [])} />
                </div>
              );
            })}
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button disabled={saving} onClick={close} type="button" variant="outline">{t("hours.cancel")}</Button>
            <Button disabled={disabled || loading} onClick={() => void save()} type="button">{saving ? t("actions.saving") : t("hours.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
