import { and, desc, eq, gt, inArray, isNull, like, lte, or, sql, type SQL } from "drizzle-orm";

import { businesses, businessNotificationReads, businessNotifications, enqueueOutbox, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import {
  BUSINESS_NOTIFICATION_RULES,
  BUSINESS_NOTIFICATION_UPDATE_LIMIT,
  isBusinessNotificationKind,
  orderBusinessNotifications,
  type BusinessNotificationItem,
  type BusinessNotificationKind,
  type ProductUpdateEntry,
} from "@lobbystack/shared";

import { hasMinimumRole } from "../authz";
import type { BusinessAccess } from "./businessAccess";
import type { DomainContext } from "./context";

// The dashboard's notification bell (migration 0209). Producers post a
// notification in the transaction where they detect its condition, with a
// key that names the condition, and resolve it where the condition clears.
// Posting a key that's already open changes nothing, so a producer that runs
// every few minutes can post on each run. Who sees a row, and its copy, come
// from BUSINESS_NOTIFICATION_RULES in @lobbystack/shared and the dashboard.

export type PostBusinessNotificationInput = {
  businessId: string;
  kind: BusinessNotificationKind;
  /** Names the condition, such as calendar_sync:<connection id>. One row per business and key. */
  key: string;
  /** What the dashboard's copy fills in, such as a page count or a phone number. Never message content. */
  params?: Record<string, unknown>;
  /** Overrides the kind's page, such as a product update's changelog address. */
  href?: string | null;
  /** Only this person sees it. */
  recipientUserId?: string | null;
  /** Past this time it stops showing. */
  expiresAt?: Date | null;
  now?: Date;
};

/**
 * Posts a notification, or opens again one whose condition had cleared or
 * whose time ran out, as unread. Returns its id, or null when the same
 * condition is still open and nothing changed.
 */
export async function postBusinessNotificationInTransaction(tx: DatabaseTransaction, input: PostBusinessNotificationInput): Promise<string | null> {
  const now = input.now ?? new Date();
  const rule = BUSINESS_NOTIFICATION_RULES[input.kind];
  const values = {
    kind: input.kind,
    category: rule.category,
    recipientUserId: input.recipientUserId ?? null,
    params: input.params ?? {},
    href: input.href ?? null,
    occurredAt: now,
    resolvedAt: null,
    expiresAt: input.expiresAt ?? null,
    updatedAt: now,
  };
  return await guarded(tx, "post", async (inner) => {
    const [row] = await inner.insert(businessNotifications)
      .values({ businessId: input.businessId, dedupeKey: input.key.slice(0, 255), ...values, createdAt: now })
      .onConflictDoUpdate({
        target: [businessNotifications.businessId, businessNotifications.dedupeKey],
        set: values,
        setWhere: or(sql`${businessNotifications.resolvedAt} IS NOT NULL`, lte(businessNotifications.expiresAt, now))!,
      })
      .returning({ id: businessNotifications.id });
    if (!row) return null;
    // The open dashboards refetch their list.
    await enqueueOutbox(inner, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "business_notification",
      aggregateId: row.id,
      dedupeKey: `business-notification:${row.id}:posted:${now.getTime()}`,
      payload: { type: "notification.posted", entityId: row.id },
    });
    return row.id;
  });
}

export type ResolveBusinessNotificationsInput = {
  businessId: string;
  /** The conditions that cleared, by key. */
  keys?: readonly string[];
  /** Or every open notification of these kinds, optionally only the keys starting with keyPrefix. */
  kinds?: readonly BusinessNotificationKind[];
  keyPrefix?: string;
  now?: Date;
};

/** Marks open notifications resolved, so they leave the panel. Returns how many it resolved. */
export async function resolveBusinessNotificationsInTransaction(tx: DatabaseTransaction, input: ResolveBusinessNotificationsInput): Promise<number> {
  const matches: SQL[] = [];
  if (input.keys?.length) matches.push(inArray(businessNotifications.dedupeKey, [...input.keys]));
  if (input.kinds?.length) {
    const ofKind = inArray(businessNotifications.kind, [...input.kinds]);
    matches.push(input.keyPrefix ? and(ofKind, like(businessNotifications.dedupeKey, `${input.keyPrefix.replace(/[\\%_]/g, "\\$&")}%`))! : ofKind);
  }
  if (!matches.length) return 0;
  const now = input.now ?? new Date();
  const resolved = await guarded(tx, "resolve", async (inner) => await inner.update(businessNotifications)
    .set({ resolvedAt: now, updatedAt: now })
    .where(and(eq(businessNotifications.businessId, input.businessId), isNull(businessNotifications.resolvedAt), or(...matches)))
    .returning({ id: businessNotifications.id }));
  return resolved?.length ?? 0;
}

/**
 * Runs a bell write in a savepoint of the producer's transaction. A bell
 * write that fails, such as one refused by row-level security in a context
 * this module didn't expect, is logged and dropped, so it never undoes the
 * work that detected the condition.
 */
async function guarded<T>(tx: DatabaseTransaction, operation: string, run: (inner: DatabaseTransaction) => Promise<T>): Promise<T | null> {
  try {
    return await tx.transaction(async (inner) => await run(inner as DatabaseTransaction));
  } catch (error) {
    console.error(`[notifications] ${operation} failed`, error instanceof Error ? error.message : "unknown");
    return null;
  }
}

/** The person's reach in the business: their role and what it lets them do, as requireBusinessAccess returns them. */
export type NotificationReader = Pick<BusinessAccess, "role" | "can">;

/** Whether this person sees notifications of this kind. */
export function readerSeesNotification(reader: NotificationReader, kind: BusinessNotificationKind): boolean {
  const rule = BUSINESS_NOTIFICATION_RULES[kind];
  return reader.can(rule.capability) && hasMinimumRole(reader.role, rule.minimumRole);
}

/** The rows a person may list: the business's, for them or for everyone, of kinds they see, still showing. */
async function visibleRows(tx: DatabaseTransaction, input: { userId: string; businessId: string; reader: NotificationReader; now: Date }) {
  const kinds = Object.keys(BUSINESS_NOTIFICATION_RULES).filter((kind) => readerSeesNotification(input.reader, kind as BusinessNotificationKind));
  if (!kinds.length) return [];
  const showing = and(
    eq(businessNotifications.businessId, input.businessId),
    inArray(businessNotifications.kind, kinds),
    or(isNull(businessNotifications.recipientUserId), eq(businessNotifications.recipientUserId, input.userId)),
    isNull(businessNotifications.resolvedAt),
    or(isNull(businessNotifications.expiresAt), gt(businessNotifications.expiresAt, input.now)),
  );
  const columns = {
    id: businessNotifications.id,
    kind: businessNotifications.kind,
    category: businessNotifications.category,
    params: businessNotifications.params,
    href: businessNotifications.href,
    occurredAt: businessNotifications.occurredAt,
    readAt: businessNotificationReads.readAt,
  };
  const read = and(eq(businessNotificationReads.notificationId, businessNotifications.id), eq(businessNotificationReads.userId, input.userId));
  // Every open action item, however old, and the latest updates.
  const [actions, updates] = await Promise.all([
    tx.select(columns).from(businessNotifications).leftJoin(businessNotificationReads, read).where(and(showing, eq(businessNotifications.category, "action"))).orderBy(desc(businessNotifications.occurredAt)),
    tx.select(columns).from(businessNotifications).leftJoin(businessNotificationReads, read).where(and(showing, eq(businessNotifications.category, "update"))).orderBy(desc(businessNotifications.occurredAt)).limit(BUSINESS_NOTIFICATION_UPDATE_LIMIT),
  ]);
  return [...actions, ...updates];
}

/** The notifications the person sees in the business, action required first, each with whether they've read it since it last happened. */
export async function listBusinessNotifications(context: DomainContext, input: { userId: string; businessId: string; reader: NotificationReader; now?: Date }): Promise<BusinessNotificationItem[]> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    const rows = await visibleRows(tx, { ...input, now });
    const items = rows.flatMap((row): BusinessNotificationItem[] => {
      if (!isBusinessNotificationKind(row.kind)) return [];
      return [{
        id: row.id,
        kind: row.kind,
        category: row.category === "action" ? "action" : "update",
        params: row.params ?? {},
        href: row.href ?? BUSINESS_NOTIFICATION_RULES[row.kind].href,
        occurredAt: row.occurredAt.toISOString(),
        read: Boolean(row.readAt && row.readAt >= row.occurredAt),
      }];
    });
    return orderBusinessNotifications(items);
  });
}

/**
 * Marks notifications read for the person: the ones named, or with `all`
 * every one they see. Ids they can't see change nothing. Returns how many it
 * marked.
 */
export async function markBusinessNotificationsRead(context: DomainContext, input: { userId: string; businessId: string; reader: NotificationReader; ids?: readonly string[]; all?: boolean; now?: Date }): Promise<number> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    const visible = await visibleRows(tx, { ...input, now });
    const wanted = input.all ? visible : visible.filter((row) => input.ids?.includes(row.id));
    if (!wanted.length) return 0;
    await tx.insert(businessNotificationReads)
      .values(wanted.map((row) => ({ notificationId: row.id, userId: input.userId, businessId: input.businessId, readAt: now })))
      .onConflictDoUpdate({ target: [businessNotificationReads.notificationId, businessNotificationReads.userId], set: { readAt: now } });
    return wanted.length;
  });
}

/** How long a product update stays in the panel after its release. */
export const PRODUCT_UPDATE_DAYS = 90;

/**
 * Posts the business an update for each released changelog entry marked
 * notify: true, once per entry, keyed by its slug. A business gets the
 * entries released since the day it was created, up to PRODUCT_UPDATE_DAYS
 * old. A partner's business gets none: its team sees the partner's brand,
 * not the host's changelog, and so does a self-hosted one. Returns the
 * slugs it posted.
 */
export async function postProductUpdatesInTransaction(tx: DatabaseTransaction, input: { businessId: string; entries: readonly ProductUpdateEntry[]; now?: Date }): Promise<string[]> {
  const now = input.now ?? new Date();
  const [business] = await tx.select({ partnerId: businesses.partnerId, createdAt: businesses.createdAt, deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  if (!business || business.partnerId || business.deploymentMode.startsWith("self_hosted")) return [];
  const createdDay = new Date(Date.UTC(business.createdAt.getUTCFullYear(), business.createdAt.getUTCMonth(), business.createdAt.getUTCDate()));
  const posted: string[] = [];
  for (const entry of input.entries) {
    const released = new Date(entry.pubDate);
    const expiresAt = new Date(released.getTime() + PRODUCT_UPDATE_DAYS * 86_400_000);
    if (Number.isNaN(released.getTime()) || released > now || released < createdDay || expiresAt <= now) continue;
    const id = await postBusinessNotificationInTransaction(tx, {
      businessId: input.businessId,
      kind: "product_update",
      key: `product_update:${entry.slug}`,
      params: { slug: entry.slug, copy: entry.copy },
      href: entry.dashboardHref,
      expiresAt,
      now,
    });
    if (id) posted.push(entry.slug);
  }
  return posted;
}

/** postProductUpdatesInTransaction in a transaction of its own, as the worker's hourly job runs it. */
export async function postProductUpdates(context: DomainContext, input: { businessId: string; entries: readonly ProductUpdateEntry[]; now?: Date }): Promise<string[]> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await postProductUpdatesInTransaction(tx, input));
}

export { PRODUCT_UPDATE_ENTRIES } from "./productUpdates.generated";
