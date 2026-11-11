"use client";

import { ArrowRight, AudioLines, CalendarCheck, Check, PhoneForwarded } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { intlLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/** Each scene is drawn for one idea with sample data, so it stays sharp at any size and follows the theme. */

const SAMPLE_SITE = "harbordental.com";
const SAMPLE_BUSINESS = "Harbor Dental";

// Stays English to French in every interface language, since the switch is what the scene shows.
const ENGLISH_LINE = "Hi, how can I help?";
const FRENCH_LINE = "Bonjour, comment puis-je vous aider ?";

// February 2027 starts on a Monday and fills exactly four weeks.
const CALENDAR_DAYS = 28;
const CALENDAR_START = Date.UTC(2027, 1, 1);
const BOOKED_DAY = 16;
const BOOKED_AT = Date.UTC(2027, 1, BOOKED_DAY, 10, 30);
const DAY_MS = 86_400_000;

// The voice on each side of the switch: two phrases that swell and fade.
const WAVE_BEFORE = [8, 14, 24, 38, 28, 16, 30, 48, 32, 18, 12, 22, 38, 26, 12];
const WAVE_AFTER = [12, 20, 34, 50, 36, 22, 40, 56, 38, 20, 30, 44, 28, 16, 8];

const enter = "motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-both motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)]";
const rise = `${enter} motion-safe:slide-in-from-bottom-2`;
const settle = `${enter} motion-safe:zoom-in-95`;
const wipe = "motion-safe:animate-[sceneWipe_800ms_cubic-bezier(0.65,0,0.35,1)_250ms_both]";

const sheet = "border border-border bg-popover text-popover-foreground";
const lift = "shadow-[0_12px_32px_-12px_oklch(0_0_0/0.18),0_2px_6px_-2px_oklch(0_0_0/0.06)]";

function useSampleDates() {
  const { i18n } = useTranslation("onboarding");
  const locale = intlLocale(i18n.resolvedLanguage ?? i18n.language);
  const inUtc = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
  return { inUtc, month: inUtc({ month: "long" }).format(CALENDAR_START), slot: inUtc({ weekday: "short", hour: "numeric", minute: "2-digit" }).format(BOOKED_AT) };
}

function Stage({ className, children }: { className?: string; children: ReactNode }) {
  return <div aria-hidden="true" className={cn("relative h-72 w-full overflow-hidden rounded-lg bg-muted dark:bg-muted/30", className)}>{children}</div>;
}

function AgentMark({ className }: { className?: string }) {
  return <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground", className)}><AudioLines className="size-[55%]" /></span>;
}

function Bubble({ from, className, children }: { from: "caller" | "agent"; className?: string; children: ReactNode }) {
  return <span className={cn("block rounded-2xl px-4 py-3 type-body-lg text-pretty", from === "agent" ? "rounded-br-md bg-primary text-primary-foreground" : `rounded-bl-md ${sheet}`, className)}>{children}</span>;
}

function Answers() {
  const { t } = useTranslation("onboarding");
  return (
    <Stage className="flex flex-col justify-center gap-3 px-4 sm:px-10">
      <Bubble className={cn("max-w-[88%] self-start", rise)} from="caller">{t("reading.scenes.answers.question")}</Bubble>
      <Bubble className={cn("max-w-[88%] self-end motion-safe:delay-[350ms]", rise)} from="agent">{t("reading.scenes.answers.answer")}</Bubble>
      <div className={cn("flex items-center gap-3 self-end rounded-xl py-2 pr-4 pl-2 motion-safe:delay-[700ms]", sheet, rise)}>
        <span className="flex h-12 w-10 flex-col gap-1 rounded-md bg-muted p-1.5 dark:bg-muted/60">
          <span className="h-1 w-3/4 rounded-full bg-muted-foreground/30" />
          <span className="h-1 w-full rounded-full bg-chart-2" />
          <span className="h-1 w-full rounded-full bg-chart-2" />
          <span className="h-1 w-2/3 rounded-full bg-muted-foreground/30" />
        </span>
        <span className="flex flex-col type-body">
          <span className="font-medium">{SAMPLE_SITE}</span>
          <span className="text-muted-foreground">/patients</span>
        </span>
      </div>
    </Stage>
  );
}

function Booking() {
  const { t } = useTranslation("onboarding");
  const { inUtc, month, slot } = useSampleDates();
  const weekdays = Array.from({ length: 7 }, (_, day) => inUtc({ weekday: "narrow" }).format(CALENDAR_START + day * DAY_MS));
  return (
    <Stage className="flex items-center justify-center">
      <div className={cn("-translate-x-5 -translate-y-7 rounded-xl p-3 sm:-translate-x-16 sm:translate-y-0 sm:p-4", sheet, lift, settle)}>
        <span className="block pb-1 pl-2.5 type-card-title first-letter:uppercase">{month}</span>
        <div className="grid grid-cols-7 text-center type-body tabular-nums">
          {weekdays.map((weekday, day) => <span className="flex size-8 items-center justify-center text-muted-foreground" key={day}>{weekday}</span>)}
          {Array.from({ length: CALENDAR_DAYS }, (_, index) => index + 1).map((day) => (
            <span className={cn("flex size-8 items-center justify-center rounded-full", day === BOOKED_DAY && "bg-primary font-medium text-primary-foreground")} key={day}>{day}</span>
          ))}
        </div>
      </div>
      <div className={cn("absolute right-2.5 bottom-5 flex items-center gap-3 rounded-xl py-3 pr-4 pl-3 motion-safe:delay-[450ms] sm:right-6 sm:bottom-10", sheet, lift, rise)}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-chart-2/15 text-chart-2 dark:text-chart-1"><Check className="size-5" strokeWidth={2.5} /></span>
        <span className="flex flex-col whitespace-nowrap">
          <span className="type-card-title">{t("reading.scenes.booking.service")}</span>
          <span className="type-body-muted">{slot}</span>
        </span>
      </div>
    </Stage>
  );
}

function Transfer() {
  const { t } = useTranslation("onboarding");
  return (
    <Stage className="flex items-center justify-center px-3">
      <div className="grid w-full max-w-md grid-cols-[6rem_1fr_6rem] items-start sm:grid-cols-[8rem_1fr_8rem]">
        <div className={cn("flex flex-col items-center gap-3 text-center", rise)}>
          <AgentMark className="size-20" />
          <span className="type-card-title">{t("reading.scenes.transfer.agent")}</span>
        </div>
        <div className="relative mt-10 h-0.5 -translate-y-px rounded-full bg-border">
          <span className={cn("absolute inset-0 rounded-full bg-gradient-to-r from-border to-chart-2", wipe)} />
          <span className={cn("absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full", sheet, lift)}>
            <PhoneForwarded className="size-5 text-chart-2 dark:text-chart-1" />
          </span>
        </div>
        <div className={cn("flex flex-col items-center gap-3 text-center motion-safe:delay-[700ms]", rise)}>
          <span className="flex size-20 items-center justify-center rounded-full bg-popover text-2xl font-medium text-popover-foreground ring-2 ring-chart-2">MC</span>
          <span className="flex flex-col">
            <span className="type-card-title">Maya Chen</span>
            <span className="type-body-muted">{t("reading.scenes.transfer.role")}</span>
          </span>
        </div>
      </div>
    </Stage>
  );
}

function Wave({ heights, className }: { heights: readonly number[]; className: string }) {
  return <span className="flex h-16 min-w-0 flex-1 items-center justify-between">{heights.map((height, index) => <span className={cn("w-[3px] rounded-full", className)} key={index} style={{ height }} />)}</span>;
}

function Languages() {
  return (
    <Stage className="flex flex-col justify-center gap-3 px-4 sm:px-10">
      <Bubble className={cn("self-start rounded-br-2xl rounded-bl-md bg-popover text-popover-foreground ring-1 ring-border", rise)} from="agent">{ENGLISH_LINE}</Bubble>
      <div className="flex items-center gap-2">
        <Wave className="bg-muted-foreground/40" heights={WAVE_BEFORE} />
        <span className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 type-title", sheet, lift)}>
          EN<ArrowRight className="size-3.5 text-chart-2 dark:text-chart-1" />FR
        </span>
        <Wave className="bg-chart-2" heights={WAVE_AFTER} />
      </div>
      <Bubble className={cn("max-w-[88%] self-end motion-safe:delay-[600ms]", rise)} from="agent">{FRENCH_LINE}</Bubble>
    </Stage>
  );
}

function Summaries() {
  const { t } = useTranslation("onboarding");
  const { slot } = useSampleDates();
  return (
    <Stage className="flex items-center justify-center px-4">
      <div className="relative -mt-3 w-full max-w-[23rem]">
        <span className={cn("absolute inset-x-8 -bottom-6 h-16 rounded-xl opacity-50", sheet)} />
        <span className={cn("absolute inset-x-4 -bottom-3 h-16 rounded-xl opacity-80", sheet)} />
        <div className={cn("relative flex flex-col gap-3 rounded-xl p-4", sheet, lift, settle)}>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted type-title">SR</span>
            <span className="min-w-0 flex-1 type-card-title">Sofia Reyes</span>
            <span className="type-body-muted tabular-nums">2:14</span>
          </div>
          <span className={cn("block type-body-lg text-pretty", wipe)}>{t("reading.scenes.summaries.summary")}</span>
          <span className={cn("flex items-center gap-1.5 self-start rounded-full bg-chart-2/15 px-2.5 py-1 type-title text-chart-3 motion-safe:delay-[900ms] dark:text-chart-1", rise)}>
            <CalendarCheck className="size-4" />{slot}
          </span>
        </div>
      </div>
    </Stage>
  );
}

function Widget() {
  const { t } = useTranslation("onboarding");
  return (
    <Stage>
      <div className={cn("absolute inset-x-4 top-5 -bottom-px flex flex-col gap-6 rounded-t-xl border-b-0 p-3 sm:inset-x-8", sheet)}>
        <span className="w-fit rounded-full bg-muted px-3 py-1 type-body-muted dark:bg-muted/60">{SAMPLE_SITE}</span>
        <span className="flex flex-col gap-2.5 px-2">
          <span className="h-4 w-3/5 rounded-full bg-foreground/15 sm:w-2/5" />
          <span className="h-4 w-2/5 rounded-full bg-foreground/15 sm:w-1/4" />
          <span className="mt-1 h-2.5 w-1/2 rounded-full bg-muted sm:w-1/3 dark:bg-muted/60" />
          <span className="h-2.5 w-2/5 rounded-full bg-muted sm:w-1/4 dark:bg-muted/60" />
          <span className="mt-2 h-7 w-20 rounded-full bg-foreground/15 max-sm:hidden" />
        </span>
      </div>
      <div className={cn("absolute right-2.5 bottom-3 flex w-56 flex-col gap-2.5 rounded-2xl p-3 sm:right-12", sheet, lift, rise)}>
        <span className="flex items-center gap-2 type-title"><AgentMark className="size-6" />{SAMPLE_BUSINESS}</span>
        <Bubble className="self-end rounded-br-md rounded-bl-2xl border-0 bg-muted px-3 py-2 type-body dark:bg-muted/60" from="caller">{t("reading.scenes.widget.question")}</Bubble>
        <Bubble className="self-start rounded-br-2xl rounded-bl-md px-3 py-2 type-body motion-safe:delay-[500ms]" from="agent">{t("reading.scenes.widget.answer")}</Bubble>
      </div>
    </Stage>
  );
}

export const IMPORT_WAIT_SCENES = {
  answers: Answers,
  booking: Booking,
  transfer: Transfer,
  languages: Languages,
  summaries: Summaries,
  widget: Widget,
} as const;
