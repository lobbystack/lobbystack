import {
  brandForBusiness,
  brandForHostReference,
  cancelAppointmentForApi,
  cancelKnowledgeSourceForApi,
  claimPhoneNumberForApi,
  completeOnboardingForApi,
  completeKnowledgeUploadForApi,
  createAppointmentForApi,
  createBusinessForApi,
  createPartnerBusinessForApi,
  invitedUserEmail,
  inviteUserForApi,
  createCalendarConnectLinkForApi,
  createCheckoutForApi,
  createClaimLinkForApi,
  createContactForApi,
  createKnowledgeEntryForApi,
  createKnowledgeSourceForApi,
  createKnowledgeUploadForApi,
  createRuleForApi,
  createServiceForApi,
  createTeamInvitationForApi,
  createWidgetKeyForApi,
  createWebhookEndpoint,
  deleteCalendarConnectionForApi,
  deleteKnowledgeEntryForApi,
  deleteKnowledgeSourceForApi,
  deleteRuleForApi,
  deleteServiceForApi,
  deleteWebhookEndpoint,
  endManagedPlanForApi,
  expandKnowledgeSourceForApi,
  generateContactPasscodesForApi,
  getAppointmentForApi,
  getAvailabilityForApi,
  getBillingForApi,
  getBusinessForApi,
  getKnowledgeEntryForApi,
  getKnowledgeSourceForApi,
  getMeForApi,
  getNotificationPreferencesForApi,
  getOnboardingForApi,
  getPlatformMeForApi,
  getReceptionistForApi,
  getTeamForApi,
  getCallForApi,
  getCheckoutForApi,
  getPhoneNumberClaimForApi,
  getContactForApi,
  getWebhookEndpoint,
  idempotencyRequestHash,
  listAccountCalendarsForApi,
  listAppointmentsForApi,
  listBusinessesForApi,
  listCalendarConnectionsForApi,
  listCallsForApi,
  listContactsForApi,
  listKnowledgeEntriesForApi,
  listKnowledgeSourcesForApi,
  listMessagesForApi,
  listPhoneNumbersForApi,
  listRulesForApi,
  listServicesForApi,
  listStaffForApi,
  listWidgetKeysForApi,
  listWebhookEndpoints,
  PublicApiError,
  refusePartnerPlatformKey,
  releasePhoneNumberForApi,
  removeTeamMemberForApi,
  reorderRulesForApi,
  rescheduleAppointmentForApi,
  resolveActingUserId,
  retryKnowledgeSourceForApi,
  revokeTeamInvitationForApi,
  searchPhoneNumbersForApi,
  sendWebhookTestEvent,
  setContactPasscodesForApi,
  setManagedPlanForApi,
  updateBillingForApi,
  updateBusinessForApi,
  updateCalendarConnectionForApi,
  updateContactForApi,
  updateOnboardingForApi,
  updateKnowledgeEntryForApi,
  updateKnowledgeSourceForApi,
  updateNotificationPreferencesForApi,
  updateReceptionistForApi,
  updateRuleForApi,
  updateServiceForApi,
  updateTeamMemberForApi,
  updateWidgetKeyForApi,
  updateWebhookEndpoint,
  type CalendarAccess,
  type DomainContext,
  type WebhookEndpointDetail,
  type WebhookManager,
} from "@lobbystack/domain";
import { SecretBox } from "@lobbystack/providers";
import {
  apiAppointmentCreateSchema,
  apiAppointmentRescheduleSchema,
  apiBillingUpdateSchema,
  apiBusinessCreateSchema,
  apiUserCreateSchema,
  apiCalendarConnectionUpdateSchema,
  apiCheckoutCreateSchema,
  apiClaimLinkCreateSchema,
  apiManagedPlanCreateSchema,
  apiNotificationPreferencesUpdateSchema,
  apiOnboardingCompleteSchema,
  apiOnboardingUpdateSchema,
  apiPhoneNumberClaimCreateSchema,
  apiPhoneNumberSearchSchema,
  apiBusinessUpdateSchema,
  apiContactCreateSchema,
  apiContactPasscodesGenerateSchema,
  apiContactPasscodesUpdateSchema,
  apiContactUpdateSchema,
  apiKnowledgeEntryCreateSchema,
  apiKnowledgeEntryUpdateSchema,
  apiKnowledgeSourceCreateSchema,
  apiKnowledgeSourceUpdateSchema,
  apiKnowledgeUploadCompleteSchema,
  apiKnowledgeUploadCreateSchema,
  apiReceptionistUpdateSchema,
  apiRuleCreateSchema,
  apiRuleReorderSchema,
  apiRuleUpdateSchema,
  apiServiceCreateSchema,
  apiServiceUpdateSchema,
  apiTeamInvitationCreateSchema,
  apiTeamMemberUpdateSchema,
  apiWebhookEndpointCreateSchema,
  apiWebhookEndpointUpdateSchema,
  apiWidgetKeyCreateSchema,
  apiWidgetKeyUpdateSchema,
  isWidgetKeyIssuanceEnabled,
  webhookEventScope,
  type ApiWebhookEndpoint,
  PLATFORM_USER_INVITATIONS_PER_DAY,
  type WebhookEventType,
} from "@lobbystack/shared";

import { getAuthDatabase } from "../auth";
import { getDatabase } from "../databases";
import { createDomainContext, createWorkerDomainContext } from "../domain-context";
import { enforceFixedWindow, fixedWindowLimit } from "../fixed-window-limit";
import { calendarSigningConfigured, createCalendarConnectLink } from "../google-calendar-oauth";
import { googleCalendarProvider } from "../google-calendar-provider";
import { checkPhoneNumberSearchLimit } from "../phone-number-search-limit";
import { getStorageProvider } from "../storage";
import { withStripeConnect } from "../stripe-connect";
import { getNumberClaimTokenSecret, getTwilioProvider, twilioConfigured } from "../twilio-provider";
import { hasVerifiedPhone } from "../verified-phone";
import { data, handleApiRequest, pageQuery, queryParam, readApiBody, uuidParam, type ApiCredential, type RestApiCaller } from "./http";
import { partnerV1 } from "./partner-routes";

// One function per v1 operation. The route files under app/api/v1 only bind
// these to HTTP methods, so tests can call the same functions.

type Params<T extends string> = { params: Promise<Record<T, string>> };

function toApiEndpoint(endpoint: WebhookEndpointDetail): ApiWebhookEndpoint {
  return { id: endpoint.id, url: endpoint.url, description: endpoint.description, events: endpoint.events, status: endpoint.status, disabled_reason: endpoint.disabled_reason, created_at: endpoint.created_at, updated_at: endpoint.updated_at };
}

// An event carries the same data as the matching read endpoint, so subscribing to it needs that read scope.
function requireEventScopes(credential: ApiCredential, events: readonly WebhookEventType[]): void {
  const missing = [...new Set(events.map((event) => webhookEventScope[event]))].filter((scope) => !credential.scopes.includes(scope));
  if (missing.length) throw new PublicApiError(403, "insufficient_scope", `This API key needs ${missing.join(", ")} to subscribe to these events.`);
}

function webhookManager(caller: RestApiCaller): WebhookManager {
  if (caller.platformKeyId !== undefined && caller.partnerId !== undefined) return { kind: "platform_key", platformKeyId: caller.platformKeyId, groupId: caller.groupId, partnerId: caller.partnerId };
  if (caller.platformKeyId !== undefined) return { kind: "platform_key", platformKeyId: caller.platformKeyId, groupId: caller.groupId, actingUserId: caller.actingUserId };
  return { kind: "api_key", apiKeyId: caller.apiKeyId };
}

/** Whether this deployment can sell a plan and interval through Polar, as the dashboard decides. */
function checkoutAvailable(plan: "starter" | "pro", interval: "monthly" | "annual"): boolean {
  return Boolean(process.env.POLAR_ACCESS_TOKEN && process.env.POLAR_ORGANIZATION_ID && process.env[`POLAR_${plan.toUpperCase()}_${interval.toUpperCase()}_PRODUCT_ID`]);
}

/** A managed plan bypasses Polar, so only the host's own platform keys, with access to every business, may set one. A partner's key never has that access. */
function requireOperatorKey(credential: ApiCredential): void {
  if (credential.kind === "platform_key") refusePartnerPlatformKey(credential, "managed_plan");
  if (credential.kind !== "platform_key" || credential.access !== "all") throw new PublicApiError(403, "forbidden", "Only an operator's platform key, one with access to every business, can manage a plan outside Polar.");
}

/**
 * Each business a partner's key creates emails its owner an invitation, so
 * the partner's keys together create at most as many an hour as one person
 * can from the console. The limit counts against the partner, since a partner
 * can make as many keys as it likes.
 */
async function requirePartnerBusinessCreationAllowed(partnerId: string): Promise<void> {
  const result = await enforceFixedWindow([fixedWindowLimit("partner-business-create", "partner-hour", partnerId, 30, 60 * 60, "rate_limit_partner_hour")]);
  if (result.allowed) return;
  if (result.status === 503) throw new PublicApiError(503, "rate_limit_unavailable", "Creating businesses is unavailable for a moment. Retry shortly.", undefined, { "Retry-After": "5" });
  // The limit counts in fixed one-hour windows.
  const retryAfter = 3_600 - (Math.floor(Date.now() / 1_000) % 3_600);
  throw new PublicApiError(429, "rate_limited", `Too many new businesses. A partner's platform keys can create 30 businesses an hour between them. Retry in ${retryAfter} seconds.`, undefined, { "Retry-After": String(retryAfter) });
}

/** A host's key acts as the account its owner_email names, which the pipeline resolved. */
function requireActingUser(actingUserId: string | null): string {
  if (!actingUserId) throw new Error("A host's platform key acts as its owner, so it always has an account.");
  return actingUserId;
}

/** A key searches numbers as the account it acts as, so its searches count against that account's dashboard limit. */
async function requireNumberSearchAllowed(userId: string): Promise<void> {
  const result = await checkPhoneNumberSearchLimit({ userId, initial: false });
  if (result.allowed) return;
  if (result.status === 503) throw new PublicApiError(503, "rate_limit_unavailable", "Number search is unavailable for a moment. Retry shortly.", undefined, { "Retry-After": "5" });
  // The limit counts in fixed 10-minute windows.
  const retryAfter = 600 - (Math.floor(Date.now() / 1_000) % 600);
  throw new PublicApiError(429, "rate_limited", `Too many number searches. The account this key acts as can search 20 times in 10 minutes. Retry in ${retryAfter} seconds.`, undefined, { "Retry-After": String(retryAfter) });
}

/** Each invitation sends an email, so a key's invitations count against its account's dashboard limit of 20 an hour. */
async function requireInvitationAllowed(userId: string): Promise<void> {
  const result = await enforceFixedWindow([fixedWindowLimit("team-invite", "user-hour", userId, 20, 60 * 60, "rate_limit_user_hour")]);
  if (result.allowed) return;
  if (result.status === 503) throw new PublicApiError(503, "rate_limit_unavailable", "Invitations are unavailable for a moment. Retry shortly.", undefined, { "Retry-After": "5" });
  // The limit counts in fixed one-hour windows.
  const retryAfter = 3_600 - (Math.floor(Date.now() / 1_000) % 3_600);
  throw new PublicApiError(429, "rate_limited", `Too many invitations. The account this key acts as can invite 20 people an hour. Retry in ${retryAfter} seconds.`, undefined, { "Retry-After": String(retryAfter) });
}

/**
 * A partner's key has no account to count against, so its invitations count
 * against the partner, at the same 20 an hour, shared by all its keys.
 */
async function requirePartnerInvitationAllowed(partnerId: string): Promise<void> {
  const result = await enforceFixedWindow([fixedWindowLimit("team-invite", "partner-hour", partnerId, 20, 60 * 60, "rate_limit_partner_hour")]);
  if (result.allowed) return;
  if (result.status === 503) throw new PublicApiError(503, "rate_limit_unavailable", "Invitations are unavailable for a moment. Retry shortly.", undefined, { "Retry-After": "5" });
  const retryAfter = 3_600 - (Math.floor(Date.now() / 1_000) % 3_600);
  throw new PublicApiError(429, "rate_limited", `Too many invitations. A partner's platform keys can invite 20 people an hour between them. Retry in ${retryAfter} seconds.`, undefined, { "Retry-After": String(retryAfter) });
}

/**
 * A platform key can invite PLATFORM_USER_INVITATIONS_PER_DAY addresses a day
 * through POST /users. The host sets its own keys, so each counts alone. A
 * partner can make as many keys as it likes, so its keys share one count.
 */
async function requireUserInvitationAllowed(credential: { platformKeyId: string; partnerId?: string | undefined }): Promise<void> {
  const limit = credential.partnerId === undefined
    ? fixedWindowLimit("platform-user-invitations", "key-day", credential.platformKeyId, PLATFORM_USER_INVITATIONS_PER_DAY, 86_400, "rate_limit_key_day")
    : fixedWindowLimit("platform-user-invitations", "partner-day", credential.partnerId, PLATFORM_USER_INVITATIONS_PER_DAY, 86_400, "rate_limit_partner_day");
  const result = await enforceFixedWindow([limit]);
  if (result.allowed) return;
  if (result.status === 503) throw new PublicApiError(503, "rate_limit_unavailable", "Invitations are unavailable for a moment. Retry shortly.", undefined, { "Retry-After": "5" });
  // The limit counts in fixed one-day windows.
  const retryAfter = 86_400 - (Math.floor(Date.now() / 1_000) % 86_400);
  const who = credential.partnerId === undefined ? "A platform key" : "A partner's platform keys";
  throw new PublicApiError(429, "rate_limited", `Too many invitations. ${who} can invite ${PLATFORM_USER_INVITATIONS_PER_DAY} addresses a day${credential.partnerId === undefined ? "" : " between them"}. Retry in ${retryAfter} seconds.`, undefined, { "Retry-After": String(retryAfter) });
}

/**
 * The host's dashboard address, from APP_BASE_URL only. A direct business's
 * setup emails, widget script tag and calendar links point there, so a
 * request can't aim them at another host through its Host header. Without
 * it, they fail.
 */
function appOrigin(): string {
  const configured = process.env.APP_BASE_URL?.trim();
  let url: URL | undefined;
  try {
    url = configured ? new URL(configured) : undefined;
  } catch {
    url = undefined;
  }
  if (!url || !["https:", "http:"].includes(url.protocol)) throw new Error("APP_BASE_URL must be set to the dashboard's address before the API can send links.");
  return url.origin;
}

/**
 * Where a business's dashboard links point: its partner's domain for a
 * partner's business, the only one it opens on, and APP_BASE_URL otherwise.
 * Either way the address comes from the deployment, never the request.
 */
async function businessOrigin(context: DomainContext, businessId: string): Promise<string> {
  const brand = await brandForBusiness(context, businessId);
  return brand.kind === "partner" ? brand.origin : appOrigin();
}

/** The dashboard address of a partner, for a partner's key that names no business. */
async function partnerOrigin(context: DomainContext, partnerId: string): Promise<string> {
  const brand = await brandForHostReference(context, { kind: "partner", partnerId });
  if (!brand) throw new Error(`Partner ${partnerId} was not found for its platform key.`);
  return brand.origin;
}

const googleCalendarUnavailable = () => new PublicApiError(403, "forbidden", "Google Calendar isn't available on this deployment.");

/** Refuses where Google Calendar isn't set up: the OAuth client, and ENCRYPTION_KEY for the tokens the callback stores. Returns that key. */
function requireGoogleCalendar(): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) throw googleCalendarUnavailable();
  return encryptionKey;
}

function calendarAccess(): CalendarAccess {
  const box = new SecretBox(requireGoogleCalendar());
  const provider = googleCalendarProvider();
  return { decryptToken: (value) => box.decrypt(value), encryptToken: (value) => box.encrypt(value), refreshAccessToken: (input) => provider.refreshAccessToken(input), listCalendars: (input) => provider.listCalendars(input) };
}

function dateParam(request: Request, name: string): Date | undefined {
  const value = queryParam(request, name);
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new PublicApiError(400, "invalid_request", `${name} must be an ISO 8601 timestamp.`);
  return parsed;
}

function textParam(request: Request, name: string, maxLength: number): string | undefined {
  const value = queryParam(request, name)?.trim();
  if (!value) return undefined;
  if (value.length > maxLength) throw new PublicApiError(400, "invalid_request", `${name} can be up to ${maxLength} characters.`, [{ path: name, message: `At most ${maxLength} characters.` }]);
  return value;
}

function booleanParam(request: Request, name: string): boolean | undefined {
  const value = queryParam(request, name);
  if (value === undefined) return undefined;
  if (value !== "true" && value !== "false") throw new PublicApiError(400, "invalid_request", `${name} must be true or false.`);
  return value === "true";
}

function enumParam<T extends string>(request: Request, name: string, values: readonly T[]): T | undefined {
  const value = queryParam(request, name);
  if (value === undefined) return undefined;
  if (!values.includes(value as T)) throw new PublicApiError(400, "invalid_request", `${name} must be one of: ${values.join(", ")}.`);
  return value as T;
}

export const v1 = {
  getMe: (request: Request) => handleApiRequest(request, "getMe", async ({ context, caller, credential }) => {
    if (credential.kind === "platform_key") return { body: data(await getPlatformMeForApi(context, credential, caller?.platformKeyId !== undefined ? caller : null)) };
    if (caller?.apiKeyId === undefined) throw new Error("A per-business key always has its business.");
    return { body: data(await getMeForApi(context, caller)) };
  }),
  getBusiness: (request: Request) => handleApiRequest(request, "getBusiness", async ({ context, caller }) => ({ body: data(await getBusinessForApi(context, caller)) })),
  updateBusiness: (request: Request) => handleApiRequest(request, "updateBusiness", async ({ context, caller }) => ({ body: data(await updateBusinessForApi(context, caller, await readApiBody(request, apiBusinessUpdateSchema))) })),
  createBusiness: (request: Request) => handleApiRequest(request, "createBusiness", async ({ context, credential, actingUserId, idempotencyKey }) => {
    if (!idempotencyKey) throw new Error("POST /businesses requires an Idempotency-Key.");
    const body = await readApiBody(request, apiBusinessCreateSchema);
    const requestHash = idempotencyRequestHash(body);
    // A partner's key creates a business of the partner through the console's own operation, which acts as the system: only the app role can.
    // A package bills it through the partner's Stripe account, and a template sets it up as the worker, as in the console.
    const result = credential.partnerId !== undefined
      ? await createPartnerBusinessForApi(withStripeConnect(createDomainContext()), { key: credential, idempotencyKey, requestHash, body }, {
        beforeCreate: () => requirePartnerBusinessCreationAllowed(credential.partnerId),
        ...(body.template_id !== undefined ? { setup: { worker: createWorkerDomainContext(), storage: getStorageProvider() } } : {}),
      })
      : await createBusinessForApi(context, { key: credential, actingUserId: requireActingUser(actingUserId), idempotencyKey, requestHash, body });
    return { body: data(result.business), ...(result.replayed ? { headers: { "Idempotent-Replayed": "true" } } : {}) };
  }),
  createUser: (request: Request) => handleApiRequest(request, "createUser", async ({ context, credential, idempotencyKey }) => {
    if (!idempotencyKey) throw new Error("POST /users requires an Idempotency-Key.");
    // A partner's key invites people to the partner's dashboard, under its brand.
    const appBaseUrl = credential.partnerId === undefined ? appOrigin() : await partnerOrigin(context, credential.partnerId);
    const body = await readApiBody(request, apiUserCreateSchema);
    const invitation = { email: invitedUserEmail(body), locale: body.locale ?? "en" };
    await requireUserInvitationAllowed(credential);
    // A server-only module, loaded when used as auth.ts loads it.
    const { assertEmailVerificationSendAllowed, EmailVerificationRateLimitError } = await import("../email-verification-policy");
    try {
      // The dashboard's limits per recipient, kept apart from verification codes so invitations can't hold up the person's own sign-up.
      // The key's daily limit above stands in for the per-IP one: every request from the key holder's server shares an address.
      await assertEmailVerificationSendAllowed({ email: invitation.email, scope: "account-setup" });
    } catch (error) {
      if (!(error instanceof EmailVerificationRateLimitError)) throw error;
      // The address got an email moments ago. Answer as if sent, as sign-up and password reset do.
      return { body: data(invitation) };
    }
    return { body: data(await inviteUserForApi({ auth: getAuthDatabase().db, app: getDatabase("lobbystack_app").db }, { key: credential, idempotencyKey, body, appBaseUrl })) };
  }),
  // A partner's group holds every business of the partner, so its keys list them all.
  listBusinesses: (request: Request) => handleApiRequest(request, "listBusinesses", async ({ context, credential }) => ({ body: await listBusinessesForApi(context, { groupId: credential.group, ...pageQuery(request) }) })),
  getBilling: (request: Request) => handleApiRequest(request, "getBilling", async ({ context, caller }) => ({ body: data(await getBillingForApi(context, caller)) })),
  updateBilling: (request: Request) => handleApiRequest(request, "updateBilling", async ({ context, caller }) => ({ body: data(await updateBillingForApi(context, caller, await readApiBody(request, apiBillingUpdateSchema))) })),
  createCheckout: (request: Request) => handleApiRequest(request, "createCheckout", async ({ context, caller }) => {
    refusePartnerPlatformKey(caller, "checkout");
    const body = await readApiBody(request, apiCheckoutCreateSchema);
    return { body: data(await createCheckoutForApi(context, caller, body, { available: checkoutAvailable(body.plan, body.interval) })) };
  }),
  getCheckout: (request: Request, { params }: Params<"checkout_id">) => handleApiRequest(request, "getCheckout", async ({ context, caller }) => ({ body: data(await getCheckoutForApi(context, caller, uuidParam((await params).checkout_id, "checkout_id"))) })),
  setManagedPlan: (request: Request) => handleApiRequest(request, "setManagedPlan", async ({ context, caller, credential }) => {
    requireOperatorKey(credential);
    await readApiBody(request, apiManagedPlanCreateSchema);
    return { body: data(await setManagedPlanForApi(context, caller)) };
  }),
  endManagedPlan: (request: Request) => handleApiRequest(request, "endManagedPlan", async ({ context, caller, credential }) => {
    requireOperatorKey(credential);
    return { body: data(await endManagedPlanForApi(context, caller)) };
  }),
  listPhoneNumbers: (request: Request) => handleApiRequest(request, "listPhoneNumbers", async ({ context, caller }) => ({ body: { data: await listPhoneNumbersForApi(context, caller), next_cursor: null, has_more: false } })),
  searchPhoneNumbers: (request: Request) => handleApiRequest(request, "searchPhoneNumbers", async ({ context, caller }) => {
    // A deployment without Twilio answers 503 phone_numbers_unavailable, before the search counts against the limit.
    if (!twilioConfigured()) throw new PublicApiError(503, "phone_numbers_unavailable", "Phone numbers aren't set up on this deployment.");
    const body = await readApiBody(request, apiPhoneNumberSearchSchema);
    const userId = await resolveActingUserId(context, caller);
    return { body: { data: await searchPhoneNumbersForApi(context, caller, body, { userId, provider: getTwilioProvider(), claimTokenSecret: getNumberClaimTokenSecret(), beforeSearch: () => requireNumberSearchAllowed(userId) }), next_cursor: null, has_more: false } };
  }),
  createPhoneNumberClaim: (request: Request) => handleApiRequest(request, "createPhoneNumberClaim", async ({ context, caller }) => {
    const body = await readApiBody(request, apiPhoneNumberClaimCreateSchema);
    const userId = await resolveActingUserId(context, caller);
    // No network hash: customers of one integration platform claim from its addresses, so a per-network limit would let only one of them have a trial.
    return { body: data(await claimPhoneNumberForApi(context, caller, { offerToken: body.offer_token }, { userId, claimTokenSecret: getNumberClaimTokenSecret() })) };
  }),
  getPhoneNumberClaim: (request: Request, { params }: Params<"claim_id">) => handleApiRequest(request, "getPhoneNumberClaim", async ({ context, caller }) => ({ body: data(await getPhoneNumberClaimForApi(context, caller, uuidParam((await params).claim_id, "claim_id"))) })),
  releasePhoneNumber: (request: Request, { params }: Params<"phone_number_id">) => handleApiRequest(request, "releasePhoneNumber", async ({ context, caller }) => ({ body: data(await releasePhoneNumberForApi(context, caller, uuidParam((await params).phone_number_id, "phone_number_id"))) })),
  replacePhoneNumber: (request: Request, { params }: Params<"phone_number_id">) => handleApiRequest(request, "replacePhoneNumber", async ({ context, caller }) => {
    const phoneNumberId = uuidParam((await params).phone_number_id, "phone_number_id");
    const body = await readApiBody(request, apiPhoneNumberClaimCreateSchema);
    const userId = await resolveActingUserId(context, caller);
    return { body: data(await claimPhoneNumberForApi(context, caller, { offerToken: body.offer_token, replaces: phoneNumberId }, { userId, claimTokenSecret: getNumberClaimTokenSecret() })) };
  }),
  getOnboarding: (request: Request) => handleApiRequest(request, "getOnboarding", async ({ context, caller }) => ({ body: data(await getOnboardingForApi(context, caller)) })),
  updateOnboarding: (request: Request) => handleApiRequest(request, "updateOnboarding", async ({ context, caller }) => ({ body: data(await updateOnboardingForApi(context, caller, await readApiBody(request, apiOnboardingUpdateSchema))) })),
  completeOnboarding: (request: Request) => handleApiRequest(request, "completeOnboarding", async ({ context, caller }) => {
    const body = await readApiBody(request, apiOnboardingCompleteSchema);
    // A platform key onboarding businesses must not credit them to an affiliate code.
    if (body.referral_code !== undefined && caller.platformKeyId !== undefined) throw new PublicApiError(400, "invalid_request", "A platform key can't credit a referral. The business's owner can, with an API key they created.", [{ path: "referral_code", message: "Not accepted with a platform key." }]);
    // Affiliate attribution runs as the system actor, which only the app's database role can be, as in the dashboard.
    const attribution = body.referral_code !== undefined ? { context: createDomainContext(), referredUserId: await resolveActingUserId(context, caller) } : undefined;
    return { body: data(await completeOnboardingForApi(context, caller, body, { attribution })) };
  }),
  getTeam: (request: Request) => handleApiRequest(request, "getTeam", async ({ context, caller }) => ({ body: data(await getTeamForApi(context, caller)) })),
  createTeamInvitation: (request: Request) => handleApiRequest(request, "createTeamInvitation", async ({ context, caller }) => {
    const body = await readApiBody(request, apiTeamInvitationCreateSchema);
    // A partner's key invites as the partner, so its invitations count against the partner.
    if (caller.platformKeyId !== undefined && caller.partnerId !== undefined) {
      const { platformKeyId, partnerId } = caller;
      return { body: data(await createTeamInvitationForApi(context, caller, body, { platformKeyId, beforeSend: () => requirePartnerInvitationAllowed(partnerId) })) };
    }
    const userId = await resolveActingUserId(context, caller);
    return { body: data(await createTeamInvitationForApi(context, caller, body, { userId, beforeSend: () => requireInvitationAllowed(userId) })) };
  }),
  revokeTeamInvitation: (request: Request, { params }: Params<"invitation_id">) => handleApiRequest(request, "revokeTeamInvitation", async ({ context, caller }) => {
    const invitationId = uuidParam((await params).invitation_id, "invitation_id");
    await revokeTeamInvitationForApi(context, caller, invitationId);
    return { body: data({ id: invitationId, deleted: true }) };
  }),
  updateTeamMember: (request: Request, { params }: Params<"membership_id">) => handleApiRequest(request, "updateTeamMember", async ({ context, caller }) => {
    const membershipId = uuidParam((await params).membership_id, "membership_id");
    return { body: data(await updateTeamMemberForApi(context, caller, membershipId, await readApiBody(request, apiTeamMemberUpdateSchema))) };
  }),
  removeTeamMember: (request: Request, { params }: Params<"membership_id">) => handleApiRequest(request, "removeTeamMember", async ({ context, caller }) => {
    const membershipId = uuidParam((await params).membership_id, "membership_id");
    await removeTeamMemberForApi(context, caller, membershipId);
    return { body: data({ id: membershipId, deleted: true }) };
  }),
  createClaimLink: (request: Request) => handleApiRequest(request, "createClaimLink", async ({ context, caller }) => {
    refusePartnerPlatformKey(caller, "claim_link");
    const body = await readApiBody(request, apiClaimLinkCreateSchema);
    const userId = await resolveActingUserId(context, caller);
    return { body: data(await createClaimLinkForApi(context, caller, body, { userId, beforeSend: () => requireInvitationAllowed(userId) })) };
  }),
  listWidgetKeys: (request: Request) => handleApiRequest(request, "listWidgetKeys", async ({ context, caller }) => ({ body: { data: await listWidgetKeysForApi(context, caller), next_cursor: null, has_more: false } })),
  createWidgetKey: (request: Request) => handleApiRequest(request, "createWidgetKey", async ({ context, caller }) => {
    if (!isWidgetKeyIssuanceEnabled(process.env)) throw new PublicApiError(403, "forbidden", "Website chat widgets aren't available on this deployment yet.");
    const input = await readApiBody(request, apiWidgetKeyCreateSchema);
    return { body: data(await createWidgetKeyForApi(context, caller, input, { appOrigin: await businessOrigin(context, caller.businessId) })) };
  }),
  updateWidgetKey: (request: Request, { params }: Params<"widget_key_id">) => handleApiRequest(request, "updateWidgetKey", async ({ context, caller }) => {
    const widgetKeyId = uuidParam((await params).widget_key_id, "widget_key_id");
    return { body: data(await updateWidgetKeyForApi(context, caller, widgetKeyId, await readApiBody(request, apiWidgetKeyUpdateSchema))) };
  }),
  listRules: (request: Request) => handleApiRequest(request, "listRules", async ({ context, caller }) => ({ body: { data: await listRulesForApi(context, caller), next_cursor: null, has_more: false } })),
  createRule: (request: Request) => handleApiRequest(request, "createRule", async ({ context, caller }) => ({ body: data(await createRuleForApi(context, caller, await readApiBody(request, apiRuleCreateSchema))) })),
  updateRule: (request: Request, { params }: Params<"rule_id">) => handleApiRequest(request, "updateRule", async ({ context, caller }) => {
    const ruleId = uuidParam((await params).rule_id, "rule_id");
    return { body: data(await updateRuleForApi(context, caller, ruleId, await readApiBody(request, apiRuleUpdateSchema))) };
  }),
  deleteRule: (request: Request, { params }: Params<"rule_id">) => handleApiRequest(request, "deleteRule", async ({ context, caller }) => {
    const ruleId = uuidParam((await params).rule_id, "rule_id");
    await deleteRuleForApi(context, caller, ruleId);
    return { body: data({ id: ruleId, deleted: true }) };
  }),
  reorderRules: (request: Request) => handleApiRequest(request, "reorderRules", async ({ context, caller }) => ({ body: { data: await reorderRulesForApi(context, caller, await readApiBody(request, apiRuleReorderSchema)), next_cursor: null, has_more: false } })),
  getReceptionist: (request: Request) => handleApiRequest(request, "getReceptionist", async ({ context, caller }) => ({ body: data(await getReceptionistForApi(context, caller)) })),
  updateReceptionist: (request: Request) => handleApiRequest(request, "updateReceptionist", async ({ context, caller }) => ({ body: data(await updateReceptionistForApi(context, caller, await readApiBody(request, apiReceptionistUpdateSchema))) })),
  createCalendarConnectLink: (request: Request) => handleApiRequest(request, "createCalendarConnectLink", async ({ context, caller }) => {
    requireGoogleCalendar();
    if (!calendarSigningConfigured()) throw googleCalendarUnavailable();
    const origin = await businessOrigin(context, caller.businessId);
    return { body: data(await createCalendarConnectLinkForApi(context, caller, { link: ({ businessId }) => createCalendarConnectLink({ origin, businessId }) })) };
  }),
  listCalendarConnections: (request: Request) => handleApiRequest(request, "listCalendarConnections", async ({ context, caller }) => ({ body: { data: await listCalendarConnectionsForApi(context, caller), next_cursor: null, has_more: false } })),
  listAccountCalendars: (request: Request, { params }: Params<"connection_id">) => handleApiRequest(request, "listAccountCalendars", async ({ context, caller }) => {
    const connectionId = uuidParam((await params).connection_id, "connection_id");
    return { body: { data: await listAccountCalendarsForApi(context, caller, connectionId, calendarAccess), next_cursor: null, has_more: false } };
  }),
  updateCalendarConnection: (request: Request, { params }: Params<"connection_id">) => handleApiRequest(request, "updateCalendarConnection", async ({ context, caller }) => {
    const connectionId = uuidParam((await params).connection_id, "connection_id");
    return { body: data(await updateCalendarConnectionForApi(context, caller, connectionId, await readApiBody(request, apiCalendarConnectionUpdateSchema), calendarAccess)) };
  }),
  deleteCalendarConnection: (request: Request, { params }: Params<"connection_id">) => handleApiRequest(request, "deleteCalendarConnection", async ({ context, caller }) => {
    const connectionId = uuidParam((await params).connection_id, "connection_id");
    await deleteCalendarConnectionForApi(context, caller, connectionId);
    return { body: data({ id: connectionId, deleted: true }) };
  }),
  // Alerts belong to the account the key acts as, which RLS lets change only its own: they run with the dashboard's database role.
  getNotificationPreferences: (request: Request) => handleApiRequest(request, "getNotificationPreferences", async ({ context, caller }) => {
    const userId = await resolveActingUserId(context, caller);
    return { body: data(await getNotificationPreferencesForApi(createDomainContext(), caller, { userId, phoneVerified: await hasVerifiedPhone(userId) })) };
  }),
  updateNotificationPreferences: (request: Request) => handleApiRequest(request, "updateNotificationPreferences", async ({ context, caller }) => {
    const body = await readApiBody(request, apiNotificationPreferencesUpdateSchema);
    const userId = await resolveActingUserId(context, caller);
    return { body: data(await updateNotificationPreferencesForApi(createDomainContext(), caller, body, { userId, phoneVerified: await hasVerifiedPhone(userId) })) };
  }),
  listServices: (request: Request) => handleApiRequest(request, "listServices", async ({ context, caller }) => ({ body: { data: await listServicesForApi(context, caller, { includeInactive: booleanParam(request, "include_inactive") }), next_cursor: null, has_more: false } })),
  createService: (request: Request) => handleApiRequest(request, "createService", async ({ context, caller }) => ({ body: data(await createServiceForApi(context, caller, await readApiBody(request, apiServiceCreateSchema))) })),
  updateService: (request: Request, { params }: Params<"service_id">) => handleApiRequest(request, "updateService", async ({ context, caller }) => {
    const serviceId = uuidParam((await params).service_id, "service_id");
    return { body: data(await updateServiceForApi(context, caller, serviceId, await readApiBody(request, apiServiceUpdateSchema))) };
  }),
  deleteService: (request: Request, { params }: Params<"service_id">) => handleApiRequest(request, "deleteService", async ({ context, caller }) => {
    const serviceId = uuidParam((await params).service_id, "service_id");
    await deleteServiceForApi(context, caller, serviceId);
    return { body: data({ id: serviceId, deleted: true }) };
  }),
  listStaff: (request: Request) => handleApiRequest(request, "listStaff", async ({ context, caller }) => ({ body: { data: await listStaffForApi(context, caller), next_cursor: null, has_more: false } })),

  listCalls: (request: Request) => handleApiRequest(request, "listCalls", async ({ context, caller }) => ({ body: await listCallsForApi(context, caller, { ...pageQuery(request), startedAfter: dateParam(request, "started_after"), startedBefore: dateParam(request, "started_before") }) })),
  getCall: (request: Request, { params }: Params<"call_id">) => handleApiRequest(request, "getCall", async ({ context, caller }) => ({ body: data(await getCallForApi(context, caller, uuidParam((await params).call_id, "call_id"))) })),

  listContacts: (request: Request) => handleApiRequest(request, "listContacts", async ({ context, caller }) => ({ body: await listContactsForApi(context, caller, { ...pageQuery(request), phone: queryParam(request, "phone"), email: queryParam(request, "email"), name: textParam(request, "name", 200) }) })),
  createContact: (request: Request) => handleApiRequest(request, "createContact", async ({ context, caller }) => ({ body: data(await createContactForApi(context, caller, await readApiBody(request, apiContactCreateSchema))) })),
  getContact: (request: Request, { params }: Params<"contact_id">) => handleApiRequest(request, "getContact", async ({ context, caller }) => ({ body: data(await getContactForApi(context, caller, uuidParam((await params).contact_id, "contact_id"))) })),
  updateContact: (request: Request, { params }: Params<"contact_id">) => handleApiRequest(request, "updateContact", async ({ context, caller }) => {
    const contactId = uuidParam((await params).contact_id, "contact_id");
    return { body: data(await updateContactForApi(context, caller, contactId, await readApiBody(request, apiContactUpdateSchema))) };
  }),
  setContactPasscodes: (request: Request) => handleApiRequest(request, "setContactPasscodes", async ({ context, caller }) => ({ body: { data: await setContactPasscodesForApi(context, caller, await readApiBody(request, apiContactPasscodesUpdateSchema)), next_cursor: null, has_more: false } })),
  // The answer is the only copy of each new PIN, so nothing on the way may keep it.
  generateContactPasscodes: (request: Request) => handleApiRequest(request, "generateContactPasscodes", async ({ context, caller }) => ({ body: data(await generateContactPasscodesForApi(context, caller, await readApiBody(request, apiContactPasscodesGenerateSchema))), headers: { "Cache-Control": "no-store" } })),

  listAppointments: (request: Request) => handleApiRequest(request, "listAppointments", async ({ context, caller }) => ({ body: await listAppointmentsForApi(context, caller, { ...pageQuery(request), status: enumParam(request, "status", ["confirmed", "cancelled"] as const), startsAfter: dateParam(request, "starts_after"), startsBefore: dateParam(request, "starts_before"), contactId: queryParam(request, "contact_id") === undefined ? undefined : uuidParam(queryParam(request, "contact_id"), "contact_id") }) })),
  getAvailability: (request: Request) => handleApiRequest(request, "getAvailability", async ({ context, caller }) => {
    const serviceId = uuidParam(queryParam(request, "service_id"), "service_id");
    const startDate = queryParam(request, "start_date");
    if (!startDate) throw new PublicApiError(400, "invalid_request", "start_date is required.", [{ path: "start_date", message: "Required." }]);
    const staffId = queryParam(request, "staff_id") === undefined ? undefined : uuidParam(queryParam(request, "staff_id"), "staff_id");
    return { body: { data: await getAvailabilityForApi(context, caller, { serviceId, startDate, endDate: queryParam(request, "end_date"), staffId }), next_cursor: null, has_more: false } };
  }),
  createAppointment: (request: Request) => handleApiRequest(request, "createAppointment", async ({ context, caller }) => ({ body: data(await createAppointmentForApi(context, caller, await readApiBody(request, apiAppointmentCreateSchema))) })),
  getAppointment: (request: Request, { params }: Params<"appointment_id">) => handleApiRequest(request, "getAppointment", async ({ context, caller }) => ({ body: data(await getAppointmentForApi(context, caller, uuidParam((await params).appointment_id, "appointment_id"))) })),
  cancelAppointment: (request: Request, { params }: Params<"appointment_id">) => handleApiRequest(request, "cancelAppointment", async ({ context, caller }) => ({ body: data(await cancelAppointmentForApi(context, caller, uuidParam((await params).appointment_id, "appointment_id"))) })),
  rescheduleAppointment: (request: Request, { params }: Params<"appointment_id">) => handleApiRequest(request, "rescheduleAppointment", async ({ context, caller }) => {
    const appointmentId = uuidParam((await params).appointment_id, "appointment_id");
    return { body: data(await rescheduleAppointmentForApi(context, caller, appointmentId, await readApiBody(request, apiAppointmentRescheduleSchema))) };
  }),

  listMessages: (request: Request) => handleApiRequest(request, "listMessages", async ({ context, caller }) => ({ body: await listMessagesForApi(context, caller, { ...pageQuery(request), status: enumParam(request, "status", ["open", "done"] as const) }) })),
  listKnowledgeEntries: (request: Request) => handleApiRequest(request, "listKnowledgeEntries", async ({ context, caller }) => ({ body: await listKnowledgeEntriesForApi(context, caller, { ...pageQuery(request), type: enumParam(request, "type", ["text", "faq"] as const) }) })),
  createKnowledgeEntry: (request: Request) => handleApiRequest(request, "createKnowledgeEntry", async ({ context, caller }) => ({ body: data(await createKnowledgeEntryForApi(context, caller, await readApiBody(request, apiKnowledgeEntryCreateSchema))) })),
  getKnowledgeEntry: (request: Request, { params }: Params<"entry_id">) => handleApiRequest(request, "getKnowledgeEntry", async ({ context, caller }) => ({ body: data(await getKnowledgeEntryForApi(context, caller, uuidParam((await params).entry_id, "entry_id"))) })),
  updateKnowledgeEntry: (request: Request, { params }: Params<"entry_id">) => handleApiRequest(request, "updateKnowledgeEntry", async ({ context, caller }) => {
    const entryId = uuidParam((await params).entry_id, "entry_id");
    return { body: data(await updateKnowledgeEntryForApi(context, caller, entryId, await readApiBody(request, apiKnowledgeEntryUpdateSchema))) };
  }),
  deleteKnowledgeEntry: (request: Request, { params }: Params<"entry_id">) => handleApiRequest(request, "deleteKnowledgeEntry", async ({ context, caller }) => {
    const entryId = uuidParam((await params).entry_id, "entry_id");
    await deleteKnowledgeEntryForApi(context, caller, entryId);
    return { body: data({ id: entryId, deleted: true }) };
  }),
  listKnowledgeSources: (request: Request) => handleApiRequest(request, "listKnowledgeSources", async ({ context, caller }) => ({ body: await listKnowledgeSourcesForApi(context, caller, { ...pageQuery(request), type: enumParam(request, "type", ["website", "page", "file"] as const), status: enumParam(request, "status", ["pending", "processing", "indexed", "error", "cancelled"] as const) }) })),
  createKnowledgeSource: (request: Request) => handleApiRequest(request, "createKnowledgeSource", async ({ context, caller }) => ({ body: data(await createKnowledgeSourceForApi(context, caller, await readApiBody(request, apiKnowledgeSourceCreateSchema))) })),
  getKnowledgeSource: (request: Request, { params }: Params<"source_id">) => handleApiRequest(request, "getKnowledgeSource", async ({ context, caller }) => ({ body: data(await getKnowledgeSourceForApi(context, caller, uuidParam((await params).source_id, "source_id"))) })),
  updateKnowledgeSource: (request: Request, { params }: Params<"source_id">) => handleApiRequest(request, "updateKnowledgeSource", async ({ context, caller }) => {
    const sourceId = uuidParam((await params).source_id, "source_id");
    return { body: data(await updateKnowledgeSourceForApi(context, caller, sourceId, await readApiBody(request, apiKnowledgeSourceUpdateSchema))) };
  }),
  deleteKnowledgeSource: (request: Request, { params }: Params<"source_id">) => handleApiRequest(request, "deleteKnowledgeSource", async ({ context, caller }) => {
    const sourceId = uuidParam((await params).source_id, "source_id");
    await deleteKnowledgeSourceForApi(context, caller, sourceId);
    return { body: data({ id: sourceId, deleted: true }) };
  }),
  expandKnowledgeSource: (request: Request, { params }: Params<"source_id">) => handleApiRequest(request, "expandKnowledgeSource", async ({ context, caller }) => ({ body: data(await expandKnowledgeSourceForApi(context, caller, uuidParam((await params).source_id, "source_id"))) })),
  retryKnowledgeSource: (request: Request, { params }: Params<"source_id">) => handleApiRequest(request, "retryKnowledgeSource", async ({ context, caller }) => ({ body: data(await retryKnowledgeSourceForApi(context, caller, uuidParam((await params).source_id, "source_id"))) })),
  createKnowledgeUpload: (request: Request) => handleApiRequest(request, "createKnowledgeUpload", async ({ context, caller }) => ({ body: data(await createKnowledgeUploadForApi(context, caller, await readApiBody(request, apiKnowledgeUploadCreateSchema), getStorageProvider())) })),
  completeKnowledgeUpload: (request: Request, { params }: Params<"upload_id">) => handleApiRequest(request, "completeKnowledgeUpload", async ({ context, caller }) => {
    const uploadId = uuidParam((await params).upload_id, "upload_id");
    return { body: data(await completeKnowledgeUploadForApi(context, caller, uploadId, await readApiBody(request, apiKnowledgeUploadCompleteSchema), getStorageProvider())) };
  }),
  cancelKnowledgeSource: (request: Request, { params }: Params<"source_id">) => handleApiRequest(request, "cancelKnowledgeSource", async ({ context, caller }) => ({ body: data(await cancelKnowledgeSourceForApi(context, caller, uuidParam((await params).source_id, "source_id"))) })),

  listWebhooks: (request: Request) => handleApiRequest(request, "listWebhooks", async ({ context, caller }) => ({ body: { data: (await listWebhookEndpoints(context, { businessId: caller.businessId, manager: webhookManager(caller) })).map(toApiEndpoint), next_cursor: null, has_more: false } })),
  createWebhook: (request: Request) => handleApiRequest(request, "createWebhook", async ({ context, caller, credential }) => {
    const body = await readApiBody(request, apiWebhookEndpointCreateSchema);
    requireEventScopes(credential, body.events);
    const created = await createWebhookEndpoint(context, { businessId: caller.businessId, manager: webhookManager(caller), url: body.url, events: body.events, description: body.description });
    return { body: data({ ...toApiEndpoint(created.endpoint), secret: created.secret }) };
  }),
  getWebhook: (request: Request, { params }: Params<"webhook_id">) => handleApiRequest(request, "getWebhook", async ({ context, caller }) => ({ body: data(toApiEndpoint(await getWebhookEndpoint(context, { businessId: caller.businessId, manager: webhookManager(caller), endpointId: uuidParam((await params).webhook_id, "webhook_id") }))) })),
  updateWebhook: (request: Request, { params }: Params<"webhook_id">) => handleApiRequest(request, "updateWebhook", async ({ context, caller, credential }) => {
    const endpointId = uuidParam((await params).webhook_id, "webhook_id");
    const body = await readApiBody(request, apiWebhookEndpointUpdateSchema);
    // A new url redirects the endpoint's existing events, so check those too.
    if (body.events !== undefined || body.url !== undefined) requireEventScopes(credential, body.events ?? (await getWebhookEndpoint(context, { businessId: caller.businessId, manager: webhookManager(caller), endpointId })).events);
    return { body: data(toApiEndpoint(await updateWebhookEndpoint(context, { businessId: caller.businessId, manager: webhookManager(caller), endpointId, url: body.url, events: body.events, description: body.description, status: body.status }))) };
  }),
  deleteWebhook: (request: Request, { params }: Params<"webhook_id">) => handleApiRequest(request, "deleteWebhook", async ({ context, caller }) => {
    const endpointId = uuidParam((await params).webhook_id, "webhook_id");
    await deleteWebhookEndpoint(context, { businessId: caller.businessId, manager: webhookManager(caller), endpointId });
    return { body: data({ id: endpointId, deleted: true }) };
  }),
  testWebhook: (request: Request, { params }: Params<"webhook_id">) => handleApiRequest(request, "testWebhook", async ({ context, caller }) => ({ body: data(await sendWebhookTestEvent(context, { businessId: caller.businessId, manager: webhookManager(caller), endpointId: uuidParam((await params).webhook_id, "webhook_id") })) })),
  ...partnerV1,
};
