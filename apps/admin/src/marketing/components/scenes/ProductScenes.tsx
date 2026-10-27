import { intlLocale } from "@lobbystack/shared"
import {
  AudioLines,
  CalendarCheck,
  CalendarDays,
  FileText,
  Globe,
  Clock,
  History,
  MessageSquareText,
  Paperclip,
  PhoneCall,
  PhoneIncoming,
  Server,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Badge, Chip, Connector, Initials, Place, Scene, Tile } from "@/marketing/components/system/art"
import type { Locale } from "@/marketing/i18n"
import { getProductScenesCopy } from "@/marketing/lib/product-scenes-copy"

// Product scenes: small pieces of the product drawn as tiles on the site's
// plane. They replace the raster illustrations, so their words follow the
// page's language.

export type ProductSceneName =
  | "callCapture"
  | "booking"
  | "handoff"
  | "answeredBooked"
  | "routing"
  | "knowledge"
  | "summary"
  | "jobBooked"
  | "guardrails"

type SceneProps = { locale: Locale }

// A fixed Tuesday, so every scene shows the same appointment.
const tuesday = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 3, hour, minute))

function slot(locale: Locale, hour: number, minute = 0) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(tuesday(hour, minute))
}

function IconDot({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-beige-strong text-foreground/75">
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  )
}

function Row({ icon, title, detail, end }: { icon: ReactNode; title: string; detail?: string | undefined; end?: ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] leading-snug font-medium">{title}</span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
      {end}
    </span>
  )
}

function CallCaptureScene({ locale }: SceneProps) {
  const t = getProductScenesCopy(locale)
  return (
    <Scene width={540} height={380}>
      <Place x={150} y={0}>
        <Tile className="w-60" innerClassName="p-4">
          <Row icon={<IconDot icon={PhoneIncoming} />} title={t.incomingCall} detail="(555) 014-2290" />
        </Tile>
      </Place>
      <Connector x={270} y={88} length={44} vertical />
      <Place x={270} y={132} className="-translate-x-1/2">
        <Chip>{t.teamUnavailable}</Chip>
      </Place>
      <Connector x={270} y={160} length={40} vertical />
      <Connector x={60} y={200} length={420} />
      <Connector x={60} y={200} length={40} vertical />
      <Connector x={480} y={200} length={40} vertical />
      <Place x={0} y={240}>
        <Tile className="w-56" innerClassName="p-4">
          <Row icon={<IconDot icon={Users} />} title={t.ringTeam} detail={t.ringFor} />
        </Tile>
      </Place>
      <Place x={300} y={240}>
        <Tile accent className="w-60" innerClassName="p-4">
          <Row icon={<IconDot icon={AudioLines} />} title={t.lobbystackAnswers} detail={t.booksOrMessages} />
        </Tile>
      </Place>
    </Scene>
  )
}

function BookingScene({ locale }: SceneProps) {
  const t = getProductScenesCopy(locale)
  const slots = [slot(locale, 9), slot(locale, 13, 30), slot(locale, 15)]
  return (
    <Scene width={520} height={380}>
      <Place x={0} y={0}>
        <Tile className="w-72" innerClassName="space-y-3 p-4">
          <Row icon={<IconDot icon={CalendarDays} />} title={t.scheduleVisit} />
          <span className="flex flex-wrap gap-1.5">
            {slots.map((time, index) => (
              <Chip key={time} strong={index === slots.length - 1}>
                {time}
              </Chip>
            ))}
          </span>
        </Tile>
      </Place>
      <Connector x={140} y={150} length={70} vertical />
      <Connector x={140} y={220} length={90} />
      <Place x={230} y={170}>
        <div className="relative">
          <Tile accent className="w-[17rem]" innerClassName="space-y-3 p-4">
            <Row icon={<IconDot icon={CalendarCheck} />} title={t.appointmentBooked} detail={slots[2]} />
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <MessageSquareText className="size-3.5" />
              {t.confirmationTexted}
            </span>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <CalendarCheck className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

function HandoffScene({ locale }: SceneProps) {
  const t = getProductScenesCopy(locale)
  const sarah = t.team[1]?.name ?? "Sarah Lopez"
  return (
    <Scene width={520} height={380}>
      <Place x={0} y={0}>
        <Tile className="w-[19rem]" innerClassName="space-y-3 p-4">
          <Chip strong>{t.urgent}</Chip>
          <span className="block rounded-2xl rounded-bl-sm bg-beige-strong px-3 py-2 text-sm leading-snug">{t.urgentQuote}</span>
        </Tile>
      </Place>
      <Connector x={150} y={160} length={60} vertical />
      <Connector x={150} y={220} length={60} />
      <Place x={210} y={180}>
        <Tile accent className="w-[18rem]" innerClassName="space-y-2.5 p-4">
          <Row icon={<Initials name={sarah} />} title={t.transferredTo(sarah.split(" ")[0] ?? sarah)} />
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Paperclip className="size-3.5" />
            {t.contextAttached}
          </span>
        </Tile>
      </Place>
    </Scene>
  )
}

function AnsweredBookedScene({ locale }: SceneProps) {
  const t = getProductScenesCopy(locale)
  return (
    <Scene width={600} height={220}>
      <Place x={0} y={20}>
        <Tile className="w-60" innerClassName="p-4">
          <Row icon={<IconDot icon={PhoneCall} />} title={t.callAnswered} detail="(555) 014-2290 · 2:14" />
        </Tile>
      </Place>
      <Connector x={250} y={62} length={80} />
      <Place x={330} y={0}>
        <div className="relative">
          <Tile accent className="w-[16.5rem]" innerClassName="p-4">
            <Row icon={<IconDot icon={CalendarCheck} />} title={t.appointmentBooked} detail={slot(locale, 15)} />
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <CalendarCheck className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

function RoutingScene({ locale }: SceneProps) {
  const t = getProductScenesCopy(locale)
  return (
    <Scene width={600} height={260}>
      <Place x={0} y={88}>
        <Tile accent className="w-56" innerClassName="p-4">
          <Row icon={<IconDot icon={PhoneIncoming} />} title={t.incomingCall} detail="(555) 014-2290" />
        </Tile>
      </Place>
      <Connector x={232} y={130} length={70} />
      <Connector x={300} y={36} length={196} vertical />
      {t.team.map((person, index) => (
        <div key={person.name}>
          <Connector x={300} y={36 + index * 98} length={40} />
          <Place x={340} y={index * 98}>
            <Tile className="w-60 rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-3 py-2.5">
              <Row icon={<Initials name={person.name} />} title={person.name.split(" ")[0] ?? person.name} detail={person.role} />
            </Tile>
          </Place>
        </div>
      ))}
    </Scene>
  )
}

function KnowledgeScene({ locale }: SceneProps) {
  const t = getProductScenesCopy(locale)
  const icons = [Globe, Tag, Clock, FileText]
  return (
    <Scene width={560} height={340}>
      <Place x={0} y={0}>
        <Tile className="w-64" innerClassName="space-y-2.5 p-4">
          <span className="block text-xs font-medium text-muted-foreground">{t.knowledgeSources}</span>
          {t.sources.map((source, index) => {
            const Icon = icons[index] ?? FileText
            return (
              <span key={source} className="flex items-center gap-2.5 rounded-xl bg-beige px-2.5 py-2">
                <Icon className="size-4 shrink-0 text-foreground/70" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate text-sm">{source}</span>
                {index === 0 && <Chip className="px-2 text-[0.6875rem]">{t.synced}</Chip>}
              </span>
            )
          })}
        </Tile>
      </Place>
      <Connector x={268} y={150} length={60} />
      <Place x={330} y={110}>
        <div className="relative">
          <Tile accent className="w-56" innerClassName="p-4">
            <Row icon={<IconDot icon={Sparkles} />} title={t.readyToAnswer} />
          </Tile>
        </div>
      </Place>
    </Scene>
  )
}

function SummaryScene({ locale }: SceneProps) {
  const t = getProductScenesCopy(locale)
  return (
    <Scene width={460} height={360}>
      <Place x={0} y={0}>
        <Tile className="w-56" innerClassName="p-4">
          <Row icon={<IconDot icon={PhoneCall} />} title={t.callAnswered} detail="2:14" />
        </Tile>
      </Place>
      <Connector x={110} y={90} length={60} vertical />
      <Place x={60} y={150}>
        <div className="relative">
          <Tile accent className="w-[18.5rem]" innerClassName="space-y-2.5 p-4">
            <span className="block text-xs font-medium text-muted-foreground">{t.callSummary}</span>
            <Row icon={<IconDot icon={Wrench} />} title={t.summaryService} detail={t.summaryNote} />
            <Chip strong>
              <CalendarCheck className="size-3" />
              {slot(locale, 15)}
            </Chip>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <Sparkles className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

function JobBookedScene({ locale }: SceneProps) {
  const t = getProductScenesCopy(locale)
  return (
    <Scene width={560} height={340}>
      <Place x={0} y={30}>
        <Tile className="w-52 rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-3 py-2.5">
          <Row icon={<IconDot icon={PhoneIncoming} />} title={t.serviceRequest} />
        </Tile>
      </Place>
      <Place x={30} y={190}>
        <Tile className="w-52 rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-3 py-2.5">
          <Row icon={<IconDot icon={FileText} />} title={t.estimate} />
        </Tile>
      </Place>
      <Connector x={220} y={70} length={80} />
      <Connector x={250} y={230} length={50} />
      <Connector x={300} y={70} length={160} vertical />
      <Place x={300} y={100}>
        <div className="relative">
          <Tile accent className="w-[16rem]" innerClassName="space-y-2.5 p-4">
            <Row icon={<IconDot icon={CalendarCheck} />} title={t.jobBooked} detail={t.jobName} />
            <Chip strong>{slot(locale, 10)}</Chip>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <CalendarCheck className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

function GuardrailsScene({ locale }: SceneProps) {
  const t = getProductScenesCopy(locale)
  return (
    <Scene width={580} height={360}>
      <Place x={0} y={0}>
        <Tile className="w-64" innerClassName="space-y-2.5 p-4">
          <Row icon={<IconDot icon={History} />} title={t.callHistory} />
          {[t.team[0], t.team[1], t.team[2]].map((person, index) =>
            person ? (
              <span key={person.name} className="flex items-center gap-2.5 rounded-xl bg-beige px-2.5 py-1.5">
                <Initials name={person.name} className="size-7 text-[0.625rem]" />
                <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{["2:14", "0:58", "3:41"][index]}</span>
              </span>
            ) : null
          )}
        </Tile>
      </Place>
      <Place x={300} y={120}>
        <div className="relative">
          <Tile accent className="w-[17rem]" innerClassName="space-y-2.5 p-4">
            <Row icon={<IconDot icon={ShieldCheck} />} title={t.guardrails} />
            {t.guardrailRules.map((rule) => (
              <span key={rule} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1">{rule}</span>
                <Chip className="px-2 text-[0.6875rem]">{t.on}</Chip>
              </span>
            ))}
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <Server className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
      <Connector x={140} y={200} length={60} vertical />
      <Connector x={140} y={260} length={160} />
      <Place x={20} y={262}>
        <Chip>
          <Server className="size-3" />
          {t.yourServer}
        </Chip>
      </Place>
    </Scene>
  )
}

const scenes = {
  callCapture: CallCaptureScene,
  booking: BookingScene,
  handoff: HandoffScene,
  answeredBooked: AnsweredBookedScene,
  routing: RoutingScene,
  knowledge: KnowledgeScene,
  summary: SummaryScene,
  jobBooked: JobBookedScene,
  guardrails: GuardrailsScene,
} satisfies Record<ProductSceneName, (props: SceneProps) => ReactNode>

// How much each kind of panel scales its scene's plane.
const fits = {
  /** A card in a row of three, about 380px wide. */
  card: "[--scene-scale:0.6] sm:[--scene-scale:0.7] lg:[--scene-scale:0.62] xl:[--scene-scale:0.68]",
  /** A wide, short card in a row of two. */
  wide: "[--scene-scale:0.5] sm:[--scene-scale:0.75] lg:[--scene-scale:0.72] xl:[--scene-scale:0.8]",
  /** The picture half of a split card. */
  panel: "[--scene-scale:0.62] sm:[--scene-scale:0.8] lg:[--scene-scale:0.92]",
  /** A square panel. */
  square: "[--scene-scale:0.62] sm:[--scene-scale:0.8] lg:[--scene-scale:0.86]",
} as const

export type SceneFit = keyof typeof fits

/** One of the product scenes, filling its container. */
export function ProductScene({ name, locale, fit = "panel" }: { name: ProductSceneName; locale: Locale; fit?: SceneFit }) {
  const Component = scenes[name]
  return (
    <div className={`absolute inset-0 ${fits[fit]}`}>
      <Component locale={locale} />
    </div>
  )
}
