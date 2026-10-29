import { z } from "zod";

import { billingPlanSlugs } from "../billing";
import { interfaceLocales, runtimeLocales } from "../locales";
import { partnerAccessLevels } from "../partners";
import { appointmentChangeVerificationModes, bookingModes, CONTACT_PASSCODE_DEFAULT_LENGTH, CONTACT_PASSCODE_LOCK_ATTEMPTS, CONTACT_PASSCODE_MAX_LENGTH, CONTACT_PASSCODE_MIN_LENGTH, isContactPasscode, isGuessableContactPasscode, RECEPTIONIST_INSTRUCTIONS_MAX_LENGTH, RECEPTIONIST_TEXT_MAX_LENGTH, RULE_CONTENT_CALL_MAX_LENGTH, RULE_TITLE_MAX_LENGTH, RULES_MAX, receptionistVoices, transferModes } from "../receptionist";
import { WIDGET_COLOR_PATTERN, widgetPositionSchema } from "../widget";
import { CONTACT_PASSCODES_MAX_PER_REQUEST, KNOWLEDGE_UPLOAD_MAX_BYTES, PUBLIC_API_VERSION, WEBHOOK_TEST_EVENT_TYPE, apiKeyScopes, webhookEventTypes, weekdays } from "./constants";

// The v1 public contract. Responses built by packages/domain are typed from
// these schemas, and the OpenAPI document is generated from them, so the docs,
// the REST API and webhook payloads cannot drift apart.

const id = z.uuid().describe("Stable identifier (UUID).");
const timestamp = z.iso.datetime().describe("ISO 8601 timestamp in UTC.");
const nullableTimestamp = timestamp.nullable();
// Zod 4 requires seconds once a timestamp has Z or an offset. The v1 API has always
// accepted minute precision too, such as 2026-10-09T14:00-04:00.
const withSeconds = z.iso.datetime({ offset: true });
const withoutSeconds = z.iso.datetime({ offset: true, precision: -1 });
const inputTimestamp = z.stringFormat("datetime", (value) => withSeconds.safeParse(value).success || withoutSeconds.safeParse(value).success).describe("ISO 8601 timestamp with a Z or numeric offset.");
const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "Use E.164 format, for example +14165550134.").describe("Phone number in E.164 format.");
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Use 24-hour HH:MM.").describe("Local time as 24-hour HH:MM.");
// A business's caller language is the language the AI receptionist speaks.
const locale = z.enum(runtimeLocales);
// A contact's language picks the copy of the reminders and confirmations they receive.
const contactLocale = z.enum(interfaceLocales).describe("Language for the contact's reminders and confirmations: en, fr, es or sr.");

export const apiErrorCodes = [
  "invalid_request",
  "unauthorized",
  "forbidden",
  "insufficient_scope",
  "not_found",
  "conflict",
  "idempotency_key_reused",
  "idempotency_request_in_progress",
  "booking_disabled",
  "booking_requires_confirmation",
  "slot_unavailable",
  "rate_limited",
  "rate_limit_unavailable",
  "method_not_allowed",
  "internal_error",
  "business_required",
  "key_owner_inactive",
  "plan_limit_reached",
  "phone_numbers_unavailable",
] as const;
export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(apiErrorCodes),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export const apiHoursWindowSchema = z.object({
  day: z.enum(weekdays),
  open: clock,
  close: clock,
}).describe("One opening window on one day. A day with a break, such as lunch, has two windows. Days that are not listed are closed.");

export const apiMeSchema = z.object({
  api_key: z.object({
    id,
    name: z.string(),
    prefix: z.string().describe("The visible start of the key, for example lsk_1a2b3c4d, or lsp_1a2b3c4d for a platform key."),
    scopes: z.array(z.enum(apiKeyScopes)),
    created_at: timestamp,
  }),
  business: z.object({ id, name: z.string() }).nullable().describe("The business the key acts on. Always set for a per-business key. For a platform key, the business in the LobbyStack-Business header, or null when the request has none."),
  platform: z.object({
    group: z.string().describe("The group the platform key belongs to, as set in PLATFORM_API_KEYS. Keys in the same group reach the same businesses."),
    partner: z.string().meta({ deprecated: true, description: "Deprecated: the old name for group, with the same value. Read group instead." }),
    reach: z.enum(["group", "all"]).describe("all: the key can act on every business. group: only on the businesses its group's keys onboarded."),
    // v1 only changes additively, so access keeps the value it shipped with for group access.
    access: z.enum(["partner", "all"]).meta({ deprecated: true, description: "Deprecated: the old name for reach, with partner in place of group. Read reach instead." }),
    partner_id: id.nullable().describe("For a key a partner made in its console, the partner, which is also the key's group: the key reaches the partner's businesses. null for the host's keys in PLATFORM_API_KEYS."),
  }).optional().describe("Present only for a platform key."),
}).describe("The API key making the request and the business it acts on.");

export const apiBusinessSchema = z.object({
  id,
  name: z.string(),
  timezone: z.string().describe("IANA time zone, for example America/Toronto."),
  locale: z.string().describe("Default language for callers: en, fr, es, sr (Serbian, Latin script), de, pt (Brazilian Portuguese), it or nl."),
  website_url: z.string().nullable(),
  business_type: z.string().describe("What kind of business it is. The dashboard uses service_company."),
  onboarding_stage: z.string().describe("Where the business is in onboarding, for example website, phone_number or complete."),
  booking_mode: z.enum(bookingModes).describe("instant: appointments are booked directly. request: the receptionist takes a request and the team confirms it. off: no booking."),
  hours: z.array(apiHoursWindowSchema),
  created_at: timestamp,
  updated_at: timestamp,
});

export const apiBusinessUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  locale: locale.optional(),
  website_url: z.url().max(2_000).nullable().optional(),
  business_type: z.string().trim().min(1).max(64).optional().describe("What kind of business it is."),
  hours: z.array(apiHoursWindowSchema).max(28).optional().describe("Replaces the whole week. Omit a day to close it. Send two windows for a day with a break. Windows on the same day can't overlap."),
});

const appointmentChangePolicyFields = {
  enabled: z.boolean().describe("Whether callers can change their own appointments with the receptionist."),
  allow_cancel: z.boolean(),
  allow_reschedule: z.boolean(),
  verification_mode: z.enum(appointmentChangeVerificationModes).describe("How a caller proves an appointment is theirs. phone_match_and_facts: their phone number and details of the booking. otp_required: a code sent by text. passcode_required: a PIN they type on the phone keypad, set on their contact in the dashboard. operator_only: the team makes the change."),
};

const receptionistText = z.string().trim().min(1).max(RECEPTIONIST_TEXT_MAX_LENGTH);
const receptionistInstructions = z.string().trim().min(1).max(RECEPTIONIST_INSTRUCTIONS_MAX_LENGTH).nullable();

export const apiReceptionistSchema = z.object({
  greeting: z.string().describe("What the receptionist says when it answers."),
  tone: z.string().describe("How it speaks, such as professional or warm."),
  summary: z.string().describe("What it tells callers the business does. Calls leave it out while summary_source is placeholder."),
  summary_source: z.enum(["placeholder", "generated", "operator"]).describe("placeholder: the default from sign-up. generated: written by AI from the business's knowledge. operator: written by a person or through the API, and AI never replaces it."),
  booking_policy: z.string().describe("Rules it follows when it books."),
  voice_instructions: z.string().nullable().describe("Extra instructions for calls."),
  sms_instructions: z.string().nullable().describe("Extra instructions for text messages."),
  chat_instructions: z.string().nullable().describe("Extra instructions for website chat."),
  transfer_mode: z.enum(transferModes).describe("When it puts a caller through to transfer_number: never, always, on_request, on_urgent or during_business_hours."),
  transfer_number: z.string().nullable().describe("Where it transfers calls, in E.164 format. A number saved before that was required may be in another format. With no number, it never transfers."),
  booking_mode: z.enum(bookingModes).describe("instant: appointments are booked directly. request: the receptionist takes a request and the team confirms it. off: no booking."),
  voice: z.enum(receptionistVoices).describe("The voice the receptionist speaks in on phone and browser calls. New businesses start with marin."),
  appointment_change_policy: z.object(appointmentChangePolicyFields).describe("Whether callers can cancel or reschedule their own appointments, and how they prove it's theirs."),
  updated_at: timestamp,
}).describe("How the receptionist answers, what it says about the business, and what it may do.");

export const apiReceptionistUpdateSchema = z.strictObject({
  greeting: receptionistText.optional(),
  tone: receptionistText.optional(),
  summary: receptionistText.optional().describe("AI never rewrites a summary set here."),
  regenerate_summary: z.literal(true).optional().describe("Hands the summary back to AI, which rewrites it from the business's knowledge. Can't be sent with summary."),
  booking_policy: receptionistText.optional(),
  voice_instructions: receptionistInstructions.optional().describe("null removes them."),
  sms_instructions: receptionistInstructions.optional().describe("null removes them."),
  chat_instructions: receptionistInstructions.optional().describe("null removes them."),
  transfer_mode: z.enum(transferModes).optional(),
  transfer_number: e164.nullable().optional().describe("null removes it, which stops transfers."),
  booking_mode: z.enum(bookingModes).optional(),
  voice: z.enum(receptionistVoices).optional().describe("Calls that start after the business snapshot refreshes use it."),
  appointment_change_policy: z.strictObject(appointmentChangePolicyFields).optional().describe("Send all four fields."),
}).refine((value) => value.summary === undefined || value.regenerate_summary === undefined, { message: "Send summary or regenerate_summary, not both.", path: ["regenerate_summary"] });

export const apiRuleSchema = z.object({
  id,
  title: z.string(),
  content: z.string().describe("What the receptionist must or must not do. Calls read the first 4,000 characters; a rule written in the dashboard can be longer."),
  active: z.boolean().describe("Whether the receptionist follows it."),
  created_at: timestamp,
  updated_at: timestamp,
}).describe("An instruction the receptionist follows on calls and in chats.");

export const apiRuleCreateSchema = z.strictObject({
  title: z.string().trim().min(1).max(RULE_TITLE_MAX_LENGTH),
  content: z.string().trim().min(1).max(RULE_CONTENT_CALL_MAX_LENGTH).describe("Up to 4,000 characters, all of which calls use."),
  active: z.boolean().optional().describe("Defaults to true."),
});

export const apiRuleUpdateSchema = z.strictObject({
  title: z.string().trim().min(1).max(RULE_TITLE_MAX_LENGTH).optional(),
  content: z.string().trim().min(1).max(RULE_CONTENT_CALL_MAX_LENGTH).optional().describe("Up to 4,000 characters, all of which calls use."),
  active: z.boolean().optional().describe("false stops the receptionist following it without deleting it."),
});

export const apiRuleReorderSchema = z.strictObject({
  rule_ids: z.array(id).min(1).max(RULES_MAX).describe("Every rule id once, in the order the receptionist should read them."),
});

const checkoutPlans = ["starter", "pro"] as const;
const billingIntervals = ["monthly", "annual"] as const;

export const apiBillingSchema = z.object({
  plan: z.enum(billingPlanSlugs).describe("The plan in force now. A Starter or Pro subscription that lapsed reads as free_cloud."),
  managed: z.boolean().describe("true when the LobbyStack operator runs the plan outside Polar and bills the business directly."),
  subscription_state: z.string().nullable().describe("The subscription's state, such as active, trialing, past_due or canceled. Null without a subscription."),
  billing_interval: z.enum(billingIntervals).nullable().describe("Null unless the plan is Starter or Pro."),
  current_period_end: nullableTimestamp.describe("When the paid period ends. Null unless the plan is Starter or Pro."),
  spending_cap_cents: z.number().int().nullable().describe("The most a Starter or Pro plan spends on usage over its allowance each month. Null means no cap, and is always null on other plans."),
  overage_spend_cents: z.number().int().describe("Usage over the allowance this month."),
  spending_cap_reached: z.boolean().describe("true once this month's overage reached the cap, which stops further billable usage."),
}).describe("The business's plan and what it spends.");

export const apiBillingUpdateSchema = z.strictObject({
  spending_cap_cents: z.number().int().min(0).nullable().describe("Cents. null removes the cap. Only Starter and Pro plans have one."),
});

export const apiCheckoutCreateSchema = z.strictObject({
  plan: z.enum(checkoutPlans),
  interval: z.enum(billingIntervals),
});

export const apiCheckoutSchema = z.object({
  id,
  plan: z.enum(checkoutPlans),
  interval: z.enum(billingIntervals),
  status: z.enum(["pending", "processing", "ready", "error"]).describe("pending or processing: Polar is making the page. ready: checkout_url is set. error: making the page failed; start another checkout."),
  checkout_url: z.string().nullable().describe("The Polar page where the customer pays. Send it to them."),
  error: z.string().nullable(),
  paid: z.boolean().describe("true once the business is on the plan bought here."),
  created_at: timestamp,
  updated_at: timestamp,
}).describe("A Polar checkout for a plan.");

export const apiManagedPlanCreateSchema = z.strictObject({
  plan: z.literal("enterprise"),
});

const phoneNumberCountries = ["US", "CA", "PR", "GB", "AU", "NZ"] as const;
const phoneNumberKinds = ["local", "mobile", "toll_free"] as const;

export const apiPhoneNumberSchema = z.object({
  id,
  phone_number: e164,
  status: z.enum(["active", "releasing", "released"]).describe("active: calls and texts to the number reach the receptionist, even while a release is scheduled. releasing: LobbyStack is giving the number back to the carrier. released: the business no longer has it."),
  release_scheduled_at: nullableTimestamp.describe("When LobbyStack releases an active number: when DELETE asked for it, or 30 days after a replacement went live. Null when no release is planned."),
  created_at: timestamp,
  updated_at: timestamp,
}).describe("A phone number the business has or had.");

export const apiPhoneNumberSearchSchema = z.strictObject({
  country: z.enum(phoneNumberCountries).optional().describe("Defaults to the country of the business's time zone, or US. When the account the key acts as verified a mobile number for this business, that number's country decides. A deployment offers US, CA and PR, and GB, AU and NZ once its carrier is set up for them."),
  kind: z.enum(phoneNumberKinds).optional().describe("Defaults to local. GB and AU numbers are always mobile, and NZ numbers local."),
  area_code: z.string().trim().regex(/^\d{1,6}$/, "Use digits only.").optional(),
  city: z.string().trim().min(1).max(100).optional(),
  region: z.string().trim().min(1).max(64).optional().describe("A state or province, such as ON or NY."),
  postal_code: z.string().trim().min(1).max(16).optional(),
  limit: z.number().int().min(1).max(20).optional().describe("How many offers to return. Defaults to 10."),
  replaces: z.uuid().optional().describe("The id of an active number to replace. The offers are then replacements, which only POST /phone-numbers/{phone_number_id}/replace accepts."),
});

export const apiPhoneNumberOfferSchema = z.object({
  phone_number: e164,
  country: z.enum(phoneNumberCountries),
  kind: z.enum(phoneNumberKinds),
  locality: z.string().nullable().describe("The city or area the number belongs to, when the carrier says."),
  region: z.string().nullable(),
  capabilities: z.object({ voice: z.boolean(), sms: z.boolean() }),
  trial: z.boolean().describe("A free trial number, offered to a cloud business without a paid plan, as in the dashboard: once per business, per account and verified phone, and per network in 30 days. It stops answering when the trial ends unless the business starts a paid plan."),
  offer_token: z.string().describe("Claim the number with this before expires_at. Only this business, and the account the key acts as, can use it."),
  expires_at: timestamp,
}).describe("A number the business can claim.");

export const apiPhoneNumberClaimCreateSchema = z.strictObject({
  offer_token: z.string().min(1).max(4_000).describe("An offer_token from POST /phone-numbers/search."),
});

export const apiPhoneNumberClaimSchema = z.object({
  id,
  status: z.enum(["pending", "provisioning", "claimed", "failed"]).describe("pending: waiting to be bought. provisioning: LobbyStack is buying the number and connecting it to the receptionist. claimed: the number is live and phone_number_id names it. failed: error says why; search again for another number."),
  phone_number: e164.describe("The number being claimed."),
  phone_number_id: z.uuid().nullable().describe("The number's id once the claim is claimed."),
  replaces_phone_number_id: z.uuid().nullable().describe("For a replacement, the number it replaces. That number keeps working until 30 days after the new one goes live."),
  error: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
}).describe("A request to buy a phone number for the business.");

const widgetKeyStatuses = ["active", "disabled", "revoked"] as const;
const widgetOrigins = z.array(z.url({ protocol: /^https?$/ }).max(2_000)).max(50);

export const apiWidgetConfigSchema = z.strictObject({
  color: z.string().regex(WIDGET_COLOR_PATTERN, "Use a hex color such as #18181b.").optional(),
  position: widgetPositionSchema.optional(),
  title: z.string().max(160).optional(),
  subtitle: z.string().max(320).optional(),
  greeting: z.string().max(400).optional(),
  locale: z.enum(interfaceLocales).optional().describe("The widget's language: en, fr, es or sr. Left out, it follows the visitor's browser."),
  lead_form: z.strictObject({
    enabled: z.boolean(),
    require_phone: z.boolean().optional(),
    require_email: z.boolean().optional(),
    show_before_chat: z.boolean().optional(),
  }).optional().describe("Asks visitors for their contact details."),
}).describe("How the widget looks and behaves.");

export const apiWidgetKeySchema = z.object({
  id,
  label: z.string().nullable(),
  status: z.enum(widgetKeyStatuses).describe("active: the widget works. disabled: it stops until it's turned back on. revoked: it stops for good."),
  allowed_origins: z.array(z.string()).describe("The websites the widget runs on, such as https://example.com."),
  config: apiWidgetConfigSchema,
  last_used_at: nullableTimestamp,
  created_at: timestamp,
}).describe("A key that puts the chat widget on the business's websites.");

export const apiWidgetKeyCreatedSchema = apiWidgetKeySchema.extend({
  key: z.string().describe("The key itself, shown only here. The widget's script tag carries it."),
  embed_snippet: z.string().describe("The script tag to paste into the website's HTML."),
}).describe("A new widget key, with the script tag that adds the widget to a website.");

export const apiWidgetKeyCreateSchema = z.strictObject({
  label: z.string().trim().min(1).max(120).optional(),
  allowed_origins: widgetOrigins.describe("The websites the widget may run on, as full http or https URLs. Only each one's origin is kept."),
  config: apiWidgetConfigSchema.optional(),
});

export const apiWidgetKeyUpdateSchema = z.strictObject({
  label: z.string().trim().min(1).max(120).nullable().optional().describe("null removes the label."),
  allowed_origins: widgetOrigins.optional().describe("Replaces the list."),
  config: apiWidgetConfigSchema.optional().describe("Replaces the whole configuration."),
  status: z.enum(widgetKeyStatuses).optional().describe("A revoked key can't be turned back on."),
});

const calendarStatuses = ["connected", "syncing", "error"] as const;

export const apiCalendarConnectionSchema = z.object({
  id,
  provider: z.string().describe("google: Google Calendar."),
  account_id: z.string().describe("Google's id for the connected account."),
  calendar_id: z.string().nullable().describe("The calendar LobbyStack reads busy times from and adds appointments to. null until one is picked with PATCH /calendars/{connection_id}; until then the connection changes nothing."),
  staff_id: id.nullable().describe("The staff member whose calendar this is: its busy times block only them, and their appointments go to it. null: the business's calendar, whose busy times block everyone and which takes the appointments of staff without a calendar of their own."),
  status: z.enum(calendarStatuses).describe("connected: the busy times are up to date. syncing: reading the calendar after a change. error: the last sync failed, and sync_error says why. While a picked calendar is syncing or failing, the staff it covers can't be booked."),
  sync_error: z.string().nullable(),
  last_synced_at: nullableTimestamp,
  created_at: timestamp,
  updated_at: timestamp,
}).describe("A calendar account connected to the business.");

export const apiCalendarConnectionUpdateSchema = z.strictObject({
  calendar_id: z.string().trim().min(1).max(255).optional().describe("A writable calendar from GET /calendars/{connection_id}/calendars. Picking another one reads it again, so the staff it covers can't be booked until that finishes."),
  staff_id: id.nullable().optional().describe("An active staff member from GET /staff, or null for the business's calendar."),
});

export const apiAccountCalendarSchema = z.object({
  id: z.string().describe("Google's id for the calendar. Send it as calendar_id."),
  name: z.string(),
  primary: z.boolean().describe("true for the account's main calendar."),
  writable: z.boolean().describe("true when LobbyStack can add appointments to it. Only a writable calendar can be picked."),
  selected: z.boolean().describe("true for the calendar the connection uses."),
}).describe("A calendar in a connected account.");

export const apiCalendarConnectLinkSchema = z.object({
  url: z.string().describe("The link to open in a browser. Whoever opens it signs in to LobbyStack as an owner or admin of the business, then agrees on Google's page."),
  expires_at: timestamp.describe("The link works until then."),
}).describe("A link that connects a Google Calendar to the business.");

// The alerts the dashboard's notification settings show, by their API names.
const notificationEventDescriptions = {
  voice_message: "A caller left a message during a call.",
  text_message: "A customer texted the business number.",
  customer_sms_failed: "A confirmation or reminder text to a customer failed or wasn't delivered.",
  calendar_sync: "An appointment couldn't sync to the connected calendar.",
  transfer_failed: "The receptionist tried to transfer a caller to a person, and the transfer didn't complete.",
  website_chat: "A visitor wrote through the website chat widget. At most one alert per chat a day.",
  webhook_disabled: "LobbyStack stopped sending events to a webhook endpoint after its deliveries failed for about a day.",
} as const;
export type ApiNotificationEvent = keyof typeof notificationEventDescriptions;
export const apiNotificationEvents = Object.keys(notificationEventDescriptions) as ApiNotificationEvent[];

function notificationEventShape<T extends z.ZodType>(channels: T) {
  return Object.fromEntries(apiNotificationEvents.map((event) => [event, channels.describe(notificationEventDescriptions[event])])) as Record<ApiNotificationEvent, T>;
}

const summaryTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM.").describe("Local time in the business's time zone, as 24-hour HH:MM.");

export const apiNotificationPreferencesSchema = z.object({
  email_enabled: z.boolean().describe("false: no alert emails at all, whatever events says."),
  sms_enabled: z.boolean().describe("false: no alert texts at all, whatever events says."),
  events: z.object(notificationEventShape(z.object({ email: z.boolean(), sms: z.boolean() }))).describe("Which alerts go out by email and which by text."),
  daily_summary: z.object({
    enabled: z.boolean(),
    send_time: summaryTime.nullable().describe("When the summary of the day before goes out."),
  }).describe("A daily summary of the alerts."),
  sms: z.object({
    available: z.boolean().describe("true when texts can be turned on."),
    unavailable_reason: z.enum(["sender_missing", "phone_unverified", "consent_required"]).nullable().describe("sender_missing: the deployment has no number to send alerts from. phone_unverified: the account has no verified mobile number. consent_required: the account hasn't agreed to alert texts. The account's owner fixes the last two in the dashboard's notification settings."),
  }),
}).describe("The alerts the account the key acts as gets about this business. Each person on the team has their own.");

export const apiNotificationPreferencesUpdateSchema = z.strictObject({
  email_enabled: z.boolean().optional(),
  sms_enabled: z.boolean().optional().describe("Texts can be turned on only while sms.available is true."),
  events: z.strictObject(notificationEventShape(z.strictObject({ email: z.boolean().optional(), sms: z.boolean().optional() }).optional())).optional().describe("Only the events and switches sent change."),
  daily_summary: z.strictObject({
    enabled: z.boolean().optional(),
    send_time: summaryTime.nullable().optional(),
  }).optional().describe("A summary that is on needs a send_time."),
});

const memberRoles = ["business_owner", "business_admin", "scheduler", "viewer"] as const;
const invitableRoles = ["business_admin", "scheduler", "viewer"] as const;
const teamEmail = z.string().trim().min(3).max(320);

export const apiTeamMemberSchema = z.object({
  id: id.describe("The membership id."),
  user_id: id,
  name: z.string().nullable(),
  email: z.string(),
  role: z.enum(memberRoles),
  joined_at: timestamp,
}).describe("Someone on the business's team.");

export const apiTeamInvitationSchema = z.object({
  id,
  email: z.string(),
  role: z.enum(memberRoles),
  status: z.enum(["pending", "expired"]).describe("pending: waiting to be accepted. expired: can no longer be accepted; send a new one."),
  transfers_ownership: z.boolean().describe("true for a claim link: accepting it makes the invitee an owner and takes the account that sent it off the team."),
  expires_at: timestamp,
  created_at: timestamp,
}).describe("An invitation nobody has accepted yet.");

export const apiTeamSchema = z.object({
  members: z.array(apiTeamMemberSchema).describe("Everyone on the team, earliest first."),
  invitations: z.array(apiTeamInvitationSchema).describe("Invitations nobody has accepted or revoked, newest first."),
}).describe("The business's team and its open invitations.");

export const apiTeamInvitationCreateSchema = z.strictObject({
  email: teamEmail.describe("One address. Only a LobbyStack account with this verified email can accept."),
  role: z.enum(invitableRoles),
});

export const apiTeamMemberUpdateSchema = z.strictObject({
  role: z.enum(invitableRoles).describe("Ownership changes hands through POST /team/claim-link instead."),
});

export const apiClaimLinkCreateSchema = z.strictObject({
  email: teamEmail.describe("The new owner's email. Only a LobbyStack account with this verified email can claim the business."),
});

export const apiClaimLinkSchema = z.object({
  invitation: apiTeamInvitationSchema,
  url: z.string().describe("The link that claims the business. LobbyStack emails it to the new owner; you can also send it yourself."),
}).describe("A link that hands the business over to its owner.");

const onboardingItems = ["business_details", "knowledge", "greeting", "plan", "phone_number", "full_site_read", "test_call"] as const;
const onboardingSkippableSteps = ["knowledge", "phone_number", "full_site_read", "test_call"] as const;

export const apiOnboardingSchema = z.object({
  stage: z.string().describe("The step the dashboard's onboarding shows, for example website, phone_number or complete. The API doesn't follow these steps in order."),
  complete: z.boolean().describe("true once onboarding is finished, so the dashboard opens on the business itself."),
  checklist: z.array(z.object({
    id: z.enum(onboardingItems).describe("business_details: a name and time zone. knowledge: a website or knowledge the receptionist answers from. greeting: a greeting, the default one included; change it with PATCH /receptionist. plan: a paid plan. phone_number: a live number. full_site_read: the whole website read, beyond the first sample, and done when there is no website. test_call: a call the receptionist answered."),
    status: z.enum(["done", "missing", "skipped"]).describe("skipped: left out through PATCH /onboarding or the dashboard's setup guide. A business on the free plan, or self-hosted, shows plan as skipped."),
    required: z.boolean().describe("true when POST /onboarding/complete needs this done or skipped: the business details, and a phone number on a paid plan."),
  })),
  missing: z.array(z.enum(onboardingItems)).describe("Required items neither done nor skipped, and empty once onboarding is complete. POST /onboarding/complete refuses while any is missing; skip_number covers phone_number."),
}).describe("How far the business is in setting up its receptionist.");

export const apiOnboardingUpdateSchema = z.strictObject({
  skip_steps: z.array(z.enum(onboardingSkippableSteps)).max(onboardingSkippableSteps.length).describe("The steps to skip, out of knowledge, phone_number, full_site_read and test_call. The list replaces the one before, so a step left out is no longer skipped."),
});

export const apiOnboardingCompleteSchema = z.strictObject({
  source: z.string().trim().max(120).optional().describe("How the business heard about LobbyStack."),
  referral_code: z.string().trim().min(1).max(64).optional().describe("An affiliate's referral code. Not accepted from a platform key, or for a business a platform key onboarded."),
  skip_number: z.boolean().optional().describe("true finishes a paid plan's onboarding without a phone number."),
});

export const apiBusinessCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(80).describe("IANA time zone, for example America/Toronto."),
  business_type: z.string().trim().min(1).max(64).optional().describe("Defaults to service_company, the type the dashboard uses."),
  slug: z.string().trim().min(2).max(120).optional().describe("Lowercase letters, digits and hyphens. Made from the name when left out. Another business already using it is a 409."),
  locale: locale.optional().describe("Default language for callers: en, fr, es, sr (Serbian, Latin script), de, pt (Brazilian Portuguese), it or nl. Defaults to en."),
  website_url: z.url().max(2_000).optional(),
  owner_email: teamEmail.optional().describe("Required with a partner's platform key, and refused with the host's. The partner emails this address an invitation to own the business and sign in on the partner's dashboard."),
  access_level: z.enum(partnerAccessLevels).optional().describe("Only with a partner's platform key: what the business's own team can use. full, the default, lets them run the receptionist, its knowledge, hours, services and team, without billing, API keys or MCP. activity shows them calls, chats, appointments, contacts and messages, and the partner sets up the receptionist."),
  template_id: id.optional().describe("Only with a partner's platform key: one of the partner's templates, from GET /partner/templates, to start the business from. The key needs partner:read too. The business takes its setup and documents, apart from the name and time zone sent here, before the owner's invitation goes out. A template that can't be applied leaves no business behind and is a 409."),
  package_id: id.optional().describe("Only with a partner's platform key: one of the partner's packages, from GET /partner/packages, to sell the business. The key needs partner.businesses:write too. The owner's invitation then opens a checkout on the partner's Stripe account. Left out, the business is billed outside LobbyStack."),
});

export const apiBusinessSummarySchema = z.object({
  id,
  name: z.string(),
  timezone: z.string().describe("IANA time zone, for example America/Toronto."),
  locale: z.string().describe("Default language for callers: en, fr, es, sr (Serbian, Latin script), de, pt (Brazilian Portuguese), it or nl."),
  website_url: z.string().nullable(),
  onboarding_stage: z.string().describe("Where the business is in onboarding, for example website, phone_number or complete."),
  created_at: timestamp,
}).describe("A business the platform key's group onboarded, or for a partner's key, a business of the partner.");

export const apiUserCreateSchema = z.strictObject({
  email: teamEmail.describe("The owner's email."),
  locale: z.enum(interfaceLocales).optional().describe("The language of the email: en, fr, es or sr. Defaults to en."),
});

export const apiUserInvitationSchema = z.object({
  email: z.string().describe("The address, lowercased."),
  locale: z.string().describe("The language you asked for."),
}).describe("The address LobbyStack emailed. The answer looks the same whether or not the address has an account.");

export const apiServiceSchema = z.object({
  id,
  name: z.string(),
  slug: z.string().describe("A short name no other service of the business uses."),
  description: z.string().nullable(),
  duration_minutes: z.number().int(),
  active: z.boolean().describe("Only active services can be booked. GET /services lists the others only with include_inactive=true."),
  staff_ids: z.array(id).describe("The staff members who take this service. Empty means every active staff member does."),
  created_at: timestamp,
  updated_at: timestamp,
});

const serviceSlug = z.string().trim().toLowerCase().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and single hyphens, such as color-touch-up.");
const serviceStaffIds = z.array(id).max(100);

export const apiServiceCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
  slug: serviceSlug.optional().describe("Made from the name when left out, keeping only its Latin letters and digits, so a name without any needs a slug. One another service already uses is a 409."),
  description: z.string().trim().min(1).max(2_000).optional(),
  duration_minutes: z.number().int().min(1).max(1_440).describe("How long an appointment for it lasts, from 1 minute to 24 hours."),
  active: z.boolean().optional().describe("Defaults to true."),
  staff_ids: serviceStaffIds.optional().describe("The staff members who take it. Leave it out, or send [], to let every active staff member take it. Inactive staff don't take bookings, so a service whose staff are all inactive can't be booked."),
});

export const apiServiceUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(160).optional(),
  slug: serviceSlug.optional().describe("One another service already uses is a 409."),
  description: z.string().trim().min(1).max(2_000).nullable().optional().describe("null removes it."),
  duration_minutes: z.number().int().min(1).max(1_440).optional(),
  active: z.boolean().optional().describe("false stops new bookings for it without deleting it."),
  staff_ids: serviceStaffIds.optional().describe("Replaces who takes it. [] lets every active staff member take it. Inactive staff don't take bookings, so a service whose staff are all inactive can't be booked."),
});

export const apiStaffSchema = z.object({
  id,
  name: z.string(),
  active: z.boolean().describe("Only active staff members take bookings."),
  timezone: z.string(),
  service_ids: z.array(id).describe("Active services this person can be booked for. A service with no staff assigned is open to every active staff member."),
  created_at: timestamp,
  updated_at: timestamp,
}).describe("A person who takes appointments. A business that never set up staff has one active staff member named after the business.");

export const apiCallSchema = z.object({
  id,
  channel: z.enum(["phone", "web"]).describe("phone: a phone call. web: a browser call from the website or dashboard."),
  status: z.enum(["in_progress", "completed"]),
  outcome: z.enum(["appointment_booked", "booking_incomplete", "message_taken", "conversation", "none"]),
  summary: z.string().nullable().describe("Short summary of the call, when one is available."),
  end_reason: z.string().nullable().describe("Why the call ended, as reported by the call provider or receptionist."),
  contact_id: id.nullable(),
  caller_name: z.string().nullable(),
  caller_phone: z.string().nullable(),
  duration_seconds: z.number().int().nullable(),
  recording_available: z.boolean(),
  started_at: timestamp,
  ended_at: nullableTimestamp,
  created_at: timestamp,
});

export const apiTranscriptEntrySchema = z.object({
  speaker: z.enum(["caller", "receptionist", "other"]),
  text: z.string(),
  at: timestamp,
});

export const apiCallDetailSchema = apiCallSchema.extend({
  transcript: z.array(apiTranscriptEntrySchema),
});

export const apiContactSchema = z.object({
  id,
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  locale: z.string().nullable(),
  timezone: z.string().nullable(),
  passcode: z.object({
    set_at: timestamp,
    locked: z.boolean().describe(`true after ${CONTACT_PASSCODE_LOCK_ATTEMPTS} wrong PINs in a row, even across calls. A locked PIN works again only once a new one is set.`),
  }).nullable().describe("The contact's keypad PIN, which callers type to change appointments when verification_mode is passcode_required: whether there is one, never the PIN itself. null: the contact has no PIN."),
  created_at: timestamp,
  updated_at: timestamp,
});

export const apiContactCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  phone: e164.optional(),
  email: z.email().max(320).optional(),
  locale: contactLocale.optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
}).refine((value) => Boolean(value.phone || value.email), { error: "Provide a phone or an email.", path: ["phone"] });

export const apiContactUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).nullable().optional(),
  phone: e164.optional(),
  email: z.email().max(320).nullable().optional(),
  locale: contactLocale.nullable().optional(),
  timezone: z.string().trim().min(1).max(80).nullable().optional(),
});

const contactPasscode = z.string()
  .regex(new RegExp(`^\\d{${CONTACT_PASSCODE_MIN_LENGTH},${CONTACT_PASSCODE_MAX_LENGTH}}$`), `Use ${CONTACT_PASSCODE_MIN_LENGTH} to ${CONTACT_PASSCODE_MAX_LENGTH} digits.`)
  .refine((value) => !isContactPasscode(value) || !isGuessableContactPasscode(value), "Too easy to guess: avoid one digit repeated or digits in a row, such as 1111 or 1234.");

export const apiContactPasscodesUpdateSchema = z.strictObject({
  passcodes: z.array(z.strictObject({
    contact_id: id,
    passcode: contactPasscode.nullable().describe(`The new PIN: ${CONTACT_PASSCODE_MIN_LENGTH} to ${CONTACT_PASSCODE_MAX_LENGTH} digits, not one digit repeated or digits in a row such as 1111 or 1234. null removes the contact's PIN.`),
  })).min(1).max(CONTACT_PASSCODES_MAX_PER_REQUEST).describe(`Each item has a contact_id and its passcode: the new PIN, or null to remove the PIN. 1 to ${CONTACT_PASSCODES_MAX_PER_REQUEST} contacts, each once.`),
});

export const apiContactPasscodesGenerateSchema = z.strictObject({
  contact_ids: z.array(id).min(1).max(CONTACT_PASSCODES_MAX_PER_REQUEST).optional().describe(`1 to ${CONTACT_PASSCODES_MAX_PER_REQUEST} contacts to give a new PIN, each once, replacing any PIN they have. Leave it out to give one to contacts that have a phone number and no PIN.`),
  length: z.number().int().min(CONTACT_PASSCODE_MIN_LENGTH).max(CONTACT_PASSCODE_MAX_LENGTH).optional().describe(`Digits in each PIN, ${CONTACT_PASSCODE_MIN_LENGTH} to ${CONTACT_PASSCODE_MAX_LENGTH}. Defaults to ${CONTACT_PASSCODE_DEFAULT_LENGTH}.`),
});

export const apiGeneratedContactPasscodesSchema = z.object({
  contacts: z.array(apiContactSchema.extend({
    new_passcode: z.string().describe("The PIN just set. LobbyStack keeps only a hash of it, so this is the only time it's shown: give it to the contact."),
  })).describe("The contacts that got a new PIN."),
  remaining: z.number().int().describe("Contacts that have a phone number and still no PIN. Without contact_ids, send the request again until this is 0."),
});

export const apiAppointmentSchema = z.object({
  id,
  status: z.enum(["confirmed", "cancelled"]),
  starts_at: timestamp,
  ends_at: timestamp,
  timezone: z.string(),
  service_id: id,
  service_name: z.string(),
  staff_id: id,
  staff_name: z.string(),
  contact_id: id,
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  source: z.string().describe("Where the booking came from, for example voice, web_chat, dashboard or api."),
  calendar_sync_status: z.enum(["pending", "synced", "failed", "not_required"]),
  created_at: timestamp,
  updated_at: timestamp,
});

export const apiAppointmentCreateSchema = z.strictObject({
  service_id: id,
  starts_at: inputTimestamp.describe("Start time. Use a starts_at value from GET /availability."),
  contact_id: id.optional().describe("An existing contact with a phone number. Provide contact_id or contact_phone."),
  contact_phone: e164.optional(),
  contact_name: z.string().trim().min(1).max(200).optional(),
  staff_id: id.optional().describe("Book with this active staff member. Without it, LobbyStack picks one who is free."),
  sms_consent: z.boolean().optional().describe("True only if the customer agreed to receive confirmation and reminder texts. Self-hosted instances only: on LobbyStack Cloud, texts come from LobbyStack's shared number, and only the receptionist can collect that consent, on a call."),
}).refine((value) => Boolean(value.contact_id || value.contact_phone), { error: "Provide contact_id or contact_phone.", path: ["contact_phone"] });

export const apiAppointmentRescheduleSchema = z.strictObject({
  starts_at: inputTimestamp,
  staff_id: id.optional().describe("Move the appointment to this active staff member. Defaults to the current one."),
});

export const apiAvailabilitySlotSchema = z.object({
  starts_at: timestamp,
  ends_at: timestamp,
});

export const apiMessageSchema = z.object({
  id,
  status: z.enum(["open", "done"]),
  title: z.string(),
  body: z.string().describe("The full message as the team sees it."),
  caller_name: z.string().nullable(),
  callback_phone: z.string().nullable(),
  urgency: z.enum(["low", "normal", "urgent"]).nullable(),
  callback_window: z.string().nullable(),
  channel: z.enum(["voice", "web_voice", "web_chat", "instagram", "sms"]).nullable(),
  call_id: id.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const apiKnowledgeEntrySchema = z.object({
  id,
  type: z.enum(["text", "faq"]),
  title: z.string().describe("The entry's title, or an FAQ's question."),
  content: z.string().describe("The entry's text, or an FAQ's answer."),
  tags: z.array(z.string()).describe("Your own labels for the entry."),
  priority: z.number().int().describe("Entries with higher numbers come first when the receptionist picks the entries it keeps ready on every call. Defaults to 0."),
  active: z.boolean().describe("Whether the receptionist answers from it."),
  created_at: timestamp,
  updated_at: timestamp,
}).describe("A text entry or FAQ the receptionist answers from.");

export const apiKnowledgeEntryUpdateSchema = z.strictObject({
  title: z.string().trim().min(1).max(300).optional().describe("The entry's title, or an FAQ's question."),
  content: z.string().trim().min(1).max(20_000).optional().describe("The entry's text, or an FAQ's answer."),
  tags: z.array(z.string().trim().min(1).max(255)).max(100).optional().describe("Replaces the entry's labels. faq is reserved, because it marks an FAQ, so it is ignored here: an entry keeps its type."),
  priority: z.number().int().min(-100).max(100).optional(),
  active: z.boolean().optional().describe("false stops the receptionist answering from the entry without deleting it."),
});

// Zod 4 reports an unknown type as "Invalid discriminator value. ..."; keep the v1 detail message "Invalid input".
export const apiKnowledgeEntryCreateSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), title: z.string().trim().min(1).max(300), content: z.string().trim().min(1).max(20_000) }),
  z.strictObject({ type: z.literal("faq"), question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(20_000) }),
], { error: (issue) => (issue.code === "invalid_union" ? "Invalid input" : undefined) });

export const apiKnowledgeSourceSchema = z.object({
  id,
  type: z.enum(["website", "page", "file"]).describe("website: a site added as a source, whose crawl reads its pages. page: one page a crawl read, or a site that has no crawl of its own. file: an uploaded document."),
  title: z.string(),
  url: z.string().nullable().describe("The website's or page's address. Null for a file."),
  status: z.enum(["pending", "processing", "indexed", "error", "cancelled"]).describe("pending: a file waits its turn. processing: it is being read. indexed: the receptionist can use it. error or cancelled: reading stopped."),
  error: z.string().nullable().describe("Why reading failed, when status is error."),
  active: z.boolean().describe("Whether the receptionist answers from it. An inactive source stays indexed but unused."),
  page_limit: z.number().int().nullable().describe("How many pages a website's crawl reads: a sample at first, the full site after POST /knowledge/sources/{source_id}/expand. Null for a page or a file."),
  created_at: timestamp,
  updated_at: timestamp,
}).describe("A website, page or file the receptionist learns from.");

export const apiKnowledgeSourceUpdateSchema = z.strictObject({
  active: z.boolean().describe("false stops the receptionist answering from the source without deleting it."),
});

export const apiKnowledgeSourceCreateSchema = z.strictObject({
  type: z.literal("website"),
  url: z.string().trim().min(1).max(2_000).describe("The site to read, such as https://example.com. A site that is already a source returns that source."),
});

export const knowledgeUploadContentTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
] as const;

export const apiKnowledgeUploadCreateSchema = z.strictObject({
  file_name: z.string().trim().min(1).max(255).regex(/[^.]/, "Use the file's name, such as prices.pdf.").describe("The file's name, such as prices.pdf."),
  content_type: z.enum(knowledgeUploadContentTypes).describe("PDF, Word (DOCX), plain text, Markdown, or a JPEG, PNG, WebP or TIFF image."),
  length: z.number().int().positive().max(KNOWLEDGE_UPLOAD_MAX_BYTES).describe("The file's size in bytes, up to 10 MB."),
  checksum_sha256: z.string().regex(/^[A-Za-z0-9+/]{43}=$/, "Use the base64 SHA-256 of the file.").describe("The base64-encoded SHA-256 of the file's bytes."),
});

export const apiKnowledgeUploadSchema = z.object({
  upload_id: id,
  upload_url: z.string().describe("Send the file's bytes here with PUT."),
  upload_headers: z.record(z.string(), z.string()).describe("Send exactly these headers with the PUT."),
  expires_at: nullableTimestamp.describe("When upload_url stops working, about 15 minutes after it was made."),
}).describe("Where to send a file before completing its upload.");

export const apiKnowledgeUploadCompleteSchema = z.strictObject({
  title: z.string().trim().min(1).max(1_000).optional().describe("Defaults to the file name."),
  tags: z.array(z.string().trim().min(1).max(255)).max(100).optional(),
});

export const apiWebhookEventTypeSchema = z.enum(webhookEventTypes);

export const apiWebhookEndpointSchema = z.object({
  id,
  url: z.string(),
  description: z.string().nullable(),
  events: z.array(apiWebhookEventTypeSchema),
  status: z.enum(["enabled", "disabled"]),
  disabled_reason: z.enum(["manual", "failing"]).nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const apiWebhookEndpointWithSecretSchema = apiWebhookEndpointSchema.extend({
  secret: z.string().describe("Signing secret (whsec_...). Returned only when the endpoint is created."),
});

const webhookUrl = z.url().max(2_000).describe("HTTPS URL that receives events.");

export const apiWebhookEndpointCreateSchema = z.strictObject({
  url: webhookUrl,
  events: z.array(apiWebhookEventTypeSchema).min(1),
  description: z.string().trim().max(200).optional(),
});

export const apiWebhookEndpointUpdateSchema = z.strictObject({
  url: webhookUrl.optional(),
  events: z.array(apiWebhookEventTypeSchema).min(1).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  status: z.enum(["enabled", "disabled"]).optional(),
});

export const apiWebhookTestResultSchema = z.object({
  event_id: id,
  delivery_id: id,
});

export const apiDeletedSchema = z.object({ id, deleted: z.literal(true) });

function eventEnvelope<T extends z.ZodType>(type: string, data: T) {
  return z.object({
    id: id.describe("Event id. Also sent as the webhook-id header; use it to ignore duplicates."),
    type: z.literal(type),
    api_version: z.literal(PUBLIC_API_VERSION),
    created_at: timestamp,
    business_id: id,
    data,
  });
}

export const apiWebhookEventSchemas = {
  "call.completed": eventEnvelope("call.completed", apiCallSchema),
  "appointment.booked": eventEnvelope("appointment.booked", apiAppointmentSchema),
  "appointment.rescheduled": eventEnvelope("appointment.rescheduled", apiAppointmentSchema),
  "appointment.cancelled": eventEnvelope("appointment.cancelled", apiAppointmentSchema),
  "message.taken": eventEnvelope("message.taken", apiMessageSchema),
  "contact.created": eventEnvelope("contact.created", apiContactSchema),
} as const;

export const apiWebhookTestEventSchema = eventEnvelope(WEBHOOK_TEST_EVENT_TYPE, z.object({ endpoint_id: id, message: z.string() }));

export type ApiMe = z.infer<typeof apiMeSchema>;
export type ApiBusiness = z.infer<typeof apiBusinessSchema>;
export type ApiBusinessUpdate = z.infer<typeof apiBusinessUpdateSchema>;
export type ApiBusinessCreate = z.infer<typeof apiBusinessCreateSchema>;
export type ApiBusinessSummary = z.infer<typeof apiBusinessSummarySchema>;
export type ApiUserCreate = z.infer<typeof apiUserCreateSchema>;
export type ApiUserInvitation = z.infer<typeof apiUserInvitationSchema>;
export type ApiHoursWindow = z.infer<typeof apiHoursWindowSchema>;
export type ApiReceptionist = z.infer<typeof apiReceptionistSchema>;
export type ApiReceptionistUpdate = z.infer<typeof apiReceptionistUpdateSchema>;
export type ApiRule = z.infer<typeof apiRuleSchema>;
export type ApiRuleCreate = z.infer<typeof apiRuleCreateSchema>;
export type ApiRuleUpdate = z.infer<typeof apiRuleUpdateSchema>;
export type ApiRuleReorder = z.infer<typeof apiRuleReorderSchema>;
export type ApiBilling = z.infer<typeof apiBillingSchema>;
export type ApiBillingUpdate = z.infer<typeof apiBillingUpdateSchema>;
export type ApiCheckout = z.infer<typeof apiCheckoutSchema>;
export type ApiCheckoutCreate = z.infer<typeof apiCheckoutCreateSchema>;
export type ApiWidgetConfig = z.infer<typeof apiWidgetConfigSchema>;
export type ApiWidgetKey = z.infer<typeof apiWidgetKeySchema>;
export type ApiWidgetKeyCreated = z.infer<typeof apiWidgetKeyCreatedSchema>;
export type ApiWidgetKeyCreate = z.infer<typeof apiWidgetKeyCreateSchema>;
export type ApiWidgetKeyUpdate = z.infer<typeof apiWidgetKeyUpdateSchema>;
export type ApiCalendarConnection = z.infer<typeof apiCalendarConnectionSchema>;
export type ApiCalendarConnectionUpdate = z.infer<typeof apiCalendarConnectionUpdateSchema>;
export type ApiAccountCalendar = z.infer<typeof apiAccountCalendarSchema>;
export type ApiCalendarConnectLink = z.infer<typeof apiCalendarConnectLinkSchema>;
export type ApiNotificationPreferences = z.infer<typeof apiNotificationPreferencesSchema>;
export type ApiNotificationPreferencesUpdate = z.infer<typeof apiNotificationPreferencesUpdateSchema>;
export type ApiTeam = z.infer<typeof apiTeamSchema>;
export type ApiTeamMember = z.infer<typeof apiTeamMemberSchema>;
export type ApiTeamInvitation = z.infer<typeof apiTeamInvitationSchema>;
export type ApiTeamInvitationCreate = z.infer<typeof apiTeamInvitationCreateSchema>;
export type ApiTeamMemberUpdate = z.infer<typeof apiTeamMemberUpdateSchema>;
export type ApiClaimLinkCreate = z.infer<typeof apiClaimLinkCreateSchema>;
export type ApiClaimLink = z.infer<typeof apiClaimLinkSchema>;
export type ApiOnboarding = z.infer<typeof apiOnboardingSchema>;
export type ApiOnboardingItem = ApiOnboarding["missing"][number];
export type ApiOnboardingUpdate = z.infer<typeof apiOnboardingUpdateSchema>;
export type ApiOnboardingComplete = z.infer<typeof apiOnboardingCompleteSchema>;
export type ApiPhoneNumber = z.infer<typeof apiPhoneNumberSchema>;
export type ApiPhoneNumberSearch = z.infer<typeof apiPhoneNumberSearchSchema>;
export type ApiPhoneNumberOffer = z.infer<typeof apiPhoneNumberOfferSchema>;
export type ApiPhoneNumberClaimCreate = z.infer<typeof apiPhoneNumberClaimCreateSchema>;
export type ApiPhoneNumberClaim = z.infer<typeof apiPhoneNumberClaimSchema>;
export type ApiService = z.infer<typeof apiServiceSchema>;
export type ApiServiceCreate = z.infer<typeof apiServiceCreateSchema>;
export type ApiServiceUpdate = z.infer<typeof apiServiceUpdateSchema>;
export type ApiStaff = z.infer<typeof apiStaffSchema>;
export type ApiCall = z.infer<typeof apiCallSchema>;
export type ApiCallDetail = z.infer<typeof apiCallDetailSchema>;
export type ApiContact = z.infer<typeof apiContactSchema>;
export type ApiContactCreate = z.infer<typeof apiContactCreateSchema>;
export type ApiContactUpdate = z.infer<typeof apiContactUpdateSchema>;
export type ApiContactPasscodesUpdate = z.infer<typeof apiContactPasscodesUpdateSchema>;
export type ApiContactPasscodesGenerate = z.infer<typeof apiContactPasscodesGenerateSchema>;
export type ApiGeneratedContactPasscodes = z.infer<typeof apiGeneratedContactPasscodesSchema>;
export type ApiAppointment = z.infer<typeof apiAppointmentSchema>;
export type ApiAppointmentCreate = z.infer<typeof apiAppointmentCreateSchema>;
export type ApiAvailabilitySlot = z.infer<typeof apiAvailabilitySlotSchema>;
export type ApiMessage = z.infer<typeof apiMessageSchema>;
export type ApiKnowledgeEntry = z.infer<typeof apiKnowledgeEntrySchema>;
export type ApiKnowledgeEntryCreate = z.infer<typeof apiKnowledgeEntryCreateSchema>;
export type ApiKnowledgeEntryUpdate = z.infer<typeof apiKnowledgeEntryUpdateSchema>;
export type ApiKnowledgeSource = z.infer<typeof apiKnowledgeSourceSchema>;
export type ApiKnowledgeSourceCreate = z.infer<typeof apiKnowledgeSourceCreateSchema>;
export type ApiKnowledgeSourceUpdate = z.infer<typeof apiKnowledgeSourceUpdateSchema>;
export type ApiKnowledgeUpload = z.infer<typeof apiKnowledgeUploadSchema>;
export type ApiKnowledgeUploadCreate = z.infer<typeof apiKnowledgeUploadCreateSchema>;
export type ApiKnowledgeUploadComplete = z.infer<typeof apiKnowledgeUploadCompleteSchema>;
export type ApiWebhookEndpoint = z.infer<typeof apiWebhookEndpointSchema>;
export type ApiWebhookEndpointCreate = z.infer<typeof apiWebhookEndpointCreateSchema>;
export type ApiWebhookEndpointUpdate = z.infer<typeof apiWebhookEndpointUpdateSchema>;
export type ApiWebhookEventPayload = {
  id: string;
  type: string;
  api_version: typeof PUBLIC_API_VERSION;
  created_at: string;
  business_id: string;
  data: Record<string, unknown>;
};

/** The v1 list envelope around one resource schema: `{ data, next_cursor, has_more }`. */
export function apiPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    next_cursor: z.string().nullable().describe("Pass as cursor to get the next page. Null on the last page."),
    has_more: z.boolean(),
  });
}

/** Parses a request body; returns field-level problems instead of throwing. */
export function parseApiInput<T>(schema: z.ZodType<T>, value: unknown): { ok: true; data: T } | { ok: false; details: Array<{ path: string; message: string }> } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, details: result.error.issues.map((issue) => ({ path: issue.path.map(String).join(".") || "(body)", message: issue.message })) };
}
