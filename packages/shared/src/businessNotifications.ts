// The dashboard's notification bell: what each kind of notification is, who on
// a business's team sees it, and the order the panel lists them in. The rows
// live in business_notifications (migration 0209); packages/domain writes them
// where each event happens, and the dashboard writes their copy from the kind
// and its params in the reader's language.

export const BUSINESS_NOTIFICATION_KINDS = [
  // Action required: listed until the condition is resolved, read or not.
  "trial_ending",
  "trial_ended",
  "trial_minutes_used_up",
  "number_released",
  "payment_failed",
  "plan_canceled",
  "minutes_80",
  "minutes_100",
  "number_purchase_failed",
  "number_release_soon",
  "calendar_sync_failing",
  "instagram_reconnect",
  "webhook_failing",
  "website_import_failed",
  // Updates.
  "website_import_finished",
  "invite_accepted",
  "product_update",
] as const;

export type BusinessNotificationKind = (typeof BUSINESS_NOTIFICATION_KINDS)[number];

export type BusinessNotificationCategory = "action" | "update";

/** The capability names of businessAccess in packages/domain, which this package doesn't depend on. */
type NotificationCapability = "activity" | "setup" | "team" | "billing" | "api_keys";

/** The roles of authzRoleSchema in packages/contracts, lowest that may see the kind. */
type NotificationMinimumRole = "viewer" | "scheduler" | "business_admin" | "business_owner";

export type BusinessNotificationRule = {
  category: BusinessNotificationCategory;
  /** What the business must let the person do to see it, as the page it opens needs. */
  capability: NotificationCapability;
  minimumRole: NotificationMinimumRole;
  /** Where the item opens, unless the row names its own. */
  href: string | null;
};

const action = (capability: NotificationCapability, href: string, minimumRole: NotificationMinimumRole = "business_admin"): BusinessNotificationRule => ({ category: "action", capability, minimumRole, href });

export const BUSINESS_NOTIFICATION_RULES: Record<BusinessNotificationKind, BusinessNotificationRule> = {
  trial_ending: action("billing", "/workspace/billing"),
  trial_ended: action("billing", "/workspace/billing"),
  trial_minutes_used_up: action("billing", "/workspace/billing"),
  number_released: action("billing", "/workspace/billing"),
  payment_failed: action("billing", "/workspace/billing"),
  plan_canceled: action("billing", "/workspace/billing"),
  // A partner's business sees its usage, without prices, on the Usage page.
  minutes_80: action("activity", "/workspace/usage"),
  minutes_100: action("activity", "/workspace/usage"),
  number_purchase_failed: action("setup", "/agents/primary/channels/phone"),
  number_release_soon: action("billing", "/workspace/billing"),
  calendar_sync_failing: action("setup", "/business/integrations"),
  instagram_reconnect: action("setup", "/business/integrations"),
  webhook_failing: action("api_keys", "/workspace/webhooks"),
  website_import_failed: action("setup", "/business/knowledge"),
  website_import_finished: { category: "update", capability: "setup", minimumRole: "business_admin", href: "/business/knowledge" },
  invite_accepted: { category: "update", capability: "team", minimumRole: "viewer", href: "/workspace/team" },
  product_update: { category: "update", capability: "activity", minimumRole: "viewer", href: null },
};

export function isBusinessNotificationKind(value: unknown): value is BusinessNotificationKind {
  return typeof value === "string" && (BUSINESS_NOTIFICATION_KINDS as readonly string[]).includes(value);
}

/** One notification as the dashboard gets it. */
export type BusinessNotificationItem = {
  id: string;
  kind: BusinessNotificationKind;
  category: BusinessNotificationCategory;
  params: Record<string, unknown>;
  href: string | null;
  /** When the condition started, or came back. */
  occurredAt: string;
  read: boolean;
};

/** Action required first, then newest first. */
export function orderBusinessNotifications<T extends Pick<BusinessNotificationItem, "category" | "occurredAt" | "id">>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.category !== b.category) return a.category === "action" ? -1 : 1;
    const time = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    return time !== 0 ? time : a.id.localeCompare(b.id);
  });
}

/** How many updates the panel lists. Open action items always show. */
export const BUSINESS_NOTIFICATION_UPDATE_LIMIT = 30;

/** A product update's copy in one interface language. */
export type ProductUpdateCopy = { title: string; description: string; href: string };

/** A changelog entry marked notify: true, with its copy in each language it has. */
export type ProductUpdateEntry = {
  slug: string;
  pubDate: string;
  /** A dashboard path to open instead of the changelog, from the entry's dashboardHref. */
  dashboardHref: string | null;
  copy: Partial<Record<"en" | "fr" | "es" | "sr", ProductUpdateCopy>> & { en: ProductUpdateCopy };
};
