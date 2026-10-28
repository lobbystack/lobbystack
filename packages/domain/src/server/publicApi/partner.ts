import { and, eq, lt, sql } from "drizzle-orm";

import { partnerApiIdempotencyKeys, partners, withBusinessTransaction } from "@lobbystack/db";
import type {
  ApiPartner,
  ApiPartnerBilling,
  ApiPartnerBrand,
  ApiPartnerBrandUpdate,
  ApiPartnerBusinessBilling,
  ApiPartnerBusinessBillingUpdate,
  ApiPartnerBusinessReleased,
  ApiPartnerBusinessSummary,
  ApiPartnerDemo,
  ApiPartnerDemoCreate,
  ApiPartnerDemoCreated,
  ApiPartnerDemoLink,
  ApiPartnerDemoPublish,
  ApiPartnerDemoState,
  ApiPartnerDomains,
  ApiPartnerLink,
  ApiPartnerPackage,
  ApiPartnerPackageCreate,
  ApiPartnerPoolOverage,
  ApiPartnerPoolOverageUpdate,
  ApiPartnerStripeConnection,
  ApiPartnerTeam,
  ApiPartnerTeamInvitation,
  ApiPartnerTeamInvitationCreate,
  ApiPartnerTeamMember,
  ApiPartnerTemplate,
  ApiPartnerTierCheckout,
  ApiPartnerTierCheckoutCreate,
} from "@lobbystack/shared";
import { keyHasScope, PUBLIC_API_IDEMPOTENCY_TTL_HOURS, type ApiErrorCode, type ApiKeyScope } from "@lobbystack/shared";

import { brandForHostReference } from "../brands";
import { deleteBusinessTemplate, listBusinessTemplates, saveBusinessTemplate, type BusinessSetupDependencies, type PartnerTemplate } from "../businessTemplates";
import type { DomainContext } from "../context";
import { createPartnerDemo, deletePartnerDemo, listPartnerDemos, publishPartnerDemo, revokePartnerDemo, rotatePartnerDemoToken, type PartnerDemo } from "../demos";
import { listPartnerBusinessBillingIn, setPartnerBusinessBilling, setPartnerBusinessOverage, type PartnerBusinessBilling } from "../packageBilling";
import { partnerActorRole, partnerRls, type PartnerKeyActor } from "../partnerActors";
import { createPartnerTierCheckout, getPartnerBilling, getPartnerTierCheckout, loadPartnerTierInTransaction, setPartnerPoolOverage, type PartnerBilling, type PartnerTierCheckout } from "../partnerBilling";
import { addPartnerCustomDomain, getPartnerDomains, removePartnerCustomDomain, type PartnerDomains } from "../partnerDomains";
import { changePartnerMemberRole, deletePartnerBusiness, getPartnerBrandSettings, invitePartnerMember, listPartnerBusinesses, listPartnerTeam, releaseBusiness, removePartnerMember, revokePartnerInvitation, savePartnerBrand, type PartnerActor, type PartnerBrandSettings, type PartnerBusiness, type PartnerTeam } from "../partners";
import { archivePartnerPackage, createPartnerPackage, getPartnerStripeConnection, listPartnerPackages, renamePartnerPackage, startPartnerStripeOnboarding, type PartnerPackage, type PartnerStripeConnection } from "../partnerStripe";
import { periodKeyFor } from "../usage";
import { PublicApiError } from "./errors";
import type { PartnerPlatformKey } from "./platformKeys";

// The v1 Partner endpoints: what the partner console does, for a partner's
// platform keys. Each function runs the console's own partner operation with
// the key as the actor, which acts as the partner with an admin's rights
// (partnerActors.ts), and answers in the v1 shape. The caller passes the app
// role's context, as the console does, since partner operations act as an
// operator or the system.

/** The key as the actor of a partner operation. */
export function partnerKeyActor(key: PartnerPlatformKey): PartnerKeyActor {
  return { kind: "key", partnerId: key.partnerId, platformKeyId: key.platformKeyId, scopes: key.scopes };
}

/**
 * Someone on the partner's team acting through an agency connection, an MCP
 * client's OAuth grant for them and the partner (ADR 0011). Partner
 * operations read their role on every call, so the console's rules apply.
 * `scopes` are the ones they consented to, which keep billing to the grants
 * that carry partner.billing scopes, as a key's do.
 */
export type PartnerMemberSubject = { kind: "member"; partnerId: string; userId: string; grantId: string; scopes: readonly ApiKeyScope[] };

/** Who calls a Partner operation: one of the partner's platform keys, or one of its people through an agency connection. */
export type PartnerSubject = PartnerPlatformKey | PartnerMemberSubject;

export function isPartnerMemberSubject(subject: PartnerSubject): subject is PartnerMemberSubject {
  return (subject as { kind?: unknown }).kind === "member";
}

/** The partner operation's actor for a subject. A person's role is read again by each operation. */
export function partnerSubjectActor(subject: PartnerSubject): PartnerActor {
  if (isPartnerMemberSubject(subject)) return { kind: "member", partnerId: subject.partnerId, userId: subject.userId, role: "member" };
  return partnerKeyActor(subject);
}

const ERROR_CODES: Record<number, "invalid_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "rate_limited"> = {
  400: "invalid_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  413: "invalid_request",
  422: "invalid_request",
  429: "rate_limited",
};

/** The console's codes that the v1 API answers as they are. */
const PASSED_THROUGH = new Set<string>(["key_owner_inactive"] satisfies ApiErrorCode[]);

/**
 * Runs a partner operation and turns its errors, which carry a status and
 * the console's own code, into v1 errors with the same message.
 */
async function partnerOperation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PublicApiError) throw error;
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    const code = PASSED_THROUGH.has((error as { code?: unknown }).code as string) ? (error as { code: ApiErrorCode }).code : ERROR_CODES[status];
    if (!code || !(error instanceof Error)) throw error;
    throw new PublicApiError(status === 413 ? 400 : status, code, error.message);
  }
}

const iso = (value: Date | string | null): string | null => (value === null ? null : new Date(value).toISOString());

// The partner

export async function getPartnerForApi(context: DomainContext, subject: PartnerSubject): Promise<ApiPartner> {
  const actor = partnerSubjectActor(subject);
  return await partnerOperation(async () => {
    const brand = await getPartnerBrandSettings(context, actor);
    const domains = await getPartnerDomains(context, actor);
    const about = await withBusinessTransaction(context.db, { ...partnerRls(actor), actorType: "operator" }, async (tx) => {
      const [row] = await tx.select({ slug: partners.slug }).from(partners).where(eq(partners.id, actor.partnerId)).limit(1);
      return { slug: row?.slug ?? "", tier: await loadPartnerTierInTransaction(tx, actor.partnerId) };
    });
    // A key whose owner is no longer one, or a person who isn't an owner, reads the partner without its pool, as a subject without the scope does.
    const billing = keyHasScope(subject.scopes, "partner.billing:read")
      ? await getPartnerBilling(context, actor).catch((error: unknown) => { if (["key_owner_inactive", "owner_only"].includes((error as { code?: string } | null)?.code ?? "")) return null; throw error; })
      : null;
    const custom = domains.custom?.status === "active" ? domains.custom : null;
    return {
      id: actor.partnerId,
      name: brand.name,
      slug: about.slug,
      subdomain: brand.subdomain,
      custom_domain: custom?.hostname ?? null,
      dashboard_url: custom?.url ?? brand.subdomainUrl,
      tier: { billed: about.tier.billed, slug: about.tier.tier, interval: about.tier.billingInterval },
      pool: billing ? poolOf(billing) : null,
    };
  });
}

function poolOf(billing: PartnerBilling): ApiPartner["pool"] {
  if (!billing.poolUsage) return null;
  return {
    period: billing.poolUsage.periodKey,
    voice_seconds_limit: billing.pool?.voiceSeconds ?? null,
    chats_limit: billing.pool?.chats ?? null,
    voice_seconds_used: billing.poolUsage.voiceSecondsUsed,
    chats_used: billing.poolUsage.chatsUsed,
    overage_spend_cents: billing.poolUsage.overageSpendCents,
  };
}

// Businesses

/** The partner's businesses, by name, as the console lists them. A prospect demo nobody claimed is on the demos list instead. */
export async function listPartnerBusinessesForApi(context: DomainContext, subject: PartnerSubject): Promise<ApiPartnerBusinessSummary[]> {
  const rows: PartnerBusiness[] = await partnerOperation(async () => await listPartnerBusinesses(context, partnerSubjectActor(subject)));
  return rows.map((row) => ({
    id: row.businessId,
    name: row.name,
    access_level: row.accessLevel,
    onboarding_stage: row.onboardingStage,
    created_at: new Date(row.createdAt).toISOString(),
    owner: row.owner ? { email: row.owner.email, status: row.owner.status, invitation_expires_at: row.owner.status === "invited" ? new Date(row.owner.expiresAt).toISOString() : null } : null,
    usage: { period: row.usage.periodKey, voice_seconds: row.usage.voiceSeconds, chats: row.usage.chats },
    billing: row.billing ? toApiBusinessBilling(row.businessId, row.billing) : null,
  }));
}

export async function releasePartnerBusinessForApi(context: DomainContext, subject: PartnerSubject, businessId: string): Promise<ApiPartnerBusinessReleased> {
  const { ownerUserId } = await partnerOperation(async () => await releaseBusiness(context, partnerSubjectActor(subject), { businessId }));
  return { id: businessId, released: true, owner_user_id: ownerUserId };
}

export async function deletePartnerBusinessForApi(context: DomainContext, subject: PartnerSubject, businessId: string): Promise<{ id: string; deleted: true }> {
  await partnerOperation(async () => await deletePartnerBusiness(context, partnerSubjectActor(subject), { businessId }));
  return { id: businessId, deleted: true };
}

function toApiBusinessBilling(businessId: string, billing: PartnerBusinessBilling): ApiPartnerBusinessBilling {
  if (billing.kind === "outside") return { business_id: businessId, kind: "outside", package_id: null, package_name: null, status: null, overage: null };
  const { overage } = billing;
  return {
    business_id: businessId,
    kind: "package",
    package_id: billing.packageId,
    package_name: billing.packageName,
    status: billing.status,
    overage: { enabled: overage.enabled, currency: overage.currency, voice_minute_rate_minor: overage.voiceMinuteRateMinor, chat_rate_minor: overage.chatRateMinor, cap_minor: overage.capMinor },
  };
}

/** How one of the partner's businesses is billed. Another partner's business, or one that's gone, is a 404. */
export async function getPartnerBusinessBillingForApi(context: DomainContext, subject: PartnerSubject, businessId: string): Promise<ApiPartnerBusinessBilling> {
  const actor = partnerSubjectActor(subject);
  const billing = await withBusinessTransaction(context.db, { ...partnerRls(actor), actorType: "operator" }, async (tx) => {
    // The partner's keys aren't on its businesses' teams, so the database lists them.
    const listed = await tx.execute<{ business_id: string }>(sql`select business_id from app.list_partner_businesses(${actor.partnerId}::uuid) where business_id = ${businessId}::uuid`);
    if (!listed.rows.length) throw new PublicApiError(404, "not_found", "Business not found.");
    // Members never see a business's billing, as on the console's Businesses page. A key acts as an admin.
    if (await partnerActorRole(tx, actor) === "member") throw new PublicApiError(403, "forbidden", "Only the partner's owners and admins see how its businesses are billed.");
    return context.stripeConnect ? (await listPartnerBusinessBillingIn(tx, actor.partnerId)).get(businessId) : undefined;
  });
  return toApiBusinessBilling(businessId, billing ?? { kind: "outside" });
}

export async function updatePartnerBusinessBillingForApi(context: DomainContext, subject: PartnerSubject, businessId: string, body: ApiPartnerBusinessBillingUpdate): Promise<ApiPartnerBusinessBilling> {
  const actor = partnerSubjectActor(subject);
  return await partnerOperation(async () => {
    let billing: PartnerBusinessBilling | null = null;
    if (body.package_id !== undefined) billing = await setPartnerBusinessBilling(context, actor, { businessId, packageId: body.package_id });
    if (body.overage) billing = await setPartnerBusinessOverage(context, actor, { businessId, enabled: body.overage.enabled, voiceMinuteRateMinor: body.overage.voice_minute_rate_minor, chatRateMinor: body.overage.chat_rate_minor, capMinor: body.overage.cap_minor });
    return toApiBusinessBilling(businessId, billing ?? { kind: "outside" });
  });
}

// Demos

function toApiDemo(demo: PartnerDemo): ApiPartnerDemo {
  return {
    id: demo.demoId,
    business_id: demo.businessId,
    business_name: demo.businessName,
    website_url: demo.websiteUrl,
    status: demo.status,
    locale: demo.locale,
    access_level: demo.accessLevel,
    suggested_prompts: demo.suggestedPrompts,
    expires_at: demo.expiresAt.toISOString(),
    published_at: iso(demo.publishedAt),
    ready: {
      website: demo.websiteIngestionStatus === "completed" || demo.websiteIngestionStatus === "unavailable",
      greeting: demo.greetingReady,
      snapshot: demo.snapshotReady,
      prompts: demo.promptsReady,
    },
    website_status: demo.websiteIngestionStatus,
    website_error: demo.websiteIngestionError,
    usage: { period: demo.usage.periodKey, voice_seconds: demo.usage.voiceSeconds, chats: demo.usage.chats },
  };
}

export async function createPartnerDemoForApi(context: DomainContext, subject: PartnerSubject, body: ApiPartnerDemoCreate): Promise<ApiPartnerDemoCreated> {
  const created = await partnerOperation(async () => await createPartnerDemo(context, partnerSubjectActor(subject), {
    name: body.name,
    websiteUrl: body.website_url,
    ...(body.access_level ? { accessLevel: body.access_level } : {}),
    ...(body.locale ? { locale: body.locale } : {}),
    ...(body.greeting ? { greeting: body.greeting } : {}),
    ...(body.timezone ? { timezone: body.timezone } : {}),
    ...(body.suggested_prompts ? { suggestedPrompts: body.suggested_prompts } : {}),
  }));
  return { id: created.demoId, business_id: created.businessId, status: created.status, access_level: created.accessLevel, token: created.token, url: created.url };
}

export async function listPartnerDemosForApi(context: DomainContext, subject: PartnerSubject): Promise<ApiPartnerDemo[]> {
  return (await partnerOperation(async () => await listPartnerDemos(context, partnerSubjectActor(subject)))).map(toApiDemo);
}

export async function getPartnerDemoForApi(context: DomainContext, subject: PartnerSubject, demoId: string): Promise<ApiPartnerDemo> {
  const demo = (await partnerOperation(async () => await listPartnerDemos(context, partnerSubjectActor(subject)))).find((candidate) => candidate.demoId === demoId);
  if (!demo) throw new PublicApiError(404, "not_found", "Prospect demo not found.");
  return toApiDemo(demo);
}

export async function publishPartnerDemoForApi(context: DomainContext, subject: PartnerSubject, demoId: string, body: ApiPartnerDemoPublish): Promise<ApiPartnerDemoState> {
  const published = await partnerOperation(async () => await publishPartnerDemo(context, partnerSubjectActor(subject), { demoId, token: body.token, ...(body.suggested_prompts ? { suggestedPrompts: body.suggested_prompts } : {}) }));
  return { id: demoId, status: published.status, expires_at: published.expiresAt.toISOString() };
}

export async function rotatePartnerDemoLinkForApi(context: DomainContext, subject: PartnerSubject, demoId: string): Promise<ApiPartnerDemoLink> {
  const rotated = await partnerOperation(async () => await rotatePartnerDemoToken(context, partnerSubjectActor(subject), { demoId }));
  return { id: demoId, token: rotated.token, url: rotated.url };
}

export async function revokePartnerDemoForApi(context: DomainContext, subject: PartnerSubject, demoId: string): Promise<ApiPartnerDemoState> {
  await partnerOperation(async () => await revokePartnerDemo(context, partnerSubjectActor(subject), { demoId }));
  return { id: demoId, status: "revoked", expires_at: null };
}

export async function deletePartnerDemoForApi(context: DomainContext, subject: PartnerSubject, demoId: string): Promise<{ id: string; deleted: true }> {
  await partnerOperation(async () => await deletePartnerDemo(context, partnerSubjectActor(subject), { demoId }));
  return { id: demoId, deleted: true };
}

// Packages

function toApiPackage(pkg: PartnerPackage): ApiPartnerPackage {
  return {
    id: pkg.packageId,
    name: pkg.name,
    currency: pkg.currency,
    monthly_price_minor: pkg.monthlyPriceMinor,
    setup_fee_minor: pkg.setupFeeMinor,
    allowance: { voice_minutes: pkg.allowance.voiceMinutes, chats: pkg.allowance.chats },
    on_connected_account: pkg.onConnectedAccount,
    created_at: pkg.createdAt,
  };
}

export async function listPartnerPackagesForApi(context: DomainContext, subject: PartnerSubject): Promise<ApiPartnerPackage[]> {
  return (await partnerOperation(async () => await listPartnerPackages(context, partnerSubjectActor(subject)))).packages.map(toApiPackage);
}

export async function createPartnerPackageForApi(context: DomainContext, subject: PartnerSubject, body: ApiPartnerPackageCreate): Promise<ApiPartnerPackage> {
  return toApiPackage(await partnerOperation(async () => await createPartnerPackage(context, partnerSubjectActor(subject), { name: body.name, monthlyPriceMinor: body.monthly_price_minor, setupFeeMinor: body.setup_fee_minor ?? null, voiceMinutes: body.voice_minutes, chats: body.chats })));
}

export async function renamePartnerPackageForApi(context: DomainContext, subject: PartnerSubject, packageId: string, name: string): Promise<ApiPartnerPackage> {
  return toApiPackage(await partnerOperation(async () => await renamePartnerPackage(context, partnerSubjectActor(subject), { packageId, name })));
}

export async function archivePartnerPackageForApi(context: DomainContext, subject: PartnerSubject, packageId: string): Promise<{ id: string; deleted: true }> {
  await partnerOperation(async () => await archivePartnerPackage(context, partnerSubjectActor(subject), { packageId }));
  return { id: packageId, deleted: true };
}

// Brand and domains

function toApiBrand(brand: PartnerBrandSettings): ApiPartnerBrand {
  return {
    name: brand.name,
    subdomain: brand.subdomain,
    subdomain_url: brand.subdomainUrl,
    logo_url: brand.logoUrl,
    favicon_url: brand.faviconUrl,
    color: brand.color,
    terms_url: brand.termsUrl,
    privacy_url: brand.privacyUrl,
    support_url: brand.supportUrl,
    support_email: brand.supportEmail,
  };
}

export async function getPartnerBrandForApi(context: DomainContext, subject: PartnerSubject): Promise<ApiPartnerBrand> {
  return toApiBrand(await partnerOperation(async () => await getPartnerBrandSettings(context, partnerSubjectActor(subject))));
}

/** Saves the fields sent over the brand as it is. An image left out stays, and null removes it. */
export async function updatePartnerBrandForApi(context: DomainContext, subject: PartnerSubject, body: ApiPartnerBrandUpdate): Promise<ApiPartnerBrand> {
  const actor = partnerSubjectActor(subject);
  return toApiBrand(await partnerOperation(async () => {
    const current = await getPartnerBrandSettings(context, actor);
    const image = (value: string | null | undefined) => (value === undefined ? undefined : value === null ? null : Buffer.from(value, "base64"));
    const logo = image(body.logo);
    const favicon = image(body.favicon);
    return await savePartnerBrand(context, actor, {
      name: body.name ?? current.name,
      color: body.color === undefined ? current.color : body.color,
      termsUrl: body.terms_url === undefined ? current.termsUrl : body.terms_url,
      privacyUrl: body.privacy_url === undefined ? current.privacyUrl : body.privacy_url,
      supportUrl: body.support_url === undefined ? current.supportUrl : body.support_url,
      supportEmail: body.support_email === undefined ? current.supportEmail : body.support_email,
      ...(logo === undefined ? {} : { logo }),
      ...(favicon === undefined ? {} : { favicon }),
    });
  }));
}

function toApiDomains(domains: PartnerDomains): ApiPartnerDomains {
  const { custom } = domains;
  return {
    subdomain: domains.subdomain,
    subdomain_url: domains.subdomainUrl,
    custom_domains: domains.customDomains,
    custom: custom ? { hostname: custom.hostname, status: custom.status, records: custom.records, errors: custom.errors, checked_at: custom.checkedAt, url: custom.url, taken: custom.taken } : null,
  };
}

export async function getPartnerDomainsForApi(context: DomainContext, subject: PartnerSubject): Promise<ApiPartnerDomains> {
  return toApiDomains(await partnerOperation(async () => await getPartnerDomains(context, partnerSubjectActor(subject))));
}

export async function addPartnerDomainForApi(context: DomainContext, subject: PartnerSubject, hostname: string): Promise<ApiPartnerDomains> {
  return toApiDomains(await partnerOperation(async () => await addPartnerCustomDomain(context, partnerSubjectActor(subject), { hostname })));
}

export async function removePartnerDomainForApi(context: DomainContext, subject: PartnerSubject): Promise<ApiPartnerDomains> {
  return toApiDomains(await partnerOperation(async () => await removePartnerCustomDomain(context, partnerSubjectActor(subject))));
}

// Templates

function toApiTemplate(template: PartnerTemplate): ApiPartnerTemplate {
  return { id: template.templateId, name: template.name, created_at: template.createdAt, manifest: template.template as unknown as Record<string, unknown> };
}

export async function listPartnerTemplatesForApi(context: DomainContext, subject: PartnerSubject): Promise<ApiPartnerTemplate[]> {
  return (await partnerOperation(async () => await listBusinessTemplates(context, partnerSubjectActor(subject)))).map(toApiTemplate);
}

export async function createPartnerTemplateForApi(context: DomainContext, subject: PartnerSubject, body: { business_id: string; name: string }, dependencies: Pick<BusinessSetupDependencies, "storage">): Promise<ApiPartnerTemplate> {
  return toApiTemplate(await partnerOperation(async () => await saveBusinessTemplate(context, partnerSubjectActor(subject), { businessId: body.business_id, name: body.name }, dependencies)));
}

export async function deletePartnerTemplateForApi(context: DomainContext, subject: PartnerSubject, templateId: string): Promise<{ id: string; deleted: true }> {
  await partnerOperation(async () => await deleteBusinessTemplate(context, partnerSubjectActor(subject), { templateId }));
  return { id: templateId, deleted: true };
}

// Team

function toApiTeam(team: PartnerTeam): ApiPartnerTeam {
  return {
    members: team.members.map((member) => ({ id: member.memberId, user_id: member.userId, name: member.name, email: member.email, role: member.role, joined_at: member.joinedAt })),
    invitations: team.invitations.map((invitation) => ({ id: invitation.invitationId, email: invitation.email, role: invitation.role, expires_at: invitation.expiresAt.toISOString(), invited_at: invitation.invitedAt.toISOString() })),
  };
}

export async function getPartnerTeamForApi(context: DomainContext, subject: PartnerSubject): Promise<ApiPartnerTeam> {
  return toApiTeam(await partnerOperation(async () => await listPartnerTeam(context, partnerSubjectActor(subject))));
}

export async function createPartnerTeamInvitationForApi(context: DomainContext, subject: PartnerSubject, body: ApiPartnerTeamInvitationCreate): Promise<ApiPartnerTeamInvitation> {
  const actor = partnerSubjectActor(subject);
  return await partnerOperation(async () => {
    const invited = await invitePartnerMember(context, actor, { email: body.email, role: body.role });
    const invitation = (await listPartnerTeam(context, actor)).invitations.find((candidate) => candidate.invitationId === invited.invitationId);
    if (!invitation) throw new Error("The invitation could not be read back.");
    return { id: invitation.invitationId, email: invitation.email, role: invitation.role, expires_at: invitation.expiresAt.toISOString(), invited_at: invitation.invitedAt.toISOString() };
  });
}

export async function revokePartnerTeamInvitationForApi(context: DomainContext, subject: PartnerSubject, invitationId: string): Promise<{ id: string; deleted: true }> {
  await partnerOperation(async () => await revokePartnerInvitation(context, partnerSubjectActor(subject), { invitationId }));
  return { id: invitationId, deleted: true };
}

export async function updatePartnerTeamMemberForApi(context: DomainContext, subject: PartnerSubject, memberId: string, role: "admin" | "member"): Promise<ApiPartnerTeamMember> {
  const actor = partnerSubjectActor(subject);
  return await partnerOperation(async () => {
    await changePartnerMemberRole(context, actor, { memberId, role });
    const member = toApiTeam(await listPartnerTeam(context, actor)).members.find((candidate) => candidate.id === memberId);
    if (!member) throw new PublicApiError(404, "not_found", "Member not found.");
    return member;
  });
}

export async function removePartnerTeamMemberForApi(context: DomainContext, subject: PartnerSubject, memberId: string): Promise<{ id: string; deleted: true }> {
  await partnerOperation(async () => await removePartnerMember(context, partnerSubjectActor(subject), { memberId }));
  return { id: memberId, deleted: true };
}

// Payments and billing

/** Where the console's pages live for the partner: its own domain, as its brand says. */
async function partnerConsoleOrigin(context: DomainContext, partnerId: string): Promise<string> {
  const brand = await brandForHostReference(context, { kind: "partner", partnerId });
  if (!brand) throw new PublicApiError(404, "not_found", "Partner not found.");
  return brand.origin;
}

function toApiStripe(connection: PartnerStripeConnection): ApiPartnerStripeConnection {
  return {
    configured: connection.configured,
    status: connection.status,
    account_id: connection.accountId,
    country: connection.country,
    currency: connection.currency,
    details_submitted: connection.detailsSubmitted,
    charges_enabled: connection.chargesEnabled,
    payouts_enabled: connection.payoutsEnabled,
    disconnected_at: connection.disconnectedAt,
  };
}

export async function getPartnerStripeForApi(context: DomainContext, subject: PartnerSubject, options: { refresh?: boolean } = {}): Promise<ApiPartnerStripeConnection> {
  return toApiStripe(await partnerOperation(async () => await getPartnerStripeConnection(context, partnerSubjectActor(subject), options)));
}

/** Stripe brings the owner back to the console's Payments page, on the partner's domain. */
export async function createPartnerStripeOnboardingLinkForApi(context: DomainContext, subject: PartnerSubject, body: { country?: string | undefined }): Promise<ApiPartnerLink> {
  const page = `${await partnerConsoleOrigin(context, subject.partnerId)}/partner/${subject.partnerId.toLowerCase()}/payments`;
  const { url } = await partnerOperation(async () => await startPartnerStripeOnboarding(context, partnerSubjectActor(subject), { country: body.country ?? null, returnUrl: `${page}?onboarding=return`, refreshUrl: `${page}?onboarding=refresh` }));
  return { url };
}

export async function getPartnerBillingForApi(context: DomainContext, subject: PartnerSubject): Promise<ApiPartnerBilling> {
  const billing = await partnerOperation(async () => await getPartnerBilling(context, partnerSubjectActor(subject)));
  return {
    billed: billing.billed,
    tier: billing.tier,
    interval: billing.billingInterval,
    subscription_state: billing.subscriptionState,
    current_period_end: billing.currentPeriodEnd,
    ends_at: billing.endsAt,
    included_numbers: billing.includedNumbers,
    trial_numbers: billing.trialNumbers,
    numbers_held: billing.numbersHeld,
    pool: poolOf(billing) ?? (billing.pool ? { period: periodKeyFor(), voice_seconds_limit: billing.pool.voiceSeconds, chats_limit: billing.pool.chats, voice_seconds_used: 0, chats_used: 0, overage_spend_cents: 0 } : null),
    pool_overage: { enabled: billing.poolOverage.enabled, cap_cents: billing.poolOverage.capCents, billed: billing.poolOverage.billed },
  };
}

export async function updatePartnerPoolOverageForApi(context: DomainContext, subject: PartnerSubject, body: ApiPartnerPoolOverageUpdate): Promise<ApiPartnerPoolOverage> {
  const overage = await partnerOperation(async () => await setPartnerPoolOverage(context, partnerSubjectActor(subject), { enabled: body.enabled, capCents: body.cap_cents ?? null }));
  return { enabled: overage.enabled, cap_cents: overage.capCents, billed: overage.billed };
}

function toApiTierCheckout(checkout: PartnerTierCheckout): ApiPartnerTierCheckout {
  return { id: checkout.requestId, tier: checkout.tier, interval: checkout.billingInterval, status: checkout.status, checkout_url: checkout.checkoutUrl, synced: checkout.synced };
}

/** Polar brings the owner back to the console they'd start a checkout from: the partner's own domain. */
export async function createPartnerTierCheckoutForApi(context: DomainContext, subject: PartnerSubject, body: ApiPartnerTierCheckoutCreate): Promise<ApiPartnerTierCheckout> {
  const actor = partnerSubjectActor(subject);
  const returnOrigin = await partnerConsoleOrigin(context, subject.partnerId);
  return await partnerOperation(async () => {
    const { requestId } = await createPartnerTierCheckout(context, actor, { tier: body.tier, billingInterval: body.interval, returnOrigin });
    return toApiTierCheckout(await getPartnerTierCheckout(context, actor, { requestId }));
  });
}

export async function getPartnerTierCheckoutForApi(context: DomainContext, subject: PartnerSubject, checkoutId: string): Promise<ApiPartnerTierCheckout> {
  return toApiTierCheckout(await partnerOperation(async () => await getPartnerTierCheckout(context, partnerSubjectActor(subject), { requestId: checkoutId })));
}

// Idempotency

/** How long a request that holds an Idempotency-Key may run before a retry may take the key over, as after a crash. */
const PARTNER_IDEMPOTENCY_STALE_MS = 15 * 60_000;

/**
 * Runs a Partner endpoint once per Idempotency-Key, which a partner's key
 * scopes to itself and the operation. A partner operation runs its own
 * transactions and may call Stripe, so the key is held in one transaction,
 * the operation runs, and its response is stored in another. A retry while
 * the first request runs is a 409, and once it finished, a replay of its
 * response. A request that failed leaves nothing, so a retry runs again. One
 * whose process died is taken over after 15 minutes.
 */
export async function runPartnerIdempotent(
  context: DomainContext,
  input: { key: PartnerPlatformKey; operation: string; idempotencyKey: string; requestHash: string },
  run: () => Promise<{ status: number; body: unknown }>,
): Promise<{ replayed: boolean; response: { status: number; body: unknown } }> {
  const rls = { platformKeyId: input.key.platformKeyId, actorType: "operator" as const };
  const scope = `partner-api:${input.key.platformKeyId}:${input.operation}`.slice(0, 120);
  const match = and(eq(partnerApiIdempotencyKeys.partnerId, input.key.partnerId), eq(partnerApiIdempotencyKeys.scope, scope), eq(partnerApiIdempotencyKeys.key, input.idempotencyKey));
  const held = await withBusinessTransaction(context.db, rls, async (tx) => {
    await tx.delete(partnerApiIdempotencyKeys).where(and(match, lt(partnerApiIdempotencyKeys.createdAt, new Date(Date.now() - PUBLIC_API_IDEMPOTENCY_TTL_HOURS * 3_600_000))));
    const [inserted] = await tx.insert(partnerApiIdempotencyKeys).values({ partnerId: input.key.partnerId, scope, key: input.idempotencyKey, requestHash: input.requestHash }).onConflictDoNothing().returning({ id: partnerApiIdempotencyKeys.id });
    if (inserted) return { id: inserted.id };
    const [existing] = await tx.select().from(partnerApiIdempotencyKeys).where(match).limit(1).for("update");
    // RLS hides another partner's record, which never shares a scope with this key's anyway.
    if (!existing) throw new PublicApiError(409, "idempotency_request_in_progress", "A request with this Idempotency-Key is still running. Retry shortly.");
    if (existing.requestHash !== input.requestHash) throw new PublicApiError(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request body.");
    if (existing.status === "completed" && existing.response) return { replay: existing.response };
    if (existing.updatedAt.getTime() > Date.now() - PARTNER_IDEMPOTENCY_STALE_MS) throw new PublicApiError(409, "idempotency_request_in_progress", "A request with this Idempotency-Key is still running. Retry shortly.");
    await tx.update(partnerApiIdempotencyKeys).set({ updatedAt: new Date() }).where(eq(partnerApiIdempotencyKeys.id, existing.id));
    return { id: existing.id };
  });
  if ("replay" in held) return { replayed: true, response: held.replay };
  let response: { status: number; body: unknown };
  try {
    response = await run();
  } catch (error) {
    await withBusinessTransaction(context.db, rls, async (tx) => { await tx.delete(partnerApiIdempotencyKeys).where(eq(partnerApiIdempotencyKeys.id, held.id)); }).catch(() => undefined);
    throw error;
  }
  await withBusinessTransaction(context.db, rls, async (tx) => {
    await tx.update(partnerApiIdempotencyKeys).set({ status: "completed", response, updatedAt: new Date() }).where(eq(partnerApiIdempotencyKeys.id, held.id));
  });
  return { replayed: false, response };
}
