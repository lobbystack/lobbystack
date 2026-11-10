import { describe, expect, it } from "vitest";
import { accessCapabilities, capabilityNames, type Capability } from "@lobbystack/domain";

import englishNav from "../../../public/locales/en/nav.json";
import frenchNav from "../../../public/locales/fr/nav.json";
import { pageCapability } from "@/lib/dashboard-pages";
import { searchCatalog, searchSynonyms, SEARCH_TAGS, type Translate } from "./catalog";
import { searchEntries, type SearchScope } from "./search";

/** Reads a namespace's keys the way i18next does, for the catalog. */
function translator(resources: unknown): Translate {
  return (key, options) => {
    const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], resources);
    if (options?.returnObjects) return value;
    return typeof value === "string" ? value : key;
  };
}

const t = translator(englishNav);
const agents = [{ id: "a1", name: "Front desk" }, { id: "a2", name: "After hours" }];

function scope(capabilities: readonly Capability[], { opensPartnerBilling = false, withAgents = true, nav = t } = {}): SearchScope {
  // Agents come from a list that needs setup, so without it there are none.
  const listed = withAgents && capabilities.includes("setup") ? agents : [];
  return { entries: searchCatalog(nav, listed), synonyms: searchSynonyms(nav), can: (capability) => capabilities.includes(capability), opensPartnerBilling };
}

const owner = scope(capabilityNames);
const direct = (fixed: ReadonlySet<Capability>) => [...fixed];
/** A partner's business at the activity level: calls, chats, appointments and contacts, nothing to set up. Its owners pay the partner. */
const activityOnly = scope(direct(accessCapabilities({ partnerId: "partner", accessLevel: "activity" }, "membership")), { opensPartnerBilling: true });
/** A partner's business at full access: everything but billing, API keys and MCP. */
const fullPartnerAccess = scope(direct(accessCapabilities({ partnerId: "partner", accessLevel: "full" }, "membership")), { opensPartnerBilling: true });
/** A direct business's viewer: every page, read-only, and none of a partner's. */
const directViewer = scope(direct(accessCapabilities({ partnerId: null, accessLevel: "full" }, "membership")));
/** A partner member who opened one of the partner's businesses: full access, and the business's billing isn't theirs. */
const partnerMember = scope(direct(accessCapabilities({ partnerId: "partner", accessLevel: "activity" }, "partner")));

const titles = (query: string, within = owner) => searchEntries(query, within).map((entry) => entry.title);
const hrefs = (query: string, within: SearchScope) => searchEntries(query, within, 100).map((entry) => entry.href);

describe("search matches related words", () => {
  it.each([
    ["invoice", "Plan and billing"],
    ["password", "Profile and security"],
    ["voice", "General"],
    ["forwarding", "Phone number"],
    ["teammate", "Team"],
    ["dm", "Instagram"],
    ["hours", "Business details"],
    ["zapier", "Connections"],
    ["transcript", "Inbox"],
    ["transfer", "General"],
  ])("%s finds %s", (query, title) => {
    expect(titles(query)).toContain(title);
  });

  it.each(["transfer", "transfer number", "booking", "staff answers first", "appointment changes", "reschedule"])("%s opens the agent's own page, where calls and booking live", (query) => {
    const found = searchEntries(query, owner, 100).filter((entry) => entry.href.startsWith("/agents/a1"));
    expect(found.map((entry) => entry.href)).toContain("/agents/a1");
    expect(found.every((entry) => !entry.href.endsWith("/handling"))).toBe(true);
  });

  it("matches a word as it's typed", () => {
    expect(titles("bill")).toContain("Plan and billing");
    expect(titles("invo")).toContain("Plan and billing");
  });

  it("ranks a title match above a synonym", () => {
    expect(titles("usage")[0]).toBe("Usage");
  });

  it("finds nothing for a word it doesn't know", () => {
    expect(titles("zzzz")).toEqual([]);
  });

  it("gives every tag synonyms in every language", () => {
    for (const nav of [englishNav, frenchNav]) for (const tag of SEARCH_TAGS) expect(nav.search.synonyms[tag], tag).toBeTruthy();
  });
});

describe("search reads in the person's language", () => {
  const french = scope(capabilityNames, { nav: translator(frenchNav) });

  it("titles results with the menus' words", () => {
    expect(searchEntries("facture", french).map((entry) => entry.title)).toContain("Forfait et facturation");
  });

  it("finds a title without its accents", () => {
    expect(searchEntries("reglages", french).length + searchEntries("employes", french).length).toBeGreaterThan(0);
  });

  it("still knows the English words", () => {
    expect(searchEntries("invoice", french).map((entry) => entry.href)).toContain("/workspace/billing");
  });
});

describe("search shows where each result lives", () => {
  it("names the agent beside its pages", () => {
    expect(searchEntries("voice", owner).map((entry) => entry.where)).toEqual(expect.arrayContaining(["Agents › Front desk", "Agents › After hours"]));
  });

  it("names the settings level", () => {
    expect(searchEntries("password", owner)[0]?.where).toBe("Settings › Your account");
    expect(searchEntries("invoice", owner)[0]?.where).toBe("Settings › Workspace");
  });

  it("finds agents by name", () => {
    expect(searchEntries("after hours", owner)[0]).toMatchObject({ title: "After hours", href: "/agents/a2" });
  });
});

describe("search respects what the person can open", () => {
  const everyQuery = ["invoice", "voice", "knowledge", "team", "api", "mcp", "forwarding", "instagram", "front", "billing", "usage", "webhook", "inbox", "password"];

  it.each([["an activity-only partner business", activityOnly], ["full partner access", fullPartnerAccess], ["a direct viewer", directViewer], ["a partner member", partnerMember]])("shows %s no page its access leaves out", (_, within) => {
    for (const query of everyQuery) for (const entry of searchEntries(query, within, 100)) expect(within.can(pageCapability(entry.href)), `${query}: ${entry.href}`).toBe(true);
  });

  it("hides setup, agents and billing from an activity-only partner business", () => {
    expect(hrefs("invoice", activityOnly)).not.toContain("/workspace/billing");
    expect(titles("front desk", activityOnly)).toEqual([]);
    expect(hrefs("voice", activityOnly).filter((href) => href.startsWith("/agents"))).toEqual([]);
    expect(hrefs("knowledge", activityOnly)).toEqual([]);
  });

  it("keeps an activity-only business's activity pages, own account and partner billing", () => {
    expect(titles("inbox", activityOnly)).toContain("Inbox");
    expect(titles("password", activityOnly)).toContain("Profile and security");
    expect(titles("minutes", activityOnly)).toContain("Usage");
    expect(hrefs("billing", activityOnly)).toContain("/workspace/subscription");
  });

  it("gives full partner access its setup, and no billing, API keys or MCP", () => {
    expect(hrefs("knowledge", fullPartnerAccess)).toContain("/workspace/knowledge");
    expect(titles("front desk", fullPartnerAccess)).toContain("Front desk");
    expect(hrefs("invoice", fullPartnerAccess)).not.toContain("/workspace/billing");
    for (const query of ["api", "mcp", "webhook", "token"]) {
      expect(hrefs(query, fullPartnerAccess)).not.toContain("/workspace/api-keys");
      expect(hrefs(query, fullPartnerAccess)).not.toContain("/workspace/webhooks");
    }
  });

  it("gives a direct viewer every page but a partner's", () => {
    expect(hrefs("invoice", directViewer)).toContain("/workspace/billing");
    expect(hrefs("api", directViewer)).toContain("/workspace/api-keys");
    expect(hrefs("billing", directViewer)).not.toContain("/workspace/subscription");
    expect(hrefs("team", directViewer)).not.toContain("/workspace/partner-access");
  });

  it("gives a partner member the business's setup, and none of its billing", () => {
    expect(titles("after hours", partnerMember)).toContain("After hours");
    expect(hrefs("billing", partnerMember)).not.toContain("/workspace/subscription");
    expect(hrefs("invoice", partnerMember)).not.toContain("/workspace/billing");
    expect(hrefs("api", partnerMember)).not.toContain("/workspace/api-keys");
  });

  it("lists only routes the access table knows", () => {
    for (const entry of searchCatalog(t, agents)) expect(pageCapability(entry.href), entry.href).toBeTruthy();
  });
});
