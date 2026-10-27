import { intlLocale } from "@lobbystack/shared"
import {
  ArrowRight,
  AudioLines,
  CalendarCheck,
  CalendarClock,
  Check,
  KeyRound,
  Languages,
  MessageSquareText,
  Moon,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  Stethoscope,
  Sun,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Badge, Chip, Connector, Initials, Place, Scene, Tile } from "@/marketing/components/system/art"
import type { Locale } from "@/marketing/i18n"
import { getSolutionScenesCopy } from "@/marketing/components/solution-layouts/solution/solution-scenes-copy"

// Scenes drawn for the solution pages only: phone answering, scheduling,
// home services, after-hours and dental. They use the same kit as the
// shared product scenes, with their words in solution-scenes-copy.ts.

export type SolutionSceneName =
  | "forwarding"
  | "coverage"
  | "overnight"
  | "reminder"
  | "reschedule"
  | "languages"
  | "triage"
  | "dentalBooked"

type SceneProps = { locale: Locale }

// The same fixed week as the shared scenes, so times read the same everywhere.
const at = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 10, day, hour, minute))

function time(locale: Locale, hour: number, minute = 0) {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    at(3, hour, minute)
  )
}

function slot(locale: Locale, day: number, hour: number, minute = 0) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(at(day, hour, minute))
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

/** Your business number fanning out to the three forwarding rules, then to LobbyStack. */
function ForwardingScene({ locale }: SceneProps) {
  const t = getSolutionScenesCopy(locale)
  return (
    <Scene width={580} height={300} tilt="left">
      <Place x={0} y={104}>
        <Tile className="w-52" innerClassName="p-4">
          <Row icon={<IconDot icon={PhoneIncoming} />} title={t.yourNumber} detail="(555) 014-2290" />
        </Tile>
      </Place>
      <Connector x={218} y={146} length={34} />
      <Connector x={252} y={44} length={204} vertical />
      {t.forwardRules.map((rule, index) => (
        <div key={rule}>
          <Connector x={252} y={44 + index * 102} length={24} />
          <Place x={276} y={28 + index * 102}>
            <Chip className="bg-white px-3 py-1 text-[0.8125rem] shadow-[0_1px_2px_oklch(0_0_0/8%)]">
              <PhoneForwarded className="size-3.5" strokeWidth={1.75} />
              {rule}
            </Chip>
          </Place>
        </div>
      ))}
      <Connector x={420} y={146} length={20} />
      <Place x={440} y={96}>
        <div className="relative">
          <Tile accent className="w-36" innerClassName="flex flex-col items-center gap-2 p-4 text-center">
            <IconDot icon={AudioLines} />
            <span className="text-sm leading-snug font-medium">{t.lobbystackAnswers}</span>
          </Tile>
        </div>
      </Place>
    </Scene>
  )
}

/** A day split into the hours your team answers and the hours LobbyStack does. */
function CoverageScene({ locale }: SceneProps) {
  const t = getSolutionScenesCopy(locale)
  const rows = [
    { icon: Sun, label: t.open, hours: `${time(locale, 8)} – ${time(locale, 18)}`, who: t.yourTeam },
    { icon: Moon, label: t.closed, hours: `${time(locale, 18)} – ${time(locale, 8)}`, who: t.lobbystack, accent: true },
    { icon: CalendarClock, label: t.weekends, hours: t.allDay, who: t.lobbystack, accent: true },
  ]
  return (
    <Scene width={432} height={290} tilt="flat">
      <Place x={0} y={0}>
        <div className="relative">
          <Tile className="w-[26rem]" innerClassName="space-y-2 p-4">
            <span className="block text-xs font-medium text-muted-foreground">{t.whoAnswers}</span>
            {rows.map(({ icon: Icon, label, hours, who, accent }) => (
              <span
                key={label}
                className={
                  accent
                    ? "flex items-center gap-3 rounded-xl bg-[linear-gradient(135deg,oklch(0.99_0.008_75),oklch(0.9_0.03_65))] px-3 py-2.5 ring-1 ring-[oklch(0.8_0.04_65)]"
                    : "flex items-center gap-3 rounded-xl bg-beige px-3 py-2.5"
                }
              >
                <Icon className="size-4 shrink-0 text-foreground/70" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">{hours}</span>
                </span>
                <Chip strong={Boolean(accent)} className="text-[0.6875rem]">
                  {who}
                </Chip>
              </span>
            ))}
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-10">
            <Moon className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
      <Place x={60} y={252}>
        <Chip className="bg-white px-3 py-1 text-[0.8125rem] shadow-[0_1px_2px_oklch(0_0_0/8%)]">
          <PhoneForwarded className="size-3.5" strokeWidth={1.75} />
          {t.sameNumber}
        </Chip>
      </Place>
    </Scene>
  )
}

/** The calls that came in overnight, each with what LobbyStack did. */
function OvernightScene({ locale }: SceneProps) {
  const t = getSolutionScenesCopy(locale)
  const times = [time(locale, 18, 12), time(locale, 22, 40), time(locale, 1, 18), time(locale, 4, 5)]
  return (
    <Scene width={512} height={300} tilt="left">
      <Place x={0} y={0}>
        <Tile className="w-[17rem]" innerClassName="space-y-2 p-4">
          <span className="block text-xs font-medium text-muted-foreground">{t.overnightCalls}</span>
          {t.overnight.map((call, index) => (
            <span key={call.reason} className="flex items-center gap-2.5 rounded-xl bg-beige px-2.5 py-2">
              <span className="w-[3.75rem] shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">{times[index]}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{call.reason}</span>
              <Chip strong={index === 2} className="px-2 text-[0.6875rem]">
                {call.outcome}
              </Chip>
            </span>
          ))}
        </Tile>
      </Place>
      <Connector x={286} y={120} length={50} />
      <Place x={336} y={70}>
        <div className="relative">
          <Tile accent className="w-44" innerClassName="space-y-2 p-4">
            <span className="block text-sm font-medium">{t.morningSummary}</span>
            <span className="block text-xs leading-snug text-muted-foreground">{t.morningDetail}</span>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <Sun className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

/** The confirmation text and the reminder the day before, on a phone. */
function ReminderScene({ locale }: SceneProps) {
  const t = getSolutionScenesCopy(locale)
  const visit = slot(locale, 3, 15)
  return (
    <Scene width={296} height={300} tilt="flat">
      <Place x={0} y={0}>
        <Tile className="w-[17.5rem] rounded-[2.25rem] p-2" innerClassName="flex h-[17.5rem] flex-col rounded-[1.75rem] px-4 pt-3 pb-4">
          <span className="mx-auto h-1.5 w-10 rounded-full bg-black/10" />
          <span className="mt-4 flex items-center gap-2">
            <Initials name={t.businessName} className="size-7 text-[0.625rem]" />
            <span className="text-xs font-medium">{t.textsFrom}</span>
          </span>
          <span className="mt-4 block w-fit max-w-[92%] rounded-2xl rounded-bl-sm bg-beige-strong px-3 py-2 text-xs leading-snug">
            {t.confirmationText(visit)}
          </span>
          <span className="mt-2 text-center text-[0.625rem] text-muted-foreground">{t.dayBefore}</span>
          <span className="mt-2 block w-fit max-w-[92%] rounded-2xl rounded-bl-sm bg-beige-strong px-3 py-2 text-xs leading-snug">
            {t.reminderText(time(locale, 15))}
          </span>
          <Chip strong className="mt-auto self-end">
            <Check className="size-3" strokeWidth={2.5} />
            {t.confirmed}
          </Chip>
        </Tile>
      </Place>
    </Scene>
  )
}

/** An appointment moved by phone after a one-time code. */
function RescheduleScene({ locale }: SceneProps) {
  const t = getSolutionScenesCopy(locale)
  return (
    <Scene width={360} height={280}>
      <Place x={0} y={0}>
        <Tile className="w-56" innerClassName="p-4">
          <Row icon={<IconDot icon={KeyRound} />} title={t.codeChecked} detail={t.codeDetail} />
        </Tile>
      </Place>
      <Connector x={110} y={86} length={74} vertical />
      <Place x={40} y={160}>
        <div className="relative">
          <Tile accent className="w-[19rem]" innerClassName="space-y-3 p-4">
            <Row icon={<IconDot icon={CalendarCheck} />} title={t.appointmentMoved} detail={t.movedService} />
            <span className="flex items-center gap-2 text-xs">
              <Chip className="line-through decoration-foreground/40">{slot(locale, 4, 9)}</Chip>
              <ArrowRight className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
              <Chip strong>{slot(locale, 6, 14)}</Chip>
            </span>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <CalendarClock className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

/** A call that opens in the default language and switches to the caller's. */
function LanguagesScene({ locale }: SceneProps) {
  const t = getSolutionScenesCopy(locale)
  return (
    <Scene width={520} height={250} tilt="flat">
      <Place x={0} y={30}>
        <Tile className="w-52" innerClassName="space-y-2.5 p-4">
          <Row icon={<IconDot icon={PhoneCall} />} title={t.callOpens} />
          <Chip>{t.defaultLanguage}</Chip>
        </Tile>
      </Place>
      <Connector x={216} y={96} length={60} />
      <Place x={276} y={0}>
        <div className="relative">
          <Tile accent className="w-60" innerClassName="space-y-2.5 p-4">
            <Row icon={<IconDot icon={Languages} />} title={t.switchedTo} />
            <span className="block w-fit rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-xs leading-snug ring-1 ring-black/[0.05]">
              {t.callerLine}
            </span>
            <span className="ml-auto block w-fit rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-xs leading-snug text-primary-foreground">
              {t.receptionistLine}
            </span>
          </Tile>
        </div>
      </Place>
    </Scene>
  )
}

/** The triage questions you approve, answered, then the transfer. */
function TriageScene({ locale }: SceneProps) {
  const t = getSolutionScenesCopy(locale)
  return (
    <Scene width={560} height={300} tilt="left">
      <Place x={0} y={0}>
        <Tile className="w-60" innerClassName="space-y-2 p-4">
          <span className="block text-xs font-medium text-muted-foreground">{t.triageQuestions}</span>
          {t.triage.map((item) => (
            <span key={item.question} className="flex items-center gap-2.5 rounded-xl bg-beige px-2.5 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{item.question}</span>
              <Chip className="bg-white px-2 text-[0.6875rem]">{item.answer}</Chip>
            </span>
          ))}
        </Tile>
      </Place>
      <Connector x={250} y={110} length={46} />
      <Place x={296} y={60}>
        <div className="relative">
          <Tile accent className="w-[15.5rem]" innerClassName="space-y-2.5 p-4">
            <Row icon={<Initials name="Anika Patel" />} title={t.transferredToDentist} detail={t.onCallDentist} />
            <Chip strong>{t.connected}</Chip>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <PhoneForwarded className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

/** A new patient's call, booked as an exam with the details your team needs. */
function DentalBookedScene({ locale }: SceneProps) {
  const t = getSolutionScenesCopy(locale)
  return (
    <Scene width={490} height={290} tilt="flat">
      <Place x={0} y={0}>
        <Tile className="w-60" innerClassName="p-4">
          <Row icon={<IconDot icon={PhoneIncoming} />} title={t.newPatientCall} detail="(555) 014-2290" />
        </Tile>
      </Place>
      <Connector x={120} y={86} length={60} vertical />
      <Place x={120} y={146}>
        <div className="relative">
          <Tile accent className="w-[22rem]" innerClassName="space-y-3 p-4">
            <Row icon={<IconDot icon={Stethoscope} />} title={t.examBooked} detail={t.examDetail} />
            <span className="flex flex-wrap gap-1.5">
              <Chip strong>
                <CalendarCheck className="size-3" />
                {slot(locale, 3, 10)}
              </Chip>
              <Chip className="bg-white">
                <MessageSquareText className="size-3" />
                {t.confirmationSent}
              </Chip>
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

const scenes = {
  forwarding: ForwardingScene,
  coverage: CoverageScene,
  overnight: OvernightScene,
  reminder: ReminderScene,
  reschedule: RescheduleScene,
  languages: LanguagesScene,
  triage: TriageScene,
  dentalBooked: DentalBookedScene,
} satisfies Record<SolutionSceneName, (props: SceneProps) => ReactNode>

// How much each kind of panel scales its scene, matching the shared scenes.
const fits = {
  /** The hero, floating on white beside the headline. */
  hero: "[--scene-scale:0.6] sm:[--scene-scale:0.85] lg:[--scene-scale:0.9] xl:[--scene-scale:1]",
  /** A card in a row of two. */
  card: "[--scene-scale:0.55] sm:[--scene-scale:0.8] lg:[--scene-scale:0.78] xl:[--scene-scale:0.86]",
  /** The picture half of a split card. */
  panel: "[--scene-scale:0.52] sm:[--scene-scale:0.8] lg:[--scene-scale:0.92]",
} as const

export type SolutionSceneFit = keyof typeof fits

/** One of the solution scenes, filling its container. */
export function SolutionScene({ name, locale, fit = "panel" }: { name: SolutionSceneName; locale: Locale; fit?: SolutionSceneFit }) {
  const Component = scenes[name]
  return (
    <div className={`absolute inset-0 ${fits[fit]}`}>
      <Component locale={locale} />
    </div>
  )
}

/** Any scene, shared or page-specific, scaled for its panel. */
export function sceneFit(fit: SolutionSceneFit) {
  return fits[fit]
}
