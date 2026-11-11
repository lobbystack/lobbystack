"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Bot, CircleHelp, FileText, Globe, MessageCircle, MessageSquare, MessagesSquare, MoreHorizontal, Phone, Plus, type LucideIcon } from "lucide-react";
import { intlLocale } from "@lobbystack/shared";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

// Each intro card opens on a miniature of its page: a few made-up rows drawn
// with the dashboard's own components and tokens, scaled down and cropped by
// the card's edge. They follow the theme and the language like the page does,
// and nothing in them can be focused or clicked. The names, numbers and
// addresses are made up; 555-01xx numbers and example.com are reserved for
// fiction.

type Tone = "blue" | "green" | "amber" | "rose";

/** The gradient backdrop and the scaled page on it. */
function IntroScene({ tone, compact = false, children }: { tone: Tone; compact?: boolean; children: ReactNode }) {
  return (
    <div aria-hidden="true" inert className="page-intro-scene relative h-52 shrink-0 overflow-hidden border-b sm:h-56" data-tone={tone}>
      {/* A compact scene draws a taller page smaller, so what matters on it stays above the card's edge. */}
      <div className={cn("pointer-events-none absolute top-7 left-1/2 w-[600px] origin-top -translate-x-1/2 select-none sm:top-8", compact ? "scale-[0.5] sm:scale-[0.62]" : "scale-[0.56] sm:scale-[0.72]")}>{children}</div>
    </div>
  );
}

/** A page's frame: its title, its main button and what's under them. */
function MiniPage({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border bg-background p-6 text-foreground shadow-xl">
      <div className="flex items-center justify-between gap-4">
        <span className="type-page-title truncate">{title}</span>
        {action ? <Button size="sm" tabIndex={-1}><Plus data-icon="inline-start" />{action}</Button> : null}
      </div>
      {children}
    </div>
  );
}

function Initials({ name }: { name: string }) {
  const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2);
  return <Avatar><AvatarFallback>{initials}</AvatarFallback></Avatar>;
}

function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground", className)}><Icon className="size-4" /></span>;
}

function useFormatters() {
  const { i18n } = useTranslation("intros");
  const locale = intlLocale(i18n.resolvedLanguage ?? i18n.language ?? "en");
  // One fixed week, so the picture never changes with the day it's opened.
  const day = (offset: number, hour = 9, minute = 0) => new Date(2026, 0, 5 + offset, hour, minute);
  return {
    time: (date: Date) => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date),
    weekday: (date: Date) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date),
    dayNumber: (date: Date) => new Intl.DateTimeFormat(locale, { day: "numeric" }).format(date),
    price: (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value),
    day,
  };
}

export function InboxIllustration() {
  const { t } = useTranslation("intros");
  const { time, day } = useFormatters();
  const rows: Array<{ name: string; icon: LucideIcon; text: string; when: string; request?: { label: string; variant: "info" | "warning" | "danger" } }> = [
    { name: "Maya Chen", icon: Phone, text: t("sample.inbox.first"), when: time(day(0, 9, 41)), request: { label: t("sample.inbox.reschedule"), variant: "info" } },
    { name: "Omar Haddad", icon: MessageSquare, text: t("sample.inbox.second"), when: time(day(0, 9, 12)), request: { label: t("sample.inbox.callback"), variant: "warning" } },
    { name: "Lena Park", icon: MessagesSquare, text: t("sample.inbox.third"), when: time(day(0, 8, 55)) },
    { name: "Jonas Weber", icon: Phone, text: t("sample.inbox.fourth"), when: time(day(0, 8, 20)), request: { label: t("sample.inbox.cancellation"), variant: "danger" } },
  ];
  return (
    <IntroScene tone="blue">
      <MiniPage title={t("sample.inbox.title")}>
        <div className="flex gap-2">
          {/* The Inbox's own channel names, so the filters read as they do on the page. */}
          {[t("sample.inbox.all"), t("common:channels.phoneCall"), t("common:channels.webChat"), t("common:channels.sms")].map((filter, index) => (
            <Badge className="h-7 px-3" key={filter} variant={index === 0 ? "default" : "outline"}>{filter}</Badge>
          ))}
        </div>
        <div className="flex flex-col divide-y rounded-xl border">
          {rows.map((row) => (
            <div className="flex items-center gap-3 px-4 py-3" key={row.name}>
              <Initials name={row.name} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 type-item-title"><row.icon className="size-3.5 text-muted-foreground" />{row.name}</span>
                <span className="truncate type-body-muted">{row.text}</span>
              </div>
              {row.request ? <Status variant={row.request.variant}>{row.request.label}</Status> : null}
              <span className="w-16 text-right type-meta tabular-nums">{row.when}</span>
            </div>
          ))}
        </div>
      </MiniPage>
    </IntroScene>
  );
}

export function AppointmentsIllustration() {
  const { t } = useTranslation("intros");
  const { day, weekday, dayNumber, time } = useFormatters();
  const days = [0, 1, 2, 3, 4].map((offset) => day(offset));
  // Each service keeps its color, as the calendar shows it.
  const services = {
    consultation: "bg-status-info text-status-info-foreground",
    standardVisit: "bg-status-success text-status-success-foreground",
    followUp: "bg-status-warning text-status-warning-foreground",
  } as const;
  const bookings: Array<{ column: number; start: number; length: number; service: keyof typeof services; name: string }> = [
    { column: 0, start: 0, length: 1, service: "consultation", name: "Maya Chen" },
    { column: 0, start: 2, length: 1.5, service: "standardVisit", name: "Omar Haddad" },
    { column: 1, start: 1, length: 1, service: "followUp", name: "Lena Park" },
    { column: 2, start: 0.5, length: 1.5, service: "standardVisit", name: "Jonas Weber" },
    { column: 3, start: 2.5, length: 1, service: "consultation", name: "Priya Nair" },
    { column: 4, start: 1, length: 1, service: "followUp", name: "Sam Rivera" },
  ];
  const hourHeight = 52;
  return (
    <IntroScene tone="green">
      <MiniPage title={t("sample.appointments.title")} action={t("sample.appointments.newAppointment")}>
        <div className="grid grid-cols-[3.5rem_repeat(5,minmax(0,1fr))] overflow-hidden rounded-xl border">
          <span className="border-b bg-table-header" />
          {days.map((date, index) => (
            <span className={cn("flex flex-col items-center gap-0.5 border-b border-l bg-table-header py-2", index === 1 && "text-foreground")} key={date.toISOString()}>
              <span className="type-meta capitalize">{weekday(date)}</span>
              <span className={cn("flex size-7 items-center justify-center rounded-full type-body tabular-nums", index === 1 && "bg-primary text-primary-foreground")}>{dayNumber(date)}</span>
            </span>
          ))}
          <div className="flex flex-col">
            {[9, 10, 11, 12].map((hour) => <span className="pt-1 pr-2 text-right type-caption text-muted-foreground tabular-nums" key={hour} style={{ height: hourHeight }}>{time(day(0, hour))}</span>)}
          </div>
          {days.map((date, column) => (
            <div className="relative border-l" key={date.toISOString()} style={{ height: hourHeight * 4, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${hourHeight - 1}px, var(--border) ${hourHeight - 1}px, var(--border) ${hourHeight}px)` }}>
              {column === 4 ? (
                <span className="absolute inset-x-1 rounded-lg border border-dashed bg-muted px-2 py-1 type-caption text-muted-foreground" style={{ top: hourHeight * 2.5 + 2, height: hourHeight * 1.5 - 4 }}>{t("sample.appointments.timeOff")}</span>
              ) : null}
              {bookings.filter((booking) => booking.column === column).map((booking) => (
                <span className={cn("absolute inset-x-1 flex flex-col overflow-hidden rounded-lg px-2 py-1", services[booking.service])} key={booking.name} style={{ top: hourHeight * booking.start + 2, height: hourHeight * booking.length - 4 }}>
                  <span className="truncate type-label">{t(`sample.services.${booking.service}`)}</span>
                  <span className="truncate type-caption opacity-80">{booking.name}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </MiniPage>
    </IntroScene>
  );
}

export function AgentsIllustration() {
  const { t } = useTranslation("intros");
  const rows = [
    { name: t("sample.agents.defaultAgent"), detail: t("sample.agents.everything"), number: "+1 555 0142", isDefault: true, icons: [Phone, MessagesSquare, MessageCircle] },
    { name: t("sample.agents.afterHours"), detail: t("sample.agents.evenings"), number: "+1 555 0178", isDefault: false, icons: [Phone] },
    { name: t("sample.agents.bookings"), detail: t("sample.agents.website"), number: "example.com", isDefault: false, icons: [MessagesSquare] },
  ];
  return (
    <IntroScene tone="amber">
      <MiniPage title={t("sample.agents.title")} action={t("sample.agents.add")}>
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div className="flex items-center gap-4 rounded-xl border p-4" key={row.name}>
              <IconTile icon={Bot} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 type-item-title">{row.name}{row.isDefault ? <Badge variant="secondary">{t("sample.agents.default")}</Badge> : null}</span>
                <span className="type-body-muted">{row.detail}</span>
              </div>
              <span className="flex items-center gap-1.5 text-muted-foreground">{row.icons.map((Icon, index) => <Icon className="size-4" key={index} />)}</span>
              <span className="w-28 text-right type-technical-value text-muted-foreground">{row.number}</span>
            </div>
          ))}
        </div>
      </MiniPage>
    </IntroScene>
  );
}

export function RulesIllustration() {
  const { t } = useTranslation("intros");
  const rules: Array<{ when: string; then: string; channel: string; icon: LucideIcon | null }> = [
    { when: t("sample.rules.emergency"), then: t("sample.rules.emergencyAction"), channel: t("sample.rules.calls"), icon: Phone },
    { when: t("sample.rules.prices"), then: t("sample.rules.pricesAction"), channel: t("sample.rules.allChannels"), icon: null },
    { when: t("sample.rules.afterHours"), then: t("sample.rules.afterHoursAction"), channel: t("sample.rules.chats"), icon: MessagesSquare },
  ];
  return (
    <IntroScene tone="rose">
      <MiniPage title={t("sample.rules.title")} action={t("sample.rules.add")}>
        <div className="flex flex-col gap-3">
          {rules.map((rule) => (
            <div className="flex items-center gap-4 rounded-xl border p-4" key={rule.when}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="type-item-title">{rule.when}</span>
                <span className="flex items-center gap-2 type-body-muted"><ArrowRight className="size-3.5" />{rule.then}</span>
              </div>
              <Badge variant="outline">{rule.icon ? <rule.icon data-icon="inline-start" /> : null}{rule.channel}</Badge>
              <MoreHorizontal className="size-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      </MiniPage>
    </IntroScene>
  );
}

export function ChannelsIllustration() {
  const { t } = useTranslation("intros");
  const rows: Array<{ icon: LucideIcon; label: string; detail: string; connected: boolean }> = [
    { icon: Phone, label: t("sample.channels.phone"), detail: "+1 555 0142", connected: true },
    { icon: MessagesSquare, label: t("sample.channels.widget"), detail: "example.com", connected: true },
    { icon: MessageCircle, label: t("sample.channels.instagram"), detail: "@example", connected: false },
  ];
  return (
    <IntroScene tone="blue">
      <MiniPage title={t("sample.channels.title")}>
        <div className="flex flex-col divide-y rounded-xl border">
          {rows.map((row) => (
            <div className="flex items-center gap-4 p-4" key={row.label}>
              <IconTile icon={row.icon} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="type-item-title">{row.label}</span>
                <span className="type-body-muted">{row.detail}</span>
              </div>
              <Status variant={row.connected ? "success" : "neutral"}>{t(row.connected ? "sample.channels.connected" : "sample.channels.notConnected")}</Status>
              <Button size="sm" tabIndex={-1} variant="outline">{t(row.connected ? "sample.channels.move" : "sample.channels.connect")}</Button>
            </div>
          ))}
        </div>
      </MiniPage>
    </IntroScene>
  );
}

export function KnowledgeIllustration() {
  const { t } = useTranslation("intros");
  const sources: Array<{ icon: LucideIcon; label: string; detail: string }> = [
    { icon: Globe, label: t("sample.knowledge.website"), detail: t("sample.knowledge.pages", { count: 24 }) },
    { icon: FileText, label: t("sample.knowledge.files"), detail: t("sample.knowledge.priceList") },
    { icon: CircleHelp, label: t("sample.knowledge.faqs"), detail: t("sample.knowledge.questions", { count: 12 }) },
  ];
  return (
    <IntroScene compact tone="green">
      <MiniPage title={t("sample.knowledge.title")} action={t("sample.knowledge.add")}>
        <div className="grid grid-cols-3 gap-3">
          {sources.map((source) => (
            <div className="flex flex-col gap-3 rounded-xl border p-4" key={source.label}>
              <IconTile icon={source.icon} />
              <div className="flex flex-col">
                <span className="type-item-title">{source.label}</span>
                <span className="truncate type-body-muted">{source.detail}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="type-title">{t("sample.knowledge.unanswered")}</span>
          <div className="flex flex-col divide-y rounded-xl border">
            {[t("sample.knowledge.giftCards"), t("sample.knowledge.parking")].map((question) => (
              <div className="flex items-center gap-3 px-4 py-3" key={question}>
                <CircleHelp className="size-4 text-status-warning-foreground" />
                <span className="flex-1 type-body">{question}</span>
                <Button size="icon-sm" tabIndex={-1} variant="outline"><Plus /></Button>
              </div>
            ))}
          </div>
        </div>
      </MiniPage>
    </IntroScene>
  );
}

/** A smooth line through evenly spaced values, in a 0–100 box with the largest value at the top. */
function linePath(values: number[], width: number, height: number): string {
  const top = Math.max(...values);
  const points = values.map((value, index) => [(index / (values.length - 1)) * width, height - (value / top) * height * 0.85] as const);
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export function AnalyticsIllustration() {
  const { t } = useTranslation("intros");
  // Thirty made-up days: calls climb through the month, messages follow lower down.
  const calls = [12, 14, 11, 16, 18, 15, 19, 21, 18, 22, 24, 20, 23, 26, 25, 28, 27, 24, 29, 31, 28, 32, 34, 30, 33, 36, 35, 38, 37, 40];
  const messages = calls.map((value, index) => Math.round(value * 0.55 + (index % 4) * 1.5));
  const tiles = [
    { title: t("sample.analytics.calls"), value: "742" },
    { title: t("sample.analytics.today"), value: "6" },
    { title: t("sample.analytics.averageDuration"), value: "2:48" },
  ];
  return (
    <IntroScene compact tone="rose">
      <MiniPage title={t("sample.analytics.title")}>
        <Surface className="grid grid-cols-3">
          {tiles.map((tile, index) => (
            <section className={cn("flex flex-col gap-2 p-4", index > 0 && "border-l")} key={tile.title}>
              <span className="type-card-title">{tile.title}</span>
              <span className="type-metric-sm">{tile.value}</span>
            </section>
          ))}
        </Surface>
        <Surface className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="type-card-title">{t("sample.analytics.chart")}</span>
            <span className="flex items-center gap-3 type-meta">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-2" />{t("sample.analytics.calls")}</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-4" />{t("sample.analytics.messages")}</span>
              <Badge variant="outline">{t("sample.analytics.range")}</Badge>
            </span>
          </div>
          <svg className="h-32 w-full" preserveAspectRatio="none" viewBox="0 0 300 100">
            {[25, 50, 75].map((y) => <line key={y} stroke="var(--border)" strokeDasharray="3 3" x1="0" x2="300" y1={y} y2={y} />)}
            <path d={`${linePath(calls, 300, 100)} L300,100 L0,100 Z`} fill="var(--chart-2)" opacity="0.12" />
            <path d={linePath(calls, 300, 100)} fill="none" stroke="var(--chart-2)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <path d={linePath(messages, 300, 100)} fill="none" stroke="var(--chart-4)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </Surface>
      </MiniPage>
    </IntroScene>
  );
}

/** A table in the dashboard's style: the tinted header row, then the rows. */
function MiniTable({ headings, rows, template }: { headings: string[]; rows: ReactNode[][]; template: string }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid items-center gap-4 border-b bg-table-header px-4 py-2.5" style={{ gridTemplateColumns: template }}>
        {headings.map((heading) => <span className="truncate type-table-head" key={heading}>{heading}</span>)}
      </div>
      {rows.map((cells, index) => (
        <div className={cn("grid items-center gap-4 px-4 py-3", index > 0 && "border-t")} key={index} style={{ gridTemplateColumns: template }}>
          {cells.map((cell, column) => <div className="flex min-w-0 items-center gap-2" key={column}>{cell}</div>)}
        </div>
      ))}
    </div>
  );
}

export function ServicesIllustration() {
  const { t } = useTranslation("intros");
  const { price } = useFormatters();
  const services: Array<{ key: "consultation" | "standardVisit" | "followUp"; minutes: number; price: number | null; dot: string }> = [
    { key: "consultation", minutes: 15, price: null, dot: "bg-status-info-foreground" },
    { key: "standardVisit", minutes: 45, price: 80, dot: "bg-status-success-foreground" },
    { key: "followUp", minutes: 30, price: 50, dot: "bg-status-warning-foreground" },
  ];
  return (
    <IntroScene tone="amber">
      <MiniPage title={t("sample.services.title")} action={t("sample.services.add")}>
        <MiniTable
          headings={[t("sample.services.name"), t("sample.services.duration"), t("sample.services.price")]}
          template="minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)"
          rows={services.map((service) => [
            <><span className={cn("size-2.5 shrink-0 rounded-full", service.dot)} /><span className="truncate type-item-title">{t(`sample.services.${service.key}`)}</span></>,
            <span className="type-body tabular-nums">{t("sample.services.minutes", { value: service.minutes })}</span>,
            <span className="type-body tabular-nums">{service.price === null ? t("sample.services.free") : price(service.price)}</span>,
          ])}
        />
      </MiniPage>
    </IntroScene>
  );
}

export function EmployeesIllustration() {
  const { t } = useTranslation("intros");
  const employees: Array<{ name: string; phone: string; services: string[]; working: boolean }> = [
    { name: "Maya Chen", phone: "+1 555 0123", services: [t("sample.services.consultation"), t("sample.services.followUp")], working: true },
    { name: "Omar Haddad", phone: "+1 555 0187", services: [t("sample.employees.allServices")], working: true },
    { name: "Lena Park", phone: "+1 555 0164", services: [t("sample.services.standardVisit")], working: false },
  ];
  return (
    <IntroScene tone="rose">
      <MiniPage title={t("sample.employees.title")} action={t("sample.employees.add")}>
        <MiniTable
          headings={[t("sample.employees.name"), t("sample.employees.services"), t("sample.employees.status")]}
          template="minmax(0,1.4fr) minmax(0,1.6fr) minmax(0,0.8fr)"
          rows={employees.map((employee) => [
            <><Initials name={employee.name} /><span className="flex min-w-0 flex-col"><span className="truncate type-item-title">{employee.name}</span><span className="truncate type-meta tabular-nums">{employee.phone}</span></span></>,
            <span className="flex min-w-0 gap-1.5 overflow-hidden">{employee.services.map((service) => <Badge key={service} variant="secondary">{service}</Badge>)}</span>,
            <Status variant={employee.working ? "success" : "neutral"}>{t(employee.working ? "sample.employees.working" : "sample.employees.onLeave")}</Status>,
          ])}
        />
      </MiniPage>
    </IntroScene>
  );
}
