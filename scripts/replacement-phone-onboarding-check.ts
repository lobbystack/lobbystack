import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { billingAccounts, businessMemberships, businesses, createDatabaseClient, onboardingPhoneVerifications, onboardingNumberClaimEvents, outboxMessages, phoneNumbers, users, withBusinessTransaction } from "@lobbystack/db";
import { checkPhoneVerification, claimNumberProvisioning, claimPhoneVerificationSend, completeNumberProvisioning, getLatestPhoneVerificationAttempt, markPhoneVerificationSent, requestPhoneVerification, reserveOnboardingNumberClaim, reserveReplacementNumberClaim, reuseVerifiedPhoneForOnboarding, searchAvailableBusinessNumbers, searchBusinessNumberInventory, skipOnboardingNumber } from "@lobbystack/domain";
import { handleJob } from "../apps/worker/src/handlers";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

async function main(): Promise<void> {
  const auth = createDatabaseClient("lobbystack_auth"); const app = createDatabaseClient("lobbystack_app"); const worker = createDatabaseClient("lobbystack_worker");
  const userId = randomUUID(); const businessId = randomUUID(); const foreignBusinessId = randomUUID();
  try {
    await auth.db.insert(users).values({ id: userId, email: `${userId}@example.test`, normalizedEmail: `${userId}@example.test` });
    for (const id of [businessId, foreignBusinessId]) await withBusinessTransaction(worker.db, { businessId: id, actorType: "worker" }, async (tx) => { await tx.insert(businesses).values({ id, slug: `phone-${id}`, name: "Phone certification", timezone: "UTC", businessType: "test", onboardingStage: "verify_phone" }); if (id === businessId) { await tx.insert(businessMemberships).values({ businessId: id, userId, role: "business_owner", status: "active" }); await tx.insert(billingAccounts).values({ businessId: id, billingKey: `business:${id}`, plan: "starter", subscriptionState: "active" }); } });
    const attemptId = await requestPhoneVerification({ db: app.db }, { userId, businessId, phoneNumber: "4165550100" }, { lookupPhoneNumber: async () => ({ phoneE164: "+14165550100", countryCode: "CA", valid: true, lineType: "mobile" }) });
    const reserved = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => ({ attempt: (await tx.select().from(onboardingPhoneVerifications).where(eq(onboardingPhoneVerifications.id, attemptId)))[0], outbox: await tx.select().from(outboxMessages).where(eq(outboxMessages.aggregateId, attemptId)) }));
    assert(reserved.attempt?.status === "queued" && !reserved.attempt.providerVerificationId && reserved.outbox.length === 1, "Verification reservation was not durable and outbox-backed.");
    const claimed = await claimPhoneVerificationSend({ db: worker.db }, { businessId, attemptId });
    assert(claimed?.phoneE164 === "+14165550100", "Worker could not claim the verification send.");
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => { await tx.update(onboardingPhoneVerifications).set({ status: "processing", updatedAt: new Date(Date.now() - 11 * 60_000) }).where(eq(onboardingPhoneVerifications.id, attemptId)); });
    const reclaimedVerification = await claimPhoneVerificationSend({ db: worker.db }, { businessId, attemptId });
    assert(reclaimedVerification?.phoneE164 === "+14165550100", "A stale phone verification lease was not recovered.");
    await markPhoneVerificationSent({ db: worker.db }, { businessId, attemptId, providerVerificationId: "VE_certification", status: "pending" });
    assert((await getLatestPhoneVerificationAttempt({ db: app.db }, { userId, businessId }))?.status === "pending", "Operator could not recover pending verification state.");
    let denied = false; try { await getLatestPhoneVerificationAttempt({ db: app.db }, { userId, businessId: foreignBusinessId }); } catch { denied = true; }
    assert(denied, "Cross-tenant verification access was not denied.");
    const approved = await checkPhoneVerification({ db: app.db }, { userId, businessId, attemptId, code: "123456", serviceSid: "VA_certification" }, { checkPhone: async () => ({ status: "approved", approved: true }) });
    assert(approved.approved, "Verification approval was not accepted.");
    const approvedState = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => ({ business: (await tx.select().from(businesses).where(eq(businesses.id, businessId)))[0], verification: (await tx.select().from(onboardingPhoneVerifications).where(eq(onboardingPhoneVerifications.id, attemptId)))[0] }));
    const verifiedUser = (await auth.db.select().from(users).where(eq(users.id, userId)))[0];
    assert(approvedState.business?.onboardingStage === "plan" && approvedState.verification?.status === "approved" && verifiedUser?.phone === "+14165550100" && verifiedUser.phoneVerifiedAt, "Approval did not update protected user and onboarding state.");
    const secret = "phone-certification-secret-at-least-32-characters";
    const searched: Array<{ areaCode?: string; city?: string }> = [];
    const emptyInventory = await searchBusinessNumberInventory({ db: app.db }, { userId, businessId, claimTokenSecret: secret }, { listAvailablePhoneNumbers: async selection => { searched.push(selection); return []; } });
    assert(emptyInventory.numbers.length === 0 && emptyInventory.market.countryCode === "CA" && emptyInventory.market.areaCode === "416" && emptyInventory.market.city === "Toronto", "An empty inventory lost the verified phone market.");
    assert(searched[0]?.areaCode === "416" && searched[1]?.areaCode === "647" && searched[2]?.areaCode === "437" && searched.some(selection => selection.city === "Toronto"), "Suggestions did not preserve main's metro preference order.");
    const foreignMarket = await withBusinessTransaction(app.db, { userId, businessId, actorType: "operator" }, async tx => tx.execute(sql`SELECT app.resolve_verified_phone_market(${foreignBusinessId}::uuid, ${userId}::uuid) AS market`));
    assert(foreignMarket.rows[0]?.market === null, "Market resolver leaked through a different tenant context.");
    await auth.db.update(users).set({ phone: "+14165550999" }).where(eq(users.id, userId));
    let stalePhoneDenied = false;
    try { await searchBusinessNumberInventory({ db: app.db }, { userId, businessId, claimTokenSecret: secret }, { listAvailablePhoneNumbers: async () => { throw new Error("Provider must not run for a stale verification"); } }); }
    catch (error) { stalePhoneDenied = error instanceof Error && error.message.includes("verified phone"); }
    assert(stalePhoneDenied, "An old verification must not authorize a different current phone.");
    await auth.db.update(users).set({ phone: "+14165550100" }).where(eq(users.id, userId));
    const offers = await searchAvailableBusinessNumbers({ db: app.db }, { userId, businessId, claimTokenSecret: secret }, { listAvailablePhoneNumbers: async (selection) => [{ phoneE164: "+14165550199", locality: "Toronto", region: "ON", countryCode: selection.countryCode, capabilities: { sms: true, voice: true } }] });
    assert(offers.length === 1 && offers[0]?.claimToken, "Signed number offer was not issued.");
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
    await withBusinessTransaction(worker.db, { businessId: foreignBusinessId, actorType: "worker" }, async (tx) => { await tx.insert(businessMemberships).values({ businessId: foreignBusinessId, userId, role: "business_owner", status: "active" }); });
    const reusedId = await reuseVerifiedPhoneForOnboarding({ db: app.db }, { userId, businessId: foreignBusinessId });
    assert(Boolean(reusedId), "Verified phone could not be reused across workspaces.");
    await withBusinessTransaction(worker.db, { businessId: foreignBusinessId, actorType: "worker" }, async tx => {
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
    let cooldown = false; try { await requestPhoneVerification({ db: app.db }, { userId, businessId, phoneNumber: "4165550100" }, { lookupPhoneNumber: async () => ({ phoneE164: "+14165550100", countryCode: "CA", valid: true, lineType: "mobile" }) }); } catch { cooldown = true; }
    const attempts = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => await tx.select().from(onboardingPhoneVerifications).where(eq(onboardingPhoneVerifications.businessId, businessId)));
    assert(cooldown && attempts.length === 1, "Verification resend cooldown was not enforced.");
    console.log(JSON.stringify({ verifiedMarketRetainedWhenEmpty: true, metroPreferenceOrder: true, stalePhoneVerificationDenied: true, marketTenantIsolation: true, completedOnboardingRevisit: true, revisitPurchaseQuotaPreserved: true, completedProgressPreserved: true, reservationDurable: true, outboxBacked: true, workerLifecycle: true, staleVerificationLeaseRecovered: true, crossTenantDenied: true, cooldownEnforced: true, approvalPersisted: true, verifiedPhoneReused: true, signedOfferIssued: true, claimIdempotent: true, numberProvisioned: true, replacementIdempotent: true, replacementActivatedBeforeRetirement: true, replacementEntitlementConsumed: true, retirementWindowScheduled: true, providerSidSafeReclaim: true }));
  } finally {
    for (const id of [businessId, foreignBusinessId]) await withBusinessTransaction(worker.db, { businessId: id, actorType: "worker" }, async (tx) => await tx.delete(businesses).where(eq(businesses.id, id))).catch(() => undefined);
    await auth.db.delete(users).where(eq(users.id, userId)).catch(() => undefined); await Promise.all([auth.pool.end(), app.pool.end(), worker.pool.end()]);
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
