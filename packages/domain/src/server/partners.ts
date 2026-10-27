import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNotNull, isNull, ne, notInArray, or, sql } from "drizzle-orm";

import { auditLogs, billingAccounts, businesses, businessInvitations, businessMemberships, enqueueOutbox, outboxMessages, partnerDomains, partnerInvitations, partnerMembers, partners, partnerSignupInvitations, phoneNumbers, storageObjects, webhookEndpoints, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import {
  brandLogoContentType,
  currentPartnerSubdomain,
  HOST_EMAIL_BRAND,
  hostDomainHostnames,
  isPartnerAccessLevel,
  isPartnerRole,
  isPartnerSlug,
  isUuid,
  MAX_BRAND_LOGO_BYTES,
  normalizeAuthEmail,
  normalizeBrandColor,
  normalizeEmailAddress,
  normalizePageUrl,
  normalizePartnerName,
  PARTNER_LINK_MAX_LENGTH,
  PARTNER_NAME_MAX_LENGTH,
  PARTNER_SLUG_MAX_LENGTH,
  partnerBrandImageUrl,
  partnerFeatures,
  partnerOrigin,
  partnerSlugFromName,
  type BrandImage,
  type EmailBrandReference,
  type PartnerAccessLevel,
  type PartnerRole,
} from "@lobbystack/shared";

import { AuthorizationError } from "../authz";
import { announceBrandChange } from "./brands";
import { applyStoredBusinessTemplate, loadBusinessTemplateInTransaction, type BusinessSetupDependencies } from "./businessTemplates";
import type { DomainContext } from "./context";
import { firstOnboardingStage } from "./onboarding";
import { closeCheckoutQuietly, dropBusinessPackageInTransaction, endLifecycleBusinessBillingInTransaction, listPartnerBusinessBillingIn, lockBusinessBillingAccount, setBusinessPackageInTransaction, type OpenCheckout, type PartnerBusinessBilling } from "./packageBilling";
import { lockBusinessNumberClaims } from "./phoneNumbers";
import { lockActivePartnerPlatformKey } from "./publicApi/platformKeys";
import { isSharedSmsSender } from "./smsSender";
import { ianaTimeZone, insertInvitationInTransaction, insertOwnerlessBusinessInTransaction, isPartnerMemberEmail, isSingleEmailAddress, lockBusinessTeam } from "./tenancy";
import { POOL_ALERT_AGGREGATE } from "./partnerPoolAlerts";
import { periodKeyFor } from "./usage";

// Partner operations: what the partner console and a partner's platform
// keys can do. Each function checks the actor's role itself, so every entry
// point gets the same rules. A member works inside the partner's businesses,
// an admin also creates businesses and runs the team, and only an owner grants
// or takes away the owner role. A key acts as the partner: it creates
// businesses, and manages nothing about the partner itself.

/** Who acts on a partner: one of its members, or one of its platform keys. */
export type PartnerActor =
  | { kind: "member"; partnerId: string; userId: string; role: PartnerRole }
  | { kind: "key"; partnerId: string; platformKeyId: string };

export type PartnerMemberActor = Extract<PartnerActor, { kind: "member" }>;

/** A partner as its member sees it in the console. */
export type PartnerSummary = { partnerId: string; name: string; slug: string; role: PartnerRole; subdomain: string | null };

export type PartnerTeam = {
  /** The actor's own role, read with the team. */
  role: PartnerRole;
  members: Array<{ memberId: string; userId: string; name: string | null; email: string; role: PartnerRole; joinedAt: string }>;
  invitations: Array<{ invitationId: string; email: string; role: PartnerRole; expiresAt: Date; invitedAt: Date }>;
};

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function failure(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

const subdomainTaken = () => failure("That subdomain is taken. Choose another.", 409, "subdomain_taken");
const invalidName = () => failure(`Enter the partner's name, up to ${PARTNER_NAME_MAX_LENGTH} characters.`, 400, "invalid_name");
const invitationInvalid = () => failure("This invitation link is invalid or expired.", 409, "invitation_invalid");
const wrongAccount = () => failure("Sign in with the verified email address this invitation was sent to.", 403, "wrong_account");

/** How a link's token is stored: only its SHA-256 is kept, so a database leak can't be used to accept anything. */
export function hashPartnerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPartnerToken(token) };
}

function appOrigin(): string {
  return (process.env.APP_BASE_URL?.trim() || "http://localhost").replace(/\/$/, "");
}

/** Where a team invitation sends its recipient: the console's accept page on the host's domain. */
export function partnerInvitationUrl(token: string): string {
  return `${appOrigin()}/partner/accept-invite?token=${encodeURIComponent(token)}`;
}

/** Where the host's signup invitation sends a company it lets in while signup is invite-only. */
export function partnerSignupInvitationUrl(token: string): string {
  return `${appOrigin()}/partner/signup?invitation=${encodeURIComponent(token)}`;
}

/**
 * The labels the host's own hostnames take directly under the partner base
 * domain, such as app for app.example.com under example.com, so no partner's
 * subdomain lands on them. The host's own domain always gets the host brand.
 */
function hostLabelsUnder(baseDomain: string): Set<string> {
  const suffix = `.${baseDomain}`;
  return new Set([...hostDomainHostnames(process.env)].filter((host) => host.endsWith(suffix)).map((host) => host.slice(0, -suffix.length).split(".").at(-1)!));
}

/**
 * The lock every change to a partner's team takes: sending and revoking
 * invitations, role changes, removals and accepting an invitation. Taken
 * first, it keeps the last owner from being demoted or removed twice at once.
 */
async function lockPartnerTeam(tx: DatabaseTransaction, partnerId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('partner-team:' || ${partnerId}::uuid::text, 0))`);
}

/** The actor's role as the database has it now, which may differ from the one it arrived with. */
async function currentRole(tx: DatabaseTransaction, actor: PartnerActor): Promise<PartnerRole> {
  if (actor.kind !== "member") throw new AuthorizationError("Platform keys can't manage a partner's team.");
  const [member] = await tx.select({ role: partnerMembers.role }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, actor.partnerId), eq(partnerMembers.userId, actor.userId), eq(partnerMembers.status, "active"))).limit(1);
  if (!member) throw new AuthorizationError("You aren't on this partner's team.");
  return member.role;
}

async function requireTeamManager(tx: DatabaseTransaction, actor: PartnerActor): Promise<PartnerRole> {
  const role = await currentRole(tx, actor);
  if (role === "member") throw new AuthorizationError("Only owners and admins can manage the team.");
  return role;
}

function requireOwner(role: PartnerRole, message: string): void {
  if (role !== "owner") throw failure(message, 403, "owner_only");
}

/** Whether the partner has one active owner or none left. The caller holds the team lock. */
async function isFinalOwner(tx: DatabaseTransaction, partnerId: string): Promise<boolean> {
  const owners = await tx.select({ id: partnerMembers.id }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, partnerId), eq(partnerMembers.role, "owner"), eq(partnerMembers.status, "active")));
  return owners.length <= 1;
}

/**
 * Throws unless a team update changed a row. Under the team lock the row was
 * just read, so nothing changed only when row-level security refused it,
 * which must not pass for success.
 */
function requireChanged(rows: unknown[]): void {
  if (rows.length === 0) throw new AuthorizationError("You can't change this partner's team.");
}

function memberActor(actor: PartnerActor): PartnerMemberActor {
  if (actor.kind !== "member") throw new AuthorizationError("Platform keys can't manage a partner's team.");
  return actor;
}

/** The partners whose team the person is on, by name. A person can be on several. */
/**
 * Whether the partner released a business the person still owns, which runs
 * on the host's dashboard now. A direct customer who signs in on a partner's
 * domain has no such business, so the partner's domain doesn't send them on.
 */
export async function partnerReleasedBusinessTo(context: DomainContext, input: { userId: string; partnerId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { userId: input.userId, actorType: "operator" }, async (tx) => (await tx.execute<{ released: boolean }>(sql`select app.partner_released_business_to_me(${input.partnerId}::uuid) as released`)).rows[0]?.released === true);
}

export async function listUserPartners(context: DomainContext, userId: string): Promise<PartnerSummary[]> {
  return await withBusinessTransaction(context.db, { userId, actorType: "operator" }, async (tx) => await tx
    .select({ partnerId: partners.id, name: partners.name, slug: partners.slug, role: partnerMembers.role, subdomain: partnerDomains.hostname })
    .from(partnerMembers)
    .innerJoin(partners, eq(partners.id, partnerMembers.partnerId))
    .leftJoin(partnerDomains, and(eq(partnerDomains.partnerId, partners.id), eq(partnerDomains.kind, "subdomain")))
    .where(and(eq(partnerMembers.userId, userId), eq(partnerMembers.status, "active")))
    .orderBy(asc(partners.name), asc(partners.id)));
}

/** The person as an actor on the partner, or a 404 when they aren't on its team, so nobody learns which partners exist. */
export async function resolvePartnerActor(context: DomainContext, input: { userId: string; partnerId: string }): Promise<PartnerMemberActor> {
  return await withBusinessTransaction(context.db, { userId: input.userId, actorType: "operator" }, async (tx) => {
    const [member] = await tx.select({ role: partnerMembers.role }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, input.partnerId), eq(partnerMembers.userId, input.userId), eq(partnerMembers.status, "active"))).limit(1);
    if (!member) throw failure("Partner not found.", 404, "partner_not_found");
    return { kind: "member", partnerId: input.partnerId, userId: input.userId, role: member.role };
  });
}

/**
 * Signs a company up as a partner: creates the partner, makes the person
 * signing up its owner, and reserves its subdomain of the partner base domain
 * when the deployment has one. While signup is invite-only it needs the host's
 * invitation, for the verified email it names, and uses it up. A subdomain the
 * person chose that's taken is refused; one made from the name gets a suffix.
 */
export async function signUpPartner(
  context: DomainContext,
  input: { userId: string; email: string | null | undefined; emailVerified: boolean | null | undefined; name: string; subdomain?: string | undefined; invitationTokenHash?: string | undefined },
): Promise<{ partnerId: string; slug: string; subdomain: string | null }> {
  const name = normalizePartnerName(input.name);
  if (!name) throw invalidName();
  const chosen = input.subdomain?.trim().toLowerCase() || undefined;
  if (chosen !== undefined && !isPartnerSlug(chosen)) throw failure("A subdomain has 3 to 40 lowercase letters, digits and hyphens, and can't be one the host keeps.", 400, "invalid_subdomain");
  const features = partnerFeatures(process.env);
  if (features.signup === "invite" && !input.invitationTokenHash) throw failure("Partner signup is by invitation only.", 403, "invitation_required");
  const hostLabels = features.baseDomain ? hostLabelsUnder(features.baseDomain) : new Set<string>();
  if (chosen && hostLabels.has(chosen)) throw subdomainTaken();

  const signedUp = await withBusinessTransaction(context.db, { userId: input.userId, actorType: "system" }, async (tx) => {
    let invitationId: string | undefined;
    if (features.signup === "invite") {
      const [invitation] = await tx.select().from(partnerSignupInvitations).where(eq(partnerSignupInvitations.tokenHash, input.invitationTokenHash!)).limit(1).for("update");
      if (!invitation || invitation.status !== "pending" || invitation.expiresAt <= new Date()) throw invitationInvalid();
      // A forwarded or leaked link must not let a different account in.
      if (!input.emailVerified || !input.email || normalizeAuthEmail(input.email) !== invitation.normalizedEmail) throw wrongAccount();
      invitationId = invitation.id;
    }

    const partnerId = randomUUID();
    const base = partnerSlugFromName(name);
    let slug: string | undefined;
    // A chosen subdomain gets one try. One made from the name tries a few suffixes before giving up.
    for (let attempt = 0; attempt < (chosen ? 1 : 6) && !slug; attempt++) {
      const suffix = randomBytes(3).toString("hex");
      const candidate = chosen ?? (attempt === 0 && base ? base : `${(base || "partner").slice(0, PARTNER_SLUG_MAX_LENGTH - 7).replace(/-+$/, "")}-${suffix}`);
      if (hostLabels.has(candidate)) continue;
      const [created] = await tx.insert(partners).values({ id: partnerId, name, slug: candidate, createdByUserId: input.userId }).onConflictDoNothing({ target: partners.slug }).returning({ slug: partners.slug });
      slug = created?.slug;
    }
    if (!slug) throw subdomainTaken();
    await tx.insert(partnerMembers).values({ partnerId, userId: input.userId, role: "owner" });

    let subdomain: string | null = null;
    if (features.baseDomain) {
      subdomain = `${slug}.${features.baseDomain}`;
      // A hostname is unique only among verified domains, so a partner's pending claim on its own domain is looked for too.
      const [claimed] = await tx.select({ id: partnerDomains.id }).from(partnerDomains).where(eq(partnerDomains.hostname, subdomain)).limit(1);
      if (claimed) throw subdomainTaken();
      const [reserved] = await tx.insert(partnerDomains).values({ partnerId, hostname: subdomain, kind: "subdomain", verifiedAt: new Date() }).onConflictDoNothing().returning({ id: partnerDomains.id });
      if (!reserved) throw subdomainTaken();
    }
    if (invitationId) {
      const [claimed] = await tx.update(partnerSignupInvitations).set({ status: "accepted", acceptedByUserId: input.userId, partnerId, acceptedAt: new Date(), updatedAt: new Date() }).where(and(eq(partnerSignupInvitations.id, invitationId), eq(partnerSignupInvitations.status, "pending"))).returning({ id: partnerSignupInvitations.id });
      if (!claimed) throw invitationInvalid();
    }
    return { partnerId, slug, subdomain };
  });
  // A process may have cached the new subdomain as a hostname nobody has.
  if (signedUp.subdomain) await announceBrandChange(context, { kind: "partner", partnerId: signedUp.partnerId });
  return signedUp;
}

/** What the signup page says about the host's invitation in its link, or null when the link names none. */
export async function previewPartnerSignupInvitation(context: DomainContext, input: { tokenHash: string }): Promise<{ email: string; status: string; expired: boolean } | null> {
  return await withBusinessTransaction(context.db, { actorType: "system" }, async (tx) => {
    const [invitation] = await tx.select({ email: partnerSignupInvitations.email, status: partnerSignupInvitations.status, expiresAt: partnerSignupInvitations.expiresAt }).from(partnerSignupInvitations).where(eq(partnerSignupInvitations.tokenHash, input.tokenHash)).limit(1);
    return invitation ? { email: invitation.email, status: invitation.status, expired: invitation.expiresAt <= new Date() } : null;
  });
}

/** The host lets a company sign up as a partner while signup is invite-only. The link works once, for this email, for 7 days. */
export async function createPartnerSignupInvitation(context: DomainContext, input: { email: string }): Promise<{ invitationId: string; url: string; expiresAt: Date }> {
  const normalizedEmail = normalizeAuthEmail(input.email);
  if (!isSingleEmailAddress(normalizedEmail)) throw failure("Enter one valid email address.", 400, "invalid_email");
  const { token, tokenHash } = newToken();
  const invitationId = randomUUID();
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
  await withBusinessTransaction(context.db, { actorType: "system" }, async (tx) => {
    await tx.insert(partnerSignupInvitations).values({ id: invitationId, email: normalizedEmail, normalizedEmail, tokenHash, expiresAt });
  });
  return { invitationId, url: partnerSignupInvitationUrl(token), expiresAt };
}

/** The partner's active members and pending invitations. Anyone on the team can read it. */
export async function listPartnerTeam(context: DomainContext, actor: PartnerActor): Promise<PartnerTeam> {
  const member = memberActor(actor);
  return await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => {
    const role = await currentRole(tx, member);
    // RLS hides other people's users rows from the app role, so read members through this function.
    const members = await tx.execute<PartnerTeam["members"][number]>(sql`select member_id as "memberId", user_id as "userId", name, email, role, joined_at as "joinedAt" from app.list_partner_members(${member.partnerId}::uuid)`);
    const invitations = await tx.select({ invitationId: partnerInvitations.id, email: partnerInvitations.email, role: partnerInvitations.role, expiresAt: partnerInvitations.expiresAt, invitedAt: partnerInvitations.createdAt }).from(partnerInvitations).where(and(eq(partnerInvitations.partnerId, member.partnerId), eq(partnerInvitations.status, "pending"))).orderBy(asc(partnerInvitations.createdAt));
    // Raw queries return Postgres timestamp text, which Safari's Date can't parse.
    return { role, members: members.rows.map((row) => ({ ...row, joinedAt: new Date(row.joinedAt).toISOString() })), invitations };
  });
}

/**
 * Invites someone to the partner's team and queues the invitation email under
 * the partner's brand. Owners and admins invite admins and members; only an
 * owner invites an owner.
 */
export async function invitePartnerMember(context: DomainContext, actor: PartnerActor, input: { email: string; role: string }): Promise<{ invitationId: string; expiresAt: Date }> {
  const normalizedEmail = normalizeAuthEmail(input.email);
  if (!isSingleEmailAddress(normalizedEmail)) throw failure("Enter one valid email address.", 400, "invalid_email");
  const role = input.role;
  if (!isPartnerRole(role)) throw failure("role must be owner, admin or member.", 400, "invalid_role");
  const member = memberActor(actor);
  // The email belongs to no business, so it's queued as the system actor.
  return await withBusinessTransaction(context.db, { userId: member.userId, actorType: "system" }, async (tx) => {
    await lockPartnerTeam(tx, member.partnerId);
    const actorRole = await requireTeamManager(tx, member);
    if (role === "owner") requireOwner(actorRole, "Only owners can invite an owner.");
    const { token, tokenHash } = newToken();
    const invitationId = randomUUID();
    const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
    await tx.insert(partnerInvitations).values({ id: invitationId, partnerId: member.partnerId, invitedByUserId: member.userId, email: normalizedEmail, normalizedEmail, role, tokenHash, expiresAt });
    await enqueueOutbox(tx, {
      topic: "email.send",
      aggregateType: "partner_invitation",
      aggregateId: invitationId,
      dedupeKey: `partner-invitation:${invitationId}:send`,
      // The worker writes the email under the partner's brand when it sends.
      payload: { invitationId, email: normalizedEmail, template: "invitation", url: partnerInvitationUrl(token), variables: { url: partnerInvitationUrl(token) }, brand: { kind: "partner", partnerId: member.partnerId } satisfies EmailBrandReference, replyTo: null },
    });
    return { invitationId, expiresAt };
  });
}

/** Changes an active member's role. Only an owner makes someone an owner or changes an owner's role, and a partner always keeps an owner. */
export async function changePartnerMemberRole(context: DomainContext, actor: PartnerActor, input: { memberId: string; role: string }): Promise<void> {
  const role = input.role;
  if (!isPartnerRole(role)) throw failure("role must be owner, admin or member.", 400, "invalid_role");
  const member = memberActor(actor);
  await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => {
    await lockPartnerTeam(tx, member.partnerId);
    const actorRole = await requireTeamManager(tx, member);
    const [target] = await tx.select({ role: partnerMembers.role }).from(partnerMembers).where(and(eq(partnerMembers.id, input.memberId), eq(partnerMembers.partnerId, member.partnerId), eq(partnerMembers.status, "active"))).limit(1);
    if (!target) throw failure("Member not found.", 404, "not_found");
    if (target.role === "owner" || role === "owner") requireOwner(actorRole, "Only owners can make someone an owner or change an owner's role.");
    if (target.role === role) return;
    if (target.role === "owner" && await isFinalOwner(tx, member.partnerId)) throw failure("A partner always keeps at least one owner.", 409, "final_owner");
    requireChanged(await tx.update(partnerMembers).set({ role, updatedAt: new Date() }).where(and(eq(partnerMembers.id, input.memberId), eq(partnerMembers.partnerId, member.partnerId), eq(partnerMembers.status, "active"))).returning({ id: partnerMembers.id }));
  });
}

/**
 * Takes a member off the partner's team, with the pending invitations they
 * sent (they hold the links) or received, either of which would let them back
 * in. Only an owner removes an owner, and never the last one.
 */
export async function removePartnerMember(context: DomainContext, actor: PartnerActor, input: { memberId: string }): Promise<void> {
  const member = memberActor(actor);
  await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => {
    await lockPartnerTeam(tx, member.partnerId);
    const actorRole = await requireTeamManager(tx, member);
    const [target] = await tx.select({ role: partnerMembers.role, userId: partnerMembers.userId }).from(partnerMembers).where(and(eq(partnerMembers.id, input.memberId), eq(partnerMembers.partnerId, member.partnerId), eq(partnerMembers.status, "active"))).limit(1);
    if (!target) throw failure("Member not found.", 404, "not_found");
    if (target.role === "owner") {
      requireOwner(actorRole, "Only owners can remove an owner.");
      if (await isFinalOwner(tx, member.partnerId)) throw failure("A partner always keeps at least one owner.", 409, "final_owner");
    }
    // RLS hides the member's users row from the app role; this function returns their email.
    const email = (await tx.execute<{ email: string }>(sql`select email from app.list_partner_members(${member.partnerId}::uuid) where member_id = ${input.memberId}::uuid`)).rows[0]?.email;
    requireChanged(await tx.update(partnerMembers).set({ status: "removed", updatedAt: new Date() }).where(and(eq(partnerMembers.id, input.memberId), eq(partnerMembers.partnerId, member.partnerId), eq(partnerMembers.status, "active"))).returning({ id: partnerMembers.id }));
    await tx.update(partnerInvitations).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(partnerInvitations.partnerId, member.partnerId), eq(partnerInvitations.status, "pending"), or(eq(partnerInvitations.invitedByUserId, target.userId), email ? eq(partnerInvitations.normalizedEmail, normalizeAuthEmail(email)) : undefined)));
  });
}

/** Revokes a pending invitation to the team. Only an owner revokes an invitation to become an owner. */
export async function revokePartnerInvitation(context: DomainContext, actor: PartnerActor, input: { invitationId: string }): Promise<void> {
  const member = memberActor(actor);
  await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => {
    await lockPartnerTeam(tx, member.partnerId);
    const actorRole = await requireTeamManager(tx, member);
    const [invitation] = await tx.select({ role: partnerInvitations.role }).from(partnerInvitations).where(and(eq(partnerInvitations.id, input.invitationId), eq(partnerInvitations.partnerId, member.partnerId), eq(partnerInvitations.status, "pending"))).limit(1);
    if (!invitation) throw failure("Invitation not found or already resolved.", 409, "invitation_resolved");
    if (invitation.role === "owner") requireOwner(actorRole, "Only owners can revoke an invitation to become an owner.");
    requireChanged(await tx.update(partnerInvitations).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(partnerInvitations.id, input.invitationId), eq(partnerInvitations.status, "pending"))).returning({ id: partnerInvitations.id }));
  });
}

/** What the accept page says about a team invitation, whatever its state, or null when the link names none. */
export async function previewPartnerInvitation(context: DomainContext, input: { tokenHash: string }): Promise<{ partnerName: string; email: string; role: PartnerRole; status: string; expired: boolean } | null> {
  return await withBusinessTransaction(context.db, { actorType: "system" }, async (tx) => {
    const [invitation] = await tx.select({ partnerName: partners.name, email: partnerInvitations.email, role: partnerInvitations.role, status: partnerInvitations.status, expiresAt: partnerInvitations.expiresAt }).from(partnerInvitations).innerJoin(partners, eq(partners.id, partnerInvitations.partnerId)).where(eq(partnerInvitations.tokenHash, input.tokenHash)).limit(1);
    return invitation ? { partnerName: invitation.partnerName, email: invitation.email, role: invitation.role, status: invitation.status, expired: invitation.expiresAt <= new Date() } : null;
  });
}

/**
 * Joins the partner's team with the invitation's role. The person must be
 * signed in with the verified email it went to, and whoever sent it must
 * still be allowed to. An active member keeps the role they have.
 */
export async function acceptPartnerInvitation(
  context: DomainContext,
  input: { userId: string; tokenHash: string; email: string | null | undefined; emailVerified: boolean | null | undefined },
): Promise<{ partnerId: string; role: PartnerRole }> {
  return await withBusinessTransaction(context.db, { userId: input.userId, actorType: "system" }, async (tx) => {
    const [found] = await tx.select({ partnerId: partnerInvitations.partnerId }).from(partnerInvitations).where(eq(partnerInvitations.tokenHash, input.tokenHash)).limit(1);
    if (!found) throw failure("Invitation is invalid or expired.", 404, "not_found");
    await lockPartnerTeam(tx, found.partnerId);
    const [invitation] = await tx.select().from(partnerInvitations).where(and(eq(partnerInvitations.tokenHash, input.tokenHash), eq(partnerInvitations.status, "pending"))).limit(1);
    if (!invitation || invitation.expiresAt <= new Date()) throw invitationInvalid();
    if (!input.emailVerified || !input.email || normalizeAuthEmail(input.email) !== invitation.normalizedEmail) throw wrongAccount();
    const [sender] = await tx.select({ role: partnerMembers.role }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, invitation.partnerId), eq(partnerMembers.userId, invitation.invitedByUserId), eq(partnerMembers.status, "active"))).limit(1);
    if (!sender || sender.role === "member" || (invitation.role === "owner" && sender.role !== "owner")) {
      throw failure("This invitation no longer works. Ask whoever sent it for a new one.", 409, "invitation_stale");
    }
    // Claim the invitation before joining, so a second accept of the same link fails.
    const [claimed] = await tx.update(partnerInvitations).set({ status: "accepted", acceptedByUserId: input.userId, acceptedAt: new Date(), updatedAt: new Date() }).where(and(eq(partnerInvitations.id, invitation.id), eq(partnerInvitations.status, "pending"))).returning({ id: partnerInvitations.id });
    if (!claimed) throw invitationInvalid();
    const [joined] = await tx.insert(partnerMembers).values({ partnerId: invitation.partnerId, userId: input.userId, role: invitation.role, status: "active" }).onConflictDoUpdate({
      target: [partnerMembers.partnerId, partnerMembers.userId],
      set: { role: invitation.role, status: "active", updatedAt: new Date() },
      setWhere: sql`${partnerMembers.status} <> 'active'`,
    }).returning({ role: partnerMembers.role });
    const role = joined?.role ?? (await tx.select({ role: partnerMembers.role }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, invitation.partnerId), eq(partnerMembers.userId, input.userId))).limit(1))[0]!.role;
    return { partnerId: invitation.partnerId, role };
  });
}

/** A partner's brand as the console's Branding & domain page shows it. */
export type PartnerBrandSettings = {
  /** The actor's own role, read with the brand: only owners and admins can save it. */
  role: PartnerRole;
  name: string;
  /** The partner's subdomain under the current partner base domain, such as acme.receptionistportal.com, or null for none. */
  subdomain: string | null;
  /** Where its dashboard lives on that subdomain, or null without one. */
  subdomainUrl: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  color: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  supportUrl: string | null;
  supportEmail: string | null;
};

/** What the Branding & domain page saves. An image left undefined stays as it is, and null removes it. */
export type PartnerBrandInput = {
  name: string;
  color: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  supportUrl: string | null;
  supportEmail: string | null;
  logo?: Uint8Array | null;
  favicon?: Uint8Array | null;
};

function brandActor(actor: PartnerActor): PartnerMemberActor {
  if (actor.kind !== "member") throw new AuthorizationError("Platform keys can't change a partner's brand.");
  return actor;
}

/** A link a partner's brand keeps: an http or https page of at most 2048 characters, or null for an empty field. */
function brandLink(value: string | null, field: "terms" | "privacy" | "support"): string | null {
  if (value === null || !value.trim()) return null;
  const link = normalizePageUrl(value);
  if (!link || link.length > PARTNER_LINK_MAX_LENGTH) throw failure(`Enter the ${field} link as a full web address, such as https://example.com/${field}.`, 400, `invalid_${field}_url`);
  return link;
}

/** An uploaded logo or favicon and its type, read from its bytes, or null to remove it. */
function brandImage(bytes: Uint8Array | null, image: BrandImage): { bytes: Buffer; contentType: string } | null {
  if (bytes === null || bytes.length === 0) return null;
  if (bytes.length > MAX_BRAND_LOGO_BYTES) throw failure(`The ${image} must be 256 KB or smaller.`, 413, `${image}_too_large`);
  const contentType = brandLogoContentType(bytes);
  if (!contentType) throw failure("Upload a PNG, JPEG, WebP or SVG image.", 400, `invalid_${image}`);
  return { bytes: Buffer.from(bytes), contentType };
}

/** Whether the partner's own domain is verified, so its businesses have somewhere to open without a subdomain. */
async function hasVerifiedCustomDomain(tx: DatabaseTransaction, partnerId: string): Promise<boolean> {
  const [domain] = await tx.select({ id: partnerDomains.id }).from(partnerDomains).where(and(eq(partnerDomains.partnerId, partnerId), eq(partnerDomains.kind, "custom"), isNotNull(partnerDomains.verifiedAt))).limit(1);
  return Boolean(domain);
}

/**
 * Reserves the partner's subdomain inside a system transaction. Returns it,
 * and whether anything was written, which the caller announces as a brand
 * change once the transaction commits.
 */
export async function reserveSubdomainIn(tx: DatabaseTransaction, partnerId: string, baseDomain: string): Promise<{ subdomain: string | null; changed: boolean }> {
  const [partner] = await tx.select({ slug: partners.slug }).from(partners).where(eq(partners.id, partnerId)).limit(1);
  if (!partner) return { subdomain: null, changed: false };
  const hostname = `${partner.slug}.${baseDomain}`;
  const [existing] = await tx.select({ id: partnerDomains.id, hostname: partnerDomains.hostname }).from(partnerDomains).where(and(eq(partnerDomains.partnerId, partnerId), eq(partnerDomains.kind, "subdomain"))).limit(1);
  if (existing?.hostname === hostname) return { subdomain: hostname, changed: false };
  // The host's own hostname, or another partner's domain, keeps the partner off it.
  if (hostLabelsUnder(baseDomain).has(partner.slug)) return { subdomain: null, changed: false };
  const [taken] = await tx.select({ id: partnerDomains.id }).from(partnerDomains).where(eq(partnerDomains.hostname, hostname)).limit(1);
  if (taken) return { subdomain: null, changed: false };
  if (existing) {
    // A partner keeps one subdomain, so the one under an earlier base domain moves.
    await tx.update(partnerDomains).set({ hostname, verifiedAt: new Date(), updatedAt: new Date() }).where(eq(partnerDomains.id, existing.id));
    return { subdomain: hostname, changed: true };
  }
  const [reserved] = await tx.insert(partnerDomains).values({ partnerId, hostname, kind: "subdomain", verifiedAt: new Date() }).onConflictDoNothing().returning({ id: partnerDomains.id });
  return { subdomain: reserved ? hostname : null, changed: Boolean(reserved) };
}

/**
 * Reserves the partner's subdomain of the partner base domain when it has none
 * there. A partner that signed up while PARTNER_BASE_DOMAIN was unset or
 * invalid has none, and one whose subdomain sits under an earlier base domain
 * moves to the current one. Returns the subdomain, or null when the deployment
 * has no base domain, or the hostname is the host's own or another partner's.
 */
export async function reservePartnerSubdomain(context: DomainContext, partnerId: string): Promise<string | null> {
  const { baseDomain } = partnerFeatures(process.env);
  if (!baseDomain) return null;
  const outcome = await withBusinessTransaction(context.db, { actorType: "system" }, async (tx) => await reserveSubdomainIn(tx, partnerId, baseDomain));
  if (outcome.changed) await announceBrandChange(context, { kind: "partner", partnerId });
  return outcome.subdomain;
}

/**
 * Reserves a subdomain for every partner without one under the current
 * partner base domain, as the admin does when it starts, since a new base
 * domain takes a restart. Returns how many it reserved.
 */
export async function reserveMissingPartnerSubdomains(context: DomainContext): Promise<number> {
  const { baseDomain } = partnerFeatures(process.env);
  if (!baseDomain) return 0;
  const missing = await withBusinessTransaction(context.db, { actorType: "system" }, async (tx) => await tx
    .select({ partnerId: partners.id })
    .from(partners)
    .leftJoin(partnerDomains, and(eq(partnerDomains.partnerId, partners.id), eq(partnerDomains.kind, "subdomain"), eq(partnerDomains.hostname, sql`${partners.slug} || ${`.${baseDomain}`}`)))
    .where(isNull(partnerDomains.id))
    .orderBy(asc(partners.createdAt)));
  let reserved = 0;
  for (const { partnerId } of missing) {
    if (await reservePartnerSubdomain(context, partnerId)) reserved += 1;
  }
  return reserved;
}

async function readBrandSettings(tx: DatabaseTransaction, member: PartnerMemberActor): Promise<PartnerBrandSettings> {
  const role = await currentRole(tx, member);
  const [row] = await tx
    .select({
      name: partners.name,
      logoVersion: partners.logoVersion,
      faviconVersion: partners.faviconVersion,
      color: partners.brandColor,
      termsUrl: partners.termsUrl,
      privacyUrl: partners.privacyUrl,
      supportUrl: partners.supportUrl,
      supportEmail: partners.supportEmail,
      subdomain: partnerDomains.hostname,
    })
    .from(partners)
    .leftJoin(partnerDomains, and(eq(partnerDomains.partnerId, partners.id), eq(partnerDomains.kind, "subdomain")))
    .where(eq(partners.id, member.partnerId))
    .limit(1);
  if (!row) throw failure("Partner not found.", 404, "partner_not_found");
  const subdomain = currentPartnerSubdomain(row.subdomain, process.env);
  return {
    role,
    name: row.name,
    subdomain,
    subdomainUrl: subdomain ? partnerOrigin(subdomain, process.env) : null,
    logoUrl: row.logoVersion ? partnerBrandImageUrl(member.partnerId, "logo", row.logoVersion) : null,
    faviconUrl: row.faviconVersion ? partnerBrandImageUrl(member.partnerId, "favicon", row.faviconVersion) : null,
    color: row.color,
    termsUrl: row.termsUrl,
    privacyUrl: row.privacyUrl,
    supportUrl: row.supportUrl,
    supportEmail: row.supportEmail,
  };
}

/**
 * The partner's brand and subdomain for the Branding & domain page. Anyone on
 * the team can read it. A partner with no subdomain under the current base
 * domain gets one reserved first.
 */
export async function getPartnerBrandSettings(context: DomainContext, actor: PartnerActor): Promise<PartnerBrandSettings> {
  const member = brandActor(actor);
  const settings = await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => await readBrandSettings(tx, member));
  if (settings.subdomain || !partnerFeatures(process.env).baseDomain) return settings;
  if (!await reservePartnerSubdomain(context, member.partnerId)) return settings;
  return await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => await readBrandSettings(tx, member));
}

/**
 * Saves the partner's name and brand: its logo, favicon, color, and terms,
 * privacy and support links, and the support email its emails take replies
 * at. Only owners and admins can. Every process shows the change at once,
 * and within the brand cache's 30 seconds when the announcement can't reach them.
 */
export async function savePartnerBrand(context: DomainContext, actor: PartnerActor, input: PartnerBrandInput): Promise<PartnerBrandSettings> {
  const member = brandActor(actor);
  const name = normalizePartnerName(input.name);
  if (!name) throw invalidName();
  const color = input.color === null || !input.color.trim() ? null : normalizeBrandColor(input.color);
  if (input.color !== null && input.color.trim() && !color) throw failure("Enter the brand color as a hex code, such as #0f766e.", 400, "invalid_color");
  const supportEmail = input.supportEmail === null || !input.supportEmail.trim() ? null : normalizeEmailAddress(input.supportEmail);
  if (input.supportEmail !== null && input.supportEmail.trim() && !supportEmail) throw failure("Enter one valid support email address.", 400, "invalid_support_email");
  const links = { termsUrl: brandLink(input.termsUrl, "terms"), privacyUrl: brandLink(input.privacyUrl, "privacy"), supportUrl: brandLink(input.supportUrl, "support") };
  const logo = input.logo === undefined ? undefined : brandImage(input.logo, "logo");
  const favicon = input.favicon === undefined ? undefined : brandImage(input.favicon, "favicon");

  const settings = await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => {
    const role = await currentRole(tx, member);
    if (role === "member") throw new AuthorizationError("Only owners and admins can change the partner's brand.");
    const saved = await tx.update(partners).set({
      name,
      brandColor: color,
      ...links,
      supportEmail,
      ...(logo === undefined ? {} : { logo: logo?.bytes ?? null, logoContentType: logo?.contentType ?? null }),
      ...(favicon === undefined ? {} : { favicon: favicon?.bytes ?? null, faviconContentType: favicon?.contentType ?? null }),
      updatedAt: new Date(),
    }).where(eq(partners.id, member.partnerId)).returning({ id: partners.id });
    // The role was just read, so nothing changed only when row-level security refused it.
    if (saved.length === 0) throw new AuthorizationError("Only owners and admins can change the partner's brand.");
    return await readBrandSettings(tx, member);
  });
  await announceBrandChange(context, { kind: "partner", partnerId: member.partnerId });
  return settings;
}

/** A partner's settings as the console's Settings page shows them. */
export type PartnerSettings = {
  /** The actor's own role, read with the settings: only owners and admins can change them. */
  role: PartnerRole;
  /**
   * Whether the console's pages share product telemetry with the host. It
   * starts on, as a business's does, and a business's own pages follow the
   * business's setting instead.
   */
  telemetryEnabled: boolean;
};

function settingsActor(actor: PartnerActor): PartnerMemberActor {
  if (actor.kind !== "member") throw new AuthorizationError("Platform keys can't read or change a partner's settings.");
  return actor;
}

async function readSettings(tx: DatabaseTransaction, member: PartnerMemberActor): Promise<PartnerSettings> {
  const role = await currentRole(tx, member);
  const [row] = await tx.select({ telemetryEnabled: partners.telemetryEnabled }).from(partners).where(eq(partners.id, member.partnerId)).limit(1);
  if (!row) throw failure("Partner not found.", 404, "partner_not_found");
  return { role, telemetryEnabled: row.telemetryEnabled };
}

/** The partner's settings for the console's Settings page and its telemetry consent. Anyone on the team can read them. */
export async function getPartnerSettings(context: DomainContext, actor: PartnerActor): Promise<PartnerSettings> {
  const member = settingsActor(actor);
  return await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => await readSettings(tx, member));
}

/**
 * Turns the console's telemetry on or off for the whole partner. Only owners
 * and admins can, the same roles that change a business's setting.
 */
export async function savePartnerSettings(context: DomainContext, actor: PartnerActor, input: { telemetryEnabled: boolean }): Promise<PartnerSettings> {
  const member = settingsActor(actor);
  return await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => {
    const role = await currentRole(tx, member);
    if (role === "member") throw new AuthorizationError("Only owners and admins can change the partner's settings.");
    const saved = await tx.update(partners).set({ telemetryEnabled: input.telemetryEnabled, updatedAt: new Date() }).where(eq(partners.id, member.partnerId)).returning({ id: partners.id });
    // The role was just read, so nothing changed only when row-level security refused it.
    if (saved.length === 0) throw new AuthorizationError("Only owners and admins can change the partner's settings.");
    return await readSettings(tx, member);
  });
}

/** A business in the partner's console. */
export type PartnerBusiness = {
  businessId: string;
  name: string;
  accessLevel: PartnerAccessLevel;
  onboardingStage: string;
  createdAt: string;
  /** Its owner once they joined, the person invited to own it while that invitation waits, or null for neither. */
  owner: { email: string; status: "joined" } | { email: string; status: "invited"; expiresAt: string } | null;
  /** What it used this month, as usage metering counts it: voice seconds and chats. A month runs in UTC. */
  usage: { periodKey: string; voiceSeconds: number; chats: number };
  /** What it's sold and whether it pays, for owners and admins. Null for members, who never see billing. */
  billing: PartnerBusinessBilling | null;
};

export const PARTNER_BUSINESS_NAME_MAX_LENGTH = 120;

function businessesActor(actor: PartnerActor): PartnerMemberActor {
  if (actor.kind !== "member") throw new AuthorizationError("Platform keys can't manage a partner's businesses.");
  return actor;
}

/**
 * The partner's businesses, by name, with each one's owner or the invitation
 * to own it, and its minutes and chats this month. Anyone on the team can
 * read them. A prospect demo shows on the Demos page instead until someone
 * claims it.
 */
export async function listPartnerBusinesses(context: DomainContext, actor: PartnerActor): Promise<PartnerBusiness[]> {
  const member = businessesActor(actor);
  const periodKey = periodKeyFor();
  return await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => {
    const role = await currentRole(tx, member);
    // Members never see billing. Without Stripe Connect, every business is billed outside LobbyStack.
    const billing = role === "member" ? null : context.stripeConnect ? await listPartnerBusinessBillingIn(tx, member.partnerId) : new Map<string, PartnerBusinessBilling>();
    // The partner's members aren't on its businesses' teams, so RLS shows them none; these functions answer instead.
    const rows = await tx.execute<{ businessId: string; name: string; accessLevel: PartnerAccessLevel; onboardingStage: string; createdAt: string; ownerEmail: string | null; invitedEmail: string | null; invitationExpiresAt: string | null }>(
      sql`select business_id as "businessId", name, access_level as "accessLevel", onboarding_stage as "onboardingStage", created_at as "createdAt", owner_email as "ownerEmail", invited_email as "invitedEmail", invitation_expires_at as "invitationExpiresAt" from app.list_partner_businesses(${member.partnerId}::uuid)`,
    );
    const demos = await tx.execute<{ businessId: string }>(sql`select business_id as "businessId" from app.list_partner_prospect_demos(${member.partnerId}::uuid) where status <> 'claimed'`);
    const unclaimedDemos = new Set(demos.rows.map((row) => row.businessId));
    const used = await tx.execute<{ businessId: string; voiceSeconds: number; chats: number }>(
      sql`select business_id as "businessId", voice_seconds_used as "voiceSeconds", chats_used as "chats" from app.list_partner_business_usage(${member.partnerId}::uuid, ${periodKey})`,
    );
    const usage = new Map(used.rows.map((row) => [row.businessId, row]));
    // Raw queries return Postgres timestamp text, which Safari's Date can't parse.
    const iso = (value: string) => new Date(value).toISOString();
    return rows.rows.filter((row) => !unclaimedDemos.has(row.businessId)).map((row) => ({
      businessId: row.businessId,
      name: row.name,
      accessLevel: row.accessLevel,
      onboardingStage: row.onboardingStage,
      createdAt: iso(row.createdAt),
      owner: row.ownerEmail ? { email: row.ownerEmail, status: "joined" } : row.invitedEmail && row.invitationExpiresAt ? { email: row.invitedEmail, status: "invited", expiresAt: iso(row.invitationExpiresAt) } : null,
      usage: { periodKey, voiceSeconds: Number(usage.get(row.businessId)?.voiceSeconds ?? 0), chats: Number(usage.get(row.businessId)?.chats ?? 0) },
      billing: billing ? billing.get(row.businessId) ?? { kind: "outside" } : null,
    }));
  });
}

/** What creating a partner's business takes. The console sends the first five, the package and the template; the v1 API's POST /businesses can send the rest but the template. */
export type PartnerBusinessInput = {
  name: string;
  timezone: string;
  businessType: string;
  accessLevel: string;
  ownerEmail: string;
  /** The package the business is sold, or null or absent to bill it outside LobbyStack. */
  packageId?: string | null | undefined;
  slug?: string | undefined;
  defaultLocale?: string | undefined;
  websiteUrl?: string | undefined;
  /** The business's id, which the API derives from the key and its Idempotency-Key so a retry finds the same business. A new one by default. */
  businessId?: string | undefined;
  /** The API's hash of the request, kept on the audit row so a retry with the same Idempotency-Key can tell a different body apart. */
  requestHash?: string | undefined;
  /** One of the partner's templates to start the business from. Only someone on the partner's team can apply one. */
  templateId?: string | undefined;
};

/**
 * Creates a business for one of the partner's clients: with no owner yet,
 * linked to the partner, at the access level its own operators get. It also
 * invites the owner by email under the partner's brand. Accepting on the
 * partner's domain makes them the owner; the invitation is never a claim link,
 * so the business stays with the partner. Owners and admins can create one,
 * and so can the partner's platform keys, which act as the partner, but only
 * once the partner has a domain for its businesses to open on, its subdomain
 * or its own verified domain: they show on no other. It never counts toward the cap of 10 businesses an account can
 * own. With a package, the owner's invitation opens a checkout on the
 * partner's Stripe account; without one, the business is billed outside
 * LobbyStack. The caller passes the app role's context, since only it can act
 * as the system.
 *
 * With one of the partner's templates, the business starts with its setup,
 * apart from the name and time zone given here. The invitation then waits
 * until the template is applied. A template that can't be applied, or an
 * invitation that then fails, leaves no business behind, so the owner never
 * hears of one that isn't set up. Only someone on the partner's team reads
 * its templates, so a platform key can't apply one.
 */
export async function createPartnerBusiness(
  context: DomainContext,
  actor: PartnerActor,
  input: PartnerBusinessInput,
  setup?: BusinessSetupDependencies,
): Promise<{ businessId: string; invitationId: string; expiresAt: Date }> {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name || name.length > PARTNER_BUSINESS_NAME_MAX_LENGTH) throw failure(`Enter the business's name, up to ${PARTNER_BUSINESS_NAME_MAX_LENGTH} characters.`, 400, "invalid_name");
  const timezone = ianaTimeZone(input.timezone);
  if (!timezone) throw failure("timezone must be an IANA time zone, such as America/Toronto.", 400, "invalid_timezone");
  const businessType = input.businessType.trim();
  if (!businessType || businessType.length > 64) throw failure("Choose the kind of business.", 400, "invalid_business_type");
  const accessLevel = input.accessLevel;
  if (!isPartnerAccessLevel(accessLevel)) throw failure("accessLevel must be full or activity.", 400, "invalid_access_level");
  const ownerEmail = normalizeAuthEmail(input.ownerEmail);
  if (!isSingleEmailAddress(ownerEmail)) throw failure("Enter one valid email address for the owner.", 400, "invalid_email");
  const packageId = input.packageId ?? null;
  if (packageId !== null && !isUuid(packageId)) throw failure("packageId must be a UUID, or null to bill the business outside LobbyStack.", 400, "invalid_package");
  const applier = input.templateId === undefined ? null : templateApplier(actor);
  if (applier && !setup) throw new Error("Applying a template needs the worker's context and storage.");
  const { baseDomain } = partnerFeatures(process.env);
  const businessId = input.businessId ?? randomUUID();
  const { partnerId } = actor;

  // The worker writes the email under the business's brand, the partner's, and puts its link on the partner's domain.
  // A key invites as the partner, with no person behind it.
  const invite = async (tx: DatabaseTransaction, templateId: string | null) => {
    const { invitationId, expiresAt } = await insertInvitationInTransaction(tx, { businessId, normalizedEmail: ownerEmail, role: "business_owner", ...(actor.kind === "member" ? { invitedByUserId: actor.userId } : { invitedByPlatformKeyId: actor.platformKeyId }) });
    const by = actor.kind === "member" ? {} : { actor: "platform_key", platformKeyId: actor.platformKeyId, groupId: partnerId };
    await tx.insert(auditLogs).values({ businessId, actorUserId: actor.kind === "member" ? actor.userId : null, eventType: "partner.business_created", entityType: "business", entityId: businessId, payload: { ...by, partnerId, accessLevel, packageId, ownerInvitationId: invitationId, ...(templateId ? { templateId } : {}), ...(input.requestHash ? { requestHash: input.requestHash } : {}) } });
    return { invitationId, expiresAt };
  };
  const created = await withBusinessTransaction(context.db, { ...(actor.kind === "member" ? { userId: actor.userId } : {}), businessId, actorType: "system" }, async (tx) => {
    if (actor.kind === "member" && await currentRole(tx, actor) === "member") throw new AuthorizationError("Only owners and admins can create the partner's businesses.");
    // Revoking a key waits for a business it's creating, so the owner's invitation is never sent by a key revoked first.
    if (actor.kind === "key") await lockActivePartnerPlatformKey(tx, actor.platformKeyId);
    // The partner's people work in its businesses through opens, never on their teams, so none of them owns one.
    if (await isPartnerMemberEmail(tx, { partnerId: actor.partnerId, normalizedEmail: ownerEmail })) throw failure("The owner can't be someone on your team. Your team works in the business from the console.", 409, "owner_on_partner_team");
    const template = input.templateId === undefined ? null : await loadBusinessTemplateInTransaction(tx, { partnerId, templateId: input.templateId });
    // A partner that signed up while the deployment had no base domain gets its subdomain now, if it can.
    const domain = baseDomain ? await reserveSubdomainIn(tx, partnerId, baseDomain) : { subdomain: null, changed: false };
    if (!domain.subdomain && !await hasVerifiedCustomDomain(tx, partnerId)) throw failure("You need your own domain before you can create a business.", 409, "partner_domain_required");
    // At the activity level the partner sets the receptionist up, so the owner's onboarding starts at their phone.
    const partner = { partnerId, accessLevel };
    await insertOwnerlessBusinessInTransaction(tx, { businessId, name, slug: input.slug, timezone, businessType, defaultLocale: input.defaultLocale, websiteUrl: input.websiteUrl, partner, onboardingStage: firstOnboardingStage(partner) });
    if (packageId) await setBusinessPackageInTransaction(tx, { businessId, partnerId, packageId, stripeConnect: Boolean(context.stripeConnect) });
    return { template, invitation: template ? null : await invite(tx, null), subdomainReserved: domain.changed };
  });
  if (created.subdomainReserved) await announceBrandChange(context, { kind: "partner", partnerId });
  if (created.invitation) return { businessId, ...created.invitation };

  // Only a member gets here: a key asking for a template was refused above.
  const template = created.template!;
  const member = applier!;
  let applied = false;
  try {
    await applyStoredBusinessTemplate(setup!, { partnerId, userId: member.userId, businessId, template, keep: { name, timezone } });
    applied = true;
    const invitation = await withBusinessTransaction(context.db, { userId: member.userId, businessId, actorType: "system" }, async (tx) => {
      // Someone on the team may have deleted it while the template was applied.
      await lockPartnerBusiness(tx, member.partnerId, businessId, "no key update");
      return await invite(tx, template.templateId);
    });
    return { businessId, ...invitation };
  } catch (error) {
    // The business has no owner and no invitation yet, so nobody but the partner knew of it.
    await removeUnfinishedBusiness(context, member, businessId);
    const status = errorStatus(error);
    if (applied || status >= 500) throw error;
    throw Object.assign(failure(`The template couldn't set up the business, so it wasn't created: ${(error as Error).message}`, 409, "template_failed"), { cause: error });
  }
}

/** Who applies a template to a new business: someone on the partner's team, since only they read its templates. */
function templateApplier(actor: PartnerActor): PartnerMemberActor {
  if (actor.kind !== "member") throw new AuthorizationError("Platform keys can't apply a partner's templates.");
  return actor;
}

function errorStatus(error: unknown): number {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
}

/**
 * Deletes a business createPartnerBusiness made but couldn't finish, whatever
 * the member's role is by now, since nobody else knows of it. One someone on
 * the team deleted already is left alone. A business that can't be deleted
 * is logged, since the caller reports what went wrong first, and it stays on
 * the Businesses page with no owner, where an owner or admin can delete it.
 */
async function removeUnfinishedBusiness(context: DomainContext, member: PartnerMemberActor, businessId: string): Promise<void> {
  try {
    const closes = await withBusinessTransaction(context.db, { userId: member.userId, businessId, actorType: "system" }, async (tx) => (await deletePartnerBusinessInTransaction(tx, { businessId, partnerId: member.partnerId, stripeConnect: Boolean(context.stripeConnect), by: "partner" })).checkout);
    await closeCheckoutQuietly(context, closes);
  } catch (error) {
    if (errorStatus(error) === 404) return;
    console.error("[partner-business] unfinished business not deleted", businessId, error instanceof Error ? error.message : error);
  }
}

function businessNotFound(): Error {
  return failure("Business not found.", 404, "business_not_found");
}

/**
 * Locks the business and checks it's one of the partner's, returning the
 * partner as the database spells it. Another partner's business, a direct
 * one, or one no longer active answers as one that doesn't exist, unless
 * `anyStatus` lets a suspended one through. The transaction must be the
 * system actor's or the worker's, scoped to the business. Take any advisory
 * lock first: the team's and the number claims' lock holders write rows that
 * point at the business, which waits on this row lock.
 */
async function lockPartnerBusiness(tx: DatabaseTransaction, partnerId: string, businessId: string, strength: "update" | "no key update", anyStatus = false): Promise<string> {
  const [business] = await tx.select({ partnerId: businesses.partnerId, status: businesses.status }).from(businesses).where(eq(businesses.id, businessId)).limit(1).for(strength);
  if (!business || (!anyStatus && business.status !== "active") || !business.partnerId || business.partnerId !== partnerId.toLowerCase()) throw businessNotFound();
  return business.partnerId;
}

/** The host's Free plan, as a billing account holds it: no paid plan, subscription or spending cap, and none of the partner's overage or the items that billed it. */
const FREE_PLAN_ACCOUNT = {
  plan: "free_cloud",
  subscriptionState: null,
  subscriptionId: null,
  billingInterval: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  overageSpendingCapCents: null,
  overageEnabled: false,
  overageCurrency: null,
  overageVoiceMinuteRateMinor: 0,
  overageChatRateMinor: 0,
  overageCapMinor: null,
  stripeOverageItems: null,
};

/**
 * The owners of one of the partner's businesses, whose own rows in users only
 * they can read: the database answers the partner's owners and admins, and
 * the worker in the business's own transaction.
 */
async function partnerBusinessOwnerEmails(tx: DatabaseTransaction, businessId: string): Promise<string[]> {
  const rows = await tx.execute<{ email: string }>(sql`select email from app.partner_business_owner_emails(${businessId}::uuid)`);
  return rows.rows.map((row) => row.email);
}

/**
 * Releases one of the partner's businesses to its owner, who keeps it as a
 * direct business on the host's Free plan and pays the host from then on. It
 * needs an owner who accepted the invitation. The business leaves the console
 * and the partner's domains. The partner's people lose it at once: the
 * database forgets their opens of it, and the invitations to its team that
 * anyone off the team sent, such as the partner's people, stop working. None
 * of them is on its team, since they can't join it. The webhooks the
 * partner's keys or people set up stop sending. Its audit log records who
 * released it and each webhook it turned off. A business on one of the partner's packages leaves it, which
 * waits while its subscription is live and the deployment would hear it end:
 * the partner cancels it in Stripe first. Only owners and admins can.
 */
export async function releaseBusiness(context: DomainContext, actor: PartnerActor, input: { businessId: string }): Promise<{ ownerUserId: string }> {
  const member = businessesActor(actor);
  // The business's own rows show only to the system actor, since the partner's people aren't on its team.
  const released = await withBusinessTransaction(context.db, { userId: member.userId, businessId: input.businessId, actorType: "system" }, async (tx) => {
    if (await currentRole(tx, member) === "member") throw new AuthorizationError("Only owners and admins can release the partner's businesses.");
    // Team changes take this lock, so the owner can't leave while the business moves to them.
    await lockBusinessTeam(tx, input.businessId);
    // The Connect webhook's writes take this before the business's row, so this does too.
    await lockBusinessBillingAccount(tx, input.businessId);
    // Clearing the partner changes no key, so joining the team, which checks the business's key, doesn't wait on this.
    const partnerId = await lockPartnerBusiness(tx, member.partnerId, input.businessId, "no key update");
    const [owner] = await tx.select({ userId: businessMemberships.userId }).from(businessMemberships)
      .where(and(eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.role, "business_owner"), eq(businessMemberships.status, "active")))
      .orderBy(asc(businessMemberships.createdAt), asc(businessMemberships.id))
      .limit(1);
    if (!owner) throw failure("The business's owner has to accept their invitation before you can release it.", 409, "owner_required");
    // Read who to tell while the business is still the partner's.
    const ownerEmails = await partnerBusinessOwnerEmails(tx, input.businessId);
    // A direct business pays the host, so it keeps none of its partner's packages.
    const closes = await dropBusinessPackageInTransaction(tx, { businessId: input.businessId, partnerId, stripeConnect: Boolean(context.stripeConnect) });
    // A direct business ignores the access level; it goes back to the default.
    await tx.update(businesses).set({ partnerId: null, partnerAccessLevel: "full", updatedAt: new Date() }).where(eq(businesses.id, input.businessId));
    const team = tx.select({ userId: businessMemberships.userId }).from(businessMemberships).where(and(eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.status, "active")));
    // An invitation a key sent names no inviter, and NOT IN never matches a null, so it's revoked on its own.
    await tx.update(businessInvitations).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(businessInvitations.businessId, input.businessId), eq(businessInvitations.status, "pending"), or(isNull(businessInvitations.invitedByUserId), notInArray(businessInvitations.invitedByUserId, team))));
    // The partner's keys and people lose the business, so the webhooks they set up stop sending its calls, contacts and messages.
    // As a claim link's hand-over does, this turns off every platform key's, since only the partner's keys reach a partner's business.
    const partnerPeople = tx.select({ userId: partnerMembers.userId }).from(partnerMembers).where(eq(partnerMembers.partnerId, partnerId));
    const now = new Date();
    const silenced = await tx.update(webhookEndpoints).set({ status: "disabled", disabledReason: "manual", disabledAt: now, updatedAt: now })
      .where(and(eq(webhookEndpoints.businessId, input.businessId), eq(webhookEndpoints.status, "enabled"), or(isNotNull(webhookEndpoints.createdByPlatformKeyId), inArray(webhookEndpoints.createdByUserId, partnerPeople))))
      .returning({ id: webhookEndpoints.id });
    if (silenced.length) {
      await tx.insert(auditLogs).values(silenced.map((endpoint) => ({ businessId: input.businessId, actorUserId: member.userId, eventType: "webhook_endpoint.disabled", entityType: "webhook_endpoint", entityId: endpoint.id, payload: { reason: "business_released", partnerId } })));
    }
    await tx.insert(billingAccounts).values({ businessId: input.businessId, billingKey: `business:${input.businessId}`, ...FREE_PLAN_ACCOUNT }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { ...FREE_PLAN_ACCOUNT, updatedAt: new Date() } });
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: member.userId, eventType: "partner.business_released", entityType: "business", entityId: input.businessId, payload: { partnerId, ownerUserId: owner.userId } });
    // The owner signs in on the host's domain from now on, so the email under the host's brand says where.
    const [about] = await tx.select({ businessName: businesses.name, partnerName: partners.name }).from(businesses).innerJoin(partners, eq(partners.id, partnerId)).where(eq(businesses.id, input.businessId)).limit(1);
    for (const email of ownerEmails) {
      await enqueueOutbox(tx, {
        topic: "email.sendNotice",
        businessId: input.businessId,
        aggregateType: "business",
        aggregateId: input.businessId,
        dedupeKey: `partner-business-released:${input.businessId}:${email}`,
        payload: { email, template: "business_released", variables: { url: `${appOrigin()}/login`, businessName: about?.businessName ?? "", partnerName: about?.partnerName ?? "" }, brand: HOST_EMAIL_BRAND, replyTo: null },
      });
    }
    return { ownerUserId: owner.userId, closes };
  });
  await closeCheckoutQuietly(context, released.closes);
  return { ownerUserId: released.ownerUserId };
}

/** How many stored files one cleanup job deletes. */
const STORED_OBJECTS_PER_JOB = 500;

/**
 * Who deletes a partner's business: the partner, from the console's
 * Businesses or Demos page or when a template couldn't set up a business it
 * was creating, or the host, 90 days after the partner's tier ended. The
 * partner can't delete a business that's suspended, or one that still pays
 * for its package while the deployment would hear the subscription end. The
 * host deletes it whatever its status, once the worker cancelled the
 * subscription that paid for its package, which it names.
 */
export type PartnerBusinessDeletion = { businessId: string; partnerId: string; stripeConnect: boolean } & ({ by: "partner" } | { by: "lifecycle"; cancelledSubscriptionId: string | null });

/** What deleting a business leaves to do and to record: the checkout to close once it commits, and the numbers it sent back to the provider. */
export type PartnerBusinessDeleted = { checkout: OpenCheckout | null; releasedNumbers: Array<{ id: string; e164: string }> };

/**
 * Deletes one of the partner's businesses with everything in it, its audit
 * log included, and queues the release of each phone number it held and the
 * deletion of the files it stored, and emails its owners that it's gone.
 * Its other emails and jobs that haven't gone out are dropped. While a number is still being bought for it, it's refused,
 * since the purchase would finish for a business that's gone. Returns the
 * checkout nobody should pay any more, for the caller to close once this
 * commits, and the numbers it queued for release. The caller checks who may
 * delete it first. The transaction is the system actor's or the worker's,
 * scoped to the business, and holds no row lock on the business yet.
 */
export async function deletePartnerBusinessInTransaction(tx: DatabaseTransaction, input: PartnerBusinessDeletion): Promise<PartnerBusinessDeleted> {
  const { businessId } = input;
  // Number claims take this lock, so none starts buying a number while the business goes.
  await lockBusinessNumberClaims(tx, businessId);
  // The Connect webhook's writes take this before the business's row, so this does too.
  await lockBusinessBillingAccount(tx, businessId);
  const partnerId = await lockPartnerBusiness(tx, input.partnerId, businessId, "update", input.by === "lifecycle");
  // Nobody should keep paying for a business that's gone: the partner cancels a live subscription first, and the host's worker cancels it for the partner.
  const checkout = input.by === "partner"
    ? await dropBusinessPackageInTransaction(tx, { businessId, partnerId, stripeConnect: input.stripeConnect })
    : await endLifecycleBusinessBillingInTransaction(tx, { businessId, partnerId, stripeConnect: input.stripeConnect, cancelledSubscriptionId: input.cancelledSubscriptionId });
  // RLS shows the partner's people none of the business's claims, so the database answers. A claim no worker will finish doesn't count.
  const claiming = (await tx.execute<{ busy: boolean }>(sql`select app.business_number_claim_in_progress(${businessId}::uuid) as busy`)).rows[0]?.busy === true;
  const [provisioning] = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "provisioning"))).limit(1);
  if (claiming || provisioning) throw failure("The business's phone number is still being set up. Try again in a few minutes.", 409, "business_number_in_progress");
  // A number being released already is released again, in case that release fails once the business is gone.
  const held = await tx.select({ id: phoneNumbers.id, e164: phoneNumbers.e164, providerPhoneId: phoneNumbers.providerPhoneId }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), inArray(phoneNumbers.status, ["active", "reclaiming"])));
  const stored = await tx.select({ objectKey: storageObjects.objectKey }).from(storageObjects).where(and(eq(storageObjects.businessId, businessId), ne(storageObjects.status, "deleted")));
  // Read who to tell before the business and its team go, whoever deletes it.
  const ownerEmails = await partnerBusinessOwnerEmails(tx, businessId);
  const [about] = await tx.select({ businessName: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  // An invitation or alert sent after the business is gone would go out under the host's brand.
  // The pool's alerts to the partner's owners and admins only went out through this business, and still go, since the pool's month counts them sent.
  await tx.delete(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), isNull(outboxMessages.publishedAt), ne(outboxMessages.aggregateType, POOL_ALERT_AGGREGATE)));
  // These jobs are queued in the business, which the worker's RLS needs, and deleting it leaves them belonging to none.
  const releasedNumbers: PartnerBusinessDeleted["releasedNumbers"] = [];
  for (const number of held) {
    // The shared sender texts for every business, so it stays, as a reclaim leaves it.
    if (!number.providerPhoneId || isSharedSmsSender(number.e164)) continue;
    releasedNumbers.push({ id: number.id, e164: number.e164 });
    await enqueueOutbox(tx, {
      topic: "phoneNumber.releaseDeleted",
      businessId,
      aggregateType: "phone_number",
      aggregateId: number.id,
      dedupeKey: `phone-number:${number.id}:release-deleted`,
      payload: { providerPhoneId: number.providerPhoneId, e164: number.e164 },
    });
  }
  for (let start = 0; start < stored.length; start += STORED_OBJECTS_PER_JOB) {
    await enqueueOutbox(tx, {
      topic: "privacy.deleteStoredObjects",
      businessId,
      aggregateType: "business",
      aggregateId: businessId,
      dedupeKey: `business:${businessId}:delete-stored-objects:${start}`,
      payload: { objectKeys: stored.slice(start, start + STORED_OBJECTS_PER_JOB).map((object) => object.objectKey) },
    });
  }
  // Queued in the business like the jobs above, so the worker may queue it too; the business's delete leaves it belonging to none, and it goes out under the partner's brand.
  for (const email of ownerEmails) {
    await enqueueOutbox(tx, {
      topic: "email.sendNotice",
      businessId,
      aggregateType: "business",
      aggregateId: businessId,
      dedupeKey: `partner-business-deleted:${businessId}:${email}`,
      payload: { email, template: "business_deleted", variables: { businessName: about?.businessName ?? "" }, brand: { kind: "partner", partnerId } satisfies EmailBrandReference, replyTo: null },
    });
  }
  await tx.delete(businesses).where(eq(businesses.id, businessId));
  return { checkout, releasedNumbers };
}

/**
 * Deletes one of the partner's businesses with everything in it: its team,
 * calls, chats, contacts, appointments, knowledge and settings, its audit log
 * included. The worker then releases the phone numbers it held and deletes
 * the files it stored. The emails and jobs it queued that haven't gone out
 * are dropped, so none reaches its people after it's gone. While a number is
 * still being bought for it, it's refused for now, since the purchase would
 * finish for a business that's gone. So is a business whose package
 * subscription is live while the deployment would hear it end: the partner
 * cancels it in Stripe first. Only owners and admins can.
 */
export async function deletePartnerBusiness(context: DomainContext, actor: PartnerActor, input: { businessId: string }): Promise<void> {
  const member = businessesActor(actor);
  const closes = await withBusinessTransaction(context.db, { userId: member.userId, businessId: input.businessId, actorType: "system" }, async (tx) => {
    if (await currentRole(tx, member) === "member") throw new AuthorizationError("Only owners and admins can delete the partner's businesses.");
    const { checkout } = await deletePartnerBusinessInTransaction(tx, { businessId: input.businessId, partnerId: member.partnerId, stripeConnect: Boolean(context.stripeConnect), by: "partner" });
    return checkout;
  });
  await closeCheckoutQuietly(context, closes);
}
