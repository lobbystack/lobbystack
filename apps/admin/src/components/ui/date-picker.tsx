"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { enUS, es, fr, srLatn } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const DAY_PICKER_LOCALES = { en: enUS, fr, es, sr: srLatn } as const;

// The day picker works in the browser's own days, so a "YYYY-MM-DD" key becomes that day's local midnight and back.
const keyToLocalDate = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
};
const localDateToKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

type DatePickerProps = {
  /** "YYYY-MM-DD", or empty for no date yet. */
  value: string;
  onChange: (value: string) => void;
  /** The earliest day that can be picked, "YYYY-MM-DD". */
  min?: string;
  /** The interface language, such as "fr": names the calendar's months and days. */
  language?: string;
  /** BCP 47 locale for the date shown on the button. */
  locale?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string | undefined;
};

/**
 * A date field: a button showing the date, which opens a calendar in a
 * popover. The shadcn date picker. It works in "YYYY-MM-DD" keys, as the
 * native date input did.
 */
function DatePicker({ value, onChange, min, language, locale, placeholder, disabled, invalid, className, id, "aria-label": ariaLabel, "aria-describedby": describedBy }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? keyToLocalDate(value) : undefined;
  const label = selected ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(selected) : null;
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            aria-label={ariaLabel}
            className={cn("w-full justify-start rounded-xl font-normal tabular-nums aria-invalid:border-destructive", !label && "text-muted-foreground", className)}
            disabled={disabled}
            id={id}
            type="button"
            variant="outline"
          />
        }
      >
        <CalendarIcon className="text-muted-foreground" data-icon="inline-start" />
        {label ?? placeholder ?? ""}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          // Opens on the picked day, or on the earliest day that can be picked, such as an end date opening on its start.
          {...(selected ?? min ? { defaultMonth: selected ?? keyToLocalDate(min!) } : {})}
          {...(min ? { disabled: { before: keyToLocalDate(min) } } : {})}
          className="bg-transparent"
          locale={DAY_PICKER_LOCALES[language as keyof typeof DAY_PICKER_LOCALES] ?? enUS}
          mode="single"
          onSelect={(day: Date | undefined) => {
            if (!day) return;
            onChange(localDateToKey(day));
            setOpen(false);
          }}
          required
          selected={selected}
        />
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker };
