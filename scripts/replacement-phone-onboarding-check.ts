import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { billingAccounts, businessMemberships, businesses, createDatabaseClient, onboardingPhoneVerifications, onboardingNumberClaimEvents, phoneNumbers, users, withBusinessTransaction } from "@lobbystack/db";
import { claimNumberProvisioning, completeNumberProvisioning, reserveOnboardingNumberClaim, reserveReplacementNumberClaim, searchAvailableBusinessNumbers, searchBusinessNumberInventory, skipOnboardingNumber, type NumberSelection } from "@lobbystack/domain";
import { handleJob } from "../apps/worker/src/handlers";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

async function main(): Promise<void> {
  const auth = createDatabaseClient("lobbystack_auth"); const app = createDatabaseClient("lobbystack_app"); const worker = createDatabaseClient("lobbystack_worker");
  const userId = randomUUID(); const businessId = randomUUID(); const foreignBusinessId = randomUUID();
  try {
    await auth.db.insert(users).values({ id: userId, email: `${userId}@example.test`, normalizedEmail: `${userId}@example.test` });
    for (const id of [businessId, foreignBusinessId]) await withBusinessTransaction(worker.db, { businessId: id, actorType: "worker" }, async (tx) => { await tx.insert(businesses).values({ id, slug: `phone-${id}`, name: "Phone certification", timezone: "America/Toronto", businessType: "test", onboardingStage: "plan" }); if (id === businessId) { await tx.insert(businessMemberships).values({ businessId: id, userId, role: "business_owner", status: "active" }); await tx.insert(billingAccounts).values({ businessId: id, billingKey: `business:${id}`, plan: "starter", subscriptionState: "active" }); } });

    // A verification send queued before retirement drains without contacting a
    // personal phone or moving the workspace back onto a removed stage.
    const staleAttemptId = randomUUID();
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, tx => tx.insert(onboardingPhoneVerifications).values({ id: staleAttemptId, businessId, userId, phoneE164: "+14165550100", countryCode: "CA", status: "queued", expiresAt: new Date(Date.now() + 600_000), requestFingerprint: "retired-verification" }));
    await handleJob({ jobId: randomUUID(), type: "phoneVerification.send", queue: "critical", businessId, payload: { attemptId: staleAttemptId }, trace: {}, idempotencyKey: `phone:${staleAttemptId}`, scheduled: false }, { domain: { db: worker.db } });
    const drained = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => ({ verification: (await tx.select().from(onboardingPhoneVerifications).where(eq(onboardingPhoneVerifications.id, staleAttemptId)))[0], business: (await tx.select().from(businesses).where(eq(businesses.id, businessId)))[0] }));
    assert(drained.verification?.status === "canceled" && drained.business?.onboardingStage === "plan", "A retired verification send did not drain without regressing onboarding.");

    const secret = "phone-certification-secret-at-least-32-characters";

    // Number search no longer requires a personal verified phone. The workspace
    // timezone seeds the market, and an explicit selection overrides it.
    const searched: Array<{ countryCode: string; areaCode?: string }> = [];
    const locationMarket = await searchBusinessNumberInventory({ db: app.db }, { userId, businessId, claimTokenSecret: secret }, { listAvailablePhoneNumbers: async selection => { searched.push(selection); return [{ phoneE164: "+14165550111", countryCode: selection.countryCode, capabilities: { sms: true, voice: true } }]; } });
    assert(locationMarket.market.countryCode === "CA" && locationMarket.market.source === "business_location", "Number search did not derive the market from the workspace location.");
    const explicitMarket = await searchBusinessNumberInventory({ db: app.db }, { userId, businessId, selection: { countryCode: "GB" }, claimTokenSecret: secret }, { listAvailablePhoneNumbers: async selection => [{ phoneE164: "+442071234567", countryCode: selection.countryCode, capabilities: { sms: true, voice: true } }] });
    assert(explicitMarket.market.countryCode === "GB" && explicitMarket.market.source === "selection", "An explicit country selection was not honored.");
    let unsupportedCountry = false;
    try { await searchBusinessNumberInventory({ db: app.db }, { userId, businessId, selection: { countryCode: "FR" } as unknown as Partial<NumberSelection>, claimTokenSecret: secret }, { listAvailablePhoneNumbers: async () => [] }); } catch { unsupportedCountry = true; }
    assert(unsupportedCountry, "An unsupported country was accepted for number search.");

    const areaCodeSearches: Array<{ areaCode?: string }> = [];
    const offers = await searchAvailableBusinessNumbers({ db: app.db }, { userId, businessId, selection: { countryCode: "CA", areaCode: "416" }, claimTokenSecret: secret }, { listAvailablePhoneNumbers: async (selection) => { areaCodeSearches.push(selection); return [{ phoneE164: "+14165550199", locality: "Toronto", region: "ON", countryCode: selection.countryCode, capabilities: { sms: true, voice: true } }]; } });
    assert(offers.length === 1 && offers[0]?.claimToken && areaCodeSearches[0]?.areaCode === "416", "Signed number offer was not issued for the explicit area code.");
    const claimId = await reserveOnboardingNumberClaim({ db: app.db }, { userId, businessId, claimToken: offers[0]!.claimToken, claimTokenSecret: secret, idempotencyKey: "certification-claim" });
    const duplicateClaimId = await reserveOnboardingNumberClaim({ db: app.db }, { userId, businessId, claimToken: offers[0]!.claimToken, claimTokenSecret: secret, idempotencyKey: "certification-claim" });
    assert(claimId === duplicateClaimId, "Claim reservation was not idempotent.");
    const provision = await claimNumberProvisioning({ db: worker.db }, { businessId, claimId });
    assert(provision?.e164 === "+14165550199", "Worker could not claim number provisioning.");
    const phoneNumberId = await completeNumberProvisioning({ db: worker.db }, { businessId, claimId, e164: provision.e164, providerPhoneId: "PN_certification", voiceUrl: "https://app.test/voice", smsUrl: "https://app.test/sms" });
    const persistedNumber = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => (await tx.select().from(phoneNumbers).where(eq(phoneNumbers.id, phoneNumberId)))[0]);
    assert(persistedNumber?.status === "active" && persistedNumber.providerPhoneId === "PN_certification", "Provisioned phone number was not persisted.");

    const replacementOffers = await searchAvailableBusinessNumbers({ db: app.db }, { userId, businessId, purpose: "replacement", claimTokenSecret: secret }, { listAvailablePhoneNumbers: async (selection) => [{ phoneE164: "+14165550200", locality: "Toronto", region: "ON", countryCode: selection.countryCode, capabilities: { sms: true, voice: true } }] });
    const replacementClaimId = await reserveReplacementNumberClaim({ db: app.db }, { userId, businessId, claimToken: replacementOffers[0]!.claimToken, claimTokenSecret: secret, idempotencyKey: "certification-replacement" });
    const duplicateReplacementClaimId = await reserveReplacementNumberClaim({ db: app.db }, { userId, businessId, claimToken: replacementOffers[0]!.claimToken, claimTokenSecret: secret, idempotencyKey: "certification-replacement" });
    assert(replacementClaimId === duplicateReplacementClaimId, "Replacement reservation was not idempotent.");
    const replacementProvision = await claimNumberProvisioning({ db: worker.db }, { businessId, claimId: replacementClaimId });
    assert(replacementProvision?.e164 === "+14165550200", "Worker could not claim replacement provisioning.");
    const replacementNumberId = await completeNumberProvisioning({ db: worker.db }, { businessId, claimId: replacementClaimId, e164: replacementProvision.e164, providerPhoneId: "PN_replacement", voiceUrl: "https://app.test/voice", smsUrl: "https://app.test/sms" });
    const replacementState = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => ({ business: (await tx.select().from(businesses).where(eq(businesses.id, businessId)))[0], oldNumber: (await tx.select().from(phoneNumbers).where(eq(phoneNumbers.id, phoneNumberId)))[0], newNumber: (await tx.select().from(phoneNumbers).where(eq(phoneNumbers.id, replacementNumberId)))[0] }));
    const retirementDelay = (replacementState.oldNumber?.reclaimScheduledAt?.getTime() ?? 0) - Date.now();
    assert(replacementState.business?.phoneNumberReplacementUsedAt && !replacementState.business.phoneNumberReplacementReservedAt, "Replacement entitlement was not consumed atomically.");
    assert(replacementState.oldNumber?.status === "active" && replacementState.oldNumber.reclaimReason === "replacement" && retirementDelay > 29 * 24 * 60 * 60_000, "Previous number did not receive a 30-day retirement window.");
    assert(replacementState.newNumber?.status === "active" && replacementState.newNumber.providerPhoneId === "PN_replacement", "Replacement number was not activated before retirement.");
    let secondReplacementDenied = false; try { await searchAvailableBusinessNumbers({ db: app.db }, { userId, businessId, purpose: "replacement", claimTokenSecret: secret }, { listAvailablePhoneNumbers: async () => [] }); } catch { secondReplacementDenied = true; }
    assert(secondReplacementDenied, "A second replacement was not denied.");
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => { await tx.update(phoneNumbers).set({ reclaimScheduledAt: new Date() }).where(and(eq(phoneNumbers.id, phoneNumberId), eq(phoneNumbers.businessId, businessId))); });
    const releasedProviderIds: string[] = [];
    await handleJob({ jobId: randomUUID(), type: "phoneNumber.reclaim", queue: "maintenance", businessId, payload: { phoneNumberId }, trace: {}, idempotencyKey: `certification-reclaim:${phoneNumberId}`, scheduled: false }, { domain: { db: worker.db }, twilio: { sendSms: async () => ({ providerMessageId: "unused", status: "sent" }), releasePhoneNumber: async ({ providerPhoneId }) => { releasedProviderIds.push(providerPhoneId); } } });
    const reclaimedState = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => ({ oldNumber: (await tx.select().from(phoneNumbers).where(eq(phoneNumbers.id, phoneNumberId)))[0], newNumber: (await tx.select().from(phoneNumbers).where(eq(phoneNumbers.id, replacementNumberId)))[0] }));
    assert(releasedProviderIds.length === 1 && releasedProviderIds[0] === "PN_certification", "Reclaim did not release the retired number by its provider SID.");
    assert(reclaimedState.oldNumber?.status === "reclaimed" && reclaimedState.newNumber?.status === "active", "Reclaim affected the replacement number.");

    // A completed workspace can still revisit number selection and stay complete.
    await withBusinessTransaction(worker.db, { businessId: foreignBusinessId, actorType: "worker" }, async (tx) => {
      await tx.insert(businessMemberships).values({ businessId: foreignBusinessId, userId, role: "business_owner", status: "active" });
      await tx.update(businesses).set({ onboardingStage: "complete" }).where(eq(businesses.id, foreignBusinessId));
      await tx.insert(billingAccounts).values({ businessId: foreignBusinessId, billingKey: `business:${foreignBusinessId}`, plan: "starter", subscriptionState: "active" });
    });
    await skipOnboardingNumber({ db: app.db }, { userId, businessId: foreignBusinessId });
    const revisitOffers = await searchAvailableBusinessNumbers({ db: app.db }, { userId, businessId: foreignBusinessId, claimTokenSecret: secret }, { listAvailablePhoneNumbers: async selection => [{ phoneE164: "+14165550201", countryCode: selection.countryCode, capabilities: { sms: true, voice: true } }] });
    let quotaBlocked = false;
    try { await reserveOnboardingNumberClaim({ db: app.db }, { userId, businessId: foreignBusinessId, claimToken: revisitOffers[0]!.claimToken, claimTokenSecret: secret, idempotencyKey: "revisit-quota" }); } catch { quotaBlocked = true; }
    assert(quotaBlocked, "Revisiting onboarding bypassed the daily phone purchase quota.");
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => tx.update(onboardingNumberClaimEvents).set({ purchasedAt: new Date(Date.now() - 2 * 24 * 60 * 60_000) }).where(eq(onboardingNumberClaimEvents.businessId, businessId)));
    const revisitClaimId = await reserveOnboardingNumberClaim({ db: app.db }, { userId, businessId: foreignBusinessId, claimToken: revisitOffers[0]!.claimToken, claimTokenSecret: secret, idempotencyKey: "revisit-complete" });
    const getRevisitStage = async () => await withBusinessTransaction(worker.db, { businessId: foreignBusinessId, actorType: "worker" }, async tx => (await tx.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, foreignBusinessId)))[0]?.stage);
    assert(await getRevisitStage() === "complete", "Revisiting number selection regressed completed onboarding.");
    await claimNumberProvisioning({ db: worker.db }, { businessId: foreignBusinessId, claimId: revisitClaimId });
    await completeNumberProvisioning({ db: worker.db }, { businessId: foreignBusinessId, claimId: revisitClaimId, e164: "+14165550201", providerPhoneId: "PN_revisit", voiceUrl: "https://app.test/voice", smsUrl: "https://app.test/sms" });
    assert(await getRevisitStage() === "complete", "Late phone provisioning regressed completed onboarding.");
    console.log(JSON.stringify({ noPersonalPhoneRequired: true, businessLocationMarket: true, explicitSelectionMarket: true, unsupportedCountryDenied: true, retiredVerificationDrained: true, signedOfferIssued: true, claimIdempotent: true, numberProvisioned: true, replacementIdempotent: true, replacementActivatedBeforeRetirement: true, replacementEntitlementConsumed: true, retirementWindowScheduled: true, providerSidSafeReclaim: true, completedOnboardingRevisit: true, revisitPurchaseQuotaPreserved: true, completedProgressPreserved: true }));
  } finally {
    for (const id of [businessId, foreignBusinessId]) await withBusinessTransaction(worker.db, { businessId: id, actorType: "worker" }, async (tx) => await tx.delete(businesses).where(eq(businesses.id, id))).catch(() => undefined);
    await auth.db.delete(users).where(eq(users.id, userId)).catch(() => undefined); await Promise.all([auth.pool.end(), app.pool.end(), worker.pool.end()]);
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
