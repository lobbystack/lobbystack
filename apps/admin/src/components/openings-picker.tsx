"use client";

import { useTranslation } from "react-i18next";
import { enUS, es, fr, srLatn } from "react-day-picker/locale";

import { OpeningTimesSkeleton } from "@/components/loading-skeletons";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { formatDateTime } from "@/lib/locale";
import { cn } from "@/lib/utils";

const DAY_PICKER_LOCALES = { en: enUS, fr, es, sr: srLatn } as const;

// The day picker works in the browser's own days, so a key becomes that day's local midnight and back.
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
 * under the calendar at every width, for a narrow panel.
 */
export function OpeningsPicker({ date, today, timeZone, times, loading, failed, selected, onDateChange, onSelect, waiting, stacked = false }: {
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
}) {
  const { t, i18n } = useTranslation("common");
  const time = (value: string) => formatDateTime(value, i18n.language, { hour: "numeric", minute: "2-digit", timeZone });
  return (
    <div className={cn("grid gap-4", !stacked && "sm:grid-cols-[auto_minmax(0,1fr)]")}>
      <section aria-label={t("appointments.openings.date")} className="flex justify-center overflow-hidden rounded-xl border">
        <Calendar
          className="bg-transparent"
          defaultMonth={keyToLocalDate(date)}
          disabled={{ before: keyToLocalDate(today) }}
          locale={DAY_PICKER_LOCALES[i18n.language as keyof typeof DAY_PICKER_LOCALES] ?? enUS}
          mode="single"
          onSelect={(day: Date | undefined) => { if (day) onDateChange(localDateToKey(day)); }}
          required
          selected={keyToLocalDate(date)}
        />
      </section>
      <section aria-busy={loading} aria-label={t("appointments.openings.times")} className="flex min-h-40 min-w-0 flex-col gap-2">
        <h3 className="type-item-title">{t("appointments.openings.times")}</h3>
        {waiting ? <p className="type-body-muted">{waiting}</p>
          : loading ? <OpeningTimesSkeleton />
          : failed ? <p className="type-body-muted text-destructive">{t("appointments.openings.timesFailed")}</p>
          : times.length ? <div className={cn("grid max-h-72 grid-cols-3 gap-2 overflow-y-auto", !stacked && "sm:grid-cols-2")}>
            {times.map((value) => <Button aria-pressed={selected === value} className={cn("tabular-nums", selected === value && "ring-2 ring-ring")} key={value} onClick={() => onSelect(value)} type="button" variant={selected === value ? "default" : "outline"}>{time(value)}</Button>)}
          </div>
          : <p className="type-body-muted">{t("appointments.openings.noTimes")}</p>}
      </section>
    </div>
  );
}
