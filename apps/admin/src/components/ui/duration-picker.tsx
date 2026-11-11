"use client";

import * as React from "react";
import { Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimeColumn } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";

type DurationPickerProps = {
  /** Total minutes. */
  value: number;
  onChange: (minutes: number) => void;
  /** BCP 47 locale for the "1 hr 30 min" label. */
  locale?: string;
  maxHours?: number;
  minuteStep?: number;
  /** Accessible names for the hour and minute columns. */
  columnLabels: { hours: string; minutes: string };
  /** Short visible titles above the hour and minute columns, such as "h" and "min". */
  columnTitles: { hours: string; minutes: string };
  disabled?: boolean | undefined;
  invalid?: boolean | undefined;
  className?: string | undefined;
  id?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-describedby"?: string | undefined;
};

function formatDuration(minutes: number, locale: string | undefined): string {
  const unit = (value: number, name: "hour" | "minute") => new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "short" }).format(value);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return unit(rest, "minute");
  return rest ? `${unit(hours, "hour")} ${unit(rest, "minute")}` : unit(hours, "hour");
}

function DurationPicker({ value, onChange, locale, maxHours = 12, minuteStep = 5, columnLabels, columnTitles, disabled, invalid, className, id, "aria-label": ariaLabel, "aria-describedby": ariaDescribedBy }: DurationPickerProps) {
  const [open, setOpen] = React.useState(false);
  const hours = Math.floor(value / 60);
  const minute = value % 60;
  // A saved value off the lists, such as 7 minutes or 14 hours, stays selectable.
  const hourOptions = React.useMemo(() => {
    const steps = Array.from({ length: maxHours + 1 }, (_, index) => index);
    return steps.includes(hours) ? steps : [...steps, hours];
  }, [hours, maxHours]);
  const minuteOptions = React.useMemo(() => {
    const steps = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, index) => index * minuteStep);
    return steps.includes(minute) ? steps : [...steps, minute].sort((left, right) => left - right);
  }, [minute, minuteStep]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button aria-describedby={ariaDescribedBy} aria-invalid={invalid || undefined} aria-label={ariaLabel} className={cn("justify-start rounded-xl font-normal tabular-nums", className)} disabled={disabled} id={id} type="button" variant="outline" />
        }
      >
        <Timer className="text-muted-foreground" data-icon="inline-start" />
        {formatDuration(value, locale)}
      </PopoverTrigger>
      <PopoverContent align="start" className="h-[min(18rem,var(--available-height))] w-auto flex-row gap-1 p-2">
        <TimeColumn label={columnLabels.hours} onSelect={(next) => onChange(next * 60 + minute)} open={open} options={hourOptions} render={String} selected={hours} title={columnTitles.hours} />
        <TimeColumn label={columnLabels.minutes} onSelect={(next) => onChange(hours * 60 + next)} open={open} options={minuteOptions} render={(option) => String(option).padStart(2, "0")} selected={minute} title={columnTitles.minutes} />
      </PopoverContent>
    </Popover>
  );
}

export { DurationPicker, formatDuration };
