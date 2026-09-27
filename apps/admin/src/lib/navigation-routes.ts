// Routes of the business navigation and the receptionist drill-down, plus the
// redirects between the old navigation and the new one. Pure, so the sidebar,
// the command search, the redirects and their tests share one source.

export type ReceptionistSection = "overview" | "behavior" | "knowledge" | "booking" | "transfers" | "numbers";

export const RECEPTIONIST_SECTIONS: ReadonlyArray<ReceptionistSection> = ["overview", "behavior", "knowledge", "booking", "transfers", "numbers"];

export type NavigationReceptionist = { id: string; name: string; isDefault: boolean };

export type NavigationSnapshot = {
  businessId: string;
  businessName: string;
  /** IANA timezone the business works in; calendars use it. */
  timezone: string;
  newNavigation: boolean;
  staffEnabled: boolean;
  canManage: boolean;
  receptionists: NavigationReceptionist[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function receptionistPath(agentId: string, section: ReceptionistSection = "overview"): string {
  return section === "overview" ? `/receptionists/${agentId}` : `/receptionists/${agentId}/${section}`;
}

/** The receptionist and section a drill-down URL points at, or null for business pages. */
export function parseReceptionistPath(pathname: string): { agentId: string; section: ReceptionistSection } | null {
  const match = /^\/receptionists\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!match || !UUID.test(match[1]!)) return null;
  const section = (match[2] ?? "overview") as ReceptionistSection;
  return RECEPTIONIST_SECTIONS.includes(section) ? { agentId: match[1]!, section } : null;
}

export function isReceptionistPath(pathname: string): boolean {
  return pathname === "/receptionists" || pathname.startsWith("/receptionists/");
}

export function defaultReceptionist(receptionists: NavigationReceptionist[]): NavigationReceptionist | undefined {
  return receptionists.find((receptionist) => receptionist.isDefault) ?? receptionists[0];
}

/**
 * Where an old-navigation URL lives in the new navigation, so bookmarks and
 * links in emails keep working. Null means the page exists in both.
 */
export function legacyToNewPath(pathname: string, input: { defaultAgentId?: string | undefined; search?: string }): string | null {
  const search = input.search ?? "";
  const receptionist = (section: ReceptionistSection) => input.defaultAgentId ? receptionistPath(input.defaultAgentId, section) : "/";
  switch (pathname.replace(/\/$/, "") || "/") {
    case "/agent":
    case "/agent/basic-settings":
    case "/agent/integrations":
      return receptionist("behavior");
    case "/agent/rules":
      return receptionist("transfers");
    case "/agent/knowledge":
      return "/knowledge";
    case "/agent/services":
      return "/services";
    case "/calls":
      return `/inbox?channel=calls${search ? `&${search.replace(/^\?/, "")}` : ""}`;
    case "/messages":
      return `/inbox?channel=chats${search ? `&${search.replace(/^\?/, "")}` : ""}`;
    case "/appointments":
      return `/calendar${search}`;
    case "/settings/phone-number":
      return "/numbers";
    case "/settings/widget":
      return "/numbers#widget";
    default:
      return null;
  }
}

/** Where a new-navigation URL lives while the new navigation is off. */
export function newToLegacyPath(pathname: string): string | null {
  const receptionist = parseReceptionistPath(pathname);
  if (receptionist) {
    if (receptionist.section === "knowledge") return "/agent/knowledge";
    if (receptionist.section === "transfers") return "/agent/rules";
    if (receptionist.section === "numbers") return "/settings/phone-number";
    return "/agent";
  }
  if (isReceptionistPath(pathname)) return "/agent";
  switch (pathname.replace(/\/$/, "")) {
    case "/inbox":
      return "/calls";
    case "/calendar":
      return "/appointments";
    case "/services":
      return "/agent/services";
    case "/knowledge":
      return "/agent/knowledge";
    case "/numbers":
      return "/settings/phone-number";
    case "/staff":
      return "/agent/services";
    default:
      return null;
  }
}

export type SidebarItemKey = "home" | "inbox" | "calendar" | "contacts" | "analytics" | "services" | "staff" | "knowledge" | "numbers" | "integrations" | "settings";

export type SidebarModel = {
  daily: Array<{ key: SidebarItemKey; href: string }>;
  receptionists: {
    /** One receptionist: a single "Receptionist" link, no group label and no list. */
    single: { href: string } | null;
    list: Array<{ id: string; name: string; href: string }>;
    showNew: boolean;
  };
  business: Array<{ key: SidebarItemKey; href: string }>;
  setup: Array<{ key: SidebarItemKey; href: string }>;
};

/** What the business sidebar shows, in order of how often owners use it. */
export function buildSidebarModel(input: { receptionists: NavigationReceptionist[]; staffEnabled: boolean; canCreateReceptionists: boolean }): SidebarModel {
  const receptionists = [...input.receptionists];
  const single = receptionists.length === 1 ? { href: receptionistPath(receptionists[0]!.id) } : null;
  return {
    daily: [
      { key: "home", href: "/" },
      { key: "inbox", href: "/inbox" },
      { key: "calendar", href: "/calendar" },
      { key: "contacts", href: "/contacts" },
      { key: "analytics", href: "/analytics" },
    ],
    receptionists: {
      single,
      list: single ? [] : receptionists.map((receptionist) => ({ id: receptionist.id, name: receptionist.name, href: receptionistPath(receptionist.id) })),
      showNew: input.canCreateReceptionists,
    },
    business: [
      { key: "services", href: "/services" },
      ...(input.staffEnabled ? [{ key: "staff" as const, href: "/staff" }] : []),
      { key: "knowledge", href: "/knowledge" },
      { key: "numbers", href: "/numbers" },
    ],
    setup: [
      { key: "integrations", href: "/integrations" },
      { key: "settings", href: "/settings/usage" },
    ],
  };
}

/** Whether a sidebar link matches the current page. */
export function isSidebarItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/settings/usage") return pathname.startsWith("/settings");
  if (href === "/inbox") return pathname === "/inbox" || pathname.startsWith("/calls/");
  const base = href.split(/[?#]/)[0]!;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** The same settings page on another receptionist, so switching keeps the page. */
export function switchReceptionistPath(pathname: string, agentId: string): string {
  const current = parseReceptionistPath(pathname);
  return receptionistPath(agentId, current?.section ?? "overview");
}
