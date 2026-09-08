import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { businesses, businessMemberships, calls, createDatabaseClient, storageObjects, users, withBusinessTransaction } from "@lobbystack/db";
import { completeCall, getCallDetail, listCalls, persistCallRecording, startCall, upsertTranscript } from "@lobbystack/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testStorage() {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async createUpload(input: { key: string; contentType: string; length: number }) { return { url: `https://storage.invalid/${encodeURIComponent(input.key)}` }; },
    async headObject(input: { key: string }) { const body = objects.get(input.key); return body ? { length: body.byteLength, contentType: "audio/wav" } : null; },
    async deleteObject(input: { key: string }) { objects.delete(input.key); },
    async createDownloadUrl(input: { key: string }) { return `https://storage.invalid/${encodeURIComponent(input.key)}`; },
    async putObject(input: { key: string; body: Uint8Array }) { objects.set(input.key, input.body); },
  };
}

async function main(): Promise<void> {
  const auth = createDatabaseClient("lobbystack_auth");
  const worker = createDatabaseClient("lobbystack_worker");
  const app = createDatabaseClient("lobbystack_app");
  const userId = randomUUID();
  const businessId = randomUUID();
  const foreignBusinessId = randomUUID();
  const storage = testStorage();

  try {
    await auth.db.insert(users).values({ id: userId, email: `${userId}@call-detail.invalid`, normalizedEmail: `${userId}@call-detail.invalid` });
    for (const id of [businessId, foreignBusinessId]) {
      await withBusinessTransaction(worker.db, { businessId: id, actorType: "worker" }, async (tx) => {
        await tx.insert(businesses).values({ id, slug: `call-detail-${id}`, name: "Call detail certification", timezone: "UTC", businessType: "service_company" });
        await tx.insert(businessMemberships).values({ businessId: id, userId, role: "business_owner", status: "active" });
      });
    }

    const created = await startCall({ db: worker.db }, { businessId, provider: "certification", providerCallId: `call-${userId}`, from: "+14165550100", to: "+14165550199", transport: "voice", billable: false });
    const missing = await getCallDetail({ db: app.db }, { userId, businessId, callId: created.callId });
    assert(missing?.recording.state === "missing", "A call without a recording was not reported as missing.");
    const list = await listCalls({ db: app.db }, { userId, businessId });
    assert(list.calls.find(call => call.id === created.callId)?.recordingState === "pending", "Main list pending state was lost while restoring the detail unavailable state.");

    const pendingCall = await startCall({ db: worker.db }, { businessId, provider: "certification", providerCallId: `pending-${userId}`, from: "+14165550102", to: "+14165550199", transport: "voice", billable: false });
    const pendingObjectId = randomUUID();
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
      await tx.insert(storageObjects).values({ id: pendingObjectId, businessId, objectKey: `${businessId}/recording/pending.wav`, purpose: "recording", fileName: "pending.wav", contentType: "audio/wav", contentLength: 0, status: "pending", retentionUntil: new Date(Date.now() + 90 * 24 * 60 * 60_000) });
      await tx.update(calls).set({ recordingObjectId: pendingObjectId, updatedAt: new Date() }).where(and(eq(calls.id, pendingCall.callId), eq(calls.businessId, businessId)));
    });
    const pending = await getCallDetail({ db: app.db }, { userId, businessId, callId: pendingCall.callId });
    assert(pending?.recording.state === "pending", "Pending recording state was not reported.");

    await upsertTranscript({ db: worker.db }, { businessId, callId: created.callId, sequence: 1, speaker: "caller", text: "I need an appointment.", final: true });
    await completeCall({ db: worker.db }, { businessId, callId: created.callId, status: "completed", endedAt: new Date().toISOString(), disposition: "appointment_request", providerDurationSeconds: 42 });
    const recordingId = await persistCallRecording({ db: worker.db }, { businessId, callId: created.callId, durationMs: 42_000, contentType: "audio/wav", body: new TextEncoder().encode("recording") }, storage);
    const available = await getCallDetail({ db: app.db }, { userId, businessId, callId: created.callId });
    assert(available?.recording.state === "available" && available.recording.objectId === recordingId && available.transcript.length === 1, "Available recording or transcript detail was not returned.");

    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
      await tx.update(storageObjects).set({ retentionUntil: new Date(Date.now() - 1_000) }).where(and(eq(storageObjects.id, recordingId), eq(storageObjects.businessId, businessId)));
    });
    const expired = await getCallDetail({ db: app.db }, { userId, businessId, callId: created.callId });
    assert(expired?.recording.state === "expired", "Expired recording retention was not reported.");

    const foreignView = await getCallDetail({ db: app.db }, { userId, businessId: foreignBusinessId, callId: created.callId });
    assert(foreignView === null, "A cross-tenant call ID did not resolve to not found.");

    console.log(JSON.stringify({ missingRecording: true, pendingRecording: true, transcriptAndOutcome: true, signedRecordingState: true, expiredRecording: true, crossTenantNotFound: true }));
  } finally {
    for (const id of [businessId, foreignBusinessId]) await withBusinessTransaction(worker.db, { businessId: id, actorType: "worker" }, async (tx) => tx.delete(businesses).where(eq(businesses.id, id))).catch(() => undefined);
    await auth.db.delete(users).where(eq(users.id, userId)).catch(() => undefined);
    await Promise.all([auth.pool.end(), worker.pool.end(), app.pool.end()]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
