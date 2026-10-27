import type { ProductSceneName } from "@/marketing/components/scenes/ProductScenes"
import type { Tilt } from "@/marketing/components/system/art"
import type { SeoLandingPage } from "@/marketing/lib/seo-landing-pages"

import type { GeneralSceneName } from "./GeneralScenes"

// Which scene each part of a general page shows. The salons and about pages
// have their own scenes, in the order of their sections. Every other page
// picks scenes from the words in each section, in any of the four languages,
// so the picture shows what the section talks about.

type SceneName = ProductSceneName | GeneralSceneName

export type PickedScene = { kind: "product"; name: ProductSceneName } | { kind: "general"; name: GeneralSceneName }

/** The plane each scene lies on, so neighbours can differ. */
const tilts: Record<SceneName, Tilt> = {
  callCapture: "left",
  booking: "right",
  handoff: "flat",
  answeredBooked: "flat",
  routing: "left",
  knowledge: "left",
  summary: "right",
  jobBooked: "left",
  guardrails: "right",
  salonDay: "right",
  stylists: "left",
  reschedule: "flat",
  serviceMenu: "right",
  eveningCalls: "left",
  repo: "flat",
  businessTypes: "flat",
}

export const sceneTilt = (scene: PickedScene) => tilts[scene.name]

const product = (name: ProductSceneName): PickedScene => ({ kind: "product", name })
const general = (name: GeneralSceneName): PickedScene => ({ kind: "general", name })

const generalNames = new Set<SceneName>(["salonDay", "stylists", "reschedule", "serviceMenu", "eveningCalls", "repo", "businessTypes"])
const pick = (name: SceneName): PickedScene =>
  generalNames.has(name) ? general(name as GeneralSceneName) : product(name as ProductSceneName)

// The scenes that replace the raster heroes, which carried English text.
const heroScenes: Record<string, ProductSceneName> = {
  "/illustrations/call-capture.webp": "callCapture",
  "/illustrations/booking-flow.webp": "booking",
  "/illustrations/industry-bookings.webp": "jobBooked",
  "/illustrations/business-knowledge.webp": "knowledge",
  "/illustrations/trust-controls.webp": "guardrails",
  "/illustrations/human-handoff.webp": "handoff",
  "/illustrations/call-routing-team.webp": "routing",
  "/illustrations/call-booking-summary.webp": "summary",
  "/illustrations/missed-calls.webp": "answeredBooked",
  "/illustrations/missed-calls-v3.webp": "answeredBooked",
  "/illustrations/calls-need-person.webp": "handoff",
}

const ownScenes: Record<string, { hero: PickedScene; sections: PickedScene[] }> = {
  "ai-receptionist-for-salons-and-spas": {
    hero: general("salonDay"),
    sections: [general("stylists"), general("reschedule"), general("serviceMenu"), general("eveningCalls")],
  },
  about: {
    hero: general("repo"),
    sections: [product("callCapture"), product("guardrails"), general("businessTypes"), product("knowledge")],
  },
}

// Words that point at a scene, in English, French, Spanish and Serbian. A
// section's title counts before its body, and within each, the earlier topic
// wins.
const topics: Array<{ scenes: SceneName[]; words: RegExp }> = [
  {
    scenes: ["guardrails", "repo"],
    words:
      /self-host|auto-h[ée]berg|autoaloj|hostov|(?<!\p{L})(serveur|server|servidor)|\bcode\b|c[óo]digo|otvorenog koda|izvorni kod|open source|infrastruct|infraestruct|infrastruktur|d[ée]ploy|desplieg|docker|railway|prompt/iu,
  },
  {
    scenes: ["handoff"],
    words:
      /urgen|emergenc|hitn|transf[eé]r|de garde|guardia|dežur|astreinte|on-call|escal|fuite|gotera|curenj|leak|personne|persona\b|human|ljud/i,
  },
  { scenes: ["answeredBooked"], words: /\bcost|co[ûu]t|cuesta|cu[áa]nto|košta|precio|\bprix\b/i },
  {
    scenes: ["knowledge"],
    words:
      /question|pregunt|pitanj|knowledge|connaiss|conocim|znanj|script|gui[óo]n|scenarij|politi|polic|pravil|r[èe]gle|regla|insurance|assurance|seguro|osiguran|langu|idioma|jezik|instruc|uputst|consigne/i,
  },
  {
    scenes: ["summary"],
    words: /summar|r[ée]sum|rezime|d[ée]tail|datos|podat|morning|matin|mañana|jutro|\bfile\b|queue|zapis|dossier|registro|document|marca|marque|model/i,
  },
  {
    scenes: ["booking"],
    words: /book|r[ée]serv|planif|agend|zakaz|\btermin|rendez|\bcita|appointment|schedul|visit|razgled|procen|devis|presupuest|estimate/i,
  },
  {
    scenes: ["callCapture"],
    words:
      /miss|manqu|perd|pierd|propust|answer|r[ée]pond|contest|odgovor|voicemail|messagerie|buz[óo]n|govorn|storm|temp[êe]te|torment|oluj|chaleur|calor|toplot/i,
  },
  { scenes: ["routing"], words: /priorit|tri(ez|age)|clasif|razvrst|filtr|spam|orient|\brout(e|ing)|team|équipe|equipo|ekip/i },
]

// When no word matches, or every match would repeat a scene.
const fallbackOrder: SceneName[] = ["summary", "routing", "booking", "knowledge", "handoff", "callCapture", "answeredBooked"]

function matches(text: string) {
  return topics.filter(({ words }) => words.test(text)).flatMap(({ scenes }) => scenes)
}

/** The hero scene for a page, or none when its picture has no scene. */
export function heroSceneFor(page: SeoLandingPage): PickedScene | undefined {
  const own = ownScenes[page.slug]
  if (own) return own.hero
  const name = heroScenes[page.image]
  return name ? product(name) : undefined
}

/**
 * One scene per section, matching its words. Neighbours never share a scene.
 * A page shows a scene twice only when a later title names it again, or
 * when nothing else fits. Among equally good choices, a scene whose tilt differs from the one
 * before wins.
 */
export function sectionScenesFor(page: SeoLandingPage): PickedScene[] {
  const own = ownScenes[page.slug]
  if (own && own.sections.length >= page.sections.length) return own.sections.slice(0, page.sections.length)

  const hero = heroSceneFor(page)
  const uses = new Map<SceneName, number>(hero ? [[hero.name, 1]] : [])
  let previous: SceneName | undefined = hero?.name
  return page.sections.map((section) => {
    const fromTitle = matches(section.title)
    const fromBody = matches(section.body)
    const fresh = (name: SceneName) => name !== previous && !uses.has(name)
    const turns = (name: SceneName) => !previous || tilts[name] !== tilts[previous]
    const best = (candidates: SceneName[]) =>
      candidates.find((candidate) => fresh(candidate) && turns(candidate)) ?? candidates.find(fresh)
    // A scene the title names may come back once after a gap; one the body
    // only hints at may not.
    const name =
      best(fromTitle) ??
      fromTitle.find((candidate) => candidate !== previous && (uses.get(candidate) ?? 0) < 2) ??
      best(fromBody) ??
      best(fallbackOrder) ??
      [...fromTitle, ...fromBody, ...fallbackOrder].find((candidate) => candidate !== previous) ??
      "summary"
    uses.set(name, (uses.get(name) ?? 0) + 1)
    previous = name
    return pick(name)
  })
}
