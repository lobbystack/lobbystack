"use client";

import { useId } from "react";
import { useTranslation } from "react-i18next";
import { enUS, es, fr, srLatn } from "react-day-picker/locale";

import { OpeningTimesSkeleton } from "@/components/loading-skeletons";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { FieldLabel } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { formatDateTime, intlLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const DAY_PICKER_LOCALES = { en: enUS, fr, es, sr: srLatn } as const;

// The day picker works in the browser's own days, so a key becomes that day's local midnight and back.
/**
 * Choosing a time adds a line under the list and moves focus, and on phones the form scrolled down with it.
 * Every scrolled ancestor is put back where it was, now and after the next two frames.
 */
function holdScroll(from: HTMLElement): void {
  const held: Array<[HTMLElement, number]> = [];
  for (let node = from.parentElement; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight && node.scrollTop > 0) held.push([node, node.scrollTop]);
  }
  if (!held.length) return;
  const restore = () => { for (const [node, top] of held) node.scrollTop = top; };
  requestAnimationFrame(() => { restore(); requestAnimationFrame(restore); });
}

const keyToLocalDate = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
};
const localDateToKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * A day on a calendar and the open times that day, as the business's clock
 * shows them. Days are "YYYY-MM-DD" keys in `timeZone`; days before `today`
 * can't be picked. The caller loads the times for `date` and keeps the pick.
 * `waiting` takes the times' place with a note while something the times
 * depend on, such as the service, is still missing. `stacked` puts the times
 * under the calendar at every width, for a narrow panel. `compact` swaps the
 * month for a date field, for a popover.
 */
export function OpeningsPicker({ date, today, timeZone, times, loading, failed, selected, onDateChange, onSelect, waiting, stacked = false, compact = false }: {
  date: string;
  today: string;
  timeZone: string;
  times: string[];
  loading: boolean;
  failed: boolean;
  selected: string | null;
  onDateChange: (date: string) => void;
  onSelect: (time: string) => void;
  waiting?: string;
  stacked?: boolean;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation("common");
  const dateId = useId();
  const time = (value: string) => formatDateTime(value, i18n.language, { hour: "numeric", minute: "2-digit", timeZone });
  const columns = stacked || compact;
  return (
    <div className={cn("grid gap-4", !columns && "sm:grid-cols-[auto_minmax(0,1fr)]")}>
      {compact ? <div className="flex flex-col gap-2">
        <FieldLabel htmlFor={dateId}>{t("appointments.openings.date")}</FieldLabel>
        <DatePicker className="w-44" id={dateId} language={i18n.language} locale={intlLocale(i18n.language)} min={today} onChange={(day) => { if (day >= today) onDateChange(day); }} value={date} />
      </div> : <section aria-label={t("appointments.openings.date")} className="flex justify-center overflow-hidden rounded-xl border">
        <Calendar
          className="w-full! bg-transparent sm:w-fit!"
          defaultMonth={keyToLocalDate(date)}
          disabled={{ before: keyToLocalDate(today) }}
          locale={DAY_PICKER_LOCALES[i18n.language as keyof typeof DAY_PICKER_LOCALES] ?? enUS}
          mode="single"
          onSelect={(day: Date | undefined) => { if (day) onDateChange(localDateToKey(day)); }}
          required
          selected={keyToLocalDate(date)}
        />
      </section>}
      <section aria-busy={loading} aria-label={t("appointments.openings.times")} className={cn("flex min-w-0 flex-col gap-2", compact ? "sm:min-h-20" : "sm:min-h-40", !waiting && (loading || times.length > 0) && (compact ? "min-h-20" : "min-h-40"))}>
        <h3 className="type-item-title">{t("appointments.openings.times")}</h3>
        {waiting ? <p className="type-body-muted">{waiting}</p>
          : loading ? <OpeningTimesSkeleton />
          : failed ? <p className="type-body-muted text-destructive">{t("appointments.openings.timesFailed")}</p>
          : times.length ? <div className={cn("grid grid-cols-3 gap-2 overflow-y-auto", compact ? "max-h-48 p-0.5" : "-m-1 max-h-72 p-1", !columns && "sm:grid-cols-2")}>
            {times.map((value) => <Button aria-pressed={selected === value} className={cn("tabular-nums", selected === value && "ring-2 ring-ring")} key={value} onClick={(event) => { holdScroll(event.currentTarget); onSelect(value); }} type="button" variant={selected === value ? "default" : "outline"}>{time(value)}</Button>)}
          </div>
          : <p className="type-body-muted">{t("appointments.openings.noTimes")}</p>}
      </section>
    </div>
  );
}
