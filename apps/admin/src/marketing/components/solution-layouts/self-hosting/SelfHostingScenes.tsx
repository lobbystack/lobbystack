import { intlLocale } from "@lobbystack/shared"
import {
  CalendarCheck,
  Database,
  FileCode,
  Folder,
  GitFork,
  Globe,
  PhoneCall,
  Rocket,
  Scale,
  Server,
  Terminal,
  Workflow,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { GithubIcon } from "@/marketing/components/GithubIcon"
import { Badge, Chip, Connector, Place, Scene, Tile } from "@/marketing/components/system/art"
import type { Locale } from "@/marketing/i18n"
import { getSelfHostingScenesCopy } from "@/marketing/components/solution-layouts/self-hosting/scenes-copy"

// The open-source and self-hosted pages' scenes, drawn on the site's plane.
// Commands, file names and tool names are the repository's real ones.

type SceneProps = { locale: Locale }

// A fixed Tuesday, the same appointment the shared scenes show.
function slot(locale: Locale, hour: number, minute = 0) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 10, 3, hour, minute)))
}

function IconDot({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-beige-strong text-foreground/75">
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  )
}

function Row({ icon, title, detail, end }: { icon: ReactNode; title: string; detail?: string; end?: ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] leading-snug font-medium">{title}</span>
        {/* Details wrap rather than cut off, since French and Spanish run long. */}
        {detail && <span className="block text-xs leading-snug text-muted-foreground">{detail}</span>}
      </span>
      {end}
    </span>
  )
}

/** One line of code or a file name, in the mono face. */
function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[0.75rem] [font-variant-ligatures:none] ${className ?? ""}`}>{children}</span>
}

/** The open-source hero: the MIT License in the middle of the repository's folders. */
export function RepoScene({ locale }: SceneProps) {
  const t = getSelfHostingScenesCopy(locale)
  const folders = [
    { name: "apps/admin", x: 0, y: 0 },
    { name: "apps/worker", x: 336, y: 0 },
    { name: "packages/agent-core", x: 0, y: 262 },
    { name: "docker-compose.yml", x: 336, y: 262, file: true },
  ]
  return (
    <Scene width={560} height={310} tilt="right">
      {/* Dashed lines from each folder to the license tile. */}
      <Connector x={112} y={46} length={64} vertical />
      <Connector x={448} y={46} length={64} vertical />
      <Connector x={112} y={200} length={62} vertical />
      <Connector x={448} y={200} length={62} vertical />
      {folders.map(({ name, x, y, file }) => (
        <Place key={name} x={x} y={y}>
          <Tile className="w-[14rem] rounded-[1.4rem] p-1.5" innerClassName="flex items-center gap-2.5 rounded-[1rem] px-3 py-2.5">
            {file ? (
              <FileCode className="size-4 shrink-0 text-foreground/70" strokeWidth={1.75} />
            ) : (
              <Folder className="size-4 shrink-0 text-foreground/70" strokeWidth={1.75} />
            )}
            <Mono className="truncate">{name}</Mono>
          </Tile>
        </Place>
      ))}
      <Place x={80} y={110}>
        <div className="relative">
          <Tile accent className="w-[25rem]" innerClassName="flex items-center gap-4 px-6 py-5">
            <Scale className="size-7 shrink-0 text-foreground/80" strokeWidth={1.5} />
            <span className="min-w-0">
              <span className="block font-heading text-[1.625rem] leading-tight font-medium tracking-[-0.03em]">{t.mitLicense}</span>
              <span className="block text-sm text-muted-foreground">{t.licenseDetail}</span>
            </span>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-10">
            <GithubIcon className="size-[1.125rem]" />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

/** The receptionist's tools in packages/agent-core, with one call's booking coming out of it. */
export function ToolsScene({ locale }: SceneProps) {
  const t = getSelfHostingScenesCopy(locale)
  const tools = ["findAvailability", "bookAppointment", "takeMessage", "transferCall"]
  return (
    <Scene width={530} height={300} tilt="left">
      <Place x={0} y={0}>
        <Tile className="w-[16.5rem]" innerClassName="space-y-2 p-4">
          <Row icon={<IconDot icon={FileCode} />} title="tools.ts" detail={t.toolsDetail} />
          {tools.map((tool) => (
            <span
              key={tool}
              className={`flex items-center rounded-xl px-2.5 py-1.5 ${tool === "bookAppointment" ? "bg-beige-strong" : "bg-beige"}`}
            >
              <Mono>{tool}</Mono>
            </span>
          ))}
        </Tile>
      </Place>
      <Connector x={272} y={140} length={42} />
      <Place x={314} y={100}>
        <Tile accent className="w-[13.5rem]" innerClassName="p-4">
          <Row icon={<IconDot icon={CalendarCheck} />} title={t.appointmentBooked} detail={slot(locale, 14, 30)} />
        </Tile>
      </Place>
    </Scene>
  )
}

/** A fork of the repository with the caller-facing parts edited. */
export function ForkScene({ locale }: SceneProps) {
  const t = getSelfHostingScenesCopy(locale)
  return (
    <Scene width={480} height={300} tilt="right">
      <Place x={0} y={0}>
        <Tile className="w-[14rem]" innerClassName="p-4">
          <Row icon={<IconDot icon={Folder} />} title="lobbystack" detail={t.mitLicense} />
        </Tile>
      </Place>
      <Connector x={112} y={86} length={70} vertical />
      <Connector x={112} y={156} length={48} />
      <Place x={160} y={110}>
        <div className="relative">
          <Tile accent className="w-[17.5rem]" innerClassName="space-y-2 p-4">
            <span className="block text-xs font-medium text-muted-foreground">{t.yourFork}</span>
            {t.changes.map((change) => (
              <span key={change} className="flex items-center gap-2 rounded-xl bg-white/70 px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{change}</span>
                <Chip className="px-2 text-[0.6875rem]">{t.edited}</Chip>
              </span>
            ))}
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <GitFork className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

/**
 * How a self-hosted install is laid out: the call comes in through your own
 * Twilio and OpenAI accounts, and the records land in your database.
 */
export function ServerStackScene({ locale }: SceneProps) {
  const t = getSelfHostingScenesCopy(locale)
  const services: Array<{ icon: LucideIcon; name: string; detail: string }> = [
    { icon: Globe, name: "Caddy", detail: t.caddyDetail },
    { icon: Server, name: t.dashboard, detail: t.dashboardDetail },
    { icon: Workflow, name: "Worker", detail: t.workerDetail },
  ]
  // A stair of three tiles, so the scene also fits a phone-width panel.
  return (
    <Scene width={420} height={500} tilt="flat">
      <Place x={0} y={0}>
        <Tile className="w-[13rem]" innerClassName="p-4">
          <Row icon={<IconDot icon={PhoneCall} />} title="Twilio + OpenAI" detail={t.yourAccounts} />
        </Tile>
      </Place>
      <Connector x={104} y={84} length={34} vertical />
      <Place x={64} y={118}>
        <Tile className="w-[22rem]" innerClassName="space-y-2 p-4">
          <span className="flex items-center justify-between gap-3 px-1 pb-1">
            <span className="text-sm font-semibold">{t.yourServer}</span>
            <Mono className="text-muted-foreground">docker compose</Mono>
          </span>
          {services.map(({ icon: Icon, name, detail }) => (
            <span key={name} className="flex items-center gap-3 rounded-xl bg-beige px-3 py-2">
              <Icon className="size-4 shrink-0 text-foreground/70" strokeWidth={1.75} />
              <span className="min-w-0">
                <span className="block text-sm leading-snug font-medium">{name}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{detail}</span>
              </span>
            </span>
          ))}
        </Tile>
      </Place>
      <Connector x={240} y={378} length={30} vertical />
      <Place x={64} y={408}>
        <Tile accent className="w-[22rem]" innerClassName="p-4">
          <Row icon={<IconDot icon={Database} />} title={t.data} detail={t.dataDetail} />
        </Tile>
      </Place>
    </Scene>
  )
}

/** The Docker Compose install: three commands, then the two app services running. */
export function TerminalScene({ locale }: SceneProps) {
  const t = getSelfHostingScenesCopy(locale)
  const commands = ["git clone …/lobbystack.git", "node scripts/generate-env.mjs", "docker compose up -d"]
  return (
    <Scene width={480} height={290} tilt="left">
      <Place x={0} y={0}>
        <Tile className="w-[18rem]" innerClassName="space-y-2 p-4">
          <span className="flex items-center gap-2 pb-1 text-muted-foreground">
            <Terminal className="size-4" strokeWidth={1.75} />
            <Mono>lobbystack</Mono>
          </span>
          {commands.map((command) => (
            <span key={command} className="block truncate">
              <Mono className="text-muted-foreground">$ </Mono>
              <Mono>{command}</Mono>
            </span>
          ))}
        </Tile>
      </Place>
      <Place x={190} y={168}>
        <Tile accent className="w-[18rem]" innerClassName="space-y-2 p-4">
          {["admin", "worker"].map((service) => (
            <span key={service} className="flex items-center justify-between gap-3">
              <Mono>{service}</Mono>
              <Chip strong className="px-2 text-[0.6875rem]">
                {t.running}
              </Chip>
            </span>
          ))}
        </Tile>
      </Place>
    </Scene>
  )
}

/** The Railway template: you paste three keys, Railway makes the rest. */
export function RailwayScene({ locale }: SceneProps) {
  const t = getSelfHostingScenesCopy(locale)
  const fields = ["OPENAI_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]
  return (
    <Scene width={440} height={300} tilt="right">
      <Place x={0} y={0}>
        <div className="relative">
          <Tile className="w-[17rem]" innerClassName="space-y-2 p-4">
            <span className="block pb-1 text-sm font-semibold">{t.railwayTitle}</span>
            {fields.map((field) => (
              <span key={field} className="flex items-center justify-between gap-3 rounded-xl bg-beige px-2.5 py-1.5">
                <Mono>{field}</Mono>
                <span className="text-xs tracking-[0.2em] text-muted-foreground">••••</span>
              </span>
            ))}
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <Rocket className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
      <Connector x={136} y={196} length={44} vertical />
      <Place x={96} y={240}>
        <Tile accent className="rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-4 py-2.5">
          <span className="text-sm font-medium whitespace-nowrap">{t.secretsGenerated}</span>
        </Tile>
      </Place>
    </Scene>
  )
}

const scenes = {
  repo: RepoScene,
  tools: ToolsScene,
  fork: ForkScene,
  serverStack: ServerStackScene,
  terminal: TerminalScene,
  railway: RailwayScene,
} satisfies Record<string, (props: SceneProps) => ReactNode>

export type SelfHostingSceneName = keyof typeof scenes

// How much each kind of panel scales its scene's plane, as the shared scenes do.
const fits = {
  /** A wide, short card in a row of two. */
  wide: "[--scene-scale:0.6] sm:[--scene-scale:0.8] lg:[--scene-scale:0.78] xl:[--scene-scale:0.86]",
  /** The picture half of a split card. */
  panel: "[--scene-scale:0.56] sm:[--scene-scale:0.8] lg:[--scene-scale:0.92]",
  /** The hero, floating on white. */
  hero: "[--scene-scale:0.56] sm:[--scene-scale:0.78] lg:[--scene-scale:0.82] xl:[--scene-scale:0.92]",
} as const

/** One of the self-hosting scenes, filling its container. */
export function SelfHostingScene({ name, locale, fit = "panel" }: { name: SelfHostingSceneName; locale: Locale; fit?: keyof typeof fits }) {
  const Component = scenes[name]
  return (
    <div className={`absolute inset-0 ${fits[fit]}`}>
      <Component locale={locale} />
    </div>
  )
}
