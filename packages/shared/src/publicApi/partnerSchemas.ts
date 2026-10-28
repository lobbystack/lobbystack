import { z } from "zod";

import { billingIntervals, paidPartnerTierSlugs, partnerTierSlugs } from "../billing";
import { runtimeLocales } from "../locales";
import { partnerAccessLevels } from "../partners";

// The v1 contract of the Partner endpoints, which a partner's platform key
// calls to run the partner itself, as its console does. Responses built by
// packages/domain are typed from these schemas, and the OpenAPI document is
// generated from them.

const id = z.uuid().describe("Stable identifier (UUID).");
const timestamp = z.iso.datetime().describe("ISO 8601 timestamp in UTC.");
const nullableTimestamp = timestamp.nullable();
const email = z.email().max(320);
const accessLevel = z.enum(partnerAccessLevels).describe("What the business's own team can use once someone owns it. full lets them run the receptionist, its knowledge, hours, services and team. activity shows them calls, chats, appointments, contacts and messages, and the partner sets up the receptionist.");
const usage = z.object({
  period: z.string().describe("The month, YYYY-MM, in UTC."),
  voice_seconds: z.number().int(),
  chats: z.number().int(),
}).describe("What the business used this month, as usage metering counts it.");
// A key never acts as an owner, so it invites, and changes people to, admin or member only.
const keyAssignableRoles = ["admin", "member"] as const;

export const apiPartnerSchema = z.object({
  id,
  name: z.string(),
  slug: z.string(),
  subdomain: z.string().nullable().describe("The partner's subdomain under the deployment's partner domain, such as acme.receptionistportal.com, or null for none."),
  custom_domain: z.string().nullable().describe("The partner's own domain once it's active, or null."),
  dashboard_url: z.string().nullable().describe("Where the partner's businesses open their dashboard: its own domain once active, else its subdomain. Null for neither."),
  tier: z.object({
    billed: z.boolean().describe("Whether this deployment bills partners for tiers."),
    slug: z.enum(partnerTierSlugs),
    interval: z.enum(billingIntervals).nullable(),
  }),
  pool: z.object({
    period: z.string().describe("The month, YYYY-MM, in UTC."),
    voice_seconds_limit: z.number().int().nullable().describe("Voice seconds the partner's businesses share this month, or null for no limit."),
    chats_limit: z.number().int().nullable().describe("Chats they share this month, or null for no limit."),
    voice_seconds_used: z.number().int(),
    chats_used: z.number().int(),
    overage_spend_cents: z.number().int().describe("What overage past the pool costs so far this month, in US cents."),
  }).nullable().describe("What the businesses used of the pool they share this month. Null when nothing limits the pool, or when the key lacks partner.billing:read."),
}).describe("The partner the platform key acts as.");

export const apiPartnerBusinessReleasedSchema = z.object({
  id,
  released: z.literal(true),
  owner_user_id: id.describe("The owner who keeps the business."),
});

const packageOverage = z.object({
  enabled: z.boolean(),
  currency: z.string().describe("The package's currency, uppercase."),
  voice_minute_rate_minor: z.number().int().describe("What each minute past the allowance costs, in the currency's smallest unit."),
  chat_rate_minor: z.number().int().describe("What each chat past the allowance costs, in the currency's smallest unit."),
  cap_minor: z.number().int().nullable().describe("The monthly cap on overage, in the currency's smallest unit, or null for none."),
});

export const apiPartnerBusinessBillingSchema = z.object({
  business_id: id,
  kind: z.enum(["outside", "package"]).describe("outside: billed outside LobbyStack. package: sold one of the partner's packages through its Stripe account."),
  package_id: id.nullable(),
  package_name: z.string().nullable(),
  status: z.string().nullable().describe("The package subscription's status, such as awaiting_payment or active. Null outside LobbyStack."),
  overage: packageOverage.nullable(),
});

export const apiPartnerBusinessBillingUpdateSchema = z.strictObject({
  package_id: id.nullable().optional().describe("The package to sell the business, or null to bill it outside LobbyStack. A business whose package subscription is live is a 409: cancel it in Stripe first."),
  overage: z.strictObject({
    enabled: z.boolean(),
    voice_minute_rate_minor: z.number().int().min(0),
    chat_rate_minor: z.number().int().min(0),
    cap_minor: z.number().int().min(0).nullable(),
  }).optional().describe("The business's overage on its package. Applied after package_id. A business billed outside LobbyStack has none, so sending it is a 409."),
}).refine((body) => body.package_id !== undefined || body.overage !== undefined, { message: "Send package_id, overage or both." });

/** One of the partner's businesses as its console's Businesses page lists it. The MCP server's list_businesses answers with it. */
export const apiPartnerBusinessSummarySchema = z.object({
  id,
  name: z.string(),
  access_level: z.enum(partnerAccessLevels),
  onboarding_stage: z.string(),
  created_at: timestamp,
  owner: z.object({
    email: z.string(),
    status: z.enum(["joined", "invited"]).describe("joined once the owner accepted, invited while the invitation waits."),
    invitation_expires_at: nullableTimestamp,
  }).nullable().describe("The business's owner, or the person invited to own it. Null for neither, such as a claimed demo's."),
  usage,
  billing: apiPartnerBusinessBillingSchema.nullable().describe("How the business is billed. Null for members of the partner's team, who never see billing."),
});

export const apiPartnerDemoCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).describe("The prospect's business name."),
  website_url: z.url().max(2_000).describe("The prospect's website, which the demo reads."),
  access_level: accessLevel.optional().describe("What the business's own team gets once someone claims the demo. Defaults to full."),
  locale: z.enum(runtimeLocales).optional().describe("The language the demo's receptionist speaks first. Defaults to en."),
  greeting: z.string().trim().max(500).optional(),
  timezone: z.string().trim().max(80).optional().describe("IANA time zone, for example America/Toronto."),
  suggested_prompts: z.array(z.string().trim().min(1).max(200)).max(6).optional().describe("What the demo page suggests the prospect ask. Publishing needs at least two."),
});

export const apiPartnerDemoSchema = z.object({
  id,
  business_id: id,
  business_name: z.string(),
  website_url: z.string(),
  status: z.string().describe("preparing, active, claimed, revoked or expired."),
  locale: z.string(),
  access_level: z.enum(partnerAccessLevels),
  suggested_prompts: z.array(z.string()),
  expires_at: timestamp,
  published_at: nullableTimestamp,
  ready: z.object({
    website: z.boolean().describe("The website crawl finished, or this deployment has no crawler."),
    greeting: z.boolean(),
    snapshot: z.boolean(),
    prompts: z.boolean().describe("At least two suggested prompts."),
  }).describe("What publishing waits for."),
  website_status: z.string().nullable().describe("The crawl's status, such as queued, running or completed."),
  website_error: z.string().nullable(),
  usage,
});

export const apiPartnerDemoCreatedSchema = z.object({
  id,
  business_id: id,
  status: z.literal("preparing"),
  access_level: z.enum(partnerAccessLevels),
  token: z.string().describe("The demo link's token. Publishing needs it. It's shown only here and by POST /partner/demos/{demo_id}/rotate."),
  url: z.string().describe("The demo page on the partner's domain. Send it to the prospect once the demo is published."),
});

export const apiPartnerDemoPublishSchema = z.strictObject({
  token: z.string().trim().min(1).max(200).describe("The token of the demo's current link."),
  suggested_prompts: z.array(z.string().trim().min(1).max(200)).max(6).optional(),
});

export const apiPartnerDemoStateSchema = z.object({
  id,
  status: z.string().describe("active once published, revoked once turned off."),
  expires_at: nullableTimestamp,
});

export const apiPartnerDemoLinkSchema = z.object({
  id,
  token: z.string().describe("The new token. The old link stops working."),
  url: z.string(),
});

export const apiPartnerPackageSchema = z.object({
  id,
  name: z.string(),
  currency: z.string().describe("Uppercase ISO 4217 code, the connected Stripe account's currency."),
  monthly_price_minor: z.number().int().describe("In the currency's smallest unit."),
  setup_fee_minor: z.number().int().nullable(),
  allowance: z.object({ voice_minutes: z.number().int(), chats: z.number().int() }).describe("What the package includes each month."),
  on_connected_account: z.boolean().describe("false for a package made on a Stripe account the partner since disconnected, which can't be sold."),
  created_at: timestamp,
});

export const apiPartnerPackageCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  monthly_price_minor: z.number().int().positive().describe("In the smallest unit of the connected Stripe account's currency."),
  setup_fee_minor: z.number().int().positive().nullable().optional().describe("A one-time fee charged with the first month, or null for none."),
  voice_minutes: z.number().int().min(0),
  chats: z.number().int().min(0),
});

export const apiPartnerPackageUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
});

export const apiPartnerBrandSchema = z.object({
  name: z.string(),
  subdomain: z.string().nullable(),
  subdomain_url: z.string().nullable(),
  logo_url: z.string().nullable(),
  favicon_url: z.string().nullable(),
  color: z.string().nullable().describe("Hex color, such as #0f766e."),
  terms_url: z.string().nullable(),
  privacy_url: z.string().nullable(),
  support_url: z.string().nullable(),
  support_email: z.string().nullable().describe("Where replies to the partner's emails go."),
});

const brandImage = z.string().max(400_000).regex(/^[A-Za-z0-9+/]*={0,2}$/, "Send the image in base64.").nullable();

export const apiPartnerBrandUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  color: z.string().trim().max(32).nullable().optional(),
  terms_url: z.string().trim().max(2_048).nullable().optional(),
  privacy_url: z.string().trim().max(2_048).nullable().optional(),
  support_url: z.string().trim().max(2_048).nullable().optional(),
  support_email: z.string().trim().max(320).nullable().optional(),
  logo: brandImage.optional().describe("A PNG, JPEG, WebP or SVG image of 256 KB at most, in base64, or null to remove the logo."),
  favicon: brandImage.optional().describe("The same, for the favicon."),
});

export const apiPartnerDomainsSchema = z.object({
  subdomain: z.string().nullable(),
  subdomain_url: z.string().nullable(),
  custom_domains: z.enum(["available", "paid_tier_required", "unavailable"]).describe("Whether the partner can add its own domain: yes, once it pays for a tier, or never on this deployment."),
  custom: z.object({
    hostname: z.string(),
    status: z.enum(["pending", "active", "failed"]),
    records: z.array(z.object({ type: z.enum(["CNAME", "TXT"]), name: z.string(), value: z.string(), verified: z.boolean() })).describe("The records to add at the domain's DNS provider. Empty until the provider first answers."),
    errors: z.array(z.string()),
    checked_at: nullableTimestamp.describe("When LobbyStack last checked the records. It checks a waiting domain every minute in its first hour, every 5 minutes in its first day, then hourly."),
    url: z.string().nullable(),
    taken: z.boolean().describe("Another partner proved it controls this domain first."),
  }).nullable(),
});

export const apiPartnerDomainCreateSchema = z.strictObject({
  hostname: z.string().trim().min(1).max(253).describe("A subdomain of the partner's own domain, such as app.youragency.com."),
});

export const apiPartnerTemplateSchema = z.object({
  id,
  name: z.string(),
  created_at: timestamp,
  manifest: z.record(z.string(), z.unknown()).describe("The setup the template copies, in the format of lobbystack onboard's manifest."),
});

export const apiPartnerTemplateCreateSchema = z.strictObject({
  business_id: id.describe("One of the partner's businesses, whose setup and documents the template copies."),
  name: z.string().trim().min(1).max(120),
});

export const apiPartnerTeamMemberSchema = z.object({
  id: id.describe("The membership id."),
  user_id: id,
  name: z.string().nullable(),
  email: z.string(),
  role: z.enum(["owner", "admin", "member"]),
  joined_at: timestamp,
});

export const apiPartnerTeamInvitationSchema = z.object({
  id,
  email: z.string(),
  role: z.enum(["owner", "admin", "member"]),
  expires_at: timestamp,
  invited_at: timestamp,
});

export const apiPartnerTeamSchema = z.object({
  members: z.array(apiPartnerTeamMemberSchema).describe("Everyone on the partner's team, earliest first."),
  invitations: z.array(apiPartnerTeamInvitationSchema).describe("Invitations nobody accepted or revoked yet, oldest first."),
});

export const apiPartnerTeamInvitationCreateSchema = z.strictObject({
  email: email.describe("Only a LobbyStack account with this verified email can accept."),
  role: z.enum(keyAssignableRoles).describe("Only an owner, in the console, invites an owner."),
});

export const apiPartnerTeamMemberUpdateSchema = z.strictObject({
  role: z.enum(keyAssignableRoles).describe("Only an owner, in the console, makes someone an owner or changes an owner's role."),
});

export const apiPartnerStripeConnectionSchema = z.object({
  configured: z.boolean().describe("Whether this deployment has Stripe Connect set up."),
  status: z.string().describe("not_connected, onboarding, restricted, active or disconnected."),
  account_id: z.string().nullable(),
  country: z.string().nullable(),
  currency: z.string().nullable().describe("The currency the partner's packages are priced in."),
  details_submitted: z.boolean(),
  charges_enabled: z.boolean(),
  payouts_enabled: z.boolean(),
  disconnected_at: nullableTimestamp,
});

export const apiPartnerStripeOnboardingCreateSchema = z.strictObject({
  country: z.string().trim().length(2).optional().describe("ISO 3166-1 alpha-2 country a new account opens in. Ignored once the partner has an account."),
});

export const apiPartnerLinkSchema = z.object({
  url: z.string().describe("Send whoever completes the step to this page. It works once, for a few minutes."),
});

export const apiPartnerBillingSchema = z.object({
  billed: z.boolean().describe("Whether this deployment bills partners for tiers."),
  tier: z.enum(partnerTierSlugs),
  interval: z.enum(billingIntervals).nullable(),
  subscription_state: z.string().nullable(),
  current_period_end: nullableTimestamp,
  ends_at: nullableTimestamp.describe("When a canceled tier ends, or null while it renews."),
  included_numbers: z.number().int(),
  trial_numbers: z.number().int(),
  numbers_held: z.number().int(),
  pool: z.object({
    period: z.string(),
    voice_seconds_limit: z.number().int().nullable(),
    chats_limit: z.number().int().nullable(),
    voice_seconds_used: z.number().int(),
    chats_used: z.number().int(),
    overage_spend_cents: z.number().int(),
  }).nullable().describe("What the businesses used of their shared pool this month, or null while nothing limits it."),
  pool_overage: z.object({
    enabled: z.boolean(),
    cap_cents: z.number().int().nullable(),
    billed: z.boolean().describe("Only a paid tier bills overage, so Free stops at its pool."),
  }),
});

export const apiPartnerPoolOverageSchema = z.object({
  enabled: z.boolean(),
  cap_cents: z.number().int().nullable().describe("The monthly cap on pool overage in US cents, or null for none."),
  billed: z.boolean(),
});

export const apiPartnerPoolOverageUpdateSchema = z.strictObject({
  enabled: z.boolean(),
  cap_cents: z.number().int().min(0).nullable().optional().describe("Leave it out or send null for no cap."),
});

export const apiPartnerTierCheckoutCreateSchema = z.strictObject({
  tier: z.enum(paidPartnerTierSlugs),
  interval: z.enum(billingIntervals),
});

export const apiPartnerTierCheckoutSchema = z.object({
  id,
  tier: z.enum(paidPartnerTierSlugs),
  interval: z.enum(billingIntervals),
  status: z.enum(["pending", "processing", "ready", "error", "superseded"]).describe("pending or processing: Polar is making the page. ready: checkout_url is set. error: start another. superseded: a newer checkout replaced it."),
  checkout_url: z.string().nullable().describe("The Polar page where the partner pays. It's made out to the owner who made the key."),
  synced: z.boolean().describe("true once the partner holds the tier."),
});

export type ApiPartner = z.infer<typeof apiPartnerSchema>;
export type ApiPartnerBusinessReleased = z.infer<typeof apiPartnerBusinessReleasedSchema>;
export type ApiPartnerBusinessSummary = z.infer<typeof apiPartnerBusinessSummarySchema>;
export type ApiPartnerBusinessBilling = z.infer<typeof apiPartnerBusinessBillingSchema>;
export type ApiPartnerBusinessBillingUpdate = z.infer<typeof apiPartnerBusinessBillingUpdateSchema>;
export type ApiPartnerDemoCreate = z.infer<typeof apiPartnerDemoCreateSchema>;
export type ApiPartnerDemo = z.infer<typeof apiPartnerDemoSchema>;
export type ApiPartnerDemoCreated = z.infer<typeof apiPartnerDemoCreatedSchema>;
export type ApiPartnerDemoPublish = z.infer<typeof apiPartnerDemoPublishSchema>;
export type ApiPartnerDemoState = z.infer<typeof apiPartnerDemoStateSchema>;
export type ApiPartnerDemoLink = z.infer<typeof apiPartnerDemoLinkSchema>;
export type ApiPartnerPackage = z.infer<typeof apiPartnerPackageSchema>;
export type ApiPartnerPackageCreate = z.infer<typeof apiPartnerPackageCreateSchema>;
export type ApiPartnerPackageUpdate = z.infer<typeof apiPartnerPackageUpdateSchema>;
export type ApiPartnerBrand = z.infer<typeof apiPartnerBrandSchema>;
export type ApiPartnerBrandUpdate = z.infer<typeof apiPartnerBrandUpdateSchema>;
export type ApiPartnerDomains = z.infer<typeof apiPartnerDomainsSchema>;
export type ApiPartnerDomainCreate = z.infer<typeof apiPartnerDomainCreateSchema>;
export type ApiPartnerTemplate = z.infer<typeof apiPartnerTemplateSchema>;
export type ApiPartnerTemplateCreate = z.infer<typeof apiPartnerTemplateCreateSchema>;
export type ApiPartnerTeam = z.infer<typeof apiPartnerTeamSchema>;
export type ApiPartnerTeamMember = z.infer<typeof apiPartnerTeamMemberSchema>;
export type ApiPartnerTeamInvitation = z.infer<typeof apiPartnerTeamInvitationSchema>;
export type ApiPartnerTeamInvitationCreate = z.infer<typeof apiPartnerTeamInvitationCreateSchema>;
export type ApiPartnerTeamMemberUpdate = z.infer<typeof apiPartnerTeamMemberUpdateSchema>;
export type ApiPartnerStripeConnection = z.infer<typeof apiPartnerStripeConnectionSchema>;
export type ApiPartnerStripeOnboardingCreate = z.infer<typeof apiPartnerStripeOnboardingCreateSchema>;
export type ApiPartnerLink = z.infer<typeof apiPartnerLinkSchema>;
export type ApiPartnerBilling = z.infer<typeof apiPartnerBillingSchema>;
export type ApiPartnerPoolOverage = z.infer<typeof apiPartnerPoolOverageSchema>;
export type ApiPartnerPoolOverageUpdate = z.infer<typeof apiPartnerPoolOverageUpdateSchema>;
export type ApiPartnerTierCheckoutCreate = z.infer<typeof apiPartnerTierCheckoutCreateSchema>;
export type ApiPartnerTierCheckout = z.infer<typeof apiPartnerTierCheckoutSchema>;
