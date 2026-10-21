import { z } from "zod";

import { BUSINESS_HEADER, CONTACT_PASSCODES_MAX_PER_REQUEST, PLATFORM_USER_INVITATIONS_PER_DAY, PUBLIC_API_AVAILABILITY_MAX_DAYS, PUBLIC_API_DEFAULT_PAGE_SIZE, PUBLIC_API_DEFAULT_RATE_LIMIT_PER_MINUTE, PUBLIC_API_MAX_PAGE_SIZE, PUBLIC_API_VERSION, WEBHOOK_TEST_EVENT_TYPE, apiKeyScopes, businessApiKeyScopes, webhookEventTypes, type ApiKeyScope, type BusinessApiKeyScope } from "./constants";
import {
  apiAccountCalendarSchema,
  apiAppointmentCreateSchema,
  apiAppointmentRescheduleSchema,
  apiAppointmentSchema,
  apiAvailabilitySlotSchema,
  apiBillingSchema,
  apiBillingUpdateSchema,
  apiBusinessCreateSchema,
  apiBusinessSchema,
  apiBusinessSummarySchema,
  apiUserCreateSchema,
  apiUserInvitationSchema,
  apiBusinessUpdateSchema,
  apiCallDetailSchema,
  apiCallSchema,
  apiCalendarConnectionSchema,
  apiCalendarConnectionUpdateSchema,
  apiCalendarConnectLinkSchema,
  apiCheckoutCreateSchema,
  apiClaimLinkCreateSchema,
  apiClaimLinkSchema,
  apiCheckoutSchema,
  apiContactCreateSchema,
  apiContactPasscodesGenerateSchema,
  apiContactPasscodesUpdateSchema,
  apiContactSchema,
  apiContactUpdateSchema,
  apiDeletedSchema,
  apiErrorSchema,
  apiGeneratedContactPasscodesSchema,
  apiKnowledgeEntryCreateSchema,
  apiKnowledgeEntrySchema,
  apiKnowledgeEntryUpdateSchema,
  apiKnowledgeSourceCreateSchema,
  apiKnowledgeSourceSchema,
  apiKnowledgeSourceUpdateSchema,
  apiKnowledgeUploadCompleteSchema,
  apiKnowledgeUploadCreateSchema,
  apiKnowledgeUploadSchema,
  apiManagedPlanCreateSchema,
  apiMeSchema,
  apiMessageSchema,
  apiNotificationPreferencesSchema,
  apiNotificationPreferencesUpdateSchema,
  apiOnboardingCompleteSchema,
  apiOnboardingSchema,
  apiOnboardingUpdateSchema,
  apiPhoneNumberClaimCreateSchema,
  apiPhoneNumberClaimSchema,
  apiPhoneNumberOfferSchema,
  apiPhoneNumberSchema,
  apiPhoneNumberSearchSchema,
  apiReceptionistSchema,
  apiReceptionistUpdateSchema,
  apiRuleCreateSchema,
  apiRuleReorderSchema,
  apiRuleSchema,
  apiRuleUpdateSchema,
  apiServiceCreateSchema,
  apiServiceSchema,
  apiServiceUpdateSchema,
  apiStaffSchema,
  apiTeamInvitationCreateSchema,
  apiTeamInvitationSchema,
  apiTeamMemberSchema,
  apiTeamMemberUpdateSchema,
  apiTeamSchema,
  apiWebhookEndpointCreateSchema,
  apiWebhookEndpointSchema,
  apiWebhookEndpointUpdateSchema,
  apiWebhookEndpointWithSecretSchema,
  apiWebhookEventSchemas,
  apiWebhookTestEventSchema,
  apiWebhookTestResultSchema,
  apiWidgetKeyCreateSchema,
  apiWidgetKeyCreatedSchema,
  apiWidgetKeySchema,
  apiWidgetKeyUpdateSchema,
} from "./schemas";

type Param = { name: string; in: "path" | "query" | "header"; required?: boolean; description: string; schema: Record<string, unknown> };

export type ApiOperation = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  description?: string;
  tag: string;
  /** null: any valid key may call it. */
  scope: ApiKeyScope | null;
  /**
   * Most operations act on one business: a per-business key's own, or the one
   * a platform key names in the LobbyStack-Business header. optional: a
   * platform key may leave the header out. none: the operation acts on no one
   * business, so only platform keys may call it.
   */
  business?: "optional" | "none";
  params?: Param[];
  list?: boolean;
  /** true: Idempotency-Key makes retries safe. required: the request must send one. */
  idempotent?: boolean | "required";
  request?: string;
  response: string;
  status: 200 | 201 | 202;
};

const idParam = (name: string, what: string): Param => ({ name, in: "path", required: true, description: `The ${what} id.`, schema: { type: "string", format: "uuid" } });
const pageParams: Param[] = [
  { name: "limit", in: "query", description: `Items per page, 1 to ${PUBLIC_API_MAX_PAGE_SIZE}. Defaults to ${PUBLIC_API_DEFAULT_PAGE_SIZE}.`, schema: { type: "integer", minimum: 1, maximum: PUBLIC_API_MAX_PAGE_SIZE } },
  { name: "cursor", in: "query", description: "The next_cursor value from the previous page.", schema: { type: "string" } },
];

/**
 * Every v1 endpoint. Route handlers look up their required scope here, so the
 * scope the docs list is the scope the server enforces.
 */
export const apiOperations = {
  getMe: { method: "GET", path: "/me", tag: "Business", summary: "Check an API key", description: "Returns the key and its business. Any valid key can call it, whatever its scopes, so integrations use it to test a connection. A platform key can call it without the LobbyStack-Business header.", scope: null, business: "optional", response: "Me", status: 200 },
  getBusiness: { method: "GET", path: "/business", tag: "Business", summary: "Get the business", scope: "business:read", response: "Business", status: 200 },
  updateBusiness: { method: "PATCH", path: "/business", tag: "Business", summary: "Update the business", description: "Updates basic fields and opening hours. Sending hours replaces the whole week.", scope: "business:write", request: "BusinessUpdate", response: "Business", status: 200 },
  createBusiness: { method: "POST", path: "/businesses", tag: "Platform", summary: "Create a business", description: "Platform keys only. Creates a business owned by the account in the key's owner_email, and lets every key of the same partner act on it. Idempotency-Key is required: a retry with the same value returns the business it created, however much later, and a different body with that value is a 422.", scope: "businesses:create", business: "none", idempotent: "required", request: "BusinessCreate", response: "Business", status: 201 },
  listBusinesses: { method: "GET", path: "/businesses", tag: "Platform", summary: "List onboarded businesses", description: "Platform keys only. Lists the active businesses the key's partner onboarded, newest first.", scope: "business:read", business: "none", list: true, params: [...pageParams], response: "BusinessSummary", status: 200 },
  createUser: { method: "POST", path: "/users", tag: "Platform", summary: "Invite an owner to make an account", description: `Platform keys only. Emails the address a link to sign up, so an owner with no LobbyStack account can make one and then accept your claim link. If the address already has an account, LobbyStack emails it a link to sign in instead and changes nothing. The answer is the same either way, so it never tells you whether someone has an account. No account exists until the person signs up, with a password or with Google. Idempotency-Key is required: a retry of the same request sends nothing more. One platform key can invite ${PLATFORM_USER_INVITATIONS_PER_DAY} addresses a day; past that it gets a 429.`, scope: "users:create", business: "none", idempotent: "required", request: "UserCreate", response: "UserInvitation", status: 202 },
  getReceptionist: { method: "GET", path: "/receptionist", tag: "Receptionist", summary: "Get the receptionist settings", description: "How the receptionist greets callers, what it says about the business, when it transfers calls and what it may book.", scope: "business:read", response: "Receptionist", status: 200 },
  updateReceptionist: { method: "PATCH", path: "/receptionist", tag: "Receptionist", summary: "Update the receptionist settings", description: "Changes the fields sent and leaves the rest. Calls and chats pick up the change once the business snapshot refreshes. The business default caller language is locale on PATCH /business.", scope: "business:write", request: "ReceptionistUpdate", response: "Receptionist", status: 200 },
  listRules: { method: "GET", path: "/rules", tag: "Receptionist", summary: "List rules", description: "Every rule, active or not, in the order the receptionist reads them, all in one page. Calls follow the first 50 active rules.", scope: "business:read", list: true, response: "Rule", status: 200 },
  createRule: { method: "POST", path: "/rules", tag: "Receptionist", summary: "Add a rule", description: "Adds an instruction the receptionist follows, after the existing rules. A business can have up to 100 rules; one more is a 409.", scope: "business:write", idempotent: true, request: "RuleCreate", response: "Rule", status: 201 },
  updateRule: { method: "PATCH", path: "/rules/{rule_id}", tag: "Receptionist", summary: "Update a rule", description: "Changes the fields sent. Values the rule already has change nothing.", scope: "business:write", params: [idParam("rule_id", "rule")], request: "RuleUpdate", response: "Rule", status: 200 },
  deleteRule: { method: "DELETE", path: "/rules/{rule_id}", tag: "Receptionist", summary: "Delete a rule", scope: "business:write", params: [idParam("rule_id", "rule")], response: "Deleted", status: 200 },
  reorderRules: { method: "POST", path: "/rules/reorder", tag: "Receptionist", summary: "Put the rules in order", description: "Send every rule id once, in the new order. Returns the rules in that order.", scope: "business:write", list: true, request: "RuleReorder", response: "Rule", status: 200 },
  getBilling: { method: "GET", path: "/billing", tag: "Billing", summary: "Get the plan and spending", scope: "billing:manage", response: "Billing", status: 200 },
  updateBilling: { method: "PATCH", path: "/billing", tag: "Billing", summary: "Set the spending cap", description: "Sets or removes the cap on a Starter or Pro plan's usage over its allowance each month. Another plan is a 409.", scope: "billing:manage", request: "BillingUpdate", response: "Billing", status: 200 },
  createCheckout: { method: "POST", path: "/billing/checkout", tag: "Billing", summary: "Start a checkout", description: "Asks Polar for a page where the customer pays for a plan. Poll GET /billing/checkout/{checkout_id} until status is ready, then send them checkout_url. As in the dashboard, only a business on the free plan can start one, and only while nobody else's checkout for it is open; a business that already pays changes plan in Polar's billing portal. Those, a managed plan and a plan this deployment doesn't sell are a 409. With a platform key the checkout is made out to the business's owner, so a business nobody has claimed yet is a 409.", scope: "billing:manage", idempotent: true, request: "CheckoutCreate", response: "Checkout", status: 202 },
  getCheckout: { method: "GET", path: "/billing/checkout/{checkout_id}", tag: "Billing", summary: "Check a checkout", scope: "billing:manage", params: [idParam("checkout_id", "checkout")], response: "Checkout", status: 200 },
  setManagedPlan: { method: "POST", path: "/billing/managed-plan", tag: "Billing", summary: "Put the business on a managed plan", description: "Operator platform keys only; any other key gets a 403 forbidden. Puts the business on the enterprise plan outside Polar, which unlocks what a paid plan unlocks while the operator bills the business directly, and removes a spending cap left from an earlier plan. A business with a live Polar subscription is a 409. If the business later starts a Starter or Pro subscription in Polar, Polar takes over.", scope: "billing:manage", request: "ManagedPlanCreate", response: "Billing", status: 200 },
  endManagedPlan: { method: "DELETE", path: "/billing/managed-plan", tag: "Billing", summary: "End the managed plan", description: "Operator platform keys only; any other key gets a 403 forbidden. Moves the business back to the free plan. A business without a managed plan is a 404.", scope: "billing:manage", response: "Billing", status: 200 },
  listPhoneNumbers: { method: "GET", path: "/phone-numbers", tag: "Phone numbers", summary: "List phone numbers", description: "Every number the business has or had, newest first, all in one page.", scope: "phone_numbers:manage", list: true, response: "PhoneNumber", status: 200 },
  searchPhoneNumbers: { method: "POST", path: "/phone-numbers/search", tag: "Phone numbers", summary: "Find numbers to claim", description: "Searches the carrier for numbers that take calls; a self-hosted business gets only numbers that also take texts. Each offer expires after 5 minutes. On the cloud, a business on a paid plan gets numbers it buys. One without a paid plan gets free trial offers (trial: true) when the account the key acts as verified a mobile number for it in the dashboard, in a country with trials, and no trial was used; otherwise it gets a 409. The account a key acts as can search 20 times in 10 minutes; searches refused before that don't count. Send replaces to find a replacement for an active number; a business can replace its number once.", scope: "phone_numbers:manage", list: true, request: "PhoneNumberSearch", response: "PhoneNumberOffer", status: 200 },
  createPhoneNumberClaim: { method: "POST", path: "/phone-numbers/claims", tag: "Phone numbers", summary: "Claim a number", description: "Buys the offered number for the business and connects it to the receptionist. It costs money, so Idempotency-Key is required. Returns the claim at once; poll GET /phone-numbers/claims/{claim_id} until its status is claimed or failed. A business that already has a number, including one still being released, or another claim in progress gets a 409. Claims are limited to 3 an hour, 2 a day and 5 in 30 days, past which they are a 429. Platform keys count each business's claims; other keys count the claims of the account they act as. A trial offer starts the business's 14-day free trial. As in the dashboard, each business, account and verified phone gets one trial. The dashboard also allows one trial per network in 30 days, and the API doesn't: an integration claims for all of its customers from the same addresses.", scope: "phone_numbers:manage", idempotent: "required", request: "PhoneNumberClaimCreate", response: "PhoneNumberClaim", status: 202 },
  getPhoneNumberClaim: { method: "GET", path: "/phone-numbers/claims/{claim_id}", tag: "Phone numbers", summary: "Check a claim", description: "A claim that waited 15 minutes for the carrier to start, or made no progress for 30, reads as failed.", scope: "phone_numbers:manage", params: [idParam("claim_id", "claim")], response: "PhoneNumberClaim", status: 200 },
  releasePhoneNumber: { method: "DELETE", path: "/phone-numbers/{phone_number_id}", tag: "Phone numbers", summary: "Release a number", description: "Gives the number back to the carrier, which can't be undone: calls and texts to it stop reaching the receptionist. Returns the number at once with release_scheduled_at set; its status then moves to releasing and released, after which the business can claim a new number. A replaced number still in its 30-day window is released at once. A number already being released is returned as it is, and one whose replacement is still being set up is a 409.", scope: "phone_numbers:manage", params: [idParam("phone_number_id", "phone number")], response: "PhoneNumber", status: 202 },
  replacePhoneNumber: { method: "POST", path: "/phone-numbers/{phone_number_id}/replace", tag: "Phone numbers", summary: "Replace a number", description: "Claims a replacement offer, from POST /phone-numbers/search with replaces, for this number. The old number keeps working until 30 days after the new one goes live, then is released. A business can replace its number once, so a second replacement is a 409. Idempotency-Key is required, and the limits of POST /phone-numbers/claims apply.", scope: "phone_numbers:manage", idempotent: "required", params: [idParam("phone_number_id", "phone number")], request: "PhoneNumberClaimCreate", response: "PhoneNumberClaim", status: 202 },
  getOnboarding: { method: "GET", path: "/onboarding", tag: "Onboarding", summary: "Get onboarding progress", description: "What the receptionist has and still needs, and which of it POST /onboarding/complete requires. Steps done in the dashboard count too, in any order.", scope: "business:read", response: "Onboarding", status: 200 },
  updateOnboarding: { method: "PATCH", path: "/onboarding", tag: "Onboarding", summary: "Skip setup steps", description: "Skips steps, or brings them back, as the dashboard's setup guide does. A skipped step no longer counts as missing.", scope: "business:write", request: "OnboardingUpdate", response: "Onboarding", status: 200 },
  completeOnboarding: { method: "POST", path: "/onboarding/complete", tag: "Onboarding", summary: "Finish onboarding", description: "Finishes onboarding, so the dashboard opens on the business instead of its onboarding steps. On a paid plan, until the business has a phone number, a skipped phone_number step or skip_number, it's a 409 whose details list what's missing. Finishing a business that is already complete changes nothing. referral_code isn't accepted from a platform key, or for a business a partner onboarded.", scope: "business:write", request: "OnboardingComplete", response: "Onboarding", status: 200 },
  getTeam: { method: "GET", path: "/team", tag: "Team", summary: "Get the team", description: "Everyone on the team and the invitations still open.", scope: "team:manage", response: "Team", status: 200 },
  createTeamInvitation: { method: "POST", path: "/team/invitations", tag: "Team", summary: "Invite someone", description: "Emails an invitation to join the team, which the invitee accepts with a verified LobbyStack account for that email within 7 days. It sends an email, so Idempotency-Key is required, and the account the key acts as can invite 20 people an hour, counted with its dashboard invitations.", scope: "team:manage", idempotent: "required", request: "TeamInvitationCreate", response: "TeamInvitation", status: 201 },
  revokeTeamInvitation: { method: "DELETE", path: "/team/invitations/{invitation_id}", tag: "Team", summary: "Revoke an invitation", description: "An invitation that was accepted or revoked already is a 404.", scope: "team:manage", params: [idParam("invitation_id", "invitation")], response: "Deleted", status: 200 },
  updateTeamMember: { method: "PATCH", path: "/team/members/{membership_id}", tag: "Team", summary: "Change someone's role", description: "A business keeps at least one owner, so demoting the last one is a 409.", scope: "team:manage", params: [idParam("membership_id", "membership")], request: "TeamMemberUpdate", response: "TeamMember", status: 200 },
  removeTeamMember: { method: "DELETE", path: "/team/members/{membership_id}", tag: "Team", summary: "Remove someone from the team", description: "Also revokes the invitations they sent or received. A business keeps at least one owner, so removing the last one is a 409.", scope: "team:manage", params: [idParam("membership_id", "membership")], response: "Deleted", status: 200 },
  // Not idempotent: a stored replay would keep the claim link, whose token hands the business over, in idempotency_keys.
  createClaimLink: { method: "POST", path: "/team/claim-link", tag: "Team", summary: "Hand the business over", description: "Emails the new owner a link that claims the business, and returns it so you can send it too. Whoever accepts it with a verified LobbyStack account for that email becomes an owner, and the account the key acts as, which must own the business, leaves the team. A new claim link revokes the one before, and the invitation limit of POST /team/invitations applies. This endpoint ignores Idempotency-Key, so LobbyStack never stores a copy of the link. After a network error, look in GET /team for a pending invitation with transfers_ownership before you retry: a retry sends a new link and revokes the first.", scope: "team:manage", request: "ClaimLinkCreate", response: "ClaimLink", status: 201 },
  listWidgetKeys: { method: "GET", path: "/widget-keys", tag: "Website chat", summary: "List widget keys", description: "Every key for the website chat widget, newest first, all in one page. The keys themselves aren't shown again after they're created.", scope: "business:read", list: true, response: "WidgetKey", status: 200 },
  createWidgetKey: { method: "POST", path: "/widget-keys", tag: "Website chat", summary: "Add the chat widget to a website", description: "Creates a key for the website chat widget and returns the script tag to paste into the site's HTML. The key is shown only in this response. A deployment that doesn't offer website chat yet answers 403.", scope: "business:write", idempotent: true, request: "WidgetKeyCreate", response: "WidgetKeyCreated", status: 201 },
  updateWidgetKey: { method: "PATCH", path: "/widget-keys/{widget_key_id}", tag: "Website chat", summary: "Update a widget key", description: "Changes the fields sent. Values the key already has change nothing.", scope: "business:write", params: [idParam("widget_key_id", "widget key")], request: "WidgetKeyUpdate", response: "WidgetKey", status: 200 },
  createCalendarConnectLink: { method: "POST", path: "/calendars/google/connect", tag: "Calendars", summary: "Get a link that connects Google Calendar", description: "Google asks the calendar's owner to agree in a browser, so the API can't connect a calendar by itself: send the link this returns to whoever owns the calendar. They sign in to LobbyStack as an owner or admin of the business, agree on Google's page, and land on the dashboard's integrations page, where they can pick the calendar to use; PATCH /calendars/{connection_id} can pick it too. For a business nobody has claimed yet, hand it over with POST /team/claim-link first, unless the account the key acts as connects its own calendar. The link works until expires_at. Connecting another Google account replaces the business's calendar, the connection without a staff member, so to add a staff member's calendar, first move the current one to its staff member with PATCH /calendars/{connection_id}. A deployment without Google Calendar answers 403.", scope: "business:write", response: "CalendarConnectLink", status: 201 },
  listCalendarConnections: { method: "GET", path: "/calendars", tag: "Calendars", summary: "List calendar connections", description: "Every connected calendar account, the business's and its staff's, oldest first, all in one page.", scope: "business:read", list: true, response: "CalendarConnection", status: 200 },
  listAccountCalendars: { method: "GET", path: "/calendars/{connection_id}/calendars", tag: "Calendars", summary: "List a connected account's calendars", description: "Asks Google for the account's calendars, all in one page. A connection Google no longer accepts is a 409: connect it again with POST /calendars/google/connect. A deployment without Google Calendar answers 403.", scope: "business:read", list: true, params: [idParam("connection_id", "calendar connection")], response: "AccountCalendar", status: 200 },
  updateCalendarConnection: { method: "PATCH", path: "/calendars/{connection_id}", tag: "Calendars", summary: "Pick a calendar or a staff member", description: "calendar_id picks the calendar to use, one that GET /calendars/{connection_id}/calendars lists as writable. staff_id makes the connection a staff member's calendar, or with null the business's. Values the connection already has change nothing. A new calendar_id is checked with Google: a connection Google no longer accepts is a 409, and a deployment without Google Calendar answers 403.", scope: "business:write", params: [idParam("connection_id", "calendar connection")], request: "CalendarConnectionUpdate", response: "CalendarConnection", status: 200 },
  deleteCalendarConnection: { method: "DELETE", path: "/calendars/{connection_id}", tag: "Calendars", summary: "Disconnect a calendar", description: "Forgets the account's Google authorization and its busy times. Appointments already added to the calendar stay there.", scope: "business:write", params: [idParam("connection_id", "calendar connection")], response: "Deleted", status: 200 },
  getNotificationPreferences: { method: "GET", path: "/notification-preferences", tag: "Notifications", summary: "Get alert settings", description: "The alerts the account the key acts as gets about this business, by email and by text. A platform key acts as its owner_email account, which has to be on the business's team, or it's a 409.", scope: "business:read", response: "NotificationPreferences", status: 200 },
  updateNotificationPreferences: { method: "PATCH", path: "/notification-preferences", tag: "Notifications", summary: "Change alert settings", description: "Changes the fields sent and keeps the rest as saved, including texts the person can't get right now. Texts need a verified mobile number and the person's consent to alert texts, which only the dashboard's notification settings collect: while sms.available is false, turning a text on is a 409, and while it's true, texts can be turned on here. Turning texts off always works. Values the settings already have change nothing.", scope: "business:write", request: "NotificationPreferencesUpdate", response: "NotificationPreferences", status: 200 },
  listServices: { method: "GET", path: "/services", tag: "Business", summary: "List services", description: "Lists the active services customers can book. Deleted services never appear.", scope: "business:read", list: true, params: [{ name: "include_inactive", in: "query", description: "true also lists services that are turned off.", schema: { type: "boolean" } }], response: "Service", status: 200 },
  createService: { method: "POST", path: "/services", tag: "Business", summary: "Add a service", description: "Adds a service customers can book and the receptionist can offer.", scope: "business:write", idempotent: true, request: "ServiceCreate", response: "Service", status: 201 },
  updateService: { method: "PATCH", path: "/services/{service_id}", tag: "Business", summary: "Update a service", description: "Changes the fields sent. Values the service already has change nothing.", scope: "business:write", params: [idParam("service_id", "service")], request: "ServiceUpdate", response: "Service", status: 200 },
  deleteService: { method: "DELETE", path: "/services/{service_id}", tag: "Business", summary: "Delete a service", description: "Removes it from the catalog, so it can no longer be booked. Appointments already booked for it stay booked but can't be rescheduled, and its slug can be used again.", scope: "business:write", params: [idParam("service_id", "service")], response: "Deleted", status: 200 },
  listStaff: { method: "GET", path: "/staff", tag: "Business", summary: "List staff", description: "Lists everyone who can take appointments, active or not. Pass an active staff id as staff_id to GET /availability, POST /appointments or reschedule.", scope: "business:read", list: true, response: "Staff", status: 200 },
  listCalls: { method: "GET", path: "/calls", tag: "Calls", summary: "List calls", description: "Newest first. Filter by start time to read one day or one week.", scope: "calls:read", list: true, params: [...pageParams, { name: "started_after", in: "query", description: "Only calls that started at or after this time.", schema: { type: "string", format: "date-time" } }, { name: "started_before", in: "query", description: "Only calls that started before this time.", schema: { type: "string", format: "date-time" } }], response: "Call", status: 200 },
  getCall: { method: "GET", path: "/calls/{call_id}", tag: "Calls", summary: "Get a call", description: "Includes the transcript.", scope: "calls:read", params: [idParam("call_id", "call")], response: "CallDetail", status: 200 },
  listContacts: { method: "GET", path: "/contacts", tag: "Contacts", summary: "List contacts", description: "Newest first.", scope: "contacts:read", list: true, params: [...pageParams, { name: "phone", in: "query", description: "Only the contact with this E.164 phone number.", schema: { type: "string" } }, { name: "email", in: "query", description: "Only contacts with this email address.", schema: { type: "string" } }, { name: "name", in: "query", description: "Only contacts whose name contains this text. Case does not matter.", schema: { type: "string", maxLength: 200 } }], response: "Contact", status: 200 },
  createContact: { method: "POST", path: "/contacts", tag: "Contacts", summary: "Create a contact", description: "Returns 409 conflict when a contact with the same phone number exists.", scope: "contacts:write", idempotent: true, request: "ContactCreate", response: "Contact", status: 201 },
  getContact: { method: "GET", path: "/contacts/{contact_id}", tag: "Contacts", summary: "Get a contact", scope: "contacts:read", params: [idParam("contact_id", "contact")], response: "Contact", status: 200 },
  updateContact: { method: "PATCH", path: "/contacts/{contact_id}", tag: "Contacts", summary: "Update a contact", scope: "contacts:write", params: [idParam("contact_id", "contact")], request: "ContactUpdate", response: "Contact", status: 200 },
  // Neither PIN operation is idempotent: the stored record would keep a hash of the body and a copy of the response, from which a short PIN is easy to recover.
  setContactPasscodes: { method: "POST", path: "/contacts/passcodes", tag: "Contacts", summary: "Set or remove keypad PINs", description: `Sets the keypad PIN each contact types to change appointments by phone when verification_mode is passcode_required, or removes it with null. A new PIN also unlocks a locked one. Send up to ${CONTACT_PASSCODES_MAX_PER_REQUEST} contacts, each once: if any isn't this business's, nothing changes. Returns the contacts in the order sent. LobbyStack keeps only a hash of each PIN, and this endpoint ignores Idempotency-Key so it never stores a copy. As in the dashboard, only owners and admins set PINs: a per-business key whose creator no longer is one gets a 403 key_owner_inactive.`, scope: "contacts:write", list: true, request: "ContactPasscodesUpdate", response: "Contact", status: 200 },
  generateContactPasscodes: { method: "POST", path: "/contacts/passcodes/generate", tag: "Contacts", summary: "Generate keypad PINs", description: `Gives contacts a random keypad PIN and returns each one in new_passcode. LobbyStack keeps only a hash, so this response is the only time the PINs appear: give each contact theirs. With contact_ids, those contacts get a new PIN, replacing any they have. Without it, contacts that have a phone number and no PIN get one, oldest first, ${CONTACT_PASSCODES_MAX_PER_REQUEST} per request: send it again until remaining is 0. This endpoint ignores Idempotency-Key, so no copy of a PIN is stored. After a network error, look for contacts whose passcode set_at is from that request, and give them new PINs with contact_ids. As in the dashboard, only owners and admins set PINs: a per-business key whose creator no longer is one gets a 403 key_owner_inactive.`, scope: "contacts:write", request: "ContactPasscodesGenerate", response: "GeneratedContactPasscodes", status: 200 },
  listAppointments: { method: "GET", path: "/appointments", tag: "Appointments", summary: "List appointments", description: "Newest booking first.", scope: "appointments:read", list: true, params: [...pageParams, { name: "status", in: "query", description: "confirmed or cancelled.", schema: { type: "string", enum: ["confirmed", "cancelled"] } }, { name: "starts_after", in: "query", description: "Only appointments starting at or after this time.", schema: { type: "string", format: "date-time" } }, { name: "starts_before", in: "query", description: "Only appointments starting before this time.", schema: { type: "string", format: "date-time" } }, { name: "contact_id", in: "query", description: "Only this contact's appointments.", schema: { type: "string", format: "uuid" } }], response: "Appointment", status: 200 },
  getAvailability: { method: "GET", path: "/availability", tag: "Appointments", summary: "List open appointment times", description: `Open start times for one service, in 30-minute steps within opening hours. The range can span up to ${PUBLIC_API_AVAILABILITY_MAX_DAYS} days.`, scope: "appointments:read", list: true, params: [{ name: "service_id", in: "query", required: true, description: "The service to book.", schema: { type: "string", format: "uuid" } }, { name: "start_date", in: "query", required: true, description: "First day, YYYY-MM-DD, in the business time zone.", schema: { type: "string", format: "date" } }, { name: "end_date", in: "query", description: "Last day, YYYY-MM-DD. Defaults to start_date.", schema: { type: "string", format: "date" } }, { name: "staff_id", in: "query", description: "Only times this active staff member is free.", schema: { type: "string", format: "uuid" } }], response: "AvailabilitySlot", status: 200 },
  createAppointment: { method: "POST", path: "/appointments", tag: "Appointments", summary: "Book an appointment", description: "Books only when the business's booking_mode is instant. Returns 409 booking_requires_confirmation in request mode and 409 booking_disabled when booking is off.", scope: "appointments:write", idempotent: true, request: "AppointmentCreate", response: "Appointment", status: 201 },
  getAppointment: { method: "GET", path: "/appointments/{appointment_id}", tag: "Appointments", summary: "Get an appointment", scope: "appointments:read", params: [idParam("appointment_id", "appointment")], response: "Appointment", status: 200 },
  cancelAppointment: { method: "POST", path: "/appointments/{appointment_id}/cancel", tag: "Appointments", summary: "Cancel an appointment", description: "Cancelling an appointment that is already cancelled returns it unchanged.", scope: "appointments:write", params: [idParam("appointment_id", "appointment")], response: "Appointment", status: 200 },
  rescheduleAppointment: { method: "POST", path: "/appointments/{appointment_id}/reschedule", tag: "Appointments", summary: "Reschedule an appointment", description: "Moves the appointment to a new open time, with the same staff member unless you pass staff_id. Requires booking_mode instant.", scope: "appointments:write", params: [idParam("appointment_id", "appointment")], request: "AppointmentReschedule", response: "Appointment", status: 200 },
  listMessages: { method: "GET", path: "/messages", tag: "Messages", summary: "List messages", description: "Messages the receptionist took for the team, newest first.", scope: "messages:read", list: true, params: [...pageParams, { name: "status", in: "query", description: "open or done.", schema: { type: "string", enum: ["open", "done"] } }], response: "Message", status: 200 },
  listKnowledgeEntries: { method: "GET", path: "/knowledge", tag: "Knowledge", summary: "List knowledge entries", description: "Text entries and FAQs, newest first. Websites, their pages and files are listed by GET /knowledge/sources.", scope: "knowledge:read", list: true, params: [...pageParams, { name: "type", in: "query", description: "text or faq.", schema: { type: "string", enum: ["text", "faq"] } }], response: "KnowledgeEntry", status: 200 },
  createKnowledgeEntry: { method: "POST", path: "/knowledge", tag: "Knowledge", summary: "Add a knowledge entry", description: "Adds a text entry or an FAQ that the receptionist can use to answer callers.", scope: "knowledge:write", idempotent: true, request: "KnowledgeEntryCreate", response: "KnowledgeEntry", status: 201 },
  getKnowledgeEntry: { method: "GET", path: "/knowledge/{entry_id}", tag: "Knowledge", summary: "Get a knowledge entry", scope: "knowledge:read", params: [idParam("entry_id", "knowledge entry")], response: "KnowledgeEntry", status: 200 },
  updateKnowledgeEntry: { method: "PATCH", path: "/knowledge/{entry_id}", tag: "Knowledge", summary: "Update a knowledge entry", description: "Changes an entry's text, labels or priority, or turns it off or back on. An FAQ stays an FAQ: its title is the question and its content the answer.", scope: "knowledge:write", params: [idParam("entry_id", "knowledge entry")], request: "KnowledgeEntryUpdate", response: "KnowledgeEntry", status: 200 },
  deleteKnowledgeEntry: { method: "DELETE", path: "/knowledge/{entry_id}", tag: "Knowledge", summary: "Delete a knowledge entry", scope: "knowledge:write", params: [idParam("entry_id", "knowledge entry")], response: "Deleted", status: 200 },
  listKnowledgeSources: { method: "GET", path: "/knowledge/sources", tag: "Knowledge", summary: "List knowledge sources", description: "Websites, the pages their crawls read, and uploaded files, newest first.", scope: "knowledge:read", list: true, params: [...pageParams, { name: "type", in: "query", description: "website, page or file.", schema: { type: "string", enum: ["website", "page", "file"] } }, { name: "status", in: "query", description: "pending, processing, indexed, error or cancelled.", schema: { type: "string", enum: ["pending", "processing", "indexed", "error", "cancelled"] } }], response: "KnowledgeSource", status: 200 },
  createKnowledgeSource: { method: "POST", path: "/knowledge/sources", tag: "Knowledge", summary: "Add a website", description: "Starts reading a website the receptionist can answer from. The first crawl reads a sample of the site; POST /knowledge/sources/{source_id}/expand reads the rest. A business still on its website step also takes the address as its website. Sending a site that is already a source returns that source, read again at its own page limit if its last crawl failed or was cancelled. Sending a page an earlier crawl read is a 409.", scope: "knowledge:write", request: "KnowledgeSourceCreate", response: "KnowledgeSource", status: 202 },
  getKnowledgeSource: { method: "GET", path: "/knowledge/sources/{source_id}", tag: "Knowledge", summary: "Get a knowledge source", scope: "knowledge:read", params: [idParam("source_id", "knowledge source")], response: "KnowledgeSource", status: 200 },
  updateKnowledgeSource: { method: "PATCH", path: "/knowledge/sources/{source_id}", tag: "Knowledge", summary: "Turn a knowledge source off or on", description: "Turning a website off leaves the pages its crawl read as they are: each page is its own source.", scope: "knowledge:write", params: [idParam("source_id", "knowledge source")], request: "KnowledgeSourceUpdate", response: "KnowledgeSource", status: 200 },
  deleteKnowledgeSource: { method: "DELETE", path: "/knowledge/sources/{source_id}", tag: "Knowledge", summary: "Delete a knowledge source", description: "Removes a website, page or file from the receptionist's knowledge, with the text read from it. Deleting a website stops its crawl, and the pages it already read stay until you delete them.", scope: "knowledge:write", params: [idParam("source_id", "knowledge source")], response: "Deleted", status: 200 },
  expandKnowledgeSource: { method: "POST", path: "/knowledge/sources/{source_id}/expand", tag: "Knowledge", summary: "Read the rest of a website", description: "Crawls the whole site, up to the full page limit, and replaces the sample the first crawl read. A page or a file is a 400.", scope: "knowledge:write", params: [idParam("source_id", "knowledge source")], response: "KnowledgeSource", status: 202 },
  retryKnowledgeSource: { method: "POST", path: "/knowledge/sources/{source_id}/retry", tag: "Knowledge", summary: "Read a source again", description: "Crawls a website or reads a file again, at the page limit it last used, for example after it failed or the site changed. A source that is still being read is a 409, and a page is a 400: retry its website.", scope: "knowledge:write", params: [idParam("source_id", "knowledge source")], response: "KnowledgeSource", status: 202 },
  createKnowledgeUpload: { method: "POST", path: "/knowledge/uploads", tag: "Knowledge", summary: "Start a file upload", description: "Reserves an upload for a document up to 10 MB and returns where to send it. Send the file's bytes with PUT to upload_url, with exactly upload_headers, within about 15 minutes. Then call POST /knowledge/uploads/{upload_id}/complete. An unfinished upload expires after a day.", scope: "knowledge:write", request: "KnowledgeUploadCreate", response: "KnowledgeUpload", status: 201 },
  completeKnowledgeUpload: { method: "POST", path: "/knowledge/uploads/{upload_id}/complete", tag: "Knowledge", summary: "Finish a file upload", description: "Checks the uploaded file against the upload request and queues it to be read. Returns the new file source. Completing an upload again returns the same source. A file that hasn't arrived yet is a 409 conflict: send it to upload_url, or start a new upload if upload_url has expired. A file that doesn't match the request is a 400. A business whose plan has no room for more knowledge text gets a 409 plan_limit_reached. Send {} to keep the file name as its title.", scope: "knowledge:write", params: [idParam("upload_id", "upload")], request: "KnowledgeUploadComplete", response: "KnowledgeSource", status: 202 },
  cancelKnowledgeSource: { method: "POST", path: "/knowledge/sources/{source_id}/cancel", tag: "Knowledge", summary: "Stop reading a source", description: "Stops a crawl or read that is still processing. A page is a 400: cancel its website. Anything else is a 409.", scope: "knowledge:write", params: [idParam("source_id", "knowledge source")], response: "KnowledgeSource", status: 200 },
  listWebhooks: { method: "GET", path: "/webhooks", tag: "Webhooks", summary: "List webhook endpoints", scope: "webhooks:manage", list: true, response: "WebhookEndpoint", status: 200 },
  // Not idempotent: a stored replay would keep the plain signing secret in idempotency_keys.
  createWebhook: { method: "POST", path: "/webhooks", tag: "Webhooks", summary: "Create a webhook endpoint", description: "Subscribes a URL to events. The key also needs the read scope for each event, such as calls:read for call.completed. The response includes the signing secret once. This endpoint ignores Idempotency-Key, so after a network error, check GET /webhooks before you retry. An endpoint a platform key creates turns off when the business is handed over, or once the admin restarts without that key.", scope: "webhooks:manage", request: "WebhookEndpointCreate", response: "WebhookEndpointWithSecret", status: 201 },
  getWebhook: { method: "GET", path: "/webhooks/{webhook_id}", tag: "Webhooks", summary: "Get a webhook endpoint", scope: "webhooks:manage", params: [idParam("webhook_id", "webhook endpoint")], response: "WebhookEndpoint", status: 200 },
  updateWebhook: { method: "PATCH", path: "/webhooks/{webhook_id}", tag: "Webhooks", summary: "Update a webhook endpoint", description: "Setting status to enabled re-enables an endpoint that was disabled after repeated failures. Changing url or events needs the read scope for each of the endpoint's events.", scope: "webhooks:manage", params: [idParam("webhook_id", "webhook endpoint")], request: "WebhookEndpointUpdate", response: "WebhookEndpoint", status: 200 },
  deleteWebhook: { method: "DELETE", path: "/webhooks/{webhook_id}", tag: "Webhooks", summary: "Delete a webhook endpoint", scope: "webhooks:manage", params: [idParam("webhook_id", "webhook endpoint")], response: "Deleted", status: 200 },
  testWebhook: { method: "POST", path: "/webhooks/{webhook_id}/test", tag: "Webhooks", summary: "Send a test event", description: `Queues a ${WEBHOOK_TEST_EVENT_TYPE} event to this endpoint only.`, scope: "webhooks:manage", params: [idParam("webhook_id", "webhook endpoint")], response: "WebhookTestResult", status: 202 },
} as const satisfies Record<string, ApiOperation>;

export type ApiOperationId = keyof typeof apiOperations;

/** Scopes at least one v1 operation requires. */
export const apiScopesInUse: readonly ApiKeyScope[] = apiKeyScopes.filter((scope) => (Object.values(apiOperations) as ApiOperation[]).some((operation) => operation.scope === scope));

/**
 * The scopes Settings > API keys offers: per-business scopes that at least
 * one endpoint uses, so a new scope shows up there with its first endpoint.
 */
export const offeredApiKeyScopes: readonly BusinessApiKeyScope[] = businessApiKeyScopes.filter((scope) => apiScopesInUse.includes(scope));

/**
 * The schema behind each component name the operations use, each with its own
 * type, so a typed client such as packages/cli sends and reads what the server checks.
 */
export const apiComponentSchemas = {
  Error: apiErrorSchema,
  Me: apiMeSchema,
  Business: apiBusinessSchema,
  BusinessUpdate: apiBusinessUpdateSchema,
  BusinessCreate: apiBusinessCreateSchema,
  BusinessSummary: apiBusinessSummarySchema,
  UserInvitation: apiUserInvitationSchema,
  UserCreate: apiUserCreateSchema,
  Service: apiServiceSchema,
  ServiceCreate: apiServiceCreateSchema,
  ServiceUpdate: apiServiceUpdateSchema,
  Staff: apiStaffSchema,
  Call: apiCallSchema,
  CallDetail: apiCallDetailSchema,
  Contact: apiContactSchema,
  ContactCreate: apiContactCreateSchema,
  ContactUpdate: apiContactUpdateSchema,
  ContactPasscodesUpdate: apiContactPasscodesUpdateSchema,
  ContactPasscodesGenerate: apiContactPasscodesGenerateSchema,
  GeneratedContactPasscodes: apiGeneratedContactPasscodesSchema,
  Appointment: apiAppointmentSchema,
  AppointmentCreate: apiAppointmentCreateSchema,
  AppointmentReschedule: apiAppointmentRescheduleSchema,
  AvailabilitySlot: apiAvailabilitySlotSchema,
  Message: apiMessageSchema,
  Billing: apiBillingSchema,
  BillingUpdate: apiBillingUpdateSchema,
  Checkout: apiCheckoutSchema,
  CheckoutCreate: apiCheckoutCreateSchema,
  ManagedPlanCreate: apiManagedPlanCreateSchema,
  WidgetKey: apiWidgetKeySchema,
  WidgetKeyCreated: apiWidgetKeyCreatedSchema,
  WidgetKeyCreate: apiWidgetKeyCreateSchema,
  WidgetKeyUpdate: apiWidgetKeyUpdateSchema,
  NotificationPreferences: apiNotificationPreferencesSchema,
  NotificationPreferencesUpdate: apiNotificationPreferencesUpdateSchema,
  CalendarConnection: apiCalendarConnectionSchema,
  CalendarConnectionUpdate: apiCalendarConnectionUpdateSchema,
  AccountCalendar: apiAccountCalendarSchema,
  CalendarConnectLink: apiCalendarConnectLinkSchema,
  Team: apiTeamSchema,
  TeamMember: apiTeamMemberSchema,
  TeamInvitation: apiTeamInvitationSchema,
  TeamInvitationCreate: apiTeamInvitationCreateSchema,
  TeamMemberUpdate: apiTeamMemberUpdateSchema,
  ClaimLink: apiClaimLinkSchema,
  ClaimLinkCreate: apiClaimLinkCreateSchema,
  Onboarding: apiOnboardingSchema,
  OnboardingUpdate: apiOnboardingUpdateSchema,
  OnboardingComplete: apiOnboardingCompleteSchema,
  PhoneNumber: apiPhoneNumberSchema,
  PhoneNumberSearch: apiPhoneNumberSearchSchema,
  PhoneNumberOffer: apiPhoneNumberOfferSchema,
  PhoneNumberClaim: apiPhoneNumberClaimSchema,
  PhoneNumberClaimCreate: apiPhoneNumberClaimCreateSchema,
  Receptionist: apiReceptionistSchema,
  ReceptionistUpdate: apiReceptionistUpdateSchema,
  Rule: apiRuleSchema,
  RuleCreate: apiRuleCreateSchema,
  RuleUpdate: apiRuleUpdateSchema,
  RuleReorder: apiRuleReorderSchema,
  KnowledgeEntry: apiKnowledgeEntrySchema,
  KnowledgeEntryCreate: apiKnowledgeEntryCreateSchema,
  KnowledgeEntryUpdate: apiKnowledgeEntryUpdateSchema,
  KnowledgeSource: apiKnowledgeSourceSchema,
  KnowledgeSourceCreate: apiKnowledgeSourceCreateSchema,
  KnowledgeSourceUpdate: apiKnowledgeSourceUpdateSchema,
  KnowledgeUpload: apiKnowledgeUploadSchema,
  KnowledgeUploadCreate: apiKnowledgeUploadCreateSchema,
  KnowledgeUploadComplete: apiKnowledgeUploadCompleteSchema,
  WebhookEndpoint: apiWebhookEndpointSchema,
  WebhookEndpointWithSecret: apiWebhookEndpointWithSecretSchema,
  WebhookEndpointCreate: apiWebhookEndpointCreateSchema,
  WebhookEndpointUpdate: apiWebhookEndpointUpdateSchema,
  WebhookTestResult: apiWebhookTestResultSchema,
  Deleted: apiDeletedSchema,
  WebhookTestEvent: apiWebhookTestEventSchema,
} as const;

const componentSchemas: Record<string, z.ZodType> = {
  ...apiComponentSchemas,
  ...Object.fromEntries(Object.entries(apiWebhookEventSchemas).map(([type, schema]) => [eventComponentName(type), schema])),
};

type ApiComponentName = keyof typeof apiComponentSchemas;
type ApiOperationSpec<Id extends ApiOperationId> = (typeof apiOperations)[Id];

/** The JSON body an operation takes, as a client sends it. */
export type ApiRequestBody<Id extends ApiOperationId> = ApiOperationSpec<Id> extends { request: infer Name extends ApiComponentName } ? z.input<(typeof apiComponentSchemas)[Name]> : never;

/** What an operation answers: { data } with the resource, or with a page of them. */
export type ApiResponseBody<Id extends ApiOperationId> = ApiOperationSpec<Id> extends { response: infer Name extends ApiComponentName }
  ? ApiOperationSpec<Id> extends { list: true }
    ? { data: Array<z.output<(typeof apiComponentSchemas)[Name]>>; next_cursor: string | null; has_more: boolean }
    : { data: z.output<(typeof apiComponentSchemas)[Name]> }
  : never;

function eventComponentName(type: string): string {
  return `${type.split(/[._]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("")}Event`;
}

function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

/** JSON Schema (draft 2020-12) for a v1 contract schema, as the OpenAPI document and the MCP tools publish it. */
export function apiJsonSchemaFor(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, { target: "draft-2020-12", io, unrepresentable: "any" }) as Record<string, unknown>;
  delete generated.$schema;
  return stripFormatPatterns(generated) as Record<string, unknown>;
}

// Formats already say uuid or date-time; the generated regexes only add noise.
function stripFormatPatterns(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripFormatPatterns);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => !(key === "pattern" && typeof (value as Record<string, unknown>).format === "string"));
  return Object.fromEntries(entries.map(([key, entry]) => [key, stripFormatPatterns(entry)]));
}

const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: ref("Error") } } });

/** The OpenAPI 3.1 document for /api/v1, generated from the zod schemas above. */
export function buildOpenApiDocument(input: { serverUrl: string }): Record<string, unknown> {
  const inputs = new Set<string>((Object.values(apiOperations) as ApiOperation[]).flatMap((operation) => ("request" in operation ? [operation.request] : [])));
  const schemas = Object.fromEntries(Object.entries(componentSchemas).map(([name, schema]) => [name, apiJsonSchemaFor(schema, inputs.has(name) ? "input" : "output")]));
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [operationId, operation] of Object.entries(apiOperations) as Array<[string, ApiOperation]>) {
    const data = operation.list ? { type: "array", items: ref(operation.response) } : ref(operation.response);
    const body = operation.list
      ? { type: "object", required: ["data", "next_cursor", "has_more"], properties: { data, next_cursor: { type: ["string", "null"], description: "Pass as cursor to get the next page. Null on the last page." }, has_more: { type: "boolean" } } }
      : { type: "object", required: ["data"], properties: { data } };
    const platformOnly = operation.business === "none";
    const businessParam: Param = {
      name: BUSINESS_HEADER,
      in: "header",
      description: operation.business === "optional"
        ? "The business a platform key acts on. Optional here: without it, business is null. A per-business key never needs it."
        : "The business a platform key acts on. Required with a platform key. A per-business key may leave it out; if it sends one, it must be the key's own business.",
      schema: { type: "string", format: "uuid" },
    };
    const idempotencyParam: Param = operation.idempotent === "required"
      ? { name: "Idempotency-Key", in: "header", required: true, description: "Required. A unique value, up to 255 characters, that makes retries of this request safe.", schema: { type: "string", maxLength: 255 } }
      : { name: "Idempotency-Key", in: "header", description: "A unique value, up to 255 characters, that makes retries of this request safe for 24 hours.", schema: { type: "string", maxLength: 255 } };
    const params = [...(operation.params ?? []), ...(platformOnly ? [] : [businessParam]), ...(operation.idempotent ? [idempotencyParam] : [])];
    paths[operation.path] ??= {};
    paths[operation.path]![operation.method.toLowerCase()] = {
      operationId,
      summary: operation.summary,
      ...(operation.description ? { description: operation.description } : {}),
      tags: [operation.tag],
      security: [{ bearerAuth: [] }],
      ...(operation.scope ? { "x-required-scope": operation.scope } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(operation.request ? { requestBody: { required: true, content: { "application/json": { schema: ref(operation.request) } } } } : {}),
      responses: {
        [String(operation.status)]: { description: operation.status === 201 ? "Created" : operation.status === 202 ? "Accepted" : "OK", content: { "application/json": { schema: body } } },
        400: errorResponse(operation.idempotent === "required"
          ? "The request is invalid (invalid_request), including a missing Idempotency-Key."
          : operation.business ? "The request is invalid (invalid_request)." : "The request is invalid (invalid_request), or a platform key sent no LobbyStack-Business header (business_required)."),
        401: errorResponse("The API key is missing, invalid, or revoked (unauthorized)."),
        403: errorResponse(["Refused.", ...(operation.scope ? [`insufficient_scope: the key lacks the ${operation.scope} scope.`] : []), platformOnly ? "forbidden: only platform keys can call this endpoint." : `forbidden: a per-business key named another business in ${BUSINESS_HEADER}.`, "key_owner_inactive: the person the key acts for can't any more: a per-business key's creator is no longer an owner or admin, or a platform key's owner_email has no verified LobbyStack account."].join(" ")),
        ...(platformOnly && !operation.path.includes("{") ? {} : { 404: errorResponse(operation.path.includes("{") ? "Not found (not_found), including a business a platform key cannot act on." : "A platform key named a business it cannot act on (not_found).") }),
        ...(operation.method !== "GET" ? { 409: errorResponse("The request conflicts with the current state.") } : {}),
        ...(operation.idempotent ? { 422: errorResponse("The Idempotency-Key was already used with a different request body (idempotency_key_reused).") } : {}),
        429: { ...errorResponse("Too many requests (rate_limited). Wait for the Retry-After header's number of seconds."), headers: { "Retry-After": { schema: { type: "integer" }, description: "Seconds to wait." } } },
      },
    };
  }
  const webhooks = Object.fromEntries([...webhookEventTypes.map((type) => [type, eventComponentName(type)] as const), [WEBHOOK_TEST_EVENT_TYPE, "WebhookTestEvent"] as const].map(([type, component]) => [type, {
    post: {
      summary: type,
      description: "Signed with the Standard Webhooks scheme: verify webhook-signature against webhook-id, webhook-timestamp and the raw body.",
      parameters: [
        { name: "webhook-id", in: "header", required: true, description: "Event id. The same for every retry of this event.", schema: { type: "string" } },
        { name: "webhook-timestamp", in: "header", required: true, description: "Unix time in seconds when this attempt was signed.", schema: { type: "string" } },
        { name: "webhook-signature", in: "header", required: true, description: "Space-separated signatures, each v1,<base64 HMAC-SHA256>.", schema: { type: "string" } },
      ],
      requestBody: { required: true, content: { "application/json": { schema: ref(component) } } },
      responses: { 200: { description: "Return any 2xx status within 10 seconds to acknowledge the event." } },
    },
  }]));
  return {
    openapi: "3.1.0",
    info: {
      title: "LobbyStack API",
      version: PUBLIC_API_VERSION,
      description: `Read calls, contacts, appointments and messages, book appointments, and subscribe to webhooks. Authenticate with an API key in the Authorization header. A platform key also names the business it acts on in the ${BUSINESS_HEADER} header. Each key allows ${PUBLIC_API_DEFAULT_RATE_LIMIT_PER_MINUTE} requests per minute by default.`,
    },
    servers: [{ url: input.serverUrl }],
    security: [{ bearerAuth: [] }],
    tags: ["Business", "Receptionist", "Billing", "Phone numbers", "Onboarding", "Team", "Website chat", "Calendars", "Notifications", "Calls", "Contacts", "Appointments", "Messages", "Knowledge", "Webhooks", "Platform"].map((name) => ({ name })),
    paths,
    webhooks,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: `An API key from Settings > API keys (lsk_...), which acts on its own business, or a platform key from the PLATFORM_API_KEYS setting (lsp_...), which onboards and manages businesses. Scopes: ${apiKeyScopes.join(", ")}. Only platform keys can hold businesses:create and users:create.` } },
      schemas,
    },
  };
}
