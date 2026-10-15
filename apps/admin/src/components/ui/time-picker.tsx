"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type TimePickerProps = {
  /** 24-hour "HH:MM". */
  value: string;
  onChange: (value: string) => void;
  hourCycle?: "24h" | "ampm";
  /** BCP 47 locale for the AM/PM labels. */
  locale?: string;
  minuteStep?: number;
  /** Accessible names for the hour, minute and AM/PM columns. */
  columnLabels: { hours: string; minutes: string; period: string };
  /** Short visible titles above the hour and minute columns, such as "HH" and "MM". */
  columnTitles: { hours: string; minutes: string };
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

function parse(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  return match ? { hour: Number(match[1]) % 24, minute: Number(match[2]) % 60 } : { hour: 0, minute: 0 };
}

function formatTime(hour: number, minute: number, hourCycle: "24h" | "ampm", locale: string | undefined): string {
  if (hourCycle === "24h") return `${pad(hour)}:${pad(minute)}`;
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(Date.UTC(1970, 0, 1, hour, minute));
}

function dayPeriods(locale: string | undefined): [string, string] {
  const format = new Intl.DateTimeFormat(locale, { hour: "numeric", hour12: true, timeZone: "UTC" });
  const period = (hour: number) => format.formatToParts(Date.UTC(1970, 0, 1, hour)).find((part) => part.type === "dayPeriod")?.value ?? (hour < 12 ? "AM" : "PM");
  return [period(0), period(12)];
}

function TimePicker({ value, onChange, hourCycle = "24h", locale, minuteStep = 5, columnLabels, columnTitles, disabled, className, "aria-label": ariaLabel }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const { hour, minute } = parse(value);
  const set = (nextHour: number, nextMinute: number) => onChange(`${pad(nextHour)}:${pad(nextMinute)}`);
  // An off-step minute already saved stays selectable.
  const minutes = React.useMemo(() => {
    const steps = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, index) => index * minuteStep);
    return steps.includes(minute) ? steps : [...steps, minute].sort((left, right) => left - right);
  }, [minute, minuteStep]);
  const twelveHour = hourCycle === "ampm";
  const pm = hour >= 12;
  const periods = React.useMemo(() => dayPeriods(locale), [locale]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button aria-label={ariaLabel} className={cn("justify-start rounded-xl font-normal tabular-nums", className)} disabled={disabled} type="button" variant="outline" />
        }
      >
        <Clock className="text-muted-foreground" data-icon="inline-start" />
        {formatTime(hour, minute, hourCycle, locale)}
      </PopoverTrigger>
      {/* The popup takes a fixed height that fits the screen, so the columns scroll inside it on small viewports too. */}
      <PopoverContent align="start" className="h-[min(18rem,var(--available-height))] w-auto flex-row gap-1 p-2">
        <TimeColumn
          label={columnLabels.hours}
          onSelect={(next) => set(twelveHour ? (next % 12) + (pm ? 12 : 0) : next, minute)}
          open={open}
          options={twelveHour ? [12, ...Array.from({ length: 11 }, (_, index) => index + 1)] : Array.from({ length: 24 }, (_, index) => index)}
          render={(option) => (twelveHour ? String(option) : pad(option))}
          selected={twelveHour ? hour % 12 || 12 : hour}
          title={columnTitles.hours}
        />
        <TimeColumn label={columnLabels.minutes} onSelect={(next) => set(hour, next)} open={open} options={minutes} render={pad} selected={minute} title={columnTitles.minutes} />
        {twelveHour ? <TimeColumn label={columnLabels.period} onSelect={(next) => set((hour % 12) + next * 12, minute)} open={open} options={[0, 1]} render={(option) => periods[option]!} selected={pm ? 1 : 0} title="" /> : null}
      </PopoverContent>
    </Popover>
  );
}

function TimeColumn({ label, onSelect, open, options, render, selected, title }: { label: string; onSelect: (value: number) => void; open: boolean; options: number[]; render: (value: number) => string; selected: number; title: string }) {
  const listRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView?.({ block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div className="flex min-h-0 w-14 flex-col gap-1">
    {/* An empty title keeps the AM/PM column aligned with the titled ones. */}
    <span aria-hidden="true" className="h-6 shrink-0 border-b border-border text-center text-xs leading-6 font-medium text-muted-foreground">{title}</span>
    <div aria-label={label} className="flex min-h-0 flex-1 touch-pan-y flex-col gap-1 overflow-y-auto overscroll-contain [scrollbar-width:none]" ref={listRef} role="listbox">
      {options.map((option) => (
        <button
          aria-selected={option === selected}
          className={cn(
            "shrink-0 rounded-lg px-2 py-1.5 text-center text-sm tabular-nums outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50",
            option === selected && "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
          key={option}
          onClick={() => onSelect(option)}
          role="option"
          type="button"
        >
          {render(option)}
        </button>
      ))}
    </div>
    </div>
  );
}

export { TimeColumn, TimePicker };
