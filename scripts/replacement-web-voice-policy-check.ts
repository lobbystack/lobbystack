import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { billingUsageEvents, businesses, calls, createDatabaseClient, outboxMessages, withBusinessTransaction } from "@lobbystack/db";
import { completeCall, getWebVoiceBillingAllowance, startCall } from "@lobbystack/domain";
import { closeWebVoicePolicyStore, enforceWebVoiceRateLimits } from "../apps/admin/src/lib/web-voice-policy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const database = createDatabaseClient("lobbystack_worker");
  const cloudBusinessId = randomUUID();
  const selfHostedBusinessId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const context = { db: database.db };

  try {
    for (const business of [
      { id: cloudBusinessId, slug: `policy-cloud-${suffix}`, name: "Policy Cloud", deploymentMode: "cloud" },
      { id: selfHostedBusinessId, slug: `policy-self-${suffix}`, name: "Policy Self", deploymentMode: "self_hosted_standard" },
    ]) {
      await withBusinessTransaction(database.db, { businessId: business.id, actorType: "worker" }, async (tx) => {
        await tx.insert(businesses).values({ ...business, timezone: "UTC", businessType: "service_company" });
      });
    }

    const cloud = await startCall(context, {
      businessId: cloudBusinessId,
      provider: "openai_realtime",
      providerCallId: `policy-cloud-${suffix}`,
      from: "web",
      to: `policy-cloud-${suffix}`,
      transport: "web_voice",
      billable: true,
      maxDurationMs: 300_000,
      startedAt: "2026-08-10T22:00:00.000Z",
    });
    assert(cloud.webCallMaxDurationMs === 300_000, "Cloud call duration reservation was not persisted.");
    await completeCall(context, {
      businessId: cloudBusinessId,
      callId: cloud.callId,
      status: "completed",
      endedAt: "2026-08-10T22:00:12.000Z",
      providerDurationSeconds: 12,
    });

    await withBusinessTransaction(database.db, { businessId: cloudBusinessId, actorType: "worker" }, async (tx) => {
      const usage = (await tx.select({ id: billingUsageEvents.id, quantity: billingUsageEvents.quantity, syncStatus: billingUsageEvents.syncStatus })
        .from(billingUsageEvents)
        .where(and(eq(billingUsageEvents.businessId, cloudBusinessId), eq(billingUsageEvents.sourceKey, `voice:${cloud.callId}`)))
        .limit(1))[0];
      assert(usage?.quantity === 12, "Voice reservation did not reconcile to actual duration.");
      assert(usage.syncStatus === "skipped", "Free-plan usage must not be sent to Polar.");
      const call = (await tx.select({ maxDurationMs: calls.webCallMaxDurationMs }).from(calls).where(eq(calls.id, cloud.callId)).limit(1))[0];
      assert(call?.maxDurationMs === 300_000, "Call max duration is not authoritative in PostgreSQL.");
      await tx.update(billingUsageEvents).set({ quantity: 1_800 }).where(eq(billingUsageEvents.id, usage.id));
    });
    const exhausted = await getWebVoiceBillingAllowance(context, { businessId: cloudBusinessId, maxDurationMs: 300_000 });
    assert(!exhausted.allowed && exhausted.errorCode === "voice_limit_reached", "Free-plan exhaustion did not block web voice.");

    const selfHosted = await startCall(context, {
      businessId: selfHostedBusinessId,
      provider: "openai_realtime",
      providerCallId: `policy-self-${suffix}`,
      from: "web",
      to: `policy-self-${suffix}`,
      transport: "web_voice",
      billable: true,
      maxDurationMs: 300_000,
    });
    assert(selfHosted.webCallMaxDurationMs === 300_000, "Self-hosted call duration was not preserved.");
    await withBusinessTransaction(database.db, { businessId: selfHostedBusinessId, actorType: "worker" }, async (tx) => {
      const usage = await tx.select({ id: billingUsageEvents.id }).from(billingUsageEvents).where(eq(billingUsageEvents.businessId, selfHostedBusinessId));
      assert(usage.length === 0, "Self-hosted voice must not create hosted billing usage.");
    });

    const rateInput = { businessId: cloudBusinessId, origin: "https://policy.example.test", ipHash: `ip-${suffix}` };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await enforceWebVoiceRateLimits(rateInput, { consume: true });
      assert(result.allowed, `Rate limiter rejected allowed attempt ${attempt + 1}.`);
    }
    const blocked = await enforceWebVoiceRateLimits(rateInput, { consume: true });
    assert(!blocked.allowed && blocked.status === 429, "The sixth per-IP attempt was not rejected.");

    console.log(JSON.stringify({
      billingReservationReconciled: true,
      freePlanExhaustionBlocked: true,
      selfHostedBillingSkipped: true,
      sixthIpAttemptBlocked: true,
    }));
  } finally {
    for (const businessId of [cloudBusinessId, selfHostedBusinessId]) {
      await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, async (tx) => {
        await tx.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
        await tx.delete(businesses).where(eq(businesses.id, businessId));
      }).catch(() => undefined);
    }
    await closeWebVoicePolicyStore();
    await database.pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
