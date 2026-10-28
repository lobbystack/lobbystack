import { intlLocale } from "@lobbystack/shared"
import {
  Bot,
  CalendarCheck,
  Check,
  Code2,
  MessageSquare,
  PhoneIncoming,
  Plug,
  Server,
  ShieldCheck,
  Unplug,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Badge, Chip, Connector, Initials, Place, Scene, Tile } from "@/marketing/components/system/art"
import type { Locale } from "@/marketing/i18n"
import type { McpCopy } from "@/marketing/lib/mcp-page-copy"

// The MCP page's scenes: an assistant working on LobbyStack through the
// server's tools, drawn with the site's illustration kit. Tool names stay in
// English because the assistant sees them that way.

type Art = McpCopy["art"]
type SceneProps = { locale: Locale; art: Art }

// A fixed Tuesday, as in the shared product scenes.
const tuesday = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 3, hour, minute))

function slot(locale: Locale, hour: number, minute = 0, weekday = true) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    ...(weekday ? { weekday: "short" as const } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(tuesday(hour, minute))
}

function ago(locale: Locale, value: number, unit: Intl.RelativeTimeFormatUnit) {
  return new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" }).format(-value, unit)
}

function IconDot({ icon: Icon, dark }: { icon: LucideIcon; dark?: boolean }) {
  return (
    <span
      className={
        dark
          ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          : "flex size-8 shrink-0 items-center justify-center rounded-full bg-beige-strong text-foreground/75"
      }
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  )
}

/** A tool call, as the assistant shows it: the tool's name in mono on a white pill. */
function ToolChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-mono text-[0.75rem] text-foreground/85 ring-1 ring-black/[0.06] [box-shadow:0_6px_16px_-8px_oklch(0.3_0.02_60/30%)]">
      <Plug className="size-3" strokeWidth={1.75} />
      {name}
    </span>
  )
}

/** The hero: LobbyStack's server in the middle, the assistants that connect to it around it. */
export function HubScene({ art }: { art: Art }) {
  const clients: { name: string; icon: LucideIcon; x: number; y: number }[] = [
    { name: "Claude", icon: Bot, x: 202, y: 0 },
    { name: "ChatGPT", icon: Bot, x: 0, y: 150 },
    { name: "Cursor", icon: Code2, x: 404, y: 150 },
    { name: "VS Code", icon: Code2, x: 202, y: 300 },
  ]
  return (
    <Scene width={560} height={362}>
      <Connector x={280} y={64} length={76} vertical />
      <Connector x={280} y={240} length={58} vertical />
      <Connector x={156} y={181} length={36} />
      <Connector x={368} y={181} length={36} />
      {clients.map(({ name, icon: Icon, x, y }) => (
        <Place key={name} x={x} y={y}>
          <Tile className="w-[9.75rem] rounded-[1.4rem] p-1.5" innerClassName="flex items-center gap-2.5 rounded-[1rem] px-3.5 py-3">
            <Icon className="size-4 shrink-0 text-foreground/70" strokeWidth={1.75} />
            <span className="text-[0.9375rem] font-medium">{name}</span>
          </Tile>
        </Place>
      ))}
      <Place x={194} y={140}>
        <div className="relative">
          <Tile accent className="w-[10.75rem]" innerClassName="space-y-1 px-4 py-3.5">
            <span className="block font-heading text-[1.25rem] leading-tight font-medium tracking-[-0.02em]">LobbyStack</span>
            <span className="block font-mono text-[0.75rem] text-muted-foreground">{art.endpoint}</span>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <Server className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

/** Asking about calls: the owner's question, the tool call, and the two calls that need a follow-up. */
export function CallsAskScene({ art }: SceneProps) {
  const callers = [
    { name: "Marcus Lee", outcome: art.messageTaken },
    { name: "Priya Shah", outcome: art.bookingIncomplete },
  ]
  return (
    <Scene width={484} height={284} tilt="left">
      <Place x={0} y={0}>
        <Tile className="w-[19.5rem] rounded-[1.4rem] p-1.5" innerClassName="flex items-center gap-2.5 rounded-[1rem] px-3.5 py-3">
          <IconDot icon={MessageSquare} />
          <span className="text-[0.875rem] leading-snug font-medium">{art.question}</span>
        </Tile>
      </Place>
      <Connector x={56} y={72} length={48} vertical />
      <Place x={30} y={120}>
        <ToolChip name="list_calls" />
      </Place>
      <Connector x={56} y={150} length={44} vertical />
      <Connector x={56} y={194} length={44} />
      <Place x={100} y={140}>
        <Tile accent className="w-[23rem]" innerClassName="space-y-2 p-3.5">
          {callers.map(({ name, outcome }) => (
            <span key={name} className="flex items-center gap-2.5 rounded-xl bg-white/70 px-2.5 py-2">
              <Initials name={name} className="size-7 text-[0.625rem]" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
              <Chip className="text-[0.6875rem]">
                <PhoneIncoming className="size-3" />
                {outcome}
              </Chip>
            </span>
          ))}
        </Tile>
      </Place>
    </Scene>
  )
}

/** Booking from the chat: open times offered, one picked, the appointment booked. */
export function BookingAskScene({ locale, art }: SceneProps) {
  const times = [
    { hour: 9, minute: 0 },
    { hour: 11, minute: 30 },
    { hour: 15, minute: 0, picked: true },
  ]
  return (
    <Scene width={494} height={236} tilt="flat">
      <Place x={0} y={0}>
        <Tile className="w-[16rem] rounded-[1.4rem] p-1.5" innerClassName="flex items-center gap-2.5 rounded-[1rem] px-3 py-2.5">
          <IconDot icon={MessageSquare} />
          <span className="text-[0.8125rem] leading-snug font-medium">{art.bookRequest}</span>
        </Tile>
      </Place>
      <Place x={0} y={84}>
        <ToolChip name="check_availability" />
      </Place>
      <Place x={0} y={122}>
        <span className="flex flex-col items-start gap-1.5">
          {times.map(({ hour, minute, picked }) => (
            <Chip
              key={`${hour}:${minute}`}
              strong={picked === true}
              className={picked ? "px-3 py-1 text-[0.8125rem]" : "bg-white px-3 py-1 text-[0.8125rem] ring-1 ring-black/[0.05]"}
            >
              {slot(locale, hour, minute)}
            </Chip>
          ))}
        </span>
      </Place>
      <Connector x={126} y={199} length={118} />
      <Place x={244} y={66}>
        <ToolChip name="book_appointment" />
      </Place>
      <Place x={244} y={104}>
        <div className="relative">
          <Tile accent className="w-[15.5rem]" innerClassName="space-y-2.5 p-4">
            <span className="flex items-center gap-2.5">
              <IconDot icon={CalendarCheck} dark />
              <span className="text-[0.9375rem] leading-snug font-medium">{art.appointmentBooked}</span>
            </span>
            <span className="flex items-center gap-2.5 rounded-xl bg-white/70 px-2.5 py-2">
              <Initials name="Dana Whitfield" className="size-7 text-[0.625rem]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">Dana Whitfield</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {art.cleaning} · {slot(locale, 15)}
                </span>
              </span>
            </span>
          </Tile>
        </div>
      </Place>
    </Scene>
  )
}

/** Consent as a chain of tiles stepping down the plane: the request, the business, the permissions, Allow access. */
export function ConsentChainScene({ art }: SceneProps) {
  const permission = (label: string, on: boolean) => (
    <span key={label} className="flex items-center gap-2 text-[0.75rem] leading-snug">
      <span
        className={
          on
            ? "flex size-4 shrink-0 items-center justify-center rounded-[0.3rem] bg-primary text-primary-foreground"
            : "size-4 shrink-0 rounded-[0.3rem] border border-foreground/25 bg-white"
        }
      >
        {on && <Check className="size-3" strokeWidth={2.5} />}
      </span>
      <span className={on ? "min-w-0" : "min-w-0 text-muted-foreground"}>{label}</span>
    </span>
  )
  const steps: { x: number; y: number; accent?: boolean; badge?: ReactNode; content: ReactNode }[] = [
    {
      x: 0,
      y: 0,
      content: (
        <span className="flex items-center gap-2.5">
          <IconDot icon={Plug} />
          <span className="text-[0.875rem] font-medium">{art.connectTitle}</span>
        </span>
      ),
    },
    {
      x: 40,
      y: 84,
      content: (
        <span className="flex items-center gap-2.5">
          <Initials name="Northside Dental" className="size-8 text-[0.625rem]" />
          <span className="min-w-0">
            <span className="block text-[0.6875rem] text-muted-foreground">{art.business}</span>
            <span className="block text-[0.875rem] font-medium">Northside Dental</span>
          </span>
        </span>
      ),
    },
    {
      x: 80,
      y: 176,
      content: (
        <span className="block space-y-1.5">
          <span className="block text-[0.6875rem] text-muted-foreground">{art.permissions}</span>
          {permission(art.scopeCalls, true)}
          {permission(art.scopeBook, true)}
          {permission(art.scopeHours, false)}
        </span>
      ),
    },
    {
      x: 120,
      y: 322,
      accent: true,
      badge: <ShieldCheck className="size-3.5" strokeWidth={2} />,
      content: (
        <span className="flex items-center justify-between gap-3">
          <span className="text-[0.9375rem] font-medium">{art.allowAccess}</span>
          <Check className="size-4 text-foreground/70" strokeWidth={2} />
        </span>
      ),
    },
  ]
  return (
    <Scene width={470} height={384}>
      {steps.slice(1).map((step, index) => {
        const previous = steps[index]!
        return (
          <span key={step.y}>
            <Connector x={previous.x + 20} y={previous.y + 62} length={step.y - previous.y - 30} vertical />
            <Connector x={previous.x + 20} y={step.y + 32} length={20} />
          </span>
        )
      })}
      {steps.map((step) => (
        <Place key={step.y} x={step.x} y={step.y}>
          <div className="relative">
            <Tile accent={step.accent} className="w-[20.5rem] rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-3.5 py-3">
              {step.content}
            </Tile>
            {step.badge && <Badge className="absolute top-1/2 -right-3 size-8 -translate-y-1/2 ring-4">{step.badge}</Badge>}
          </div>
        </Place>
      ))}
    </Scene>
  )
}

/** Connected apps: the assistants on the business, one just cut off. */
export function ConnectedAppsScene({ locale, art }: SceneProps) {
  const apps = [
    { name: "Claude", used: ago(locale, 2, "minute") },
    { name: "ChatGPT", used: ago(locale, 1, "day") },
  ]
  return (
    <Scene width={440} height={260} tilt="left">
      <Place x={0} y={0}>
        <Tile className="w-[25rem]" innerClassName="space-y-2.5 p-4">
          <span className="flex items-center gap-2.5">
            <IconDot icon={Plug} />
            <span className="text-[0.9375rem] font-medium">{art.connectedApps}</span>
          </span>
          {apps.map(({ name, used }) => (
            <span key={name} className="flex items-center gap-2.5 rounded-xl bg-beige px-2.5 py-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-foreground/70 ring-1 ring-black/[0.05]">
                <Bot className="size-3.5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{name}</span>
                <span className="block truncate text-[0.6875rem] text-muted-foreground">
                  {art.connectedBy} · {used}
                </span>
              </span>
              <Chip className="bg-white text-[0.6875rem] ring-1 ring-black/[0.06]">{art.disconnect}</Chip>
            </span>
          ))}
        </Tile>
      </Place>
      <Place x={150} y={206}>
        <span className="flex items-center gap-2 rounded-full bg-white py-1.5 pr-4 pl-1.5 text-sm font-medium whitespace-nowrap ring-1 ring-black/[0.05] [box-shadow:0_10px_24px_-8px_oklch(0.3_0.02_60/25%)]">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Unplug className="size-3.5" strokeWidth={1.75} />
          </span>
          {art.disconnected}
        </span>
      </Place>
    </Scene>
  )
}

// How much each panel scales its scene's plane, as ProductScene's fits do.
const fits = {
  hero: "[--scene-scale:0.54] sm:[--scene-scale:0.86] lg:[--scene-scale:0.95]",
  wide: "[--scene-scale:0.58] sm:[--scene-scale:0.8] lg:[--scene-scale:0.78] xl:[--scene-scale:0.86]",
  panel: "[--scene-scale:0.68] sm:[--scene-scale:0.86] lg:[--scene-scale:0.95]",
} as const

/** A scene filling its container at one of the page's fits. */
export function McpScene({ fit, children }: { fit: keyof typeof fits; children: ReactNode }) {
  return <div className={`absolute inset-0 ${fits[fit]}`}>{children}</div>
}
