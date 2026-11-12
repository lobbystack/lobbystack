import { and, asc, count, eq, gt, isNull, lt, ne, type SQL } from "drizzle-orm";

import { businesses, closures, enqueueOutbox, staff, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin } from "../authz";
import { MAX_CLOSURES, normalizeClosures } from "../hours";
import type { DomainContext } from "./context";

/**
 * Time off on the appointments calendar: the business's closures (no staff
 * member) and employees' time off, both rows in `closures`, which booking
 * already treats as busy. The hours editor and the employee editor change the
 * same rows. `name` is the closure's reason, which the agent can read for the
 * business's closures; `note` is staff-only and never leaves the dashboard.
 */
export type TimeOffEntry = { id: string; staffId: string | null; staffName: string | null; startsAt: Date; endsAt: Date; name: string; note: string | null };

export const MAX_TIME_OFF_NOTE_LENGTH = 500;

const invalid = (message: string, code = "time_off_invalid") => Object.assign(new Error(message), { status: 400, code });

/** Time off that overlaps [from, to), with each employee's name. */
export async function listTimeOffBetween(tx: DatabaseTransaction, businessId: string, from: Date, to: Date): Promise<TimeOffEntry[]> {
  return await tx.select({ id: closures.id, staffId: closures.staffId, staffName: staff.name, startsAt: closures.startsAt, endsAt: closures.endsAt, name: closures.reason, note: closures.note })
    .from(closures)
    .leftJoin(staff, and(eq(staff.id, closures.staffId), eq(staff.businessId, closures.businessId)))
    .where(and(eq(closures.businessId, businessId), lt(closures.startsAt, to), gt(closures.endsAt, from)))
    .orderBy(asc(closures.startsAt), asc(closures.id));
}

type TimeOffFields = {
  /** Null closes the whole business. */
  staffId: string | null;
  /** Local times in the business's timezone, such as 2026-12-25T00:00. */
  startsAt: string;
  endsAt: string;
  name: string;
  note?: string | null | undefined;
};

/**
 * Adds time off, or changes it with `id`. It follows the closures' rules: it
 * must end after it starts, not be over already, end within two years, and
 * not overlap other time off for the same business or employee. Takes the
 * admin role, like the hours and employee editors.
 */
export async function saveTimeOff(context: DomainContext, input: { userId: string; businessId: string; id?: string | undefined } & TimeOffFields): Promise<TimeOffEntry | null> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    // Locked like the hours editor's save, so two saves can't both pass the overlap check.
    const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1).for("update");
    if (!business) throw Object.assign(new Error("Business not found."), { status: 404 });
    const name = input.name.trim();
    if (!name) throw invalid("Name the time off.", "time_off_name_required");
    const note = input.note?.trim() || null;
    if (note && note.length > MAX_TIME_OFF_NOTE_LENGTH) throw invalid(`A reason can be up to ${MAX_TIME_OFF_NOTE_LENGTH} characters.`);
    if (input.staffId) {
      const [employee] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.businessId, input.businessId), eq(staff.id, input.staffId), eq(staff.isEmployee, true), eq(staff.active, true))).limit(1);
      if (!employee) throw Object.assign(new Error("Employee not found."), { status: 404, code: "not_found" });
    }
    const [window] = normalizeClosures([{ startsAt: input.startsAt, endsAt: input.endsAt, reason: name }], business.timezone, new Date());
    const scope = and(eq(closures.businessId, input.businessId), input.staffId ? eq(closures.staffId, input.staffId) : isNull(closures.staffId), ...(input.id ? [ne(closures.id, input.id)] : []) as SQL[]);
    const [overlap] = await tx.select({ id: closures.id }).from(closures).where(and(scope, lt(closures.startsAt, window!.endsAt), gt(closures.endsAt, window!.startsAt))).limit(1);
    if (overlap) throw invalid("This time off overlaps other time off.", "time_off_overlap");
    if (!input.id) {
      const [existing] = await tx.select({ total: count() }).from(closures).where(scope);
      if (Number(existing?.total ?? 0) >= MAX_CLOSURES) throw invalid(`There can be up to ${MAX_CLOSURES} time off entries.`);
    }
    const values = { staffId: input.staffId, startsAt: window!.startsAt, endsAt: window!.endsAt, reason: name, note };
    const [saved] = input.id
      ? await tx.update(closures).set({ ...values, updatedAt: new Date() }).where(and(eq(closures.businessId, input.businessId), eq(closures.id, input.id))).returning({ id: closures.id })
      : await tx.insert(closures).values({ businessId: input.businessId, ...values }).returning({ id: closures.id });
    if (!saved) return null;
    await refreshSnapshot(tx, input.businessId, saved.id);
    const [entry] = await listTimeOffById(tx, input.businessId, saved.id);
    return entry ?? null;
  });
}

/** Removes time off. Returns false when it isn't the business's. */
export async function deleteTimeOff(context: DomainContext, input: { userId: string; businessId: string; id: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [deleted] = await tx.delete(closures).where(and(eq(closures.businessId, input.businessId), eq(closures.id, input.id))).returning({ id: closures.id });
    if (!deleted) return false;
    await refreshSnapshot(tx, input.businessId, deleted.id);
    return true;
  });
}

async function listTimeOffById(tx: DatabaseTransaction, businessId: string, id: string) {
  return await tx.select({ id: closures.id, staffId: closures.staffId, staffName: staff.name, startsAt: closures.startsAt, endsAt: closures.endsAt, name: closures.reason, note: closures.note })
    .from(closures)
    .leftJoin(staff, and(eq(staff.id, closures.staffId), eq(staff.businessId, closures.businessId)))
    .where(and(eq(closures.businessId, businessId), eq(closures.id, id)));
}

// The agent's snapshot lists the closures, so it's rebuilt after each change.
async function refreshSnapshot(tx: DatabaseTransaction, businessId: string, closureId: string) {
  await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId, aggregateType: "closure", aggregateId: closureId, dedupeKey: `closure:${closureId}:snapshot:${Date.now()}`, payload: { businessId, reason: "time_off_updated" } });
}
