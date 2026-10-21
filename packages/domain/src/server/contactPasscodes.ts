import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";

import { auditLogs, contactPasscodes, contacts, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { CONTACT_PASSCODE_LOCK_ATTEMPTS, isContactPasscode, isGuessableContactPasscode } from "@lobbystack/shared";

import { requireBusinessAdmin } from "../authz";
import type { DomainContext } from "./context";
import { verificationCodeSecret } from "./verificationCode";

// A contact's keypad PIN, which callers type to change appointments when the
// business's verification mode is passcode_required. The worker checks it; the
// dashboard and the v1 API set and remove it.

const PASSCODE_HASH_PREFIX = "scrypt-v1:";

/**
 * Salted scrypt of a PIN, with the same cost as admin passwords and on the
 * libuv thread pool so a check doesn't stall the worker's calls. The server
 * secret goes into the input, so a leaked database alone doesn't give PINs
 * away, and the contact id ties a hash to its contact.
 */
function passcodeKey(contactId: string, passcode: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(`${verificationCodeSecret()}:contact-passcode:${contactId}:${passcode}`, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

async function hashContactPasscode(contactId: string, passcode: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `${PASSCODE_HASH_PREFIX}${salt}:${(await passcodeKey(contactId, passcode, salt)).toString("hex")}`;
}

/**
 * PINs that bulk changes hash at once across the whole process, however many
 * run together, so the rest of the thread pool stays free for other requests.
 */
const BULK_HASH_CONCURRENCY = 2;
let bulkHashesRunning = 0;
const bulkHashWaiting: Array<() => void> = [];

async function withBulkHashSlot<T>(run: () => Promise<T>): Promise<T> {
  if (bulkHashesRunning < BULK_HASH_CONCURRENCY) bulkHashesRunning += 1;
  else await new Promise<void>((resolve) => bulkHashWaiting.push(resolve));
  try {
    return await run();
  } finally {
    // The slot passes straight to the next waiting hash, if any.
    const next = bulkHashWaiting.shift();
    if (next) next();
    else bulkHashesRunning -= 1;
  }
}

/** A caller already has as many PINs waiting for a hash as it may. */
export class ContactPasscodeHashesBusyError extends Error {
  constructor() {
    super("This caller is already hashing as many PINs as it may at once.");
    this.name = "ContactPasscodeHashesBusyError";
  }
}

// PINs each caller has waiting for or in a hash, for the per-caller cap.
const bulkHashesByCaller = new Map<string, number>();

/**
 * Hashes many contacts' PINs, in the order given. Each hash takes about a
 * tenth of a second, so bulk changes hash before their write transaction.
 * With a caller, refuses with ContactPasscodeHashesBusyError, before any
 * hash, when its PINs already waiting plus these would pass callerLimit, so
 * one caller's requests can't fill the queue the whole process shares.
 */
export async function hashContactPasscodes(entries: ReadonlyArray<{ contactId: string; passcode: string }>, options: { caller?: string; callerLimit?: number } = {}): Promise<string[]> {
  const { caller, callerLimit = Infinity } = options;
  if (caller === undefined) return await Promise.all(entries.map((entry) => withBulkHashSlot(() => hashContactPasscode(entry.contactId, entry.passcode))));
  const waiting = bulkHashesByCaller.get(caller) ?? 0;
  if (waiting + entries.length > callerLimit) throw new ContactPasscodeHashesBusyError();
  bulkHashesByCaller.set(caller, waiting + entries.length);
  try {
    return await Promise.all(entries.map((entry) => withBulkHashSlot(() => hashContactPasscode(entry.contactId, entry.passcode))));
  } finally {
    const left = (bulkHashesByCaller.get(caller) ?? entries.length) - entries.length;
    if (left > 0) bulkHashesByCaller.set(caller, left);
    else bulkHashesByCaller.delete(caller);
  }
}

/**
 * Saves PIN hashes for contacts the caller checked, which also clears a lock.
 * With replace false, a contact that has a PIN keeps it. Returns the contacts
 * whose PIN was saved.
 */
export async function saveContactPasscodesInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; hashes: ReadonlyArray<{ contactId: string; passcodeHash: string }>; replace: boolean; now: Date },
): Promise<string[]> {
  if (!input.hashes.length) return [];
  const fresh = { failedAttempts: 0, lockedAt: null, setAt: input.now, updatedAt: input.now };
  const insert = tx.insert(contactPasscodes).values(input.hashes.map((entry) => ({ contactId: entry.contactId, businessId: input.businessId, passcodeHash: entry.passcodeHash, ...fresh })));
  const saved = input.replace
    ? await insert.onConflictDoUpdate({ target: contactPasscodes.contactId, set: { passcodeHash: sql`excluded.passcode_hash`, ...fresh } }).returning({ contactId: contactPasscodes.contactId })
    : await insert.onConflictDoNothing({ target: contactPasscodes.contactId }).returning({ contactId: contactPasscodes.contactId });
  return saved.map((row) => row.contactId);
}

/** Removes the PINs of contacts the caller checked. Returns the contacts that had one. */
export async function removeContactPasscodesInTransaction(tx: DatabaseTransaction, input: { businessId: string; contactIds: readonly string[] }): Promise<string[]> {
  if (!input.contactIds.length) return [];
  const removed = await tx.delete(contactPasscodes).where(and(eq(contactPasscodes.businessId, input.businessId), inArray(contactPasscodes.contactId, [...input.contactIds]))).returning({ contactId: contactPasscodes.contactId });
  return removed.map((row) => row.contactId);
}

async function matchesContactPasscode(storedHash: string, contactId: string, passcode: string): Promise<boolean> {
  if (!storedHash.startsWith(PASSCODE_HASH_PREFIX)) return false;
  const parts = storedHash.slice(PASSCODE_HASH_PREFIX.length).split(":");
  if (parts.length !== 2) return false;
  const [salt, key] = parts as [string, string];
  const actual = await passcodeKey(contactId, passcode, salt);
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Whether a contact has a PIN, when it was set, and whether wrong tries locked it. */
export type ContactPasscodeStatus = { setAt: string; locked: boolean } | null;

export async function contactPasscodeStatusInTransaction(tx: DatabaseTransaction, input: { businessId: string; contactId: string }): Promise<ContactPasscodeStatus> {
  const row = (await tx.select({ setAt: contactPasscodes.setAt, lockedAt: contactPasscodes.lockedAt }).from(contactPasscodes).where(and(eq(contactPasscodes.contactId, input.contactId), eq(contactPasscodes.businessId, input.businessId))).limit(1))[0];
  return row ? { setAt: row.setAt.toISOString(), locked: row.lockedAt !== null } : null;
}

/**
 * Sets or replaces a contact's PIN, which also clears a lock. Returns null when
 * the business has no such contact.
 */
export async function setContactPasscode(
  context: DomainContext,
  input: { userId: string; businessId: string; contactId: string; passcode: string },
): Promise<ContactPasscodeStatus> {
  if (!isContactPasscode(input.passcode)) throw Object.assign(new Error("The PIN must be 4 to 8 digits."), { status: 400, code: "invalid_passcode" });
  if (isGuessableContactPasscode(input.passcode)) throw Object.assign(new Error("The PIN is too easy to guess: avoid one digit repeated or digits in a row."), { status: 400, code: "guessable_passcode" });
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const contact = (await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId))).limit(1))[0];
    if (!contact) return null;
    const now = new Date();
    await saveContactPasscodesInTransaction(tx, { businessId: input.businessId, hashes: [{ contactId: contact.id, passcodeHash: await hashContactPasscode(contact.id, input.passcode) }], replace: true, now });
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "contact.passcode_set", entityType: "contact", entityId: contact.id });
    return { setAt: now.toISOString(), locked: false };
  });
}

/** Removes a contact's PIN. Returns false when the business has no such contact. */
export async function removeContactPasscode(
  context: DomainContext,
  input: { userId: string; businessId: string; contactId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const contact = (await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId))).limit(1))[0];
    if (!contact) return false;
    const removed = await removeContactPasscodesInTransaction(tx, { businessId: input.businessId, contactIds: [contact.id] });
    if (removed.length) await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "contact.passcode_removed", entityType: "contact", entityId: contact.id });
    return true;
  });
}

/**
 * Checks a PIN a caller typed. A match resets the count of wrong PINs; the
 * CONTACT_PASSCODE_LOCK_ATTEMPTS-th wrong one in a row locks the PIN, and a
 * locked PIN is refused without being compared.
 */
export async function checkContactPasscodeInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; contactId: string; passcode: string },
): Promise<{ status: "accepted" | "rejected" | "missing" } | { status: "locked"; justLocked: boolean }> {
  const where = and(eq(contactPasscodes.contactId, input.contactId), eq(contactPasscodes.businessId, input.businessId));
  const row = (await tx.select({ passcodeHash: contactPasscodes.passcodeHash, failedAttempts: contactPasscodes.failedAttempts, lockedAt: contactPasscodes.lockedAt }).from(contactPasscodes).where(where).limit(1).for("update"))[0];
  if (!row) return { status: "missing" };
  if (row.lockedAt) return { status: "locked", justLocked: false };
  const now = new Date();
  if (await matchesContactPasscode(row.passcodeHash, input.contactId, input.passcode)) {
    if (row.failedAttempts > 0) await tx.update(contactPasscodes).set({ failedAttempts: 0, updatedAt: now }).where(where);
    return { status: "accepted" };
  }
  const failedAttempts = row.failedAttempts + 1;
  const locked = failedAttempts >= CONTACT_PASSCODE_LOCK_ATTEMPTS;
  await tx.update(contactPasscodes).set({ failedAttempts, ...(locked ? { lockedAt: now } : {}), updatedAt: now }).where(where);
  return locked ? { status: "locked", justLocked: true } : { status: "rejected" };
}

/** Whether the contact has a PIN that isn't locked, read inside the caller's transaction. */
export async function contactPasscodeUsableInTransaction(tx: DatabaseTransaction, input: { businessId: string; contactId: string }): Promise<"usable" | "missing" | "locked"> {
  const status = await contactPasscodeStatusInTransaction(tx, input);
  return !status ? "missing" : status.locked ? "locked" : "usable";
}
