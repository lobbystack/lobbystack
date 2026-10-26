import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, asc, eq, or, sql } from "drizzle-orm";

import { enqueueOutbox, partnerDomains, partnerInvitations, partnerMembers, partners, partnerSignupInvitations, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { isPartnerRole, isPartnerSlug, normalizeAuthEmail, PARTNER_NAME_MAX_LENGTH, PARTNER_SLUG_MAX_LENGTH, partnerFeatures, partnerSlugFromName, type EmailBrandReference, type PartnerRole } from "@lobbystack/shared";

import { AuthorizationError } from "../authz";
import type { DomainContext } from "./context";
import { isSingleEmailAddress } from "./tenancy";

// Partner operations: what the partner console, and later a partner's
// platform keys, can do. Each function checks the actor's role itself, so
// every entry point gets the same rules. A member works inside the partner's
// businesses, an admin also runs the team, and only an owner grants or takes
// away the owner role.

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
 * subdomain lands on them.
 */
function hostLabelsUnder(baseDomain: string): Set<string> {
  const hosts = (process.env.MARKETING_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  try {
    if (process.env.APP_BASE_URL) hosts.push(new URL(process.env.APP_BASE_URL).hostname.toLowerCase());
  } catch {
    // An APP_BASE_URL that isn't a URL names no hostname to keep.
  }
  const suffix = `.${baseDomain}`;
  return new Set(hosts.filter((host) => host.endsWith(suffix)).map((host) => host.slice(0, -suffix.length).split(".").at(-1)!));
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
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > PARTNER_NAME_MAX_LENGTH) throw failure(`Enter the partner's name, up to ${PARTNER_NAME_MAX_LENGTH} characters.`, 400, "invalid_name");
  const chosen = input.subdomain?.trim().toLowerCase() || undefined;
  if (chosen !== undefined && !isPartnerSlug(chosen)) throw failure("A subdomain has 3 to 40 lowercase letters, digits and hyphens, and can't be one the host keeps.", 400, "invalid_subdomain");
  const features = partnerFeatures(process.env);
  if (features.signup === "invite" && !input.invitationTokenHash) throw failure("Partner signup is by invitation only.", 403, "invitation_required");
  const hostLabels = features.baseDomain ? hostLabelsUnder(features.baseDomain) : new Set<string>();
  if (chosen && hostLabels.has(chosen)) throw subdomainTaken();

  return await withBusinessTransaction(context.db, { userId: input.userId, actorType: "system" }, async (tx) => {
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
      const [reserved] = await tx.insert(partnerDomains).values({ partnerId, hostname: subdomain, kind: "subdomain", verifiedAt: new Date() }).onConflictDoNothing({ target: partnerDomains.hostname }).returning({ id: partnerDomains.id });
      if (!reserved) throw subdomainTaken();
    }
    if (invitationId) {
      const [claimed] = await tx.update(partnerSignupInvitations).set({ status: "accepted", acceptedByUserId: input.userId, partnerId, acceptedAt: new Date(), updatedAt: new Date() }).where(and(eq(partnerSignupInvitations.id, invitationId), eq(partnerSignupInvitations.status, "pending"))).returning({ id: partnerSignupInvitations.id });
      if (!claimed) throw invitationInvalid();
    }
    return { partnerId, slug, subdomain };
  });
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
      payload: { invitationId, email: normalizedEmail, template: "invitation", url: partnerInvitationUrl(token), brand: { kind: "partner", partnerId: member.partnerId } satisfies EmailBrandReference, replyTo: null },
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
