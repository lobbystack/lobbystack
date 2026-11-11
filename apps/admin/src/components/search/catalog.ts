import englishNav from "../../../public/locales/en/nav.json";
import { AGENT_PAGES, agentHref, type AgentPage } from "@/lib/agent-pages";
import { ACCOUNT_PAGES, BUSINESS_PAGES, WORKSPACE_PAGES } from "@/lib/settings-pages";

// What search can find without asking the server: the dashboard's pages,
// Business, the two settings levels and each agent's pages. Titles and places come from
// the nav translations, so results read in the person's language. Each entry
// has tags, and the locale's synonyms in nav.json map the words people type
// onto them.

export type SearchEntry = {
  id: string;
  title: string;
  href: string;
  /** Where it lives, shown beside the result so people learn the dashboard. */
  where: string;
  /** What the entry answers to. A synonym in the query maps onto them. */
  tags: string[];
  /** A settings page only a partner's business shows. */
  partnerBusinessOnly?: boolean;
};

export type Translate = (key: string, options?: Record<string, unknown>) => unknown;

/** The tags synonyms map onto, one list of words each in nav.json's search.synonyms. */
export const SEARCH_TAGS = ["billing", "usage", "security", "phone", "voice", "rules", "handling", "business", "knowledge", "services", "employees", "team", "appearance", "notifications", "widget", "instagram", "connections", "keys", "inbox", "contacts", "appointments", "analytics", "affiliate", "agents"] as const;
export type SearchTag = (typeof SEARCH_TAGS)[number];

const PAGE_TAGS: Record<string, SearchTag[]> = {
  "/account": ["security"],
  "/account/appearance": ["appearance"],
  "/account/notifications": ["notifications"],
  "/business": ["business"],
  "/business/knowledge": ["knowledge"],
  "/business/services": ["services"],
  "/business/employees": ["employees"],
  "/business/integrations": ["connections"],
  "/workspace/team": ["team"],
  "/workspace/usage": ["usage"],
  "/workspace/billing": ["billing"],
  "/workspace/subscription": ["billing"],
  "/workspace/webhooks": ["connections"],
  "/workspace/api-keys": ["keys"],
  "/workspace/partner-access": ["team"],
};

const AGENT_TAGS: Partial<Record<AgentPage["section"], SearchTag[]>> = {
  // The agent's own page holds its voice and greeting, and how it handles calls and bookings.
  "": ["voice", "handling"],
  // The Instructions page joined Rules, so its words find Rules (nav.json's search.synonyms.rules).
  rules: ["rules"],
  channels: [],
  "channels/phone": ["phone"],
  "channels/widget": ["widget"],
};

const text = (t: Translate, key: string, options?: Record<string, unknown>) => String(t(key, options));

/** A place in the dashboard, as the labels on the way there. */
export function wherePath(...labels: string[]): string {
  return labels.join(" › ");
}

/**
 * Every page, settings page and agent page search can show, before access
 * rules. `t` reads the nav namespace. Agents come only for people who may
 * set them up, since the agents list needs setup.
 */
export function searchCatalog(t: Translate, agents: ReadonlyArray<{ id: string; name: string }>): SearchEntry[] {
  const main = text(t, "search.where.main");
  const settings = text(t, "items.settings");
  const agentsLabel = text(t, "items.agents");
  const businessLabel = text(t, "items.business");
  const page = (id: string, href: string, titleKey: string, tags: SearchTag[] | string[], where = main): SearchEntry => ({ id, href, title: text(t, titleKey), where, tags });
  const pages: SearchEntry[] = [
    page("home", "/", "items.home", ["home"]),
    page("inbox", "/inbox", "items.inbox", ["inbox"]),
    page("appointments", "/appointments", "items.appointments", ["appointments"]),
    page("contacts", "/contacts", "items.contacts", ["contacts"]),
    page("analytics", "/analytics", "items.analytics", ["analytics"]),
    page("agents", "/agents", "items.agents", ["agents"]),
    page("affiliate", "/affiliate", "items.affiliate", ["affiliate"], text(t, "accountMenu")),
  ];
  const settingsPages: SearchEntry[] = [
    // Business's rows read as its menu does, "Business › Details"; the "business" tag still finds Details by its full name.
    ...BUSINESS_PAGES.map((item) => page(item.href, item.href, item.menuKey ?? item.titleKey, PAGE_TAGS[item.href] ?? [], businessLabel)),
    ...ACCOUNT_PAGES.map((item) => ({ ...page(item.href, item.href, item.titleKey, PAGE_TAGS[item.href] ?? [], wherePath(settings, text(t, "sidebar.yourAccount"))) })),
    ...WORKSPACE_PAGES.map((item) => ({ ...page(item.href, item.href, item.titleKey, PAGE_TAGS[item.href] ?? [], wherePath(settings, text(t, "sidebar.workspace"))), ...(item.partnerBusinessOnly ? { partnerBusinessOnly: true } : {}) })),
  ];
  const agentPages = agents.flatMap((agent) => [
    { id: `agent:${agent.id}`, title: agent.name, href: agentHref(agent.id), where: agentsLabel, tags: ["agents"] },
    ...AGENT_PAGES.filter((item) => item.section in AGENT_TAGS).map((item) => ({ id: `agent:${agent.id}:${item.section}`, title: text(t, item.titleKey), href: agentHref(agent.id, item.section), where: wherePath(agentsLabel, agent.name), tags: [...(AGENT_TAGS[item.section] ?? [])] })),
    { id: `agent:${agent.id}:instagram`, title: text(t, "search.instagram"), href: agentHref(agent.id, "channels"), where: wherePath(agentsLabel, agent.name), tags: ["instagram"] },
  ]);
  return [...pages, ...settingsPages, ...agentPages];
}

/** Each synonym word, lowercased, mapped to the tags it stands for. */
export type Synonyms = Record<string, string[]>;

function addWords(synonyms: Synonyms, lists: unknown) {
  if (!lists || typeof lists !== "object") return;
  for (const tag of SEARCH_TAGS) {
    const words = (lists as Record<string, unknown>)[tag];
    if (typeof words !== "string") continue;
    for (const word of words.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)) {
      synonyms[word] = [...new Set([...(synonyms[word] ?? []), tag])];
    }
  }
}

/**
 * The words people type for each tag, in their language and in English, so
 * an English word such as "invoice" or "api" still works in another language.
 */
export function searchSynonyms(t: Translate): Synonyms {
  const synonyms: Synonyms = {};
  addWords(synonyms, t("search.synonyms", { returnObjects: true }));
  addWords(synonyms, englishNav.search.synonyms);
  return synonyms;
}
