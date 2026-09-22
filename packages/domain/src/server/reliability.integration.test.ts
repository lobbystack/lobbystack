import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { businessHours, calls, conversations, messages, storageObjects, transcripts } from "@lobbystack/db";
import { affiliateCommissions, affiliatePayoutItems, affiliateProfiles, billingTransactions, appointments, auditLogs, businessMemberships, contacts, services, staff, users, businesses, notifications, outboxMessages, withBusinessTransaction, claimOutboxBatch, createDatabaseClient, enqueueOutbox, markOutboxFailed, markOutboxPublished, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { generateAffiliatePayoutRun } from "./affiliates";
import { bookAppointment, cancelAppointment } from "./booking";
import { runPrivacyRetentionSweep } from "./privacy";
import { EXPIRED_UPLOAD_STATUS, deleteExpiredObjectsForBusiness } from "./storage";
import { completeCall } from "./voice";
import { claimNotificationDelivery, releaseNotificationDelivery, rescheduleAppointmentReminderInTransaction } from "./notifications";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Reliability integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

describe.skipIf(!testUrl)("reliability against dedicated PostgreSQL roles", () => {
  it("allows only one overlapping booking after two connections wait on the same staff lock", async () => {
    const businessId = randomUUID();
    const blocker = await client!.pool.connect();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      const employeeId = randomUUID();
      const serviceId = randomUUID();
      await client!.db.transaction(async (tx) => {
        await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Concurrent booking test", timezone: "UTC", businessType: "test", telemetryEnabled: false });
        await tx.insert(staff).values({ id: employeeId, businessId, name: "Test", timezone: "UTC" });
        await tx.insert(services).values({ id: serviceId, businessId, name: "Test", slug: "test", durationMinutes: 30 });
        await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1440 })));
      });
      await blocker.query("begin");
      await blocker.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [employeeId]);
      pending = Promise.allSettled(["12:00", "12:15"].map((time, index) => client!.db.transaction(async (tx) => {
        await tx.execute(sql`set local role lobbystack_worker`);
        return bookAppointment({ db: tx as unknown as Database }, { businessId, serviceId, preferredStaffId: employeeId, startsAt: `2030-01-01T${time}:00Z`, timezone: "UTC", contactPhone: `+1555555010${index}`, sourceChannel: "voice" });
      })));
      // Both requests must actually reach PostgreSQL before releasing the barrier.
      await vi.waitFor(async () => {
        const result = await blocker.query("select count(*)::int as waiting from pg_locks where locktype = 'advisory' and not granted and database = (select oid from pg_database where datname = current_database())");
        expect(result.rows[0].waiting).toBe(2);
      }, { timeout: 3000 });
      await blocker.query("rollback");
      const results = await pending;
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason.message).toBe("No staff member is available for this service.");
      expect(await client!.db.select().from(appointments).where(eq(appointments.businessId, businessId))).toHaveLength(1);
      expect(await client!.db.select().from(contacts).where(eq(contacts.businessId, businessId))).toHaveLength(1);
      expect(await client!.db.select().from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "calendar.syncAppointment")))).toHaveLength(1);
    } finally {
      await blocker.query("rollback");
      blocker.release();
      await pending;
      await client!.db.delete(businesses).where(eq(businesses.id, businessId));
    }
  });

  it("certifies gated message/media scrubbing and transcript expiry under worker RLS", async () => {
    vi.stubEnv("CONTENT_RETENTION_ENABLED", "false");
    vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", JSON.stringify({ approvalId: "synthetic-local-test-only", categories: { messages: 2, transcripts: 3 }, messageMedia: "scrub_with_body" }));
    try {
      await rollbackTest(async (tx) => {
        const businessId = randomUUID();
        const conversationId = randomUUID();
        const callId = randomUUID();
        const now = new Date();
        await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Retention test", timezone: "UTC", businessType: "test" });
        await tx.insert(conversations).values({ id: conversationId, businessId, channel: "voice" });
        await tx.insert(calls).values({ id: callId, businessId, conversationId, providerCallId: randomUUID(), transport: "web", status: "completed", startedAt: now });
        const [expired] = await tx.insert(messages).values({ businessId, conversationId, direction: "inbound", channel: "sms", body: "expired", media: [{ url: "https://example.invalid/test" }], contentExpiresAt: new Date(0) }).returning();
        await tx.insert(transcripts).values([
          { businessId, callId, sequence: 1, speaker: "caller", text: "expired", expiresAt: new Date(0) },
          { businessId, callId, sequence: 2, speaker: "caller", text: "retained", expiresAt: new Date(now.getTime() + 86400000) },
        ]);
        await tx.execute(sql`set local role lobbystack_worker`);
        const context = { db: tx as unknown as Database };
        expect(await runPrivacyRetentionSweep(context, { businessId, now })).toMatchObject({ scrubbedMessages: 0, deletedTranscripts: 0 });
        vi.stubEnv("CONTENT_RETENTION_ENABLED", "true");
        expect(await runPrivacyRetentionSweep(context, { businessId, now })).toMatchObject({ scrubbedMessages: 1, deletedTranscripts: 1 });
        expect(await runPrivacyRetentionSweep(context, { businessId, now })).toMatchObject({ scrubbedMessages: 0, deletedTranscripts: 0 });
        await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (workerTx) => {
          const [message] = await workerTx.select().from(messages).where(eq(messages.id, expired!.id));
          expect(message).toMatchObject({ body: "[content expired]", media: null, contentExpiresAt: null });
          const remaining = await workerTx.select().from(transcripts).where(eq(transcripts.callId, callId));
          expect(remaining.map((row) => row.text)).toEqual(["retained"]);
        });
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not repeat operator cancellation revision, audit, or outbox effects", async () => {
    await rollbackTest(async (tx) => {
      const businessId = randomUUID();
      const userId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Reliability test", timezone: "UTC", businessType: "test", telemetryEnabled: false });
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
      await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
      const [contact] = await tx.insert(contacts).values({ businessId }).returning();
      const [employee] = await tx.insert(staff).values({ businessId, name: "Test", timezone: "UTC" }).returning();
      const [service] = await tx.insert(services).values({ businessId, name: "Test", slug: "test", durationMinutes: 30 }).returning();
      const [appointment] = await tx.insert(appointments).values({ businessId, contactId: contact!.id, staffId: employee!.id, serviceId: service!.id, startsAt: new Date("2030-01-01T12:00:00Z"), endsAt: new Date("2030-01-01T12:30:00Z"), timezone: "UTC", sourceChannel: "operator" }).returning();
      await tx.execute(sql`set local role lobbystack_app`);
      const db = tx as unknown as Database;
      const input = { businessId, userId, appointmentId: appointment!.id };
      await cancelAppointment({ db }, input);
      await cancelAppointment({ db }, input);
      await withBusinessTransaction(db, { businessId, userId, actorType: "operator" }, async (appTx) => {
        const [current] = await appTx.select().from(appointments).where(eq(appointments.id, appointment!.id));
        expect(current!.revision).toBe(appointment!.revision + 1);
        expect(current!.calendarSyncState).toBe("pending");
        expect(await appTx.select().from(auditLogs).where(and(eq(auditLogs.entityId, appointment!.id), eq(auditLogs.eventType, "appointment_change.canceled")))).toHaveLength(1);
        expect(await appTx.select().from(outboxMessages).where(and(eq(outboxMessages.aggregateId, appointment!.id), eq(outboxMessages.topic, "calendar.syncAppointment")))).toHaveLength(1);
      });
    });
  });

  it("replaces reminders transactionally, leaving queued and processing old identities inert", async () => {
    await rollbackTest(async (tx) => {
      const businessId = randomUUID();
      const appointmentId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Reliability test", timezone: "UTC", businessType: "test" });
      await tx.execute(sql`set local role lobbystack_worker`);
      const db = tx as unknown as Database;
      await withBusinessTransaction(db, { businessId, actorType: "worker" }, async (workerTx) => {
        const [old] = await workerTx.insert(notifications).values({ businessId, kind: "appointment_reminder", channel: "sms", relatedId: appointmentId, scheduledFor: new Date(0), status: "processing" }).returning();
        const startsAt = new Date(Date.now() + 4 * 86_400_000);
        await rescheduleAppointmentReminderInTransaction(workerTx, { businessId, appointmentId, startsAt, revision: 2 });
        const [current] = await workerTx.select().from(notifications).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, "appointment_reminder")));
        expect(current!.id).not.toBe(old!.id);
        expect(current!.scheduledFor.getTime()).toBe(startsAt.getTime() - 86_400_000);
        const [message] = await workerTx.select().from(outboxMessages).where(eq(outboxMessages.dedupeKey, `notification:${current!.id}:dispatch:2`));
        expect(message!.availableAt).toEqual(current!.scheduledFor);
        expect(await claimNotificationDelivery({ db }, { businessId, notificationId: old!.id })).toBe(false);
        expect(await releaseNotificationDelivery({ db }, { businessId, notificationId: old!.id })).toBe(false);
        expect(await claimNotificationDelivery({ db }, { businessId, notificationId: current!.id })).toBe(false);
        // Rescheduling inside 24 hours retires the old job without a late reminder.
        await rescheduleAppointmentReminderInTransaction(workerTx, { businessId, appointmentId, startsAt: new Date(Date.now() + 3_600_000), revision: 3 });
        expect(await workerTx.select().from(notifications).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, "appointment_reminder")))).toHaveLength(0);
        expect(await claimNotificationDelivery({ db }, { businessId, notificationId: current!.id })).toBe(false);
      });
    });
  });

  it("preserves a delivered reminder and schedules a fresh one after reschedule", async () => {
    await rollbackTest(async (tx) => {
      const businessId = randomUUID();
      const appointmentId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Delivered reminder test", timezone: "UTC", businessType: "test", telemetryEnabled: false });
      await tx.execute(sql`set local role lobbystack_worker`);
      const db = tx as unknown as Database;
      await withBusinessTransaction(db, { businessId, actorType: "worker" }, async (workerTx) => {
        const [delivered] = await workerTx.insert(notifications).values({ businessId, kind: "appointment_reminder", channel: "sms", relatedId: appointmentId, scheduledFor: new Date(0), status: "sent" }).returning();
        const startsAt = new Date(Date.now() + 5 * 86_400_000);
        await rescheduleAppointmentReminderInTransaction(workerTx, { businessId, appointmentId, startsAt, revision: 1 });
        const [preserved] = await workerTx.select().from(notifications).where(eq(notifications.id, delivered!.id));
        // The delivered row keeps its history and status; only its kind changes to free the active-reminder slot.
        expect(preserved!.kind).toBe("appointment_reminder_superseded:1");
        expect(preserved!.status).toBe("sent");
        const [replacement] = await workerTx.select().from(notifications).where(and(eq(notifications.relatedId, appointmentId), eq(notifications.kind, "appointment_reminder")));
        expect(replacement!.id).not.toBe(delivered!.id);
        expect(replacement!.status).toBe("pending");
        expect(replacement!.scheduledFor.getTime()).toBe(startsAt.getTime() - 86_400_000);
      });
    });
  });

  it("fences stale completion and failure after same-dispatcher reclaim", async () => {
    await rollbackTest(async (tx) => {
      await tx.execute(sql`set local role lobbystack_dispatcher`);
      await tx.execute(sql`select set_config('app.actor_type', 'dispatcher', true)`);
      const db = tx as unknown as Database;
      const id = await enqueueOutbox(tx, { topic: "realtime.publish", aggregateType: "test", dedupeKey: randomUUID(), payload: {}, availableAt: new Date("2000-01-01") });
      const earlierId = await enqueueOutbox(tx, { topic: "realtime.publish", aggregateType: "test", dedupeKey: randomUUID(), payload: {}, availableAt: new Date("1999-01-01") });
      const batch = await claimOutboxBatch(db, { dispatcherId: "same", limit: 1000 });
      expect(batch.findIndex((row) => row.id === earlierId)).toBeLessThan(batch.findIndex((row) => row.id === id));
      const first = batch.find((row) => row.id === id)!;
      expect(first).toBeDefined();
      const second = (await claimOutboxBatch(db, { dispatcherId: "same", limit: 1000, lockForMs: -1 })).find((row) => row.id === id)!;
      expect(second.lockedBy).not.toBe(first.lockedBy);
      expect(second.attempts).toBe(first.attempts + 1);
      expect(await markOutboxPublished(db, first)).toBe(false);
      expect(await markOutboxFailed(db, first, new Error("stale"), new Date())).toBe(false);
      const [unchanged] = await tx.select().from(outboxMessages).where(eq(outboxMessages.id, id));
      expect(unchanged!.lockedBy).toBe(second.lockedBy);
      expect(unchanged!.lastError).toBeNull();
      expect(unchanged!.publishedAt).toBeNull();
      expect(await markOutboxPublished(db, second)).toBe(true);
      expect(await markOutboxPublished(db, second)).toBe(false);
    });
  });

  it("runs payout generation with the worker role and worker RLS actor", async () => {
    await rollbackTest(async (tx) => {
      const businessId = randomUUID();
      const userId = randomUUID();
      const email = `${userId}@example.invalid`;
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Payout test", timezone: "UTC", businessType: "test" });
      await tx.insert(users).values({ id: userId, email, normalizedEmail: email });
      const [profile] = await tx.insert(affiliateProfiles).values({ userId, referralCode: randomUUID(), payoutEmail: email }).returning();
      const [payment] = await tx.insert(billingTransactions).values({ businessId, kind: "order", sourceId: randomUUID(), status: "paid", amountCents: 100_000, currency: "usd", occurredAt: new Date("1999-01-01") }).returning();
      const [commission] = await tx.insert(affiliateCommissions).values({ affiliateProfileId: profile!.id, referredBusinessId: businessId, sourceKey: randomUUID(), billingTransactionId: payment!.id, amountCents: 100_000, commissionCents: 20_000, currency: "usd", occurredAt: new Date("1999-01-01"), clearsAt: new Date("1999-02-01") }).returning();
      await tx.execute(sql`set local role lobbystack_worker`);
      const context = { db: tx as unknown as Database };
      const input = { periodKey: `test-${randomUUID().slice(0, 8)}`, createdAt: "2000-01-01T00:00:00Z" };
      const first = await generateAffiliatePayoutRun(context, input);
      const second = await generateAffiliatePayoutRun(context, input);
      expect(first.assignedCommissions).toBeGreaterThanOrEqual(1);
      expect(second.payoutRunId).toBe(first.payoutRunId);
      expect(second.assignedCommissions).toBe(0);
      expect(second.totalCents).toBe(first.totalCents);
      await withBusinessTransaction(context.db, { actorType: "worker" }, async (workerTx) => {
        const items = await workerTx.select().from(affiliatePayoutItems).where(eq(affiliatePayoutItems.affiliateProfileId, profile!.id));
        expect(items).toHaveLength(1);
        expect(items[0]!.amountCents).toBe(20_000);
        expect(items[0]!.affiliateEmail).toBe(email);
        const [assigned] = await workerTx.select().from(affiliateCommissions).where(eq(affiliateCommissions.id, commission!.id));
        expect(assigned!.payoutItemId).toBe(items[0]!.id);
      });
    });
  });

  it("serializes concurrent payout generation across periods", async () => {
    await rollbackTest(async (tx) => {
      await tx.execute(sql`set local role lobbystack_worker`);
      await generateAffiliatePayoutRun({ db: tx as unknown as Database }, { periodKey: `test-${randomUUID().slice(0, 8)}`, createdAt: "2000-01-01T00:00:00Z" });
      let failure: unknown;
      try {
        await rollbackTest(async (otherTx) => {
          await otherTx.execute(sql`set local role lobbystack_worker`);
          await otherTx.execute(sql`set local lock_timeout = '100ms'`);
          await generateAffiliatePayoutRun({ db: otherTx as unknown as Database }, { periodKey: `test-${randomUUID().slice(0, 8)}`, createdAt: "2000-01-01T00:00:00Z" });
        });
      } catch (error) {
        failure = error;
      }
      const error = failure as { code?: string; cause?: { code?: string } } | undefined;
      // 55P03 is lock_not_available, rather than a grant or constraint failure.
      expect(error?.cause?.code ?? error?.code).toBe("55P03");
    });
  });

  it("keeps a failed expired-upload deletion claimed and retryable without resurrection", async () => {
    const businessId = randomUUID();
    const objectId = randomUUID();
    const objectKey = `${businessId}/expired-upload`;
    await client!.db.transaction(async (tx) => {
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Storage sweep test", timezone: "UTC", businessType: "test" });
      await tx.insert(storageObjects).values({ id: objectId, businessId, objectKey, purpose: "attachment", fileName: "expired.txt", contentType: "text/plain", contentLength: 3, status: "pending", expiresAt: new Date(Date.now() - 60_000) });
    });
    const present = new Set([objectKey]);
    const deleted: string[] = [];
    const provider = {
      createUpload: async () => ({ url: "https://example.invalid" }),
      headObject: async ({ key }: { key: string }) => (present.has(key) ? { length: 3, contentType: "text/plain" } : null),
      deleteObject: async ({ key }: { key: string }) => { deleted.push(key); },
      createDownloadUrl: async () => "https://example.invalid",
    };
    try {
      await expect(deleteExpiredObjectsForBusiness({ db: client!.db }, { businessId }, provider)).rejects.toThrow("still present after deletion");
      const [claimed] = await client!.db.select({ status: storageObjects.status }).from(storageObjects).where(eq(storageObjects.id, objectId));
      expect(claimed!.status).toBe(EXPIRED_UPLOAD_STATUS);
      // finalizeUpload promotes only `pending`, so nothing can resurrect the claim.
      const promoted = await client!.db.update(storageObjects).set({ status: "ready" }).where(and(eq(storageObjects.id, objectId), eq(storageObjects.status, "pending"))).returning({ id: storageObjects.id });
      expect(promoted).toHaveLength(0);

      present.delete(objectKey);
      await expect(deleteExpiredObjectsForBusiness({ db: client!.db }, { businessId }, provider)).resolves.toBe(1);
      expect(await client!.db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.id, objectId))).toHaveLength(0);
      expect(deleted).toEqual([objectKey, objectKey]);
    } finally {
      await client!.db.delete(businesses).where(eq(businesses.id, businessId));
    }
  });

  it("skips expired rows another sweep already locked", async () => {
    const businessId = randomUUID();
    const keys = [`${businessId}/expired-a`, `${businessId}/expired-b`];
    await client!.db.transaction(async (tx) => {
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Storage lock test", timezone: "UTC", businessType: "test" });
      await tx.insert(storageObjects).values(keys.map((objectKey, index) => ({ id: randomUUID(), businessId, objectKey, purpose: "attachment", fileName: `expired-${index}.txt`, contentType: "text/plain", contentLength: 1, status: "pending", expiresAt: new Date(Date.now() - 60_000) })));
    });
    const blocker = await client!.pool.connect();
    const deleted: string[] = [];
    const provider = {
      createUpload: async () => ({ url: "https://example.invalid" }),
      headObject: async () => null,
      deleteObject: async ({ key }: { key: string }) => { deleted.push(key); },
      createDownloadUrl: async () => "https://example.invalid",
    };
    try {
      await blocker.query("begin");
      await blocker.query("select id from storage_objects where business_id = $1 for update", [businessId]);
      // A concurrent sweep must skip the locked rows rather than block on them.
      const sweep = deleteExpiredObjectsForBusiness({ db: client!.db }, { businessId }, provider);
      sweep.catch(() => undefined);
      const result = await Promise.race([
        sweep,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("sweep blocked instead of skipping locked rows")), 3_000)),
      ]);
      expect(result).toBe(0);
      expect(deleted).toHaveLength(0);

      await blocker.query("rollback");
      await expect(deleteExpiredObjectsForBusiness({ db: client!.db }, { businessId }, provider)).resolves.toBe(2);
      expect(deleted.sort()).toEqual([...keys].sort());
    } finally {
      await blocker.query("rollback").catch(() => undefined);
      blocker.release();
      await client!.db.delete(businesses).where(eq(businesses.id, businessId));
    }
  });

  it("retains a reconciled reservation when the provider binding changed after validation", async () => {
    await rollbackTest(async (tx) => {
      const businessId = randomUUID();
      const conversationId = randomUUID();
      const callId = randomUUID();
      await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Voice bind fence test", timezone: "UTC", businessType: "test", telemetryEnabled: false });
      await tx.insert(conversations).values({ id: conversationId, businessId, channel: "web_voice" });
      await tx.insert(calls).values({ id: callId, businessId, conversationId, providerCallId: `webcall_${callId}`, transport: "web_voice", provider: "openai_realtime", status: "started", startedAt: new Date(Date.now() - 60 * 60_000), webCallMaxDurationMs: 300_000 });
      await tx.execute(sql`set local role lobbystack_worker`);
      const db = tx as unknown as Database;
      // A late bind replaces the placeholder with the real provider call ID. It must run
      // under the worker RLS context, otherwise FORCE RLS filters the write to zero rows.
      await withBusinessTransaction(db, { businessId, actorType: "worker" }, async (workerTx) => {
        await workerTx.update(calls).set({ providerCallId: "rtc_late_bind" }).where(eq(calls.id, callId));
      });
      // Validated against the placeholder, completion must not release the reservation.
      expect(await completeCall({ db }, { businessId, callId, status: "failed", endedAt: new Date().toISOString(), disposition: "reconciled_unconsumed_attested", providerDurationSeconds: 0, mediaDurationSeconds: 0, expectedProviderCallId: `webcall_${callId}` })).toBe(false);
      const [stillOpen] = await tx.select({ endedAt: calls.endedAt }).from(calls).where(eq(calls.id, callId));
      expect(stillOpen!.endedAt).toBeNull();
      // The current binding finalizes.
      expect(await completeCall({ db }, { businessId, callId, status: "failed", endedAt: new Date().toISOString(), disposition: "reconciled_unconsumed_attested", providerDurationSeconds: 0, mediaDurationSeconds: 0, expectedProviderCallId: "rtc_late_bind" })).toBe(true);
    });
  });
});
