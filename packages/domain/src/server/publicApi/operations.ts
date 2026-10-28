import { createHash, randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, notExists, sql } from "drizzle-orm";
import { DateTime } from "luxon";

import { agentRules, apiKeys, appointments, auditLogs, billingAccounts, billingCheckoutRequests, billingUsageMonths, businesses, businessInvitations, businessMemberships, calendarConnections, contactPasscodes, contacts, knowledgeDocuments, knowledgeSnippets, phoneNumbers, platformKeyBusinesses, receptionistProfiles, services, storageObjects, users, websiteIngestionJobs, widgetKeys, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import {
  CONTACT_PASSCODE_DEFAULT_LENGTH,
  CONTACT_PASSCODE_HASHES_PER_CALLER,
  CONTACT_PASSCODE_MAX_LENGTH,
  CONTACT_PASSCODE_MIN_LENGTH,
  CONTACT_PASSCODES_MAX_PER_REQUEST,
  PUBLIC_API_AVAILABILITY_MAX_DAYS,
  apiNotificationEvents,
  isContactPasscode,
  isGuessableContactPasscode,
  keyHasScope,
  randomContactPasscode,
  RULES_MAX,
  isApiKeyScope,
  normalizeAuthEmail,
  normalizeWidgetOrigin,
  widgetEmbedSnippet,
  normalizeAppointmentChangePolicy,
  normalizeRuntimeLocale,
  normalizeBookingMode,
  weekdays,
  type ApiAccountCalendar,
  type ApiAppointment,
  type ApiAppointmentCreate,
  type ApiAvailabilitySlot,
  type ApiBilling,
  type ApiBillingUpdate,
  type ApiBusiness,
  type ApiBusinessCreate,
  type ApiBusinessSummary,
  type ApiBusinessUpdate,
  type ApiCalendarConnection,
  type ApiCalendarConnectionUpdate,
  type ApiCalendarConnectLink,
  type ApiCall,
  type ApiCallDetail,
  type ApiCheckout,
  type ApiCheckoutCreate,
  type ApiClaimLink,
  type ApiClaimLinkCreate,
  type ApiContact,
  type ApiContactCreate,
  type ApiContactPasscodesGenerate,
  type ApiContactPasscodesUpdate,
  type ApiContactUpdate,
  type ApiGeneratedContactPasscodes,
  type ApiKnowledgeEntry,
  type ApiKnowledgeEntryCreate,
  type ApiKnowledgeEntryUpdate,
  type ApiKnowledgeSource,
  type ApiKnowledgeSourceCreate,
  type ApiKnowledgeSourceUpdate,
  type ApiKnowledgeUpload,
  type ApiKnowledgeUploadComplete,
  type ApiKnowledgeUploadCreate,
  type ApiMe,
  type ApiMessage,
  type ApiNotificationPreferences,
  type ApiNotificationPreferencesUpdate,
  type ApiOnboarding,
  type ApiOnboardingComplete,
  type ApiOnboardingItem,
  type ApiOnboardingUpdate,
  type ApiPhoneNumber,
  type ApiPhoneNumberClaim,
  type ApiPhoneNumberOffer,
  type ApiPhoneNumberSearch,
  type ApiReceptionist,
  type ApiReceptionistUpdate,
  type ApiRule,
  type ApiRuleCreate,
  type ApiRuleReorder,
  type ApiRuleUpdate,
  type ApiService,
  type ApiServiceCreate,
  type ApiServiceUpdate,
  type ApiStaff,
  type ApiTeam,
  type ApiTeamInvitation,
  type ApiTeamInvitationCreate,
  type ApiTeamMember,
  type ApiTeamMemberUpdate,
  type ApiWidgetConfig,
  type ApiWidgetKey,
  type ApiWidgetKeyCreate,
  type ApiWidgetKeyCreated,
  type ApiWidgetKeyUpdate,
} from "@lobbystack/shared";

import { AuthorizationError, requireTeamMembership } from "../../authz";
import { hasAnsweredPhoneCall, loadSetupGuideInTransaction, setupGuideStepIds, updateSetupGuideSkippedStepsInTransaction, type SetupGuideStepId } from "../activation";
import { attributeBusiness } from "../affiliates";
import { createBillingCheckoutRequestInTransaction, endManagedPlanInTransaction, isManagedBillingAccount, setManagedPlanInTransaction, setOverageSpendingCapInTransaction } from "../billing";
import { cancelAppointmentInTransaction, findOpeningsInTransaction, rescheduleAppointmentInTransaction, type ApiAudit } from "../booking";
import { BookingUnavailableError, type UnavailableReason } from "../../availability";
import { assignCalendarStaffInTransaction, disconnectCalendarInTransaction, listCalendarConnectionsInTransaction, resolveCalendarAccessToken, selectCalendarInTransaction } from "../calendar";
import { deleteServiceInTransaction, insertServiceInTransaction, replaceBusinessHoursInTransaction, replaceServiceStaffInTransaction, updateServiceInTransaction } from "../catalog";
import { NUMBER_BEING_REPLACED_MESSAGE, schedulePhoneNumberReleaseInTransaction } from "../compliance";
import { ContactPasscodeHashesBusyError, hashContactPasscodes, removeContactPasscodesInTransaction, saveContactPasscodesInTransaction } from "../contactPasscodes";
import type { BusinessSetupDependencies } from "../businessTemplates";
import type { DomainContext } from "../context";
import { loadEntitlement } from "../entitlement";
import { cancelKnowledgeDocumentInTransaction, createKnowledgeDocumentInTransaction, createKnowledgeSnippetInTransaction, deleteKnowledgeDocumentInTransaction, deleteKnowledgeSnippetInTransaction, expandWebsiteCrawlInTransaction, KnowledgeStorageLimitError, ONBOARDING_CRAWL_PAGE_LIMIT, retryKnowledgeDocumentInTransaction, setKnowledgeDocumentActiveInTransaction, updateKnowledgeSnippetInTransaction } from "../knowledge";
import { normalizeWebsiteSourceUrl } from "../knowledgeUrl";
import { normalizeOnboardingStage, scheduleOnboardingFollowupInTransaction } from "../onboarding";
import { createPartnerBusiness } from "../partners";
import { loadNotificationPreferencesInTransaction, loadSavedNotificationPreferencesInTransaction, saveNotificationPreferencesInTransaction } from "../notifications";
import { completeUploadInTransaction, insertPendingUploadInTransaction, planUpload, type StorageProvider } from "../storage";
import { bookForCaller } from "../receptionistActions";
import { expireAbandonedNumberClaimsInTransaction, lockBusinessNumberClaims, numberEligibilityInTransaction, offerBusinessNumbers, readNumberOffer, reserveApiNumberClaimInTransaction, type NumberInventoryProvider, type NumberOffer, type NumberSelection } from "../phoneNumbers";
import { isSharedSmsSender, resolveSmsSender } from "../smsSender";
import { loadBillingContext } from "../usage";
import { defaultReceptionistProfile, saveReceptionistProfileInTransaction, type ReceptionistProfilePatch } from "../receptionistProfile";
import { deleteAgentRuleInTransaction, insertAgentRuleInTransaction, listAgentRulesInTransaction, lockAgentRulesInTransaction, reorderAgentRulesInTransaction, updateAgentRuleInTransaction } from "../rules";
import { insertWidgetKeyInTransaction, updateWidgetKeyInTransaction, type WidgetKeyPatch } from "../widgetKeys";
import { ianaTimeZone, insertBusinessInTransaction, insertInvitationInTransaction, invitationUrl, isSingleEmailAddress, lockBusinessTeam, partnerBusinessNotClaimable, removeMemberInTransaction, revokeInvitationInTransaction, updateBusinessInTransaction, updateMemberRoleInTransaction } from "../tenancy";
import { conflict, invalidRequest, notFound, PublicApiError } from "./errors";
import { isPartnerMemberSubject, partnerSubjectActor, type PartnerSubject } from "./partner";
import { lockActivePartnerPlatformKey, refusePartnerPlatformKey, type HostPlatformKey, type ResolvedPlatformKey } from "./platformKeys";
import {
  clockToMinutes,
  decodeCursor,
  FAQ_TAG,
  knowledgeSourceType,
  listAppointmentResources,
  listCallResources,
  listContactResources,
  listKnowledgeEntryResources,
  listKnowledgeSourceResources,
  listMessageResources,
  listPhoneNumberResources,
  listServiceResources,
  listStaffResources,
  loadAppointmentResource,
  loadBusinessResource,
  loadCallDetailResource,
  loadContactResource,
  loadContactResources,
  loadServiceResource,
  notificationEventKeys,
  loadKnowledgeEntryResource,
  loadKnowledgeSourceResource,
  loadPhoneNumberClaimResource,
  loadPhoneNumberResource,
  pageSize,
  serializeCalendarConnection,
  serializeContact,
  serializeKnowledgeEntry,
  serializeNotificationPreferences,
  serializeReceptionist,
  serializeRule,
  serializeWidgetKey,
  toPage,
  type Page,
  type PageRequest,
} from "./resources";
import { emitWebhookEventInTransaction } from "./webhooks";

// The v1 public API operations. Each runs inside the API key's business with
// the worker database role and RLS, and reuses the same domain rules as the
// dashboard and the receptionist.

/**
 * The API key's business and id. `actor` names the surface that used the key:
 * the REST API (the default) or the MCP server. Both run these same
 * operations; the audit log tells them apart by actor.
 */
export type ApiActor = "api_key" | "mcp";
/** A request authenticated with an API key, through REST or MCP. */
export type ApiKeyCaller = { businessId: string; apiKeyId: string; grantId?: undefined; userId?: undefined; platformKeyId?: undefined; partnerId?: undefined; actor?: ApiActor | undefined };
/** An MCP request authenticated with an OAuth access token: the grant is the owner's consent for one client and business. */
export type OAuthGrantCaller = { businessId: string; grantId: string; userId: string; apiKeyId?: undefined; platformKeyId?: undefined; partnerId?: undefined; actor: "mcp" };
/**
 * A REST request authenticated with a platform key. It acts on the business
 * in the LobbyStack-Business header. A host's key from PLATFORM_API_KEYS acts
 * as the account its owner_email names. A key a partner made in its console
 * acts as the partner, which has no account, so it has no acting user. The
 * key's group travels with it for attribution.
 */
export type PlatformKeyCaller = { businessId: string; platformKeyId: string; groupId: string; apiKeyId?: undefined; grantId?: undefined; userId?: undefined; actor: "platform_key" }
  & ({ actingUserId: string; partnerId?: undefined } | { partnerId: string; actingUserId?: undefined });
/**
 * Someone on a partner's team setting up one of its businesses from the
 * console, such as applying a template, which runs these operations
 * in-process. The partner operation checks their role and the business first.
 * Unlike a partner's platform key, they act as themself. Like one, they act
 * for the partner, so what only the host's keys may do refuses them too.
 */
export type PartnerMemberCaller = { businessId: string; partnerId: string; userId: string; apiKeyId?: undefined; grantId?: undefined; platformKeyId?: undefined; actor: "partner_member"; mcpGrantId?: string | undefined };
export type ApiCaller = ApiKeyCaller | OAuthGrantCaller | PlatformKeyCaller | PartnerMemberCaller;

/**
 * The id that owns rate limits and idempotency records for a caller. API keys
 * keep their bare id, so REST and MCP requests with one key share them; OAuth
 * grants, platform keys and partner members are prefixed so they can never
 * collide with a key id.
 */
export function callerPrincipalId(caller: ApiCaller): string {
  if (caller.actor === "partner_member") return `partner_member:${caller.partnerId}:${caller.userId}`;
  if (caller.grantId !== undefined) return `grant:${caller.grantId}`;
  if (caller.platformKeyId !== undefined) return `platform:${caller.platformKeyId}`;
  return caller.apiKeyId;
}

/**
 * Audit fields for a change made by a caller. The key or grant id is recorded,
 * never a secret. A platform key also records its group and the account it
 * acts as, or for a partner's key the partner, so every change traces back to
 * who made it. Rows written before ADR 0010 name the group partnerId, so a
 * reader that needs the group falls back to it; a partner's key writes both
 * groupId and partnerId.
 */
export function callerAudit(caller: ApiCaller): ApiAudit {
  // Through an agency connection, the MCP client's grant is recorded too.
  if (caller.actor === "partner_member") return { actorUserId: caller.userId, payload: { actor: "partner_member", partnerId: caller.partnerId, ...(caller.mcpGrantId ? { via: "mcp", grantId: caller.mcpGrantId } : {}) } };
  if (caller.grantId !== undefined) return { actorUserId: caller.userId, payload: { actor: "mcp", grantId: caller.grantId } };
  if (caller.platformKeyId !== undefined && caller.partnerId !== undefined) return { actorUserId: null, payload: { actor: "platform_key", platformKeyId: caller.platformKeyId, groupId: caller.groupId, partnerId: caller.partnerId } };
  if (caller.platformKeyId !== undefined) return { actorUserId: null, payload: { actor: "platform_key", platformKeyId: caller.platformKeyId, groupId: caller.groupId, actingUserId: caller.actingUserId } };
  return { actorUserId: null, payload: { actor: caller.actor ?? "api_key", apiKeyId: caller.apiKeyId } };
}

/**
 * The person an API call acts for, for operations that need one, such as
 * number claims, checkout and invites. A host's platform key acts as its
 * owner, an OAuth grant as the user who granted it, and a partner member as
 * themself. A per-business key acts as the person who created it, but only
 * while they are still an owner or admin of the business; otherwise the call
 * is refused with key_owner_inactive. A partner's platform key acts as the
 * partner, which has no account, so it's refused.
 */
export async function resolveActingUserId(context: DomainContext, caller: ApiCaller): Promise<string> {
  if (caller.actor === "partner_member" || caller.grantId !== undefined) return caller.userId;
  if (caller.platformKeyId !== undefined && caller.partnerId !== undefined) throw partnerPlatformKeyActsAsPartner();
  if (caller.platformKeyId !== undefined) return caller.actingUserId;
  const { apiKeyId } = caller;
  return await inBusiness(context, caller, async (tx) => {
    const [key] = await tx.select({ createdByUserId: apiKeys.createdByUserId }).from(apiKeys).where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.businessId, caller.businessId))).limit(1);
    const userId = key?.createdByUserId;
    if (!userId) throw keyOwnerInactive();
    try {
      // The key's creator must still be on the team: a partner open never stands in for them.
      await requireTeamMembership(tx, { userId, businessId: caller.businessId, minimumRole: "business_admin" });
    } catch (error) {
      if (error instanceof AuthorizationError) throw keyOwnerInactive();
      throw error;
    }
    return userId;
  });
}

function keyOwnerInactive(): PublicApiError {
  return new PublicApiError(403, "key_owner_inactive", "This API key's creator is no longer an owner or admin of the business, so the key can't do this. Create a new key.");
}

function partnerPlatformKeyActsAsPartner(): PublicApiError {
  return new PublicApiError(403, "forbidden", "This platform key acts as its partner, which has no LobbyStack account, so it can't do this.");
}

/**
 * Refuses a per-business key whose creator is no longer an owner or admin of
 * the business, for operations only owners and admins do in the dashboard.
 * Grants and platform keys pass.
 */
async function requireKeyOwnerActive(context: DomainContext, caller: ApiCaller): Promise<void> {
  if (caller.apiKeyId !== undefined) await resolveActingUserId(context, caller);
}

async function inBusiness<T>(context: DomainContext, caller: ApiCaller, callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await withBusinessTransaction(context.db, { businessId: caller.businessId, actorType: "worker" }, callback);
}

async function audit(tx: DatabaseTransaction, caller: ApiCaller, input: { eventType: string; entityType: string; entityId?: string; payload?: Record<string, unknown> }) {
  await tx.insert(auditLogs).values({ businessId: caller.businessId, eventType: input.eventType, entityType: input.entityType, ...(input.entityId ? { entityId: input.entityId } : {}), ...(callerAudit(caller).actorUserId ? { actorUserId: callerAudit(caller).actorUserId } : {}), payload: { ...callerAudit(caller).payload, ...input.payload } });
}

function apiChange(caller: ApiCaller) {
  return { source: "api" as const, audit: callerAudit(caller) };
}

function isUniqueViolation(error: unknown): boolean {
  const cause = typeof error === "object" && error !== null && "cause" in error ? (error as { cause: unknown }).cause : undefined;
  return [error, cause].some((value) => typeof value === "object" && value !== null && "code" in value && (value as { code: unknown }).code === "23505");
}

function assertTimeZone(value: string, field: string): void {
  if (!ianaTimeZone(value)) {
    throw invalidRequest(`${field} is not a valid IANA time zone.`, [{ path: field, message: "Use an IANA time zone such as America/Toronto." }]);
  }
}

// Business

/** The key and its business, for integrations to test a connection. Needs no scope. */
export async function getMeForApi(context: DomainContext, caller: ApiKeyCaller): Promise<ApiMe> {
  return await inBusiness(context, caller, async (tx) => {
    const [row] = await tx.select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scopes: apiKeys.scopes, createdAt: apiKeys.createdAt, businessName: businesses.name }).from(apiKeys).innerJoin(businesses, eq(businesses.id, apiKeys.businessId)).where(and(eq(apiKeys.businessId, caller.businessId), eq(apiKeys.id, caller.apiKeyId))).limit(1);
    if (!row) throw notFound("API key");
    return { api_key: { id: row.id, name: row.name, prefix: row.prefix, scopes: row.scopes.filter(isApiKeyScope), created_at: row.createdAt.toISOString() }, business: { id: caller.businessId, name: row.businessName } };
  });
}

/** GET /me for a platform key: the key, its group and access, and the business in the header, if any. */
export async function getPlatformMeForApi(context: DomainContext, key: ResolvedPlatformKey, caller: PlatformKeyCaller | null): Promise<ApiMe> {
  let business: ApiMe["business"] = null;
  if (caller) {
    const { businessId } = caller;
    const [row] = await inBusiness(context, caller, async (tx) => await tx.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1));
    if (!row) throw notFound("Business");
    business = { id: businessId, name: row.name };
  }
  return {
    api_key: { id: key.platformKeyId, name: key.name, prefix: key.prefix, scopes: key.scopes, created_at: key.createdAt },
    business,
    // /api/v1 only changes additively, so GET /me keeps the names it shipped
    // with: partner repeats the group, and access repeats reach with group
    // access reading "partner".
    platform: { group: key.group, partner: key.group, reach: key.access === "all" ? "all" : "group", access: key.access === "all" ? "all" : "partner", partner_id: key.partnerId ?? null },
  };
}

export async function getBusinessForApi(context: DomainContext, caller: ApiCaller): Promise<ApiBusiness> {
  return await inBusiness(context, caller, async (tx) => {
    const business = await loadBusinessResource(tx, caller.businessId);
    if (!business) throw notFound("Business");
    return business;
  });
}

export async function updateBusinessForApi(context: DomainContext, caller: ApiCaller, input: ApiBusinessUpdate): Promise<ApiBusiness> {
  if (input.timezone !== undefined) assertTimeZone(input.timezone, "timezone");
  const fields = { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.timezone !== undefined ? { timezone: input.timezone } : {}), ...(input.locale !== undefined ? { defaultLocale: input.locale } : {}), ...(input.website_url !== undefined ? { websiteUrl: input.website_url } : {}), ...(input.business_type !== undefined ? { businessType: input.business_type } : {}) };
  if (!Object.keys(fields).length && input.hours === undefined) throw invalidRequest("Send at least one field to update.");
  return await inBusiness(context, caller, async (tx) => {
    if (Object.keys(fields).length) await updateBusinessInTransaction(tx, { businessId: caller.businessId, ...fields });
    if (input.hours !== undefined) {
      await tx.update(businesses).set({ updatedAt: new Date() }).where(eq(businesses.id, caller.businessId));
      try {
        await replaceBusinessHoursInTransaction(tx, { businessId: caller.businessId, hours: input.hours.map((window) => ({ dayOfWeek: weekdays.indexOf(window.day), openMinutes: clockToMinutes(window.open), closeMinutes: clockToMinutes(window.close) })) });
      } catch (error) {
        throw invalidRequest(error instanceof Error ? error.message : "hours are invalid.", [{ path: "hours", message: error instanceof Error ? error.message : "Invalid hours." }]);
      }
    }
    await audit(tx, caller, { eventType: "api.business.updated", entityType: "business", entityId: caller.businessId, payload: { fields: Object.keys(input) } });
    const business = await loadBusinessResource(tx, caller.businessId);
    if (!business) throw notFound("Business");
    return business;
  });
}

// Billing

/** The plan in force, as the server enforces it, and this month's overage spend against the cap. */
async function loadBilling(tx: DatabaseTransaction, businessId: string): Promise<ApiBilling> {
  const { plan, entitlement } = await loadBillingContext(tx, businessId);
  const [account] = await tx.select({ source: billingAccounts.source, subscriptionState: billingAccounts.subscriptionState, billingInterval: billingAccounts.billingInterval, currentPeriodEnd: billingAccounts.currentPeriodEnd }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1);
  const periodKey = new Date().toISOString().slice(0, 7);
  const [month] = await tx.select({ overageSpendCents: billingUsageMonths.overageSpendCents }).from(billingUsageMonths).where(and(eq(billingUsageMonths.businessId, businessId), eq(billingUsageMonths.periodKey, periodKey))).limit(1);
  // A partner's business pays its partner for overage, in its package's currency, so the host's billing shows none.
  const spend = entitlement.source === "package" || entitlement.source === "billed_outside" ? 0 : month?.overageSpendCents ?? 0;
  // Interval, period and cap belong to a Starter or Pro subscription; an older one's values don't carry over.
  const paid = plan === "starter" || plan === "pro";
  const cap = paid ? entitlement.overage.capMinor : null;
  return {
    plan,
    managed: isManagedBillingAccount(account),
    subscription_state: account?.subscriptionState ?? null,
    billing_interval: paid && (account?.billingInterval === "monthly" || account?.billingInterval === "annual") ? account.billingInterval : null,
    current_period_end: paid && account?.currentPeriodEnd ? account.currentPeriodEnd.toISOString() : null,
    spending_cap_cents: cap,
    overage_spend_cents: spend,
    spending_cap_reached: cap !== null && spend > 0 && spend >= cap,
  };
}

export async function getBillingForApi(context: DomainContext, caller: ApiCaller): Promise<ApiBilling> {
  return await inBusiness(context, caller, async (tx) => await loadBilling(tx, caller.businessId));
}

/** Sets or removes the overage cap. Only Starter and Pro plans have one; sending the cap it already has changes nothing. */
export async function updateBillingForApi(context: DomainContext, caller: ApiCaller, input: ApiBillingUpdate): Promise<ApiBilling> {
  return await inBusiness(context, caller, async (tx) => {
    const { plan, entitlement } = await loadBillingContext(tx, caller.businessId);
    if (plan !== "starter" && plan !== "pro") throw conflict("Spending caps are available on Starter and Pro plans.");
    if (input.spending_cap_cents !== entitlement.overage.capMinor) {
      await setOverageSpendingCapInTransaction(tx, { businessId: caller.businessId, capCents: input.spending_cap_cents });
      await audit(tx, caller, { eventType: "api.billing.updated", entityType: "billing_account", entityId: caller.businessId, payload: { spendingCapCents: input.spending_cap_cents } });
    }
    return await loadBilling(tx, caller.businessId);
  });
}

async function loadCheckout(tx: DatabaseTransaction, businessId: string, checkoutId: string): Promise<ApiCheckout> {
  const [row] = await tx.select().from(billingCheckoutRequests).where(and(eq(billingCheckoutRequests.businessId, businessId), eq(billingCheckoutRequests.id, checkoutId))).limit(1);
  if (!row || (row.target !== "starter" && row.target !== "pro") || (row.billingInterval !== "monthly" && row.billingInterval !== "annual")) throw notFound("Checkout");
  const [account] = await tx.select({ plan: billingAccounts.plan, billingInterval: billingAccounts.billingInterval, subscriptionState: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1);
  // A checkout canceled because the business moved to a managed plan reads as failed.
  const status = row.status === "canceled" ? "error" : (["pending", "processing", "ready", "error"] as const).find((value) => value === row.status) ?? "pending";
  return {
    id: row.id,
    plan: row.target,
    interval: row.billingInterval,
    status,
    checkout_url: status === "ready" ? row.checkoutUrl : null,
    error: status === "error" ? row.error : null,
    // The dashboard counts a checkout as paid the same way, once Polar's webhook has moved the business onto the plan.
    paid: status === "ready" && account?.plan === row.target && account.billingInterval === row.billingInterval && ["active", "trialing"].includes(account.subscriptionState ?? ""),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/**
 * The person a checkout is made out to, whose email Polar fills in and sends
 * receipts to. A per-business key acts for its creator, who must still be an
 * owner or admin. A platform key acts for an owner of the business other than
 * the key's own account, and is refused while there is none: every business the
 * key onboards would otherwise carry one email in Polar, which can tie their
 * payments together.
 */
async function checkoutPayerId(context: DomainContext, caller: ApiCaller): Promise<string> {
  if (caller.platformKeyId === undefined) return await resolveActingUserId(context, caller);
  if (caller.partnerId !== undefined) throw partnerPlatformKeyActsAsPartner();
  const [owner] = await inBusiness(context, caller, async (tx) => await tx.select({ userId: businessMemberships.userId }).from(businessMemberships).where(and(eq(businessMemberships.businessId, caller.businessId), eq(businessMemberships.role, "business_owner"), eq(businessMemberships.status, "active"), ne(businessMemberships.userId, caller.actingUserId))).orderBy(asc(businessMemberships.createdAt)).limit(1));
  if (!owner) throw conflict("Only the business's own owner can pay for a plan, and this business hasn't been claimed yet. Send the claim link first, or give it a managed plan.");
  return owner.userId;
}

/**
 * Asks Polar for a page where the customer pays. Like the dashboard, it sells
 * a plan only to a free business, one open checkout at a time; a paid plan
 * changes in Polar's billing portal. Callers say whether this deployment
 * sells the plan and interval.
 */
export async function createCheckoutForApi(context: DomainContext, caller: ApiCaller, input: ApiCheckoutCreate, options: { available: boolean }): Promise<ApiCheckout> {
  refusePartnerPlatformKey(caller, "checkout");
  if (!options.available) throw conflict("This deployment doesn't sell that plan and interval.");
  const userId = await checkoutPayerId(context, caller);
  return await inBusiness(context, caller, async (tx) => {
    const [account] = await tx.select({ source: billingAccounts.source, subscriptionState: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, caller.businessId)).limit(1);
    if (isManagedBillingAccount(account)) throw conflict("This business is on a managed plan, so LobbyStack bills it directly.");
    // Only a business on the free plan buys one: a self-hosted server's businesses have no limit to buy off.
    const entitlement = await loadEntitlement(tx, caller.businessId);
    if (entitlement.live || entitlement.source === "unlimited") throw conflict("This business already pays for a plan. Change it in the billing portal.");
    let checkoutId: string;
    try {
      checkoutId = await createBillingCheckoutRequestInTransaction(tx, { userId, businessId: caller.businessId, target: input.plan, billingInterval: input.interval });
    } catch (error) {
      // Someone else's checkout is still open, or the plan changed meanwhile.
      if (error instanceof Error && (error as { status?: unknown }).status === 409) throw conflict(error.message);
      throw error;
    }
    await audit(tx, caller, { eventType: "api.billing.checkout_started", entityType: "billing_checkout_request", entityId: checkoutId, payload: { plan: input.plan, interval: input.interval, payerUserId: userId } });
    return await loadCheckout(tx, caller.businessId, checkoutId);
  });
}

export async function getCheckoutForApi(context: DomainContext, caller: ApiCaller, checkoutId: string): Promise<ApiCheckout> {
  return await inBusiness(context, caller, async (tx) => await loadCheckout(tx, caller.businessId, checkoutId));
}

/** Puts the business on the managed enterprise plan. Callers check that an operator's platform key asked; a partner's key is refused here too. */
export async function setManagedPlanForApi(context: DomainContext, caller: ApiCaller): Promise<ApiBilling> {
  refusePartnerPlatformKey(caller, "managed_plan");
  return await inBusiness(context, caller, async (tx) => {
    const outcome = await setManagedPlanInTransaction(tx, { businessId: caller.businessId });
    if (outcome === "partner_business") throw conflict("Its partner bills this business, so it can't have a managed plan.");
    if (outcome === "paid_through_polar") throw conflict("This business pays through Polar. Cancel that subscription before giving it a managed plan.");
    if (outcome === "set") await audit(tx, caller, { eventType: "api.billing.managed_plan_set", entityType: "billing_account", entityId: caller.businessId, payload: { plan: "enterprise" } });
    return await loadBilling(tx, caller.businessId);
  });
}

/** Moves the business off its managed plan, back to the free plan. Callers check that an operator's platform key asked; a partner's key is refused here too. */
export async function endManagedPlanForApi(context: DomainContext, caller: ApiCaller): Promise<ApiBilling> {
  refusePartnerPlatformKey(caller, "managed_plan");
  return await inBusiness(context, caller, async (tx) => {
    if (!await endManagedPlanInTransaction(tx, { businessId: caller.businessId })) throw notFound("Managed plan");
    await audit(tx, caller, { eventType: "api.billing.managed_plan_ended", entityType: "billing_account", entityId: caller.businessId });
    return await loadBilling(tx, caller.businessId);
  });
}

// Phone numbers. A claim buys a real number, so the dashboard's rules apply:
// a free trial number for a cloud business without a paid plan, a paid plan
// for any other number, and its replacement and claim limits. Only the
// onboarding stage order doesn't.

const checkout = "Start a paid plan with POST /billing/checkout.";

// The API's wording for the refusals the dashboard's number rules raise, by
// code. The rest keep the dashboard's message.
const numberRefusalMessages: Record<string, string> = {
  number_claim_in_progress: "Another number claim for this business is still in progress. Wait for it to finish, then try again.",
  invalid_onboarding_stage: "This business can't pick a number yet.",
  business_number_exists: "This business already has a phone number. Release it first, or replace it with POST /phone-numbers/{phone_number_id}/replace.",
  dedicated_number_requires_paid_plan: `This phone number needs a paid plan. ${checkout}`,
  replacement_already_used: "This business already used its one number replacement.",
  replacement_already_reserved: "A replacement for this business's number is already in progress.",
  active_number_required: "Only an active number that isn't scheduled for release can be replaced.",
  phone_verification_required: `A free trial number needs the mobile number of the account this key acts as, verified for this business in the dashboard. Or: ${checkout}`,
  trial_already_used: `This business, the account this key acts as, or its verified phone already had a free trial number. ${checkout}`,
  trial_ip_limited: `A free trial number already started from this network in the last 30 days. ${checkout}`,
  trial_not_needed: "This business has a paid plan now, so its number isn't a trial. Search again.",
  trial_not_available: `A free trial number isn't available for this business. ${checkout}`,
  number_claim_rate_limited: "Too many numbers were claimed in the last hour. Try again later.",
  daily_claim_quota_reached: "Too many numbers were claimed today. Try again tomorrow.",
  monthly_claim_quota_reached: "Too many numbers were claimed in the last 30 days. Try again later.",
  partner_numbers_unavailable: "A partner's business can't get a phone number on this server yet.",
  partner_number_limit_reached: "This business's partner needs a paid tier for more phone numbers. Its owners choose one on the console's Billing page.",
  partner_trial_used: "This business's partner already used its free trial number. Its owners choose a paid tier on the console's Billing page.",
};

// The claim limits know only that a window is full, so Retry-After is its length, at most a day.
const numberRetryAfter: Record<string, string> = { number_claim_rate_limited: "3600", daily_claim_quota_reached: "86400", monthly_claim_quota_reached: "86400", trial_ip_limited: "86400" };

/** Turns a refusal from the number rules, which carry a status and code, into the API's error. */
function numberRefusal(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const { status, code } = error as { status?: unknown; code?: unknown };
  if (typeof status !== "number" || typeof code !== "string") return error;
  const message = numberRefusalMessages[code] ?? error.message;
  if (status === 429) return new PublicApiError(429, "rate_limited", message, undefined, { "Retry-After": numberRetryAfter[code] ?? "3600" });
  if (status === 404) return notFound("Business");
  if (code === "unsupported_country") return invalidRequest(message, [{ path: "country", message: "Not available." }]);
  if (code === "replacement_number_must_differ") return invalidRequest("Pick a number other than the one being replaced.", [{ path: "offer_token", message: "The same number as the one being replaced." }]);
  if (code === "number_offer_invalid" || code === "number_offer_expired") return invalidRequest("The offer is invalid or has expired. Search again.", [{ path: "offer_token", message: "Invalid or expired." }]);
  if (status === 409) return conflict(message);
  if (status === 400) return invalidRequest(message);
  return error;
}

// The carrier's errors never reach the caller as their own: its 401 or 403
// would read as the caller's key. A filter it refuses, or a kind of number a
// country doesn't have, is a 400; anything else is our failure.
function numberSearchError(error: unknown): unknown {
  const status = typeof error === "object" && error !== null && "status" in error ? (error as { status: unknown }).status : undefined;
  if (status === 400) return invalidRequest("The carrier can't search with these filters. Check area_code, city, region and postal_code.");
  if (status === 404) return invalidRequest("The carrier has no numbers of this kind in this country.", [{ path: "kind", message: "Not offered in this country." }]);
  return new Error("The carrier's number search failed.", { cause: error });
}

/** Refuses a number id that isn't this business's, or a number that can't be replaced. */
async function requireReplaceableNumber(tx: DatabaseTransaction, businessId: string, phoneNumberId: string): Promise<void> {
  const [number] = await tx.select({ status: phoneNumbers.status, reclaimScheduledAt: phoneNumbers.reclaimScheduledAt }).from(phoneNumbers).where(and(eq(phoneNumbers.id, phoneNumberId), eq(phoneNumbers.businessId, businessId))).limit(1);
  if (!number) throw notFound("Phone number");
  if (number.status !== "active" || number.reclaimScheduledAt) throw conflict("Only an active number that isn't scheduled for release can be replaced.");
}

export async function listPhoneNumbersForApi(context: DomainContext, caller: ApiCaller): Promise<ApiPhoneNumber[]> {
  return await inBusiness(context, caller, async (tx) => await listPhoneNumberResources(tx, caller.businessId));
}

/**
 * Finds numbers the business can claim, as offers signed for the account the
 * caller acts as. `replaces` asks for replacement offers instead. Without a
 * paid plan, a cloud business is offered free trial numbers when the dashboard
 * would offer them. `beforeSearch` runs once the business may search, just
 * before the carrier is asked, so a refused search uses up no search limit.
 */
export async function searchPhoneNumbersForApi(context: DomainContext, caller: ApiCaller, input: ApiPhoneNumberSearch, options: { userId: string; provider: NumberInventoryProvider; claimTokenSecret: string; beforeSearch?: (() => Promise<void>) | undefined }): Promise<ApiPhoneNumberOffer[]> {
  const purpose = input.replaces ? "replacement" : "onboarding";
  const selection: Partial<NumberSelection> = {
    ...(input.country ? { countryCode: input.country } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.area_code ? { areaCode: input.area_code } : {}),
    ...(input.city ? { city: input.city } : {}),
    ...(input.region ? { regionCode: input.region } : {}),
    ...(input.postal_code ? { postalCode: input.postal_code } : {}),
  };
  const eligibility = await inBusiness(context, caller, async (tx) => {
    if (input.replaces) await requireReplaceableNumber(tx, caller.businessId, input.replaces);
    try {
      return await numberEligibilityInTransaction(tx, { userId: options.userId, businessId: caller.businessId, purpose, selection, via: "api" });
    } catch (error) {
      throw numberRefusal(error);
    }
  });
  await options.beforeSearch?.();
  let offers: Awaited<ReturnType<typeof offerBusinessNumbers>>;
  try {
    offers = await offerBusinessNumbers({ businessId: caller.businessId, userId: options.userId, purpose, eligibility, selection, limit: input.limit, claimTokenSecret: options.claimTokenSecret }, options.provider);
  } catch (error) {
    const refusal = numberRefusal(error);
    throw refusal instanceof PublicApiError ? refusal : numberSearchError(error);
  }
  return offers.map((offer) => ({
    phone_number: offer.phoneE164,
    country: offer.countryCode as ApiPhoneNumberOffer["country"],
    kind: offer.kind,
    locality: offer.locality ?? null,
    region: offer.region ?? null,
    capabilities: { voice: offer.capabilities.voice, sms: offer.capabilities.sms },
    trial: offer.trial,
    offer_token: offer.claimToken,
    expires_at: offer.expiresAt.toISOString(),
  }));
}

/**
 * Claims an offer, or with `replaces` a replacement offer for that number, and
 * queues its purchase. The offer must be for this business and the account
 * the caller acts as. A trial offer starts the business's free trial, once per
 * business, person and phone, as in the dashboard. Every key acts as one
 * person, so each key gets one trial at most.
 */
export async function claimPhoneNumberForApi(context: DomainContext, caller: ApiCaller, input: { offerToken: string; replaces?: string | undefined }, options: { userId: string; claimTokenSecret: string }): Promise<ApiPhoneNumberClaim> {
  const purpose = input.replaces ? "replacement" : "onboarding";
  let offer: NumberOffer;
  try {
    offer = readNumberOffer(input.offerToken, options.claimTokenSecret);
  } catch (error) {
    throw numberRefusal(error);
  }
  if (offer.businessId !== caller.businessId || offer.userId !== options.userId) throw invalidRequest("This offer was made for another business or account. Search again with this key.", [{ path: "offer_token", message: "Made for another business or account." }]);
  if (offer.purpose !== purpose) throw invalidRequest(purpose === "replacement" ? "This offer is for a new number. Claim it with POST /phone-numbers/claims." : "This offer is for a replacement. Claim it with POST /phone-numbers/{phone_number_id}/replace.", [{ path: "offer_token", message: "The wrong kind of offer." }]);
  return await inBusiness(context, caller, async (tx) => {
    if (input.replaces) await requireReplaceableNumber(tx, caller.businessId, input.replaces);
    let claimId: string;
    try {
      claimId = await reserveApiNumberClaimInTransaction(tx, { businessId: caller.businessId, userId: options.userId, offer, claimToken: input.offerToken, replacingPhoneNumberId: input.replaces ?? null, quotaByBusiness: caller.platformKeyId !== undefined, requestKey: randomUUID() });
    } catch (error) {
      throw numberRefusal(error);
    }
    await audit(tx, caller, { eventType: "api.phone_number.claim_started", entityType: "number_claim", entityId: claimId, payload: { phoneNumber: offer.e164, trial: offer.selection.trial === true, ...(input.replaces ? { replacesPhoneNumberId: input.replaces } : {}) } });
    const claim = await loadPhoneNumberClaimResource(tx, caller.businessId, claimId);
    if (!claim) throw new Error("The number claim could not be read back.");
    return claim;
  });
}

export async function getPhoneNumberClaimForApi(context: DomainContext, caller: ApiCaller, claimId: string): Promise<ApiPhoneNumberClaim> {
  const claim = await inBusiness(context, caller, async (tx) => {
    await expireAbandonedNumberClaimsInTransaction(tx, caller.businessId);
    return await loadPhoneNumberClaimResource(tx, caller.businessId, claimId);
  });
  if (!claim) throw notFound("Claim");
  return claim;
}

/**
 * Schedules the number's release now. A number already on its way out comes
 * back as it is, and one whose replacement is still being bought is a 409.
 */
export async function releasePhoneNumberForApi(context: DomainContext, caller: ApiCaller, phoneNumberId: string): Promise<ApiPhoneNumber> {
  return await inBusiness(context, caller, async (tx) => {
    // Take the claims' lock before reading, so concurrent releases see each other.
    await lockBusinessNumberClaims(tx, caller.businessId);
    const number = await loadPhoneNumberResource(tx, caller.businessId, phoneNumberId);
    if (!number) throw notFound("Phone number");
    if (number.status !== "active" || (number.release_scheduled_at !== null && Date.parse(number.release_scheduled_at) <= Date.now())) return number;
    const outcome = await schedulePhoneNumberReleaseInTransaction(tx, { businessId: caller.businessId, phoneNumberId });
    if (outcome === "being_replaced") throw conflict(NUMBER_BEING_REPLACED_MESSAGE);
    if (outcome === "scheduled") await audit(tx, caller, { eventType: "api.phone_number.release_scheduled", entityType: "phone_number", entityId: phoneNumberId, payload: { phoneNumber: number.phone_number } });
    return (await loadPhoneNumberResource(tx, caller.businessId, phoneNumberId)) ?? number;
  });
}

// Onboarding. The API ignores the dashboard's step order: it reports what the
// business has, and completion checks only what the dashboard can't finish without.

// The setup guide step each skippable item stands for.
const onboardingSetupSteps: Record<ApiOnboardingUpdate["skip_steps"][number], SetupGuideStepId> = { knowledge: "sources", phone_number: "phoneNumber", full_site_read: "fullScan", test_call: "testCall" };

const onboardingHints: Record<ApiOnboardingItem, string> = {
  business_details: "Set a name and time zone with PATCH /business.",
  knowledge: "Add a website with POST /knowledge/sources, or knowledge with POST /knowledge.",
  greeting: "Save a greeting with PATCH /receptionist.",
  plan: "Start a paid plan with POST /billing/checkout.",
  phone_number: "Claim a number with POST /phone-numbers/claims, or send skip_number.",
  full_site_read: "Read the rest of the website with POST /knowledge/sources/{source_id}/expand.",
  test_call: "Call the business's number once.",
};

async function loadOnboarding(tx: DatabaseTransaction, businessId: string): Promise<ApiOnboarding> {
  const [business] = await tx.select({ name: businesses.name, timezone: businesses.timezone, stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) throw notFound("Business");
  const [profile] = await tx.select({ greeting: receptionistProfiles.greeting }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)).limit(1);
  const [indexed] = await tx.select({ count: count() }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.status, "indexed")));
  const [entries] = await tx.select({ count: count() }).from(knowledgeSnippets).where(and(eq(knowledgeSnippets.businessId, businessId), eq(knowledgeSnippets.active, true)));
  const { steps } = await loadSetupGuideInTransaction(tx, businessId);
  // The plan step is done once the business holds a live entitlement. A self-hosted server sells no plan.
  const entitlement = await loadEntitlement(tx, businessId);
  const paid = entitlement.live && entitlement.source !== "unlimited";
  const answeredCall = await hasAnsweredPhoneCall(tx, businessId);
  const item = (id: ApiOnboardingItem, done: boolean, skipped: boolean, required: boolean) => ({ id, status: done ? "done" as const : skipped ? "skipped" as const : "missing" as const, required });
  const checklist = [
    item("business_details", business.name.trim().length > 0 && business.timezone.trim().length > 0, false, true),
    item("knowledge", Number(indexed?.count ?? 0) + Number(entries?.count ?? 0) > 0, steps.sources === "skipped", false),
    // A business without a saved profile answers with the default greeting, as GET /receptionist shows.
    item("greeting", !profile || profile.greeting.trim().length > 0, false, false),
    item("plan", paid, !paid, false),
    item("phone_number", steps.phoneNumber === "complete", steps.phoneNumber === "skipped", paid),
    item("full_site_read", steps.fullScan === "complete", steps.fullScan === "skipped", false),
    // From the command line there is no browser test call, so the first answered call to the number counts.
    item("test_call", steps.testCall === "complete" || answeredCall, steps.testCall === "skipped", false),
  ];
  // The step the dashboard shows.
  const stage = normalizeOnboardingStage(business.stage);
  const complete = stage === "complete";
  return { stage, complete, checklist, missing: complete ? [] : checklist.filter((entry) => entry.required && entry.status === "missing").map((entry) => entry.id) };
}

export async function getOnboardingForApi(context: DomainContext, caller: ApiCaller): Promise<ApiOnboarding> {
  return await inBusiness(context, caller, async (tx) => await loadOnboarding(tx, caller.businessId));
}

export async function updateOnboardingForApi(context: DomainContext, caller: ApiCaller, input: ApiOnboardingUpdate): Promise<ApiOnboarding> {
  return await inBusiness(context, caller, async (tx) => {
    const wanted = new Set<string>(input.skip_steps.map((step) => onboardingSetupSteps[step]));
    const changed = await updateSetupGuideSkippedStepsInTransaction(tx, caller.businessId, (current) => {
      const guide = new Set<string>(setupGuideStepIds);
      const skipped = current.filter((step) => guide.has(step));
      // The same steps in another order change nothing.
      if (skipped.length === wanted.size && skipped.every((step) => wanted.has(step))) return current;
      return [...current.filter((step) => !guide.has(step)), ...setupGuideStepIds.filter((step) => wanted.has(step))];
    });
    if (!changed) throw notFound("Business");
    if (changed.after !== changed.before) await audit(tx, caller, { eventType: "api.onboarding.updated", entityType: "business", entityId: caller.businessId, payload: { skipSteps: input.skip_steps } });
    return await loadOnboarding(tx, caller.businessId);
  });
}

/**
 * Finishes onboarding once the business has what the dashboard requires. A
 * referral credits an affiliate only while onboarding is still open, as the
 * dashboard's last step does; attributeBusiness runs as the system actor, so
 * the caller passes a context whose database role can be one.
 */
export async function completeOnboardingForApi(context: DomainContext, caller: ApiCaller, input: ApiOnboardingComplete, options: { attribution?: { context: DomainContext; referredUserId: string } | undefined } = {}): Promise<ApiOnboarding> {
  const refusal = (onboarding: ApiOnboarding): PublicApiError | null => {
    const missing = onboarding.missing.filter((id) => !(id === "phone_number" && input.skip_number));
    return missing.length ? new PublicApiError(409, "conflict", `The business isn't ready to finish onboarding. Missing: ${missing.join(", ")}.`, missing.map((id) => ({ path: id, message: onboardingHints[id] }))) : null;
  };
  const { onboarding: before, platformKeyOnboarded } = await inBusiness(context, caller, async (tx) => ({
    onboarding: await loadOnboarding(tx, caller.businessId),
    platformKeyOnboarded: (await tx.select({ businessId: platformKeyBusinesses.businessId }).from(platformKeyBusinesses).where(eq(platformKeyBusinesses.businessId, caller.businessId)).limit(1)).length > 0,
  }));
  if (before.complete) return before;
  // A business a platform key onboarded came through the key's group, whose
  // own account owns it, so no affiliate is credited with it, whichever key asks.
  if (input.referral_code && platformKeyOnboarded) throw invalidRequest("A business a platform key onboarded can't credit a referral.", [{ path: "referral_code", message: "Not accepted for a business a platform key onboarded." }]);
  const notReady = refusal(before);
  if (notReady) throw notReady;
  if (input.referral_code && options.attribution) await attributeBusiness(options.attribution.context, { businessId: caller.businessId, referredUserId: options.attribution.referredUserId, referralCode: input.referral_code, source: "referral_link" });
  return await inBusiness(context, caller, async (tx) => {
    await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, caller.businessId)).for("no key update");
    const current = await loadOnboarding(tx, caller.businessId);
    if (current.complete) return current;
    const stillNotReady = refusal(current);
    if (stillNotReady) throw stillNotReady;
    const source = input.source?.trim() || null;
    const completedAt = new Date();
    await tx.update(businesses).set({ onboardingAttribution: source, onboardingStage: "complete", updatedAt: completedAt }).where(eq(businesses.id, caller.businessId));
    // The founder's check-in is for people who set up their own business. It
    // goes to the first owner, which for a business a platform key onboarded is the key's account.
    if (caller.platformKeyId === undefined && !platformKeyOnboarded) await scheduleOnboardingFollowupInTransaction(tx, caller.businessId, completedAt);
    await audit(tx, caller, { eventType: "api.onboarding.completed", entityType: "business", entityId: caller.businessId, payload: { skipNumber: Boolean(input.skip_number), ...(source ? { source } : {}) } });
    return await loadOnboarding(tx, caller.businessId);
  });
}

// Team. People join through invitations they accept with a verified account
// for the invited email; a claim link is an owner invitation that also takes
// the account that sent it off the team, which is how a platform key's account
// hands over a business it set up.

type TeamInvitationRow = { id: string; email: string; role: string; transfersOwnership: boolean; expiresAt: Date; createdAt: Date };
const teamInvitationColumns = { id: businessInvitations.id, email: businessInvitations.email, role: businessInvitations.role, transfersOwnership: businessInvitations.transfersOwnership, expiresAt: businessInvitations.expiresAt, createdAt: businessInvitations.createdAt };

function serializeTeamInvitation(row: TeamInvitationRow): ApiTeamInvitation {
  return { id: row.id, email: row.email, role: row.role as ApiTeamInvitation["role"], status: row.expiresAt.getTime() <= Date.now() ? "expired" : "pending", transfers_ownership: row.transfersOwnership, expires_at: row.expiresAt.toISOString(), created_at: row.createdAt.toISOString() };
}

// The worker role may read the name and email of any account, so it joins them in directly.
function selectTeamMembers(tx: DatabaseTransaction, businessId: string, membershipId?: string) {
  return tx.select({ id: businessMemberships.id, userId: businessMemberships.userId, name: users.name, email: users.email, role: businessMemberships.role, joinedAt: businessMemberships.createdAt }).from(businessMemberships).innerJoin(users, eq(users.id, businessMemberships.userId)).where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.status, "active"), membershipId === undefined ? undefined : eq(businessMemberships.id, membershipId)));
}

function serializeTeamMember(row: { id: string; userId: string; name: string | null; email: string; role: string; joinedAt: Date }): ApiTeamMember {
  return { id: row.id, user_id: row.userId, name: row.name, email: row.email, role: row.role as ApiTeamMember["role"], joined_at: row.joinedAt.toISOString() };
}

async function loadTeamMember(tx: DatabaseTransaction, businessId: string, membershipId: string): Promise<ApiTeamMember | null> {
  const [row] = await selectTeamMembers(tx, businessId, membershipId).limit(1);
  return row ? serializeTeamMember(row) : null;
}

function teamEmail(value: string): string {
  const normalized = normalizeAuthEmail(value);
  if (!isSingleEmailAddress(normalized)) throw invalidRequest("Enter one valid email address.", [{ path: "email", message: "One address, such as sam@example.com." }]);
  return normalized;
}

const lastOwner = () => conflict("A business keeps at least one owner. Hand it over with POST /team/claim-link first.");

export async function getTeamForApi(context: DomainContext, caller: ApiCaller): Promise<ApiTeam> {
  return await inBusiness(context, caller, async (tx) => {
    const members = await selectTeamMembers(tx, caller.businessId).orderBy(asc(businessMemberships.createdAt), asc(businessMemberships.id));
    const invitations = await tx.select(teamInvitationColumns).from(businessInvitations).where(and(eq(businessInvitations.businessId, caller.businessId), eq(businessInvitations.status, "pending"))).orderBy(desc(businessInvitations.createdAt), desc(businessInvitations.id));
    return { members: members.map(serializeTeamMember), invitations: invitations.map(serializeTeamInvitation) };
  });
}

/**
 * Invites someone as the account the caller acts as. `beforeSend` runs once
 * the request is valid, just before the email is queued, so a refused one
 * uses up no invitation limit.
 */
/**
 * Invites someone to the business's team. The person the caller acts as
 * sends it, or for a partner's platform key, the key itself: it acts as the
 * partner, which has no account.
 */
export async function createTeamInvitationForApi(context: DomainContext, caller: ApiCaller, input: ApiTeamInvitationCreate, options: ({ userId: string; platformKeyId?: undefined } | { platformKeyId: string; userId?: undefined }) & { beforeSend?: (() => Promise<void>) | undefined }): Promise<ApiTeamInvitation> {
  const normalizedEmail = teamEmail(input.email);
  await options.beforeSend?.();
  return await inBusiness(context, caller, async (tx) => {
    const inviter = options.userId !== undefined ? { invitedByUserId: options.userId } : { invitedByPlatformKeyId: options.platformKeyId };
    // Revoking the key waits for this invitation, then revokes it too.
    if (inviter.invitedByPlatformKeyId !== undefined) await lockActivePartnerPlatformKey(tx, inviter.invitedByPlatformKeyId);
    const { invitationId } = await insertInvitationInTransaction(tx, { businessId: caller.businessId, normalizedEmail, role: input.role, ...inviter });
    await audit(tx, caller, { eventType: "api.team.invitation_created", entityType: "business_invitation", entityId: invitationId, payload: { role: input.role } });
    const [row] = await tx.select(teamInvitationColumns).from(businessInvitations).where(eq(businessInvitations.id, invitationId)).limit(1);
    return serializeTeamInvitation(row!);
  });
}

export async function revokeTeamInvitationForApi(context: DomainContext, caller: ApiCaller, invitationId: string): Promise<void> {
  await inBusiness(context, caller, async (tx) => {
    if (!await revokeInvitationInTransaction(tx, { businessId: caller.businessId, invitationId })) throw notFound("Invitation");
    await audit(tx, caller, { eventType: "api.team.invitation_revoked", entityType: "business_invitation", entityId: invitationId });
  });
}

export async function updateTeamMemberForApi(context: DomainContext, caller: ApiCaller, membershipId: string, input: ApiTeamMemberUpdate): Promise<ApiTeamMember> {
  return await inBusiness(context, caller, async (tx) => {
    const current = await loadTeamMember(tx, caller.businessId, membershipId);
    if (!current) throw notFound("Team member");
    if (current.role === input.role) return current;
    const outcome = await updateMemberRoleInTransaction(tx, { businessId: caller.businessId, membershipId, role: input.role });
    if (outcome === "not_found") throw notFound("Team member");
    if (outcome === "final_owner") throw lastOwner();
    await audit(tx, caller, { eventType: "api.team.member_updated", entityType: "business_membership", entityId: membershipId, payload: { role: input.role, previousRole: current.role } });
    return (await loadTeamMember(tx, caller.businessId, membershipId))!;
  });
}

export async function removeTeamMemberForApi(context: DomainContext, caller: ApiCaller, membershipId: string): Promise<void> {
  await inBusiness(context, caller, async (tx) => {
    const outcome = await removeMemberInTransaction(tx, { businessId: caller.businessId, membershipId }, async () => (await selectTeamMembers(tx, caller.businessId, membershipId).limit(1))[0]?.email);
    if (outcome === "not_found") throw notFound("Team member");
    if (outcome === "final_owner") throw lastOwner();
    await audit(tx, caller, { eventType: "api.team.member_removed", entityType: "business_membership", entityId: membershipId });
  });
}

/**
 * Hands the business over (D2): an owner invitation that also takes the
 * account the caller acts as off the team once accepted, so that account must
 * own the business. A new claim link revokes the open one.
 */
export async function createClaimLinkForApi(context: DomainContext, caller: ApiCaller, input: ApiClaimLinkCreate, options: { userId: string; beforeSend?: (() => Promise<void>) | undefined }): Promise<ApiClaimLink> {
  // A partner keeps its businesses, so its keys never hand one over.
  refusePartnerPlatformKey(caller, "claim_link");
  const normalizedEmail = teamEmail(input.email);
  const owns = async (tx: DatabaseTransaction) => (await tx.select({ role: businessMemberships.role }).from(businessMemberships).where(and(eq(businessMemberships.businessId, caller.businessId), eq(businessMemberships.userId, options.userId), eq(businessMemberships.status, "active"))).limit(1))[0]?.role === "business_owner";
  const notOwner = () => conflict("Only an owner can hand the business over, and the account this key acts as doesn't own it.");
  const standing = await inBusiness(context, caller, async (tx) => ({
    partnerId: (await tx.select({ partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, caller.businessId)).limit(1))[0]?.partnerId ?? null,
    owner: await owns(tx),
  }));
  // A partner's business stays with its partner, which can release it to its owner.
  if (standing.partnerId) throw conflict(partnerBusinessNotClaimable().message);
  if (!standing.owner) throw notOwner();
  await options.beforeSend?.();
  return await inBusiness(context, caller, async (tx) => {
    await lockBusinessTeam(tx, caller.businessId);
    if (!await owns(tx)) throw notOwner();
    await tx.update(businessInvitations).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(businessInvitations.businessId, caller.businessId), eq(businessInvitations.status, "pending"), eq(businessInvitations.transfersOwnership, true)));
    const { invitationId, token } = await insertInvitationInTransaction(tx, { businessId: caller.businessId, invitedByUserId: options.userId, normalizedEmail, role: "business_owner", transfersOwnership: true });
    await audit(tx, caller, { eventType: "api.team.claim_link_created", entityType: "business_invitation", entityId: invitationId });
    const [row] = await tx.select(teamInvitationColumns).from(businessInvitations).where(eq(businessInvitations.id, invitationId)).limit(1);
    return { invitation: serializeTeamInvitation(row!), url: invitationUrl(token) };
  });
}

// Website chat widget keys

/** The configuration as the dashboard stores it, from the API's snake_case. */
function widgetConfigFromApi(config: ApiWidgetConfig): Record<string, unknown> {
  const lead = config.lead_form;
  return {
    ...(config.color !== undefined ? { color: config.color } : {}),
    ...(config.position !== undefined ? { position: config.position } : {}),
    ...(config.title !== undefined ? { title: config.title } : {}),
    ...(config.subtitle !== undefined ? { subtitle: config.subtitle } : {}),
    ...(config.greeting !== undefined ? { greeting: config.greeting } : {}),
    ...(config.locale !== undefined ? { localeOverride: config.locale } : {}),
    ...(lead !== undefined ? { leadForm: { enabled: lead.enabled, ...(lead.require_phone !== undefined ? { requirePhone: lead.require_phone } : {}), ...(lead.require_email !== undefined ? { requireEmail: lead.require_email } : {}), ...(lead.show_before_chat !== undefined ? { showBeforeChat: lead.show_before_chat } : {}) } } : {}),
  };
}

function widgetOrigins(values: string[]): string[] {
  return [...new Set(values.map(normalizeWidgetOrigin))];
}

/** JSON with sorted keys, so two configurations compare by value. */
function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${sortedJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function listWidgetKeysForApi(context: DomainContext, caller: ApiCaller): Promise<ApiWidgetKey[]> {
  return await inBusiness(context, caller, async (tx) => (await tx.select().from(widgetKeys).where(eq(widgetKeys.businessId, caller.businessId)).orderBy(desc(widgetKeys.createdAt), desc(widgetKeys.id))).map(serializeWidgetKey));
}

/** Creates a widget key and the script tag for it, served from the dashboard's own origin. */
export async function createWidgetKeyForApi(context: DomainContext, caller: ApiCaller, input: ApiWidgetKeyCreate, options: { appOrigin: string }): Promise<ApiWidgetKeyCreated> {
  return await inBusiness(context, caller, async (tx) => {
    const { row, key } = await insertWidgetKeyInTransaction(tx, { businessId: caller.businessId, label: input.label, allowedOrigins: widgetOrigins(input.allowed_origins), config: widgetConfigFromApi(input.config ?? {}) });
    await audit(tx, caller, { eventType: "api.widget_key.created", entityType: "widget_key", entityId: row.id });
    const widgetKey = serializeWidgetKey(row);
    return { ...widgetKey, key, embed_snippet: widgetEmbedSnippet(options.appOrigin, key) };
  });
}

export async function updateWidgetKeyForApi(context: DomainContext, caller: ApiCaller, widgetKeyId: string, input: ApiWidgetKeyUpdate): Promise<ApiWidgetKey> {
  if (Object.keys(input).length === 0) throw invalidRequest("Send at least one field to update.");
  return await inBusiness(context, caller, async (tx) => {
    const [current] = await tx.select().from(widgetKeys).where(and(eq(widgetKeys.id, widgetKeyId), eq(widgetKeys.businessId, caller.businessId))).limit(1).for("no key update");
    if (!current) throw notFound("Widget key");
    const before = serializeWidgetKey(current);
    // A revoked key may be on a page someone else controls, so it stays off.
    if (before.status === "revoked" && input.status !== undefined && input.status !== "revoked") throw conflict("A revoked widget key can't be turned back on. Create a new one.");
    const patch: WidgetKeyPatch = {};
    if (input.label !== undefined && input.label !== before.label) patch.label = input.label;
    // Compare what the widget would use, so sending back what GET showed changes nothing.
    if (input.allowed_origins !== undefined) {
      const origins = widgetOrigins(input.allowed_origins);
      if (sortedJson([...origins].sort()) !== sortedJson([...before.allowed_origins].sort())) patch.allowedOrigins = origins;
    }
    if (input.config !== undefined) {
      // The dashboard's live chat switch isn't part of the API's configuration, so a replaced one keeps it.
      const liveChat = (current.config as { liveChat?: unknown } | null)?.liveChat;
      const config = { ...widgetConfigFromApi(input.config), ...(liveChat !== undefined ? { liveChat } : {}) };
      if (sortedJson(serializeWidgetKey({ ...current, config }).config) !== sortedJson(before.config)) patch.config = config;
    }
    if (input.status !== undefined && input.status !== before.status) patch.status = input.status;
    if (Object.keys(patch).length === 0) return before;
    const row = await updateWidgetKeyInTransaction(tx, { businessId: caller.businessId, widgetKeyId, patch });
    if (!row) throw notFound("Widget key");
    await audit(tx, caller, { eventType: "api.widget_key.updated", entityType: "widget_key", entityId: widgetKeyId, payload: { fields: Object.keys(patch) } });
    return serializeWidgetKey(row);
  });
}

// Calendars. Google asks the calendar's owner to agree in a browser, so the
// API hands out a link that starts that flow in the dashboard, then manages
// the connections it creates as the integrations page does.

/** What the API needs from Google for a connection: its tokens, kept encrypted, and its calendars. */
export type CalendarAccess = {
  decryptToken: (value: string) => string;
  encryptToken: (value: string) => string;
  refreshAccessToken: (input: { refreshToken: string }) => Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }>;
  listCalendars: (input: { accessToken: string }) => Promise<Array<{ id: string; summary: string; primary: boolean; accessRole?: string }>>;
};

type AccountCalendar = Awaited<ReturnType<CalendarAccess["listCalendars"]>>[number];

/** LobbyStack adds appointments to the calendar it reads, so it needs one it may write to, as in the dashboard. */
function isWritableCalendar(calendar: AccountCalendar): boolean {
  return calendar.accessRole === "owner" || calendar.accessRole === "writer";
}

// Google refused the stored authorization, or none is stored, so only connecting again helps.
function needsReconnect(error: unknown): boolean {
  return error instanceof Error && (error.message === "Google Calendar authorization requires reconnection." || (error as { reconnectRequired?: unknown }).reconnectRequired === true);
}

/** The status Google answered a failed calendar request with, which the provider's error carries. */
function googleStatus(error: unknown): unknown {
  return typeof error === "object" && error !== null ? (error as { responseStatus?: unknown }).responseStatus : undefined;
}

/** The account's calendars, with a token refreshed under the connection's lock when it's about to expire. */
async function accountCalendars(context: DomainContext, caller: ApiCaller, connectionId: string, access: CalendarAccess): Promise<AccountCalendar[]> {
  const list = async (forceRefresh: boolean) => await access.listCalendars({ accessToken: await resolveCalendarAccessToken(context, { businessId: caller.businessId, connectionId, decryptToken: access.decryptToken, encryptToken: access.encryptToken, refreshAccessToken: access.refreshAccessToken, forceRefresh }) });
  try {
    return await list(false).catch(async (error: unknown) => {
      // A token revoked in the Google account still looks unexpired here.
      // Refreshing it once either works or shows that the grant is gone.
      if (googleStatus(error) === 401) return await list(true);
      throw error;
    });
  } catch (error) {
    if (needsReconnect(error) || googleStatus(error) === 401) throw conflict("Google no longer accepts this connection. Connect the calendar again with POST /calendars/google/connect.");
    // Disconnected since it was read.
    if (error instanceof Error && error.message === "Calendar connection is unavailable.") throw notFound("Calendar connection");
    // Google's own errors never reach the caller: its 401 would read as the caller's key.
    throw new Error("Google Calendar couldn't list the account's calendars.", { cause: error });
  }
}

async function loadCalendarConnection(tx: DatabaseTransaction, businessId: string, connectionId: string) {
  return (await listCalendarConnectionsInTransaction(tx, { businessId, connectionId }))[0] ?? null;
}

/** Records the link and returns it. `link` signs it in the admin app, which serves the page it opens. */
export async function createCalendarConnectLinkForApi(context: DomainContext, caller: ApiCaller, options: { link: (input: { businessId: string }) => { url: string; expiresAt: Date } }): Promise<ApiCalendarConnectLink> {
  return await inBusiness(context, caller, async (tx) => {
    const { url, expiresAt } = options.link({ businessId: caller.businessId });
    await audit(tx, caller, { eventType: "api.calendar.connect_link_created", entityType: "business", entityId: caller.businessId, payload: { provider: "google", expiresAt: expiresAt.toISOString() } });
    return { url, expires_at: expiresAt.toISOString() };
  });
}

export async function listCalendarConnectionsForApi(context: DomainContext, caller: ApiCaller): Promise<ApiCalendarConnection[]> {
  return await inBusiness(context, caller, async (tx) => (await listCalendarConnectionsInTransaction(tx, { businessId: caller.businessId })).map(serializeCalendarConnection));
}

export async function listAccountCalendarsForApi(context: DomainContext, caller: ApiCaller, connectionId: string, access: () => CalendarAccess): Promise<ApiAccountCalendar[]> {
  const connection = await inBusiness(context, caller, async (tx) => await loadCalendarConnection(tx, caller.businessId, connectionId));
  if (!connection) throw notFound("Calendar connection");
  return (await accountCalendars(context, caller, connectionId, access())).map((calendar) => ({ id: calendar.id, name: calendar.summary, primary: calendar.primary, writable: isWritableCalendar(calendar), selected: calendar.id === connection.selectedCalendarId }));
}

/** Picks the calendar or the staff member. `access` is called only when a new calendar has to be checked with Google. */
export async function updateCalendarConnectionForApi(context: DomainContext, caller: ApiCaller, connectionId: string, input: ApiCalendarConnectionUpdate, access: () => CalendarAccess): Promise<ApiCalendarConnection> {
  if (Object.keys(input).length === 0) throw invalidRequest("Send at least one field to update.");
  const current = await inBusiness(context, caller, async (tx) => await loadCalendarConnection(tx, caller.businessId, connectionId));
  if (!current) throw notFound("Calendar connection");
  const calendarId = input.calendar_id !== undefined && input.calendar_id !== current.selectedCalendarId ? input.calendar_id : undefined;
  if (calendarId !== undefined) {
    const picked = (await accountCalendars(context, caller, connectionId, access())).find((calendar) => calendar.id === calendarId);
    if (!picked) throw invalidRequest("The connected account has no calendar with this id.", [{ path: "calendar_id", message: "Use an id from GET /calendars/{connection_id}/calendars." }]);
    if (!isWritableCalendar(picked)) throw invalidRequest("LobbyStack can't add appointments to this calendar. Pick one the account can change.", [{ path: "calendar_id", message: "Not writable." }]);
  }
  return await inBusiness(context, caller, async (tx) => {
    // Held to the end, so a disconnect can't land between the checks and the changes.
    const [locked] = await tx.select({ staffId: calendarConnections.staffId, selectedCalendarId: calendarConnections.selectedCalendarId }).from(calendarConnections).where(and(eq(calendarConnections.id, connectionId), eq(calendarConnections.businessId, caller.businessId), ne(calendarConnections.status, "disconnected"))).limit(1).for("no key update");
    if (!locked) throw notFound("Calendar connection");
    const fields: string[] = [];
    // A calendar_id not checked with Google above was the connection's own calendar
    // when the request began. If someone picked another since, it goes back, as any later write would.
    if (input.calendar_id !== undefined && input.calendar_id !== locked.selectedCalendarId) {
      if (!await selectCalendarInTransaction(tx, { businessId: caller.businessId, connectionId, calendarId: input.calendar_id })) throw notFound("Calendar connection");
      fields.push("calendar_id");
    }
    if (input.staff_id !== undefined && input.staff_id !== locked.staffId) {
      const outcome = await assignCalendarStaffInTransaction(tx, { businessId: caller.businessId, connectionId, staffId: input.staff_id });
      if (outcome === "staff_not_found") throw invalidRequest("staff_id isn't an active staff member of the business.", [{ path: "staff_id", message: "Use an active staff member's id from GET /staff." }]);
      if (outcome === "not_found") throw notFound("Calendar connection");
      fields.push("staff_id");
    }
    if (fields.length) await audit(tx, caller, { eventType: "api.calendar_connection.updated", entityType: "calendar_connection", entityId: connectionId, payload: { fields } });
    return serializeCalendarConnection((await loadCalendarConnection(tx, caller.businessId, connectionId))!);
  });
}

export async function deleteCalendarConnectionForApi(context: DomainContext, caller: ApiCaller, connectionId: string): Promise<void> {
  await inBusiness(context, caller, async (tx) => {
    const disconnected = await disconnectCalendarInTransaction(tx, { businessId: caller.businessId, connectionId });
    if (!disconnected) throw notFound("Calendar connection");
    await audit(tx, caller, { eventType: "api.calendar_connection.disconnected", entityType: "calendar_connection", entityId: connectionId, payload: { provider: disconnected.provider } });
  });
}

// Alert settings. Each person on the team has their own, and RLS lets only
// that person change them, so these run as the account the key acts as, with
// the dashboard's database role: pass an app-role context, not the worker's.

async function asTeamMember<T>(context: DomainContext, caller: ApiCaller, userId: string, run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await withBusinessTransaction(context.db, { userId, businessId: caller.businessId, actorType: "operator" }, async (tx) => {
    try {
      await requireTeamMembership(tx, { userId, businessId: caller.businessId });
    } catch (error) {
      if (error instanceof AuthorizationError) throw conflict("The account this key acts as isn't on the business's team, so it gets no alerts about it.");
      throw error;
    }
    return await run(tx);
  });
}

const textsUnavailable: Record<NonNullable<ApiNotificationPreferences["sms"]["unavailable_reason"]>, string> = {
  sender_missing: "This deployment has no number to send alert texts from, so texts can't be turned on.",
  phone_unverified: "The account this key acts as has no verified mobile number. Its owner adds one in the dashboard's notification settings, which also asks for consent to alert texts.",
  consent_required: "The account this key acts as hasn't agreed to alert texts. Its owner turns texts on once in the dashboard's notification settings, which asks for that consent.",
};

/** `phoneVerified` comes from the account, which only the auth database can read. */
export async function getNotificationPreferencesForApi(context: DomainContext, caller: ApiCaller, options: { userId: string; phoneVerified: boolean }): Promise<ApiNotificationPreferences> {
  return await asTeamMember(context, caller, options.userId, async (tx) => serializeNotificationPreferences(await loadNotificationPreferencesInTransaction(tx, { userId: options.userId, businessId: caller.businessId, phoneVerified: options.phoneVerified })));
}

/**
 * Changes the settings sent and keeps the rest as the person saved them, texts
 * included while they can't be sent. A text can be turned on only while it can
 * be sent: the person's consent comes from the dashboard alone.
 */
export async function updateNotificationPreferencesForApi(context: DomainContext, caller: ApiCaller, input: ApiNotificationPreferencesUpdate, options: { userId: string; phoneVerified: boolean }): Promise<ApiNotificationPreferences> {
  if (Object.keys(input).length === 0) throw invalidRequest("Send at least one field to update.");
  return await asTeamMember(context, caller, options.userId, async (tx) => {
    const target = { userId: options.userId, businessId: caller.businessId, phoneVerified: options.phoneVerified };
    const saved = await loadSavedNotificationPreferencesInTransaction(tx, target);
    const before = serializeNotificationPreferences(await loadNotificationPreferencesInTransaction(tx, target));
    if (before.sms.unavailable_reason && (input.sms_enabled === true || apiNotificationEvents.some((event) => input.events?.[event]?.sms === true))) throw conflict(textsUnavailable[before.sms.unavailable_reason]);
    const eventPreferences = { ...saved.eventPreferences };
    for (const event of apiNotificationEvents) {
      const change = input.events?.[event];
      const key = notificationEventKeys[event];
      if (change) eventPreferences[key] = { email: change.email ?? eventPreferences[key].email, sms: change.sms ?? eventPreferences[key].sms };
    }
    const next = {
      emailEnabled: input.email_enabled ?? saved.emailEnabled,
      smsEnabled: input.sms_enabled ?? saved.smsEnabled,
      eventPreferences,
      dailySummaryEnabled: input.daily_summary?.enabled ?? saved.dailySummaryEnabled,
      dailySummarySendTime: input.daily_summary?.send_time !== undefined ? input.daily_summary.send_time : saved.dailySummarySendTime,
    };
    if (next.dailySummaryEnabled && !next.dailySummarySendTime) throw invalidRequest("A daily summary that is on needs a send_time.", [{ path: "daily_summary.send_time", message: "Required while the summary is on." }]);
    const fields = [
      ...(next.emailEnabled !== saved.emailEnabled ? ["email_enabled"] : []),
      ...(next.smsEnabled !== saved.smsEnabled ? ["sms_enabled"] : []),
      ...(apiNotificationEvents.some((event) => { const key = notificationEventKeys[event]; return next.eventPreferences[key].email !== saved.eventPreferences[key].email || next.eventPreferences[key].sms !== saved.eventPreferences[key].sms; }) ? ["events"] : []),
      ...(next.dailySummaryEnabled !== saved.dailySummaryEnabled || next.dailySummarySendTime !== saved.dailySummarySendTime ? ["daily_summary"] : []),
    ];
    if (fields.length === 0) return before;
    await saveNotificationPreferencesInTransaction(tx, { userId: options.userId, businessId: caller.businessId, ...next });
    await audit(tx, caller, { eventType: "api.notification_preferences.updated", entityType: "user", entityId: options.userId, payload: { fields } });
    return serializeNotificationPreferences(await loadNotificationPreferencesInTransaction(tx, target));
  });
}

// Rules the receptionist follows

export async function listRulesForApi(context: DomainContext, caller: ApiCaller): Promise<ApiRule[]> {
  return await inBusiness(context, caller, async (tx) => (await listAgentRulesInTransaction(tx, { businessId: caller.businessId })).map(serializeRule));
}

/** Adds a rule after the others. A business keeps up to RULES_MAX rules, so the API can always send them all in one reorder. */
export async function createRuleForApi(context: DomainContext, caller: ApiCaller, input: ApiRuleCreate): Promise<ApiRule> {
  return await inBusiness(context, caller, async (tx) => {
    await lockAgentRulesInTransaction(tx, caller.businessId);
    const [count] = await tx.select({ rules: sql<number>`count(*)::int` }).from(agentRules).where(eq(agentRules.businessId, caller.businessId));
    if ((count?.rules ?? 0) >= RULES_MAX) throw conflict(`A business can have up to ${RULES_MAX} rules. Delete one first.`);
    const rule = await insertAgentRuleInTransaction(tx, { businessId: caller.businessId, title: input.title, content: input.content, active: input.active });
    await audit(tx, caller, { eventType: "api.rule.created", entityType: "agent_rule", entityId: rule.id });
    return serializeRule(rule);
  });
}

/** Changes the fields sent. Values the rule already has change nothing, so an unchanged rule isn't written, audited or refreshed. */
export async function updateRuleForApi(context: DomainContext, caller: ApiCaller, ruleId: string, input: ApiRuleUpdate): Promise<ApiRule> {
  if (Object.values(input).every((value) => value === undefined)) throw invalidRequest("Send at least one field to update.");
  return await inBusiness(context, caller, async (tx) => {
    const [current] = await tx.select().from(agentRules).where(and(eq(agentRules.businessId, caller.businessId), eq(agentRules.id, ruleId))).limit(1).for("no key update");
    if (!current) throw notFound("Rule");
    const changes = {
      ...(input.title !== undefined && input.title !== current.title ? { title: input.title } : {}),
      ...(input.content !== undefined && input.content !== current.content ? { content: input.content } : {}),
      ...(input.active !== undefined && input.active !== current.active ? { active: input.active } : {}),
    };
    if (!Object.keys(changes).length) return serializeRule(current);
    const rule = await updateAgentRuleInTransaction(tx, { businessId: caller.businessId, ruleId, ...changes });
    if (!rule) throw notFound("Rule");
    await audit(tx, caller, { eventType: "api.rule.updated", entityType: "agent_rule", entityId: ruleId, payload: { fields: Object.keys(changes) } });
    return serializeRule(rule);
  });
}

export async function deleteRuleForApi(context: DomainContext, caller: ApiCaller, ruleId: string): Promise<void> {
  await inBusiness(context, caller, async (tx) => {
    if (!await deleteAgentRuleInTransaction(tx, { businessId: caller.businessId, ruleId })) throw notFound("Rule");
    await audit(tx, caller, { eventType: "api.rule.deleted", entityType: "agent_rule", entityId: ruleId });
  });
}

/**
 * Puts every rule in the order sent. The list has to name each of the
 * business's rules once, so no rule is left in an old position. The order the
 * rules already have changes nothing.
 */
export async function reorderRulesForApi(context: DomainContext, caller: ApiCaller, input: ApiRuleReorder): Promise<ApiRule[]> {
  return await inBusiness(context, caller, async (tx) => {
    // Hold the order first, so a rule added meanwhile can't slip past the check below.
    await lockAgentRulesInTransaction(tx, caller.businessId);
    const current = await listAgentRulesInTransaction(tx, { businessId: caller.businessId });
    const ruleIds = input.rule_ids.map((ruleId) => ruleId.toLowerCase());
    const missing = current.filter((rule) => !ruleIds.includes(rule.id)).map((rule) => rule.id);
    const unknown = ruleIds.filter((ruleId) => !current.some((rule) => rule.id === ruleId));
    if (missing.length || unknown.length || new Set(ruleIds).size !== ruleIds.length) {
      throw invalidRequest("Send every rule id once, in the new order.", [
        ...(missing.length ? [{ path: "rule_ids", message: `Missing: ${missing.join(", ")}.` }] : []),
        ...(unknown.length ? [{ path: "rule_ids", message: `Not this business's rules: ${unknown.join(", ")}.` }] : []),
        ...(new Set(ruleIds).size !== ruleIds.length ? [{ path: "rule_ids", message: "An id is sent more than once." }] : []),
      ]);
    }
    // The order the rules already have changes nothing, unless two rules share a position: then writing it settles the tie.
    const distinctPositions = current.every((rule, index) => index === 0 || rule.sortOrder > current[index - 1]!.sortOrder);
    if (distinctPositions && ruleIds.every((ruleId, index) => current[index]?.id === ruleId)) return current.map(serializeRule);
    if (!await reorderAgentRulesInTransaction(tx, { businessId: caller.businessId, ruleIds })) throw invalidRequest("Send every rule id once, in the new order.");
    await audit(tx, caller, { eventType: "api.rules.reordered", entityType: "agent_rule", payload: { ruleIds } });
    return (await listAgentRulesInTransaction(tx, { businessId: caller.businessId })).map(serializeRule);
  });
}

// Receptionist settings

const receptionistApiFields: Record<keyof ReceptionistProfilePatch, keyof ApiReceptionistUpdate> = {
  greeting: "greeting",
  tone: "tone",
  summary: "summary",
  bookingPolicy: "booking_policy",
  voiceInstructions: "voice_instructions",
  smsInstructions: "sms_instructions",
  chatInstructions: "chat_instructions",
  transferMode: "transfer_mode",
  transferNumber: "transfer_number",
  appointmentChangePolicy: "appointment_change_policy",
  bookingMode: "booking_mode",
};

/** The business's receptionist row, or the defaults it would be saved with when it has none yet. */
async function loadReceptionistState(tx: DatabaseTransaction, businessId: string, lock: boolean) {
  const [row] = await tx.select({ name: businesses.name, defaultLocale: businesses.defaultLocale, updatedAt: businesses.updatedAt }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!row) throw notFound("Business");
  const business = { ...row, locale: normalizeRuntimeLocale(row.defaultLocale) };
  const query = tx.select().from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)).limit(1);
  const [profile] = lock ? await query.for("update") : await query;
  return { business, profile: profile ?? null, shown: profile ?? { ...defaultReceptionistProfile(business.name, business.locale), updatedAt: business.updatedAt } };
}

export async function getReceptionistForApi(context: DomainContext, caller: ApiCaller): Promise<ApiReceptionist> {
  return await inBusiness(context, caller, async (tx) => serializeReceptionist((await loadReceptionistState(tx, caller.businessId, false)).shown));
}

/**
 * Changes the fields sent. Values the receptionist already has change nothing,
 * so an unchanged receptionist isn't written, audited or refreshed. Sending a
 * summary makes it the business's own, so AI won't replace it, even when the
 * text is the same.
 */
export async function updateReceptionistForApi(context: DomainContext, caller: ApiCaller, input: ApiReceptionistUpdate): Promise<ApiReceptionist> {
  if (Object.values(input).every((value) => value === undefined)) throw invalidRequest("Send at least one field to update.");
  return await inBusiness(context, caller, async (tx) => {
    const { business, profile: current, shown } = await loadReceptionistState(tx, caller.businessId, true);
    const policy = input.appointment_change_policy;
    const requested: ReceptionistProfilePatch = {
      ...(input.greeting !== undefined ? { greeting: input.greeting } : {}),
      ...(input.tone !== undefined ? { tone: input.tone } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.booking_policy !== undefined ? { bookingPolicy: input.booking_policy } : {}),
      ...(input.voice_instructions !== undefined ? { voiceInstructions: input.voice_instructions } : {}),
      ...(input.sms_instructions !== undefined ? { smsInstructions: input.sms_instructions } : {}),
      ...(input.chat_instructions !== undefined ? { chatInstructions: input.chat_instructions } : {}),
      ...(input.transfer_mode !== undefined ? { transferMode: input.transfer_mode } : {}),
      ...(input.transfer_number !== undefined ? { transferNumber: input.transfer_number } : {}),
      ...(input.booking_mode !== undefined ? { bookingMode: input.booking_mode } : {}),
      ...(policy ? { appointmentChangePolicy: { enabled: policy.enabled, allowCancel: policy.allow_cancel, allowReschedule: policy.allow_reschedule, verificationMode: policy.verification_mode } } : {}),
    };
    const unchanged = (field: keyof ReceptionistProfilePatch): boolean => {
      if (!current) return false;
      if (field === "summary") return requested.summary === current.summary && current.summarySource === "operator";
      if (field === "appointmentChangePolicy") return JSON.stringify(requested.appointmentChangePolicy) === JSON.stringify(normalizeAppointmentChangePolicy(current.appointmentChangePolicy));
      return requested[field] === current[field];
    };
    const patch = Object.fromEntries(Object.entries(requested).filter(([field]) => !unchanged(field as keyof ReceptionistProfilePatch))) as ReceptionistProfilePatch;
    const regenerateSummary = input.regenerate_summary === true;
    if (!Object.keys(patch).length && !regenerateSummary) return serializeReceptionist(shown);
    const profile = await saveReceptionistProfileInTransaction(tx, { businessId: caller.businessId, businessName: business.name, locale: business.locale, patch, regenerateSummary });
    if (!profile) throw new Error("The receptionist settings could not be saved.");
    const fields = [...(Object.keys(patch) as Array<keyof ReceptionistProfilePatch>).map((field) => receptionistApiFields[field]), ...(regenerateSummary ? ["regenerate_summary"] : [])];
    await audit(tx, caller, { eventType: "api.receptionist.updated", entityType: "receptionist_profile", entityId: profile.id, payload: { fields } });
    return serializeReceptionist(profile);
  });
}

// Businesses, for platform keys

/**
 * The id POST /businesses gives the business made for one platform key and
 * Idempotency-Key, so a retry finds that business instead of making another.
 * A UUIDv8 from SHA-256: other keys can't produce it.
 */
export function platformBusinessId(platformKeyId: string, idempotencyKey: string): string {
  const bytes = createHash("sha256").update(`lobbystack:platform-business:v1:${platformKeyId}:${idempotencyKey}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Creates a business for a platform key. The key's owner owns it until the
 * customer claims it, and every key in the key's group may act on it. The
 * Idempotency-Key decides the business id, so a retry returns the business it
 * made, and a different body with the same key is idempotency_key_reused.
 * The audit row keeps the request's hash for that check.
 */
export async function createBusinessForApi(
  context: DomainContext,
  input: { key: HostPlatformKey; actingUserId: string; idempotencyKey: string; requestHash: string; body: ApiBusinessCreate },
): Promise<{ business: ApiBusiness; replayed: boolean }> {
  const partnerOnly = (["owner_email", "access_level", "template_id", "package_id"] as const).filter((field) => input.body[field] !== undefined);
  if (partnerOnly.length) throw invalidRequest(`${partnerOnly.join(" and ")} ${partnerOnly.length > 1 ? "are" : "is"} only for a partner's platform key. The account in this key's owner_email owns the business it creates.`, partnerOnly.map((path) => ({ path, message: "Not accepted with the host's platform key." })));
  const timezone = ianaTimeZone(input.body.timezone);
  if (!timezone) throw invalidRequest("timezone is not a valid IANA time zone.", [{ path: "timezone", message: "Use an IANA time zone such as America/Toronto." }]);
  const businessId = platformBusinessId(input.key.platformKeyId, input.idempotencyKey);
  const caller: PlatformKeyCaller = { businessId, platformKeyId: input.key.platformKeyId, groupId: input.key.group, actingUserId: input.actingUserId, actor: "platform_key" };
  const created = async (): Promise<ApiBusiness | null> => await inBusiness(context, caller, async (tx) => {
    const [row] = await tx.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, "api.business.created"))).limit(1);
    if (!row) return null;
    if ((row.payload as { requestHash?: unknown } | null)?.requestHash !== input.requestHash) throw new PublicApiError(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request body.");
    // A business since suspended or unlinked from the group is gone for this key, as on every other endpoint.
    const [business] = await tx.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
    const [link] = await tx.select({ businessId: platformKeyBusinesses.businessId }).from(platformKeyBusinesses).where(and(eq(platformKeyBusinesses.businessId, businessId), eq(platformKeyBusinesses.groupId, input.key.group))).limit(1);
    if (business?.status !== "active" || !link) throw notFound("Business");
    return await loadBusinessResource(tx, businessId);
  });

  const existing = await created();
  if (existing) return { business: existing, replayed: true };
  try {
    const business = await inBusiness(context, caller, async (tx) => {
      await insertBusinessInTransaction(tx, { businessId, userId: input.actingUserId, name: input.body.name, slug: input.body.slug, timezone, businessType: input.body.business_type ?? "service_company", defaultLocale: input.body.locale, websiteUrl: input.body.website_url });
      await tx.insert(platformKeyBusinesses).values({ businessId, groupId: input.key.group, createdByPlatformKeyId: input.key.platformKeyId });
      await audit(tx, caller, { eventType: "api.business.created", entityType: "business", entityId: businessId, payload: { requestHash: input.requestHash } });
      return await loadBusinessResource(tx, businessId);
    });
    if (!business) throw new Error("The new business could not be read back.");
    return { business, replayed: false };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // A retry that ran at the same time created it first.
    const raced = await created();
    if (raced) return { business: raced, replayed: true };
    throw conflict("Another business already uses this slug.");
  }
}

// What createPartnerBusiness refuses, by the field of POST /businesses at fault.
const partnerBusinessFields: Record<string, string> = { invalid_name: "name", invalid_timezone: "timezone", invalid_business_type: "business_type", invalid_access_level: "access_level", invalid_email: "owner_email", invalid_package: "package_id" };

/**
 * Creates a business of the partner for one of its platform keys, through
 * the partner operation the console uses: with no owner yet, at the access
 * level the request picks, and with an invitation the partner emails to
 * owner_email. As for a host's key, the Idempotency-Key decides the business
 * id, so a retry returns the business it made, and a different body with the
 * same key is idempotency_key_reused. The audit row keeps the request's hash
 * for that check. Pass the app role's context: only it can act as the system,
 * as creating a business needs. beforeCreate runs only when a new business is
 * about to be made, so callers check their limits there.
 */
export async function createPartnerBusinessForApi(
  context: DomainContext,
  input: { key: PartnerSubject; idempotencyKey: string; requestHash: string; body: ApiBusinessCreate },
  options: { beforeCreate?: (() => Promise<void>) | undefined; setup?: BusinessSetupDependencies | undefined } = {},
): Promise<{ business: ApiBusiness; replayed: boolean }> {
  const { body, key } = input;
  const what = isPartnerMemberSubject(key) ? "This connection" : "This API key";
  // Selling a package and reading a template are the partner's own work, so they take its scopes on top of businesses:create.
  if (body.package_id !== undefined && !keyHasScope(key.scopes, "partner.businesses:write")) throw new PublicApiError(403, "insufficient_scope", `${what} needs the partner.businesses:write scope to send package_id.`);
  if (body.template_id !== undefined && !keyHasScope(key.scopes, "partner:read")) throw new PublicApiError(403, "insufficient_scope", `${what} needs the partner:read scope to send template_id.`);
  if (body.owner_email === undefined) throw invalidRequest("A partner invites the business's owner as it creates the business, so send owner_email.", [{ path: "owner_email", message: "Required for a partner's business." }]);
  const timezone = ianaTimeZone(body.timezone);
  if (!timezone) throw invalidRequest("timezone is not a valid IANA time zone.", [{ path: "timezone", message: "Use an IANA time zone such as America/Toronto." }]);
  // The Idempotency-Key decides the id within its key, or within a person's agency connection.
  const businessId = platformBusinessId(isPartnerMemberSubject(key) ? `grant:${key.grantId}` : key.platformKeyId, input.idempotencyKey);
  const inBusinessAsSystem = async <T>(run: (tx: DatabaseTransaction) => Promise<T>) => await withBusinessTransaction(context.db, { businessId, actorType: "system" }, run);
  const created = async (): Promise<ApiBusiness | null> => await inBusinessAsSystem(async (tx) => {
    const [row] = await tx.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, "partner.business_created"))).limit(1);
    if (!row) return null;
    if ((row.payload as { requestHash?: unknown } | null)?.requestHash !== input.requestHash) throw new PublicApiError(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request body.");
    // A business since suspended, deleted or released is gone for this key, as on every other endpoint.
    const [business] = await tx.select({ status: businesses.status, partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
    if (business?.status !== "active" || business.partnerId !== key.partnerId) throw notFound("Business");
    return await loadBusinessResource(tx, businessId);
  });

  const existing = await created();
  if (existing) return { business: existing, replayed: true };
  // A replay sends no email, so only a new business counts against the caller's limit.
  await options.beforeCreate?.();
  try {
    if (body.template_id !== undefined && !options.setup) throw new Error("Applying a template needs the worker's context and storage.");
    await createPartnerBusiness(context, partnerSubjectActor(key), {
      businessId,
      name: body.name,
      timezone,
      businessType: body.business_type ?? "service_company",
      accessLevel: body.access_level ?? "full",
      ownerEmail: body.owner_email,
      slug: body.slug,
      defaultLocale: body.locale,
      websiteUrl: body.website_url,
      requestHash: input.requestHash,
      ...(body.template_id !== undefined ? { templateId: body.template_id } : {}),
      ...(body.package_id !== undefined ? { packageId: body.package_id } : {}),
    }, options.setup);
  } catch (error) {
    if (isUniqueViolation(error)) {
      // A retry that ran at the same time created it first.
      const raced = await created();
      if (raced) return { business: raced, replayed: true };
      throw conflict("Another business already uses this slug.");
    }
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "partner_domain_required") throw conflict("The partner needs a dashboard address of its own before it can create a business. Its businesses open only there.");
    const field = partnerBusinessFields[code];
    if (field && error instanceof Error) throw invalidRequest(error.message, [{ path: field, message: error.message }]);
    // A template or package that isn't the partner's, or a template that couldn't set the business up, answers as the console does.
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
    if (error instanceof Error && !(error instanceof PublicApiError) && (status === 404 || status === 409)) throw new PublicApiError(status, status === 404 ? "not_found" : "conflict", error.message);
    throw error;
  }
  const business = await inBusinessAsSystem(async (tx) => await loadBusinessResource(tx, businessId));
  if (!business) throw new Error("The new business could not be read back.");
  return { business, replayed: false };
}

/**
 * The active businesses linked to a platform key's group, newest first. A
 * partner's keys have the partner as their group, which holds every business
 * of the partner, whether the console or a key made it.
 */
export async function listBusinessesForApi(context: DomainContext, input: { groupId: string } & PageRequest): Promise<Page<ApiBusinessSummary>> {
  const limit = pageSize(input.limit);
  const cursor = decodeCursor(input.cursor);
  // The links and businesses are tenant-isolated, so a resolver reads one group's page.
  const rows = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => (await tx.execute<{ business_id: string; name: string; timezone: string; default_locale: string; website_url: string | null; onboarding_stage: string; created_at: Date | string }>(sql`select business_id, name, timezone, default_locale, website_url, onboarding_stage, created_at from app.list_platform_key_businesses(${input.groupId}, ${cursor?.at.toISOString() ?? null}::timestamptz, ${cursor?.id ?? null}::uuid, ${limit + 1}::int)`)).rows);
  return toPage(rows, limit, (row) => ({
    id: row.business_id,
    name: row.name,
    timezone: row.timezone,
    locale: row.default_locale,
    website_url: row.website_url,
    onboarding_stage: row.onboarding_stage,
    created_at: new Date(row.created_at).toISOString(),
  }), (row) => ({ at: new Date(row.created_at), id: row.business_id }));
}

export async function listServicesForApi(context: DomainContext, caller: ApiCaller, options: { includeInactive?: boolean | undefined } = {}): Promise<ApiService[]> {
  return await inBusiness(context, caller, async (tx) => await listServiceResources(tx, caller.businessId, options));
}

/**
 * A slug made from a service's name the way the dashboard makes one: its Latin
 * letters and digits joined by hyphens, cut to the column's 120 characters.
 * Empty for a name with no Latin letters or digits.
 */
function serviceSlugFrom(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120).replace(/-+$/, "");
}

function serviceSlugTaken(slug: string): PublicApiError {
  return conflict(`Another service already uses the slug ${slug}.`);
}

async function requireFreeServiceSlug(tx: DatabaseTransaction, businessId: string, slug: string, serviceId?: string): Promise<void> {
  const [taken] = await tx.select({ id: services.id }).from(services).where(and(eq(services.businessId, businessId), eq(services.slug, slug), isNull(services.deletedAt), ...(serviceId ? [ne(services.id, serviceId)] : []))).limit(1);
  if (taken) throw serviceSlugTaken(slug);
}

async function setServiceStaff(tx: DatabaseTransaction, businessId: string, serviceId: string, staffIds: string[]): Promise<boolean> {
  const result = await replaceServiceStaffInTransaction(tx, { businessId, serviceId, staffIds });
  if (result.unknownStaffIds.length) throw invalidRequest("staff_ids lists staff members this business doesn't have.", [{ path: "staff_ids", message: `Unknown staff: ${result.unknownStaffIds.join(", ")}.` }]);
  return result.changed;
}

async function loadService(tx: DatabaseTransaction, businessId: string, serviceId: string): Promise<ApiService> {
  const service = await loadServiceResource(tx, businessId, serviceId);
  if (!service) throw notFound("Service");
  return service;
}

export async function createServiceForApi(context: DomainContext, caller: ApiCaller, input: ApiServiceCreate): Promise<ApiService> {
  const slug = input.slug ?? serviceSlugFrom(input.name);
  if (!slug) throw invalidRequest("Send a slug: this name has no letters or digits to make one from.", [{ path: "slug", message: "Required for this name." }]);
  return await inBusiness(context, caller, async (tx) => {
    await requireFreeServiceSlug(tx, caller.businessId, slug);
    let serviceId: string;
    try {
      serviceId = (await insertServiceInTransaction(tx, { businessId: caller.businessId, name: input.name, slug, durationMinutes: input.duration_minutes, description: input.description, active: input.active })).id;
    } catch (error) {
      // Another request took the slug after the check above.
      if (isUniqueViolation(error)) throw serviceSlugTaken(slug);
      throw error;
    }
    if (input.staff_ids?.length) await setServiceStaff(tx, caller.businessId, serviceId, input.staff_ids);
    await audit(tx, caller, { eventType: "api.service.created", entityType: "service", entityId: serviceId });
    return await loadService(tx, caller.businessId, serviceId);
  });
}

/** Changes the fields sent. Values the service already has change nothing, so an unchanged service isn't written, audited or refreshed. */
export async function updateServiceForApi(context: DomainContext, caller: ApiCaller, serviceId: string, input: ApiServiceUpdate): Promise<ApiService> {
  if (Object.values(input).every((value) => value === undefined)) throw invalidRequest("Send at least one field to update.");
  return await inBusiness(context, caller, async (tx) => {
    // "no key update" still lets bookings that reference the service check their foreign key meanwhile.
    const [current] = await tx.select().from(services).where(and(eq(services.businessId, caller.businessId), eq(services.id, serviceId), isNull(services.deletedAt))).limit(1).for("no key update");
    if (!current) throw notFound("Service");
    const changes = {
      ...(input.name !== undefined && input.name !== current.name ? { name: input.name } : {}),
      ...(input.slug !== undefined && input.slug !== current.slug ? { slug: input.slug } : {}),
      ...(input.description !== undefined && input.description !== current.description ? { description: input.description } : {}),
      ...(input.duration_minutes !== undefined && input.duration_minutes !== current.durationMinutes ? { durationMinutes: input.duration_minutes } : {}),
      ...(input.active !== undefined && input.active !== current.active ? { active: input.active } : {}),
    };
    const fields: string[] = Object.keys(changes).map((field) => (field === "durationMinutes" ? "duration_minutes" : field));
    if (changes.slug !== undefined) await requireFreeServiceSlug(tx, caller.businessId, changes.slug, serviceId);
    if (fields.length) {
      try {
        await updateServiceInTransaction(tx, { businessId: caller.businessId, serviceId, ...changes });
      } catch (error) {
        if (isUniqueViolation(error) && changes.slug !== undefined) throw serviceSlugTaken(changes.slug);
        throw error;
      }
    }
    if (input.staff_ids !== undefined && await setServiceStaff(tx, caller.businessId, serviceId, input.staff_ids)) {
      // A change of staff alone still moves updated_at, so clients that sync by it see it.
      if (!fields.length) await tx.update(services).set({ updatedAt: new Date() }).where(and(eq(services.businessId, caller.businessId), eq(services.id, serviceId)));
      fields.push("staff_ids");
    }
    if (fields.length) await audit(tx, caller, { eventType: "api.service.updated", entityType: "service", entityId: serviceId, payload: { fields } });
    return await loadService(tx, caller.businessId, serviceId);
  });
}

/** Removes a service from the catalog, as deleteService explains. */
export async function deleteServiceForApi(context: DomainContext, caller: ApiCaller, serviceId: string): Promise<void> {
  await inBusiness(context, caller, async (tx) => {
    if (!await deleteServiceInTransaction(tx, { businessId: caller.businessId, serviceId })) throw notFound("Service");
    await audit(tx, caller, { eventType: "api.service.deleted", entityType: "service", entityId: serviceId });
  });
}

export async function listStaffForApi(context: DomainContext, caller: ApiCaller): Promise<ApiStaff[]> {
  return await inBusiness(context, caller, async (tx) => await listStaffResources(tx, caller.businessId));
}

/**
 * A staff_id must name an active staff member of this business who takes the
 * service. Anything else is a 400 rather than a "no availability" 409.
 */
async function assertBookableStaff(tx: DatabaseTransaction, businessId: string, staffId: string, serviceId: string, path = "staff_id"): Promise<void> {
  const member = (await listStaffResources(tx, businessId)).find((row) => row.id === staffId);
  if (!member || !member.active) throw invalidRequest(`${path} is not an active staff member of this business.`, [{ path, message: "Unknown or inactive staff member." }]);
  if (!member.service_ids.includes(serviceId)) throw invalidRequest(`${path} does not take this service.`, [{ path, message: "This staff member isn't assigned to the service." }]);
}

// Calls

export async function listCallsForApi(context: DomainContext, caller: ApiCaller, request: Parameters<typeof listCallResources>[2]): Promise<Page<ApiCall>> {
  return await inBusiness(context, caller, async (tx) => await listCallResources(tx, caller.businessId, request));
}

export async function getCallForApi(context: DomainContext, caller: ApiCaller, callId: string): Promise<ApiCallDetail> {
  return await inBusiness(context, caller, async (tx) => {
    const call = await loadCallDetailResource(tx, caller.businessId, callId);
    if (!call) throw notFound("Call");
    return call;
  });
}

// Contacts

export async function listContactsForApi(context: DomainContext, caller: ApiCaller, request: Parameters<typeof listContactResources>[2]): Promise<Page<ApiContact>> {
  return await inBusiness(context, caller, async (tx) => await listContactResources(tx, caller.businessId, request));
}

export async function getContactForApi(context: DomainContext, caller: ApiCaller, contactId: string): Promise<ApiContact> {
  return await inBusiness(context, caller, async (tx) => {
    const contact = await loadContactResource(tx, caller.businessId, contactId);
    if (!contact) throw notFound("Contact");
    return contact;
  });
}

export async function createContactForApi(context: DomainContext, caller: ApiCaller, input: ApiContactCreate): Promise<ApiContact> {
  if (input.timezone !== undefined) assertTimeZone(input.timezone, "timezone");
  try {
    return await inBusiness(context, caller, async (tx) => {
      if (input.phone) {
        const [existing] = await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, caller.businessId), eq(contacts.phone, input.phone))).limit(1);
        if (existing) throw conflict(`A contact with this phone number already exists: ${existing.id}.`);
      }
      const [row] = await tx.insert(contacts).values({
        businessId: caller.businessId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        preferredLocale: input.locale,
        timezone: input.timezone,
      }).returning();
      if (!row) throw new Error("The contact could not be created.");
      await audit(tx, caller, { eventType: "api.contact.created", entityType: "contact", entityId: row.id });
      await emitWebhookEventInTransaction(tx, { businessId: caller.businessId, type: "contact.created", resourceId: row.id });
      return serializeContact(row, null);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("A contact with this phone number already exists.");
    throw error;
  }
}

export async function updateContactForApi(context: DomainContext, caller: ApiCaller, contactId: string, input: ApiContactUpdate): Promise<ApiContact> {
  if (input.timezone) assertTimeZone(input.timezone, "timezone");
  const patch = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.locale !== undefined ? { preferredLocale: input.locale } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
  };
  if (!Object.keys(patch).length) throw invalidRequest("Send at least one field to update.");
  try {
    return await inBusiness(context, caller, async (tx) => {
      // Consent belongs to the number that gave it: a new number starts without it. An opt-out stays.
      // The database clock dates the change, so texts the old number sent stop counting as consent (see loadSmsReach).
      const consent = input.phone !== undefined ? {
        smsConsentStatus: sql<string | null>`case when ${contacts.phone} is distinct from ${input.phone} and ${contacts.smsConsentStatus} = 'subscribed' then null else ${contacts.smsConsentStatus} end`,
        smsConsentUpdatedAt: sql<Date | null>`case when ${contacts.phone} is distinct from ${input.phone} then now() else ${contacts.smsConsentUpdatedAt} end`,
        smsOptInConfirmedAt: sql<Date | null>`case when ${contacts.phone} is distinct from ${input.phone} then null else ${contacts.smsOptInConfirmedAt} end`,
      } : {};
      const [row] = await tx.update(contacts).set({ ...patch, ...consent, updatedAt: new Date() }).where(and(eq(contacts.businessId, caller.businessId), eq(contacts.id, contactId))).returning({ id: contacts.id });
      if (!row) throw notFound("Contact");
      await audit(tx, caller, { eventType: "api.contact.updated", entityType: "contact", entityId: row.id, payload: { fields: Object.keys(patch) } });
      const contact = await loadContactResource(tx, caller.businessId, row.id);
      if (!contact) throw notFound("Contact");
      return contact;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("Another contact already has this phone number.");
    throw error;
  }
}

// Keypad PINs. Only a slow hash of each PIN is kept, so these hash before
// their write transaction, which then holds the contacts so none is deleted
// before its PIN is saved.

/** Lowercased contact ids, refusing one sent twice. */
function distinctContactIds(contactIds: readonly string[], path: (index: number) => string): string[] {
  const lowered = contactIds.map((contactId) => contactId.toLowerCase());
  const repeated = lowered.flatMap((contactId, index) => (lowered.indexOf(contactId) < index ? [{ path: path(index), message: "This contact is already in the list." }] : []));
  if (repeated.length) throw invalidRequest("Send each contact once.", repeated);
  return lowered;
}

/** Refuses ids the business has no contact for. With lock, holds the contacts until the transaction ends. */
async function requireContacts(tx: DatabaseTransaction, businessId: string, contactIds: readonly string[], path: (index: number) => string, lock: boolean): Promise<void> {
  const query = tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, businessId), inArray(contacts.id, [...contactIds])));
  const found = new Set((lock ? await query.for("key share") : await query).map((row) => row.id));
  const unknown = contactIds.flatMap((contactId, index) => (found.has(contactId) ? [] : [{ path: path(index), message: "Unknown contact." }]));
  if (unknown.length) throw invalidRequest("Some contacts aren't this business's.", unknown);
}

/** Contacts a request without contact_ids gives a PIN: the ones that can call in by phone and have none. */
function lacksPasscode(tx: DatabaseTransaction, businessId: string) {
  return and(eq(contacts.businessId, businessId), isNotNull(contacts.phone), notExists(tx.select({ contactId: contactPasscodes.contactId }).from(contactPasscodes).where(eq(contactPasscodes.contactId, contacts.id))));
}

/** Hashes PINs for a request, at most CONTACT_PASSCODE_HASHES_PER_CALLER of the caller's at once. */
async function hashPasscodesForCaller(caller: ApiCaller, entries: ReadonlyArray<{ contactId: string; passcode: string }>): Promise<string[]> {
  try {
    return await hashContactPasscodes(entries, { caller: callerPrincipalId(caller), callerLimit: CONTACT_PASSCODE_HASHES_PER_CALLER });
  } catch (error) {
    if (error instanceof ContactPasscodeHashesBusyError) throw new PublicApiError(429, "rate_limited", "This key is still setting other PINs. Retry once that request finishes.", undefined, { "Retry-After": "5" });
    throw error;
  }
}

async function auditContacts(tx: DatabaseTransaction, caller: ApiCaller, eventType: string, contactIds: readonly string[]): Promise<void> {
  if (!contactIds.length) return;
  const { actorUserId, payload } = callerAudit(caller);
  await tx.insert(auditLogs).values(contactIds.map((contactId) => ({ businessId: caller.businessId, eventType, entityType: "contact", entityId: contactId, ...(actorUserId ? { actorUserId } : {}), payload })));
}

/**
 * Sets contacts' PINs, or removes them where the PIN is null: all of them, or
 * none when a contact isn't the business's. A new PIN also unlocks a locked
 * one. Only owners and admins set PINs in the dashboard, so a per-business key
 * whose creator no longer is one is refused.
 */
export async function setContactPasscodesForApi(context: DomainContext, caller: ApiCaller, input: ApiContactPasscodesUpdate): Promise<ApiContact[]> {
  const path = (index: number) => `passcodes.${index}.contact_id`;
  const contactIds = distinctContactIds(input.passcodes.map((entry) => entry.contact_id), path);
  const weak = input.passcodes.flatMap((entry, index) => (entry.passcode === null || (isContactPasscode(entry.passcode) && !isGuessableContactPasscode(entry.passcode)) ? [] : [{ path: `passcodes.${index}.passcode`, message: `Use ${CONTACT_PASSCODE_MIN_LENGTH} to ${CONTACT_PASSCODE_MAX_LENGTH} digits that aren't easy to guess.` }]));
  if (weak.length) throw invalidRequest("Some PINs can't be used.", weak);
  await requireKeyOwnerActive(context, caller);
  await inBusiness(context, caller, async (tx) => await requireContacts(tx, caller.businessId, contactIds, path, false));
  const toSet = input.passcodes.flatMap((entry, index) => (entry.passcode === null ? [] : [{ contactId: contactIds[index]!, passcode: entry.passcode }]));
  const toRemove = input.passcodes.flatMap((entry, index) => (entry.passcode === null ? [contactIds[index]!] : []));
  const hashes = await hashPasscodesForCaller(caller, toSet);
  return await inBusiness(context, caller, async (tx) => {
    await requireContacts(tx, caller.businessId, contactIds, path, true);
    const saved = await saveContactPasscodesInTransaction(tx, { businessId: caller.businessId, hashes: toSet.map((entry, index) => ({ contactId: entry.contactId, passcodeHash: hashes[index]! })), replace: true, now: new Date() });
    const removed = await removeContactPasscodesInTransaction(tx, { businessId: caller.businessId, contactIds: toRemove });
    await auditContacts(tx, caller, "api.contact.passcode_set", saved);
    await auditContacts(tx, caller, "api.contact.passcode_removed", removed);
    return await loadContactResources(tx, caller.businessId, contactIds);
  });
}

/**
 * Gives contacts a random PIN and returns each PIN this once. contact_ids
 * names the contacts, replacing PINs they have. Without it, contacts that can
 * call in and have no PIN get one, oldest first,
 * CONTACT_PASSCODES_MAX_PER_REQUEST at a time, and remaining counts the rest.
 * Only owners and admins set PINs, as for setContactPasscodesForApi.
 */
export async function generateContactPasscodesForApi(context: DomainContext, caller: ApiCaller, input: ApiContactPasscodesGenerate): Promise<ApiGeneratedContactPasscodes> {
  const path = (index: number) => `contact_ids.${index}`;
  const named = input.contact_ids ? distinctContactIds(input.contact_ids, path) : undefined;
  const length = input.length ?? CONTACT_PASSCODE_DEFAULT_LENGTH;
  await requireKeyOwnerActive(context, caller);
  const contactIds = await inBusiness(context, caller, async (tx) => {
    if (!named) return (await tx.select({ id: contacts.id }).from(contacts).where(lacksPasscode(tx, caller.businessId)).orderBy(asc(contacts.createdAt), asc(contacts.id)).limit(CONTACT_PASSCODES_MAX_PER_REQUEST)).map((row) => row.id);
    await requireContacts(tx, caller.businessId, named, path, false);
    return named;
  });
  const passcodes = contactIds.map((contactId) => ({ contactId, passcode: randomContactPasscode(length) }));
  const hashes = await hashPasscodesForCaller(caller, passcodes);
  const generated = passcodes.map((entry, index) => ({ ...entry, passcodeHash: hashes[index]! }));
  return await inBusiness(context, caller, async (tx) => {
    let present = generated;
    if (named) {
      await requireContacts(tx, caller.businessId, named, path, true);
    } else if (contactIds.length) {
      // A contact deleted since it was picked is left out.
      const kept = new Set((await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, caller.businessId), inArray(contacts.id, contactIds))).for("key share")).map((row) => row.id));
      present = generated.filter((entry) => kept.has(entry.contactId));
    }
    // Without contact_ids, a contact given a PIN meanwhile keeps that one.
    const saved = new Set(await saveContactPasscodesInTransaction(tx, { businessId: caller.businessId, hashes: present, replace: Boolean(named), now: new Date() }));
    const given = present.filter((entry) => saved.has(entry.contactId));
    await auditContacts(tx, caller, "api.contact.passcode_generated", given.map((entry) => entry.contactId));
    const newPasscodes = new Map(given.map((entry) => [entry.contactId, entry.passcode]));
    const updated = await loadContactResources(tx, caller.businessId, given.map((entry) => entry.contactId));
    const [remaining] = await tx.select({ count: count() }).from(contacts).where(lacksPasscode(tx, caller.businessId));
    return { contacts: updated.map((contact) => ({ ...contact, new_passcode: newPasscodes.get(contact.id)! })), remaining: Number(remaining?.count ?? 0) };
  });
}

// Appointments

export async function listAppointmentsForApi(context: DomainContext, caller: ApiCaller, request: Parameters<typeof listAppointmentResources>[2]): Promise<Page<ApiAppointment>> {
  return await inBusiness(context, caller, async (tx) => await listAppointmentResources(tx, caller.businessId, request));
}

export async function getAppointmentForApi(context: DomainContext, caller: ApiCaller, appointmentId: string): Promise<ApiAppointment> {
  return await inBusiness(context, caller, async (tx) => {
    const appointment = await loadAppointmentResource(tx, caller.businessId, appointmentId);
    if (!appointment) throw notFound("Appointment");
    return appointment;
  });
}

async function bookingContext(tx: DatabaseTransaction, businessId: string) {
  const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) throw notFound("Business");
  const [profile] = await tx.select({ bookingMode: receptionistProfiles.bookingMode }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)).limit(1);
  return { timezone: business.timezone, bookingMode: normalizeBookingMode(profile?.bookingMode) };
}

/** The API books under the same rule the receptionist does: only in instant booking mode. */
function assertInstantBooking(bookingMode: "instant" | "request" | "off"): void {
  if (bookingMode === "off") throw new PublicApiError(409, "booking_disabled", "Booking is turned off for this business.");
  if (bookingMode === "request") throw new PublicApiError(409, "booking_requires_confirmation", "This business takes appointment requests that the team confirms. It does not accept direct bookings.");
}

function slotUnavailable(reason: UnavailableReason): PublicApiError {
  return reason === "no_hours"
    ? new PublicApiError(409, "slot_unavailable", "The business has no opening hours, so no time is available. Set hours with PATCH /business first.")
    : new PublicApiError(409, "slot_unavailable", "That time is not available. Pick another time from GET /availability.");
}

const inactiveService = () => invalidRequest("service_id is not an active service.", [{ path: "service_id", message: "Not an active service." }]);

export async function getAvailabilityForApi(context: DomainContext, caller: ApiCaller, input: { serviceId: string; startDate: string; endDate?: string | undefined; staffId?: string | undefined }): Promise<ApiAvailabilitySlot[]> {
  return await inBusiness(context, caller, async (tx) => {
    const [service] = await tx.select({ id: services.id }).from(services).where(and(eq(services.businessId, caller.businessId), eq(services.id, input.serviceId), eq(services.active, true))).limit(1);
    if (!service) throw inactiveService();
    if (input.staffId) await assertBookableStaff(tx, caller.businessId, input.staffId, service.id);
    // Whole calendar dates: the business's timezone doesn't change how many days a range spans.
    const start = DateTime.fromISO(input.startDate, { zone: "UTC" });
    const end = DateTime.fromISO(input.endDate ?? input.startDate, { zone: "UTC" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !start.isValid) throw invalidRequest("start_date must be a date as YYYY-MM-DD.", [{ path: "start_date", message: "Use YYYY-MM-DD." }]);
    if ((input.endDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) || !end.isValid) throw invalidRequest("end_date must be a date as YYYY-MM-DD.", [{ path: "end_date", message: "Use YYYY-MM-DD." }]);
    const days = Math.round(end.diff(start, "days").days) + 1;
    if (days < 1) throw invalidRequest("end_date must be on or after start_date.");
    if (days > PUBLIC_API_AVAILABILITY_MAX_DAYS) throw invalidRequest(`The date range can span up to ${PUBLIC_API_AVAILABILITY_MAX_DAYS} days.`);
    const { openings, durationMinutes } = await findOpeningsInTransaction(tx, { businessId: caller.businessId, serviceId: service.id, dates: Array.from({ length: days }, (_, index) => start.plus({ days: index }).toISODate()!), ...(input.staffId ? { staffId: input.staffId } : {}) });
    return openings.map((startsAt) => ({ starts_at: new Date(startsAt).toISOString(), ends_at: new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString() }));
  });
}

export async function createAppointmentForApi(context: DomainContext, caller: ApiCaller, input: ApiAppointmentCreate): Promise<ApiAppointment> {
  const startsAt = new Date(input.starts_at);
  if (startsAt.getTime() <= Date.now()) throw invalidRequest("starts_at must be in the future.", [{ path: "starts_at", message: "Must be in the future." }]);
  const prepared = await inBusiness(context, caller, async (tx) => {
    const { timezone, bookingMode } = await bookingContext(tx, caller.businessId);
    assertInstantBooking(bookingMode);
    let contactPhone = input.contact_phone;
    if (input.contact_id) {
      const [contact] = await tx.select({ phone: contacts.phone }).from(contacts).where(and(eq(contacts.businessId, caller.businessId), eq(contacts.id, input.contact_id))).limit(1);
      if (!contact) throw invalidRequest("contact_id does not match a contact.", [{ path: "contact_id", message: "Unknown contact." }]);
      if (!contact.phone) throw invalidRequest("That contact has no phone number. Send contact_phone instead.", [{ path: "contact_id", message: "Contact has no phone number." }]);
      if (contactPhone && contactPhone !== contact.phone) throw invalidRequest("contact_phone does not match the contact's phone number.");
      contactPhone = contact.phone;
    }
    if (input.staff_id) await assertBookableStaff(tx, caller.businessId, input.staff_id, input.service_id);
    // The shared number's toll-free verification covers consent the receptionist
    // collects on a call, not consent a business asserts through the API or MCP.
    // A business that texts from the shared number (cloud) can't opt customers in here.
    const consentCounts = !isSharedSmsSender(await resolveSmsSender(tx, caller.businessId));
    return { timezone, contactPhone: contactPhone!, consentCounts };
  });
  const booked = await bookForCaller(context, {
    businessId: caller.businessId,
    service: { id: input.service_id },
    startsAt: startsAt.toISOString(),
    timezone: prepared.timezone,
    contactPhone: prepared.contactPhone,
    channel: "api",
    apiAudit: callerAudit(caller),
    ...(input.contact_name ? { contactName: input.contact_name } : {}),
    ...(input.staff_id ? { preferredStaffId: input.staff_id } : {}),
    ...(input.sms_consent && prepared.consentCounts ? { smsConsent: "agreed" as const } : {}),
  });
  if (!booked.ok) throw booked.reason === "unknown_service" ? inactiveService() : slotUnavailable(booked.reason);
  // Only a caller's own number or call finds an earlier booking, and the API sends neither.
  return await getAppointmentForApi(context, caller, booked.appointmentId!);
}

export async function cancelAppointmentForApi(context: DomainContext, caller: ApiCaller, appointmentId: string): Promise<ApiAppointment> {
  return await inBusiness(context, caller, async (tx) => {
    const result = await cancelAppointmentInTransaction(tx, { businessId: caller.businessId, appointmentId, change: apiChange(caller) });
    if (result === "missing") throw notFound("Appointment");
    const appointment = await loadAppointmentResource(tx, caller.businessId, appointmentId);
    if (!appointment) throw notFound("Appointment");
    return appointment;
  });
}

export async function rescheduleAppointmentForApi(context: DomainContext, caller: ApiCaller, appointmentId: string, input: { starts_at: string; staff_id?: string | undefined }): Promise<ApiAppointment> {
  const startsAt = new Date(input.starts_at);
  if (startsAt.getTime() <= Date.now()) throw invalidRequest("starts_at must be in the future.", [{ path: "starts_at", message: "Must be in the future." }]);
  try {
    return await inBusiness(context, caller, async (tx) => {
      const { bookingMode } = await bookingContext(tx, caller.businessId);
      assertInstantBooking(bookingMode);
      const [existing] = await tx.select({ status: appointments.status, serviceId: appointments.serviceId, staffId: appointments.staffId }).from(appointments).where(and(eq(appointments.businessId, caller.businessId), eq(appointments.id, appointmentId))).limit(1);
      if (!existing) throw notFound("Appointment");
      if (existing.status === "canceled") throw conflict("A cancelled appointment cannot be rescheduled.");
      if (input.staff_id) await assertBookableStaff(tx, caller.businessId, input.staff_id, existing.serviceId);
      if (input.staff_id && input.staff_id !== existing.staffId) {
        // Calendar sync updates the event on the staff member's own calendar. Moving
        // between staff with their own calendars would leave the old event behind.
        const [ownCalendar] = await tx.select({ id: calendarConnections.id }).from(calendarConnections).where(and(eq(calendarConnections.businessId, caller.businessId), ne(calendarConnections.status, "disconnected"), inArray(calendarConnections.staffId, [existing.staffId, input.staff_id]))).limit(1);
        if (ownCalendar) throw conflict("This appointment can't move to another staff member because one of them has their own connected calendar. Cancel it and book a new one instead.");
      }
      const moved = await rescheduleAppointmentInTransaction(tx, { businessId: caller.businessId, appointmentId, startsAt: startsAt.toISOString(), change: apiChange(caller), ...(input.staff_id ? { staffId: input.staff_id } : {}) });
      if (!moved) throw notFound("Appointment");
      const appointment = await loadAppointmentResource(tx, caller.businessId, appointmentId);
      if (!appointment) throw notFound("Appointment");
      return appointment;
    });
  } catch (error) {
    throw error instanceof BookingUnavailableError ? slotUnavailable(error.reason) : error;
  }
}

// Messages and knowledge

export async function listMessagesForApi(context: DomainContext, caller: ApiCaller, request: PageRequest & { status?: "open" | "done" | undefined }): Promise<Page<ApiMessage>> {
  return await inBusiness(context, caller, async (tx) => await listMessageResources(tx, caller.businessId, request));
}

export async function createKnowledgeEntryForApi(context: DomainContext, caller: ApiCaller, input: ApiKnowledgeEntryCreate): Promise<ApiKnowledgeEntry> {
  return await inBusiness(context, caller, async (tx) => {
    const snippet = await createKnowledgeSnippetInTransaction(tx, input.type === "faq"
      ? { businessId: caller.businessId, title: input.question, content: input.answer, tags: [FAQ_TAG] }
      : { businessId: caller.businessId, title: input.title, content: input.content });
    await audit(tx, caller, { eventType: "api.knowledge.created", entityType: "knowledge_snippet", entityId: snippet.id, payload: { type: input.type } });
    return serializeKnowledgeEntry(snippet);
  });
}

export async function listKnowledgeEntriesForApi(context: DomainContext, caller: ApiCaller, request: PageRequest & { type?: "text" | "faq" | undefined }): Promise<Page<ApiKnowledgeEntry>> {
  return await inBusiness(context, caller, async (tx) => await listKnowledgeEntryResources(tx, caller.businessId, request));
}

export async function getKnowledgeEntryForApi(context: DomainContext, caller: ApiCaller, entryId: string): Promise<ApiKnowledgeEntry> {
  return await inBusiness(context, caller, async (tx) => {
    const entry = await loadKnowledgeEntryResource(tx, caller.businessId, entryId);
    if (!entry) throw notFound("Knowledge entry");
    return entry;
  });
}

/**
 * Changes the fields sent. Values the entry already has change nothing, so an
 * unchanged entry isn't written, audited or refreshed. The labels sent replace
 * the entry's own, and an FAQ keeps the tag that makes it an FAQ.
 */
export async function updateKnowledgeEntryForApi(context: DomainContext, caller: ApiCaller, entryId: string, input: ApiKnowledgeEntryUpdate): Promise<ApiKnowledgeEntry> {
  if (Object.values(input).every((value) => value === undefined)) throw invalidRequest("Send at least one field to update.");
  return await inBusiness(context, caller, async (tx) => {
    const [current] = await tx.select().from(knowledgeSnippets).where(and(eq(knowledgeSnippets.businessId, caller.businessId), eq(knowledgeSnippets.id, entryId))).limit(1).for("update");
    if (!current) throw notFound("Knowledge entry");
    const tags = input.tags === undefined ? undefined : [...new Set([...(current.tags.includes(FAQ_TAG) ? [FAQ_TAG] : []), ...input.tags.filter((tag) => tag !== FAQ_TAG)])];
    const changes = {
      ...(input.title !== undefined && input.title !== current.title ? { title: input.title } : {}),
      ...(input.content !== undefined && input.content !== current.content ? { content: input.content } : {}),
      ...(tags !== undefined && JSON.stringify(tags) !== JSON.stringify(current.tags) ? { tags } : {}),
      ...(input.priority !== undefined && input.priority !== current.priority ? { priority: input.priority } : {}),
      ...(input.active !== undefined && input.active !== current.active ? { active: input.active } : {}),
    };
    if (!Object.keys(changes).length) return serializeKnowledgeEntry(current);
    const snippet = await updateKnowledgeSnippetInTransaction(tx, { businessId: caller.businessId, snippetId: entryId, ...changes });
    if (!snippet) throw notFound("Knowledge entry");
    await audit(tx, caller, { eventType: "api.knowledge.updated", entityType: "knowledge_snippet", entityId: entryId, payload: { fields: Object.keys(changes) } });
    return serializeKnowledgeEntry(snippet);
  });
}

export async function deleteKnowledgeEntryForApi(context: DomainContext, caller: ApiCaller, entryId: string): Promise<void> {
  await inBusiness(context, caller, async (tx) => {
    if (!await deleteKnowledgeSnippetInTransaction(tx, { businessId: caller.businessId, snippetId: entryId })) throw notFound("Knowledge entry");
    await audit(tx, caller, { eventType: "api.knowledge.deleted", entityType: "knowledge_snippet", entityId: entryId });
  });
}

// Knowledge sources: websites, the pages their crawls read, and uploaded files.

/**
 * Gives a domain error that carries an HTTP status its v1 code. The
 * dashboard's domain functions throw these; the API answers with them.
 */
export function apiErrorFromDomain(error: unknown, what: string): unknown {
  if (error instanceof PublicApiError || typeof error !== "object" || error === null) return error;
  if (error instanceof KnowledgeStorageLimitError) return new PublicApiError(409, "plan_limit_reached", error.message);
  const { status, code } = error as { status?: unknown; code?: unknown };
  const message = error instanceof Error ? error.message : "The request is invalid.";
  if (code === "website_url_invalid") return invalidRequest(message, [{ path: "url", message }]);
  if (status === 404) return notFound(what);
  if (status === 409) return conflict(message);
  if (status === 400 || status === 422) return invalidRequest(message);
  return error;
}

type KnowledgeSourceState = { id: string; sourceType: string; status: string; jobId: string | null; pageLimit: number | null };

function selectKnowledgeSource(tx: DatabaseTransaction, businessId: string) {
  return tx
    .select({ id: knowledgeDocuments.id, sourceType: knowledgeDocuments.sourceType, status: knowledgeDocuments.status, jobId: websiteIngestionJobs.id, pageLimit: websiteIngestionJobs.pageLimit })
    .from(knowledgeDocuments)
    .leftJoin(websiteIngestionJobs, and(eq(websiteIngestionJobs.rootDocumentId, knowledgeDocuments.id), eq(websiteIngestionJobs.businessId, businessId)));
}

/**
 * A source that can be read again: a website the API or dashboard added (the
 * root of its crawl) or an uploaded file. A page a crawl read is a source too,
 * but crawling one on its own would fight its website's crawl, so it is refused.
 */
async function requireKnowledgeSource(tx: DatabaseTransaction, businessId: string, documentId: string): Promise<KnowledgeSourceState> {
  const [source] = await selectKnowledgeSource(tx, businessId).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.id, documentId))).limit(1);
  if (!source) throw notFound("Knowledge source");
  if (knowledgeSourceType(source) === "page") throw invalidRequest("This page has no crawl of its own. Act on the website that read it, or delete the page and add its address as a website.");
  return source;
}

async function changeKnowledgeSource(context: DomainContext, caller: ApiCaller, documentId: string, change: { eventType: string; run: (tx: DatabaseTransaction, source: KnowledgeSourceState) => Promise<unknown> }): Promise<ApiKnowledgeSource> {
  return await inBusiness(context, caller, async (tx) => {
    const source = await requireKnowledgeSource(tx, caller.businessId, documentId);
    try {
      await change.run(tx, source);
    } catch (error) {
      throw apiErrorFromDomain(error, "Knowledge source");
    }
    await audit(tx, caller, { eventType: change.eventType, entityType: "knowledge_document", entityId: documentId });
    const loaded = await loadKnowledgeSourceResource(tx, caller.businessId, documentId);
    if (!loaded) throw notFound("Knowledge source");
    return loaded;
  });
}

/**
 * Starts reading a website with a sample crawl. A site that is already a source
 * returns that source, read again at its own page limit if its last crawl failed
 * or was cancelled. A page an earlier crawl read is not a new source.
 */
export async function createKnowledgeSourceForApi(context: DomainContext, caller: ApiCaller, input: ApiKnowledgeSourceCreate): Promise<ApiKnowledgeSource> {
  return await inBusiness(context, caller, async (tx) => {
    let url: string;
    try {
      url = normalizeWebsiteSourceUrl(input.url);
    } catch (error) {
      throw apiErrorFromDomain(error, "Knowledge source");
    }
    const [existing] = await selectKnowledgeSource(tx, caller.businessId).where(and(eq(knowledgeDocuments.businessId, caller.businessId), eq(knowledgeDocuments.sourceUrl, url))).limit(1);
    if (existing && !existing.jobId) throw conflict(`This address is already source ${existing.id}, a page with no crawl of its own. Delete that source, then add the address again.`);
    let documentId: string;
    if (existing) {
      documentId = existing.id;
      if (["cancelled", "error"].includes(existing.status)) {
        await retryKnowledgeDocumentInTransaction(tx, { businessId: caller.businessId, documentId, crawlLimit: existing.pageLimit ?? ONBOARDING_CRAWL_PAGE_LIMIT });
        await audit(tx, caller, { eventType: "api.knowledge_source.retried", entityType: "knowledge_document", entityId: documentId });
      }
    } else {
      documentId = await createKnowledgeDocumentInTransaction(tx, { businessId: caller.businessId, title: url, sourceUrl: url, sample: true });
      await audit(tx, caller, { eventType: "api.knowledge_source.created", entityType: "knowledge_document", entityId: documentId, payload: { type: "website" } });
    }
    const source = await loadKnowledgeSourceResource(tx, caller.businessId, documentId);
    if (!source) throw new Error("The knowledge source could not be read back.");
    return source;
  });
}

export async function expandKnowledgeSourceForApi(context: DomainContext, caller: ApiCaller, documentId: string): Promise<ApiKnowledgeSource> {
  return await changeKnowledgeSource(context, caller, documentId, { eventType: "api.knowledge_source.expanded", run: async (tx) => await expandWebsiteCrawlInTransaction(tx, { businessId: caller.businessId, documentId }) });
}

/** Reads a source again at the page limit it last crawled with, so a sample stays a sample. Refused while it is still being read. */
export async function retryKnowledgeSourceForApi(context: DomainContext, caller: ApiCaller, documentId: string): Promise<ApiKnowledgeSource> {
  return await changeKnowledgeSource(context, caller, documentId, {
    eventType: "api.knowledge_source.retried",
    run: async (tx, source) => {
      if (source.status === "processing") throw conflict("This source is still being read. Cancel it first, or wait for it to finish.");
      await retryKnowledgeDocumentInTransaction(tx, { businessId: caller.businessId, documentId, crawlLimit: source.pageLimit ?? undefined });
    },
  });
}

export async function cancelKnowledgeSourceForApi(context: DomainContext, caller: ApiCaller, documentId: string): Promise<ApiKnowledgeSource> {
  return await changeKnowledgeSource(context, caller, documentId, { eventType: "api.knowledge_source.cancelled", run: async (tx) => await cancelKnowledgeDocumentInTransaction(tx, { businessId: caller.businessId, documentId }) });
}

export async function listKnowledgeSourcesForApi(context: DomainContext, caller: ApiCaller, request: PageRequest & { type?: ApiKnowledgeSource["type"] | undefined; status?: ApiKnowledgeSource["status"] | undefined }): Promise<Page<ApiKnowledgeSource>> {
  return await inBusiness(context, caller, async (tx) => await listKnowledgeSourceResources(tx, caller.businessId, request));
}

export async function getKnowledgeSourceForApi(context: DomainContext, caller: ApiCaller, documentId: string): Promise<ApiKnowledgeSource> {
  return await inBusiness(context, caller, async (tx) => {
    const source = await loadKnowledgeSourceResource(tx, caller.businessId, documentId);
    if (!source) throw notFound("Knowledge source");
    return source;
  });
}

/** Turns a website, page or file off or back on. Sending its current state changes nothing. */
export async function updateKnowledgeSourceForApi(context: DomainContext, caller: ApiCaller, documentId: string, input: ApiKnowledgeSourceUpdate): Promise<ApiKnowledgeSource> {
  return await inBusiness(context, caller, async (tx) => {
    const [current] = await tx.select({ active: knowledgeDocuments.active }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, caller.businessId), eq(knowledgeDocuments.id, documentId))).limit(1).for("update");
    if (!current) throw notFound("Knowledge source");
    if (current.active !== input.active) {
      await setKnowledgeDocumentActiveInTransaction(tx, { businessId: caller.businessId, documentId, active: input.active });
      await audit(tx, caller, { eventType: "api.knowledge_source.updated", entityType: "knowledge_document", entityId: documentId, payload: { active: input.active } });
    }
    const source = await loadKnowledgeSourceResource(tx, caller.businessId, documentId);
    if (!source) throw notFound("Knowledge source");
    return source;
  });
}

/** Deletes a website, page or file and its indexed text. A website's crawl stops; the pages it read stay. */
export async function deleteKnowledgeSourceForApi(context: DomainContext, caller: ApiCaller, documentId: string): Promise<void> {
  await inBusiness(context, caller, async (tx) => {
    if (!await deleteKnowledgeDocumentInTransaction(tx, { businessId: caller.businessId, documentId })) throw notFound("Knowledge source");
    await audit(tx, caller, { eventType: "api.knowledge_source.deleted", entityType: "knowledge_document", entityId: documentId });
  });
}

// File uploads: reserve, PUT the bytes to storage, then complete.

/** Reserves a document upload and returns the signed URL to PUT its bytes to. */
export async function createKnowledgeUploadForApi(context: DomainContext, caller: ApiCaller, input: ApiKnowledgeUploadCreate, storage: StorageProvider): Promise<ApiKnowledgeUpload> {
  const request = { businessId: caller.businessId, purpose: "knowledge", fileName: input.file_name, contentType: input.content_type, length: input.length, checksum: input.checksum_sha256 };
  const planned = planUpload(request);
  await inBusiness(context, caller, async (tx) => {
    await insertPendingUploadInTransaction(tx, { ...request, ...planned });
    await audit(tx, caller, { eventType: "api.knowledge_upload.created", entityType: "storage_object", entityId: planned.objectId, payload: { contentType: input.content_type, length: input.length } });
  });
  const upload = await storage.createUpload({ key: planned.key, contentType: input.content_type, length: input.length, checksum: input.checksum_sha256 });
  return { upload_id: planned.objectId, upload_url: upload.url, upload_headers: upload.headers ?? {}, expires_at: upload.expiresAt?.toISOString() ?? null };
}

/** The source an upload already became, for a completion that is repeated or lost a race. */
async function completedUpload(context: DomainContext, caller: ApiCaller, uploadId: string): Promise<ApiKnowledgeSource> {
  return await inBusiness(context, caller, async (tx) => {
    const [document] = await tx.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, caller.businessId), eq(knowledgeDocuments.storageObjectId, uploadId))).limit(1);
    const source = document ? await loadKnowledgeSourceResource(tx, caller.businessId, document.id) : null;
    if (!source) throw notFound("Upload");
    return source;
  });
}

/**
 * Checks the stored file against its upload request, then makes it a file
 * source queued to be read. Completing again returns the same source.
 */
export async function completeKnowledgeUploadForApi(context: DomainContext, caller: ApiCaller, uploadId: string, input: ApiKnowledgeUploadComplete, storage: StorageProvider): Promise<ApiKnowledgeSource> {
  const object = await inBusiness(context, caller, async (tx) => (await tx.select().from(storageObjects).where(and(eq(storageObjects.id, uploadId), eq(storageObjects.businessId, caller.businessId), eq(storageObjects.purpose, "knowledge"))).limit(1))[0]);
  if (!object) throw notFound("Upload");
  if (object.status === "ready") return await completedUpload(context, caller, uploadId);
  if (object.status !== "pending" || (object.expiresAt && object.expiresAt.getTime() <= Date.now())) throw notFound("Upload");
  const metadata = await storage.headObject({ key: object.objectKey });
  if (!metadata) throw conflict("The file hasn't arrived yet. Send it with PUT to upload_url, then complete the upload. If upload_url has expired, start a new upload.");
  if (metadata.length !== object.contentLength || metadata.contentType !== object.contentType || (object.checksum && metadata.checksum !== object.checksum)) {
    throw invalidRequest("The stored file doesn't match its upload request. Check its size, content type and SHA-256, then start a new upload.");
  }
  try {
    return await inBusiness(context, caller, async (tx) => {
      const documentId = await completeUploadInTransaction(tx, { businessId: caller.businessId, objectId: uploadId, purpose: "knowledge", fileName: object.fileName, metadata, title: input.title, tags: input.tags });
      if (!documentId) throw new Error("The knowledge upload made no document.");
      await audit(tx, caller, { eventType: "api.knowledge_upload.completed", entityType: "knowledge_document", entityId: documentId, payload: { uploadId } });
      const source = await loadKnowledgeSourceResource(tx, caller.businessId, documentId);
      if (!source) throw new Error("The file source could not be read back.");
      return source;
    });
  } catch (error) {
    // Another request completed it first.
    if (error instanceof Error && error.message === "Upload is missing or already finalized.") return await completedUpload(context, caller, uploadId);
    throw apiErrorFromDomain(error, "Upload");
  }
}
