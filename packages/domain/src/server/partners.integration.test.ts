import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabaseClient, outboxMessages, partnerDomains, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { brandForEmail, forgetCachedBrands } from "./brands";
import {
  acceptPartnerInvitation,
  changePartnerMemberRole,
  createPartnerSignupInvitation,
  hashPartnerToken,
  invitePartnerMember,
  listPartnerTeam,
  listUserPartners,
  previewPartnerInvitation,
  previewPartnerSignupInvitation,
  removePartnerMember,
  resolvePartnerActor,
  revokePartnerInvitation,
  signUpPartner,
  type PartnerMemberActor,
} from "./partners";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Partner integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "self_hosted_standard");
  vi.stubEnv("PARTNER_SIGNUP", "");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "");
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("MARKETING_HOSTS", "");
  vi.stubEnv("EMAIL_FROM", "Front Desk <no-reply@desk.example.test>");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
});

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

type Person = { userId: string; email: string; emailVerified: boolean };

/** Accounts made as the migrator; every call after this runs as the app role. */
async function people(tx: DatabaseTransaction, count: number): Promise<Person[]> {
  const made = Array.from({ length: count }, () => {
    const userId = randomUUID();
    return { userId, email: `${userId}@example.invalid`, emailVerified: true };
  });
  await tx.execute(sql`reset role`);
  await tx.insert(users).values(made.map((person) => ({ id: person.userId, email: person.email, normalizedEmail: person.email, name: `Person ${person.userId.slice(0, 4)}`, emailVerified: true })));
  await tx.execute(sql`set local role lobbystack_app`);
  return made;
}

/** Reads what the migrator sees, then goes back to the app role. */
async function asMigrator<T>(tx: DatabaseTransaction, read: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  try {
    return await read();
  } finally {
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/** The link token in the invitation email queued for this invitation. */
async function invitationToken(tx: DatabaseTransaction, invitationId: string): Promise<string> {
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.aggregateId, invitationId)));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

async function signUp(context: { db: Database }, person: Person, name: string, extra: { subdomain?: string; invitationTokenHash?: string } = {}) {
  return await signUpPartner(context, { userId: person.userId, email: person.email, emailVerified: person.emailVerified, name, ...extra });
}

/** A partner signed up by its owner, with each further person invited and joined in the given role. */
async function partnerWithTeam(tx: DatabaseTransaction, roles: Array<"owner" | "admin" | "member">) {
  const [owner, ...others] = await people(tx, roles.length + 1);
  const context = { db: tx as unknown as Database };
  const { partnerId } = await signUp(context, owner!, `Partner ${randomUUID().slice(0, 6)}`);
  const ownerActor: PartnerMemberActor = { kind: "member", partnerId, userId: owner!.userId, role: "owner" };
  const actors: PartnerMemberActor[] = [];
  for (const [index, role] of roles.entries()) {
    const person = others[index]!;
    const { invitationId } = await invitePartnerMember(context, ownerActor, { email: person.email, role });
    await acceptPartnerInvitation(context, { userId: person.userId, tokenHash: hashPartnerToken(await invitationToken(tx, invitationId)), email: person.email, emailVerified: true });
    actors.push({ kind: "member", partnerId, userId: person.userId, role });
  }
  const memberIds = Object.fromEntries((await listPartnerTeam(context, ownerActor)).members.map((member) => [member.userId, member.memberId]));
  return { context, partnerId, owner: owner!, ownerActor, actors, memberIds };
}

describe.skipIf(!client)("partner signup", () => {
  it("creates the partner with the person signing up as its owner, and reserves no subdomain without a base domain", async () => {
    await rollbackTest(async (tx) => {
      const [owner, other] = await people(tx, 2);
      const context = { db: tx as unknown as Database };
      const signedUp = await signUp(context, owner!, "  Bright   Desk  ");
      expect(signedUp).toEqual({ partnerId: expect.any(String), slug: "bright-desk", subdomain: null });
      expect(await listUserPartners(context, owner!.userId)).toEqual([{ partnerId: signedUp.partnerId, name: "Bright Desk", slug: "bright-desk", role: "owner", subdomain: null }]);
      expect(await resolvePartnerActor(context, { userId: owner!.userId, partnerId: signedUp.partnerId })).toEqual({ kind: "member", partnerId: signedUp.partnerId, userId: owner!.userId, role: "owner" });
      // Another company with the same name gets a slug of its own. Open signup needs no verified email.
      const second = await signUp(context, { ...other!, emailVerified: false }, "Bright Desk");
      expect(second.slug).toMatch(/^bright-desk-[0-9a-f]{6}$/);
    });
  });

  it("reserves the partner's subdomain of the partner base domain, and refuses one that's taken or the host's own", async () => {
    vi.stubEnv("PARTNER_BASE_DOMAIN", "Portal.Example.Test");
    vi.stubEnv("MARKETING_HOSTS", "www.example.test,desk.portal.example.test");
    await rollbackTest(async (tx) => {
      const [first, second] = await people(tx, 2);
      const context = { db: tx as unknown as Database };
      expect(await signUp(context, first!, "Acme Reception", { subdomain: " Acme " })).toMatchObject({ slug: "acme", subdomain: "acme.portal.example.test" });
      expect((await listUserPartners(context, first!.userId))[0]).toMatchObject({ subdomain: "acme.portal.example.test" });
      await expect(signUp(context, second!, "Acme Again", { subdomain: "acme" })).rejects.toMatchObject({ status: 409, code: "subdomain_taken" });
      await expect(signUp(context, second!, "Front Desk", { subdomain: "desk" })).rejects.toMatchObject({ status: 409, code: "subdomain_taken" });
      await expect(signUp(context, second!, "Acme Again", { subdomain: "www" })).rejects.toMatchObject({ status: 400, code: "invalid_subdomain" });
      await expect(signUp(context, second!, "Acme Again", { subdomain: "acme.desk" })).rejects.toMatchObject({ status: 400, code: "invalid_subdomain" });
      expect(await listUserPartners(context, second!.userId)).toEqual([]);
      expect(await signUp(context, second!, "Acme Again", { subdomain: "acme-again" })).toMatchObject({ subdomain: "acme-again.portal.example.test" });
    });
  });

  it("leaves nothing behind when the subdomain turns out taken after the partner was written", async () => {
    vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
    await rollbackTest(async (tx) => {
      const [first, second, third] = await people(tx, 3);
      const context = { db: tx as unknown as Database };
      const { partnerId } = await signUp(context, first!, "First Desk");
      // Another partner's own domain already uses the hostname "taken" would get.
      await asMigrator(tx, async () => { await tx.insert(partnerDomains).values({ partnerId, hostname: "taken.portal.example.test", kind: "custom" }); });
      await expect(signUp(context, second!, "Taken Desk", { subdomain: "taken" })).rejects.toMatchObject({ status: 409, code: "subdomain_taken" });
      expect(await listUserPartners(context, second!.userId)).toEqual([]);
      // The slug is still free: the refused signup's partner row rolled back with its owner.
      await asMigrator(tx, async () => { await tx.delete(partnerDomains).where(eq(partnerDomains.hostname, "taken.portal.example.test")); });
      expect(await signUp(context, third!, "Taken Desk", { subdomain: "taken" })).toMatchObject({ slug: "taken", subdomain: "taken.portal.example.test" });
    });
  });

  it("needs the host's invitation for the signer's verified email while signup is invite-only, as it is by default on the cloud", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    await rollbackTest(async (tx) => {
      const [invited, stranger] = await people(tx, 2);
      const context = { db: tx as unknown as Database };
      await expect(signUp(context, invited!, "Invited Reception")).rejects.toMatchObject({ status: 403, code: "invitation_required" });

      const { url } = await createPartnerSignupInvitation(context, { email: ` ${invited!.email.toUpperCase()} ` });
      expect(url).toMatch(/^https:\/\/desk\.example\.test\/partner\/signup\?invitation=/);
      const tokenHash = hashPartnerToken(new URL(url).searchParams.get("invitation")!);
      expect(await previewPartnerSignupInvitation(context, { tokenHash })).toEqual({ email: invited!.email, status: "pending", expired: false });

      await expect(signUp(context, stranger!, "Stranger Reception", { invitationTokenHash: tokenHash })).rejects.toMatchObject({ status: 403, code: "wrong_account" });
      await expect(signUp(context, { ...invited!, emailVerified: false }, "Invited Reception", { invitationTokenHash: tokenHash })).rejects.toMatchObject({ status: 403, code: "wrong_account" });
      await expect(signUp(context, invited!, "Invited Reception", { invitationTokenHash: hashPartnerToken("made-up") })).rejects.toMatchObject({ status: 409, code: "invitation_invalid" });
      const { partnerId } = await signUp(context, invited!, "Invited Reception", { invitationTokenHash: tokenHash });
      expect(await listUserPartners(context, invited!.userId)).toEqual([expect.objectContaining({ partnerId, role: "owner" })]);
      // The link works once.
      await expect(signUp(context, invited!, "Second Reception", { invitationTokenHash: tokenHash })).rejects.toMatchObject({ status: 409, code: "invitation_invalid" });
      expect(await previewPartnerSignupInvitation(context, { tokenHash })).toMatchObject({ status: "accepted" });
    });
  });

  it("lets anyone signed in sign up while signup is open, even on the cloud", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    vi.stubEnv("PARTNER_SIGNUP", "open");
    await rollbackTest(async (tx) => {
      const [person] = await people(tx, 1);
      await expect(signUp({ db: tx as unknown as Database }, person!, "Open Reception")).resolves.toMatchObject({ slug: "open-reception" });
    });
  });

  it("lets one account belong to several partners", async () => {
    await rollbackTest(async (tx) => {
      const first = await partnerWithTeam(tx, ["member"]);
      const person = first.actors[0]!;
      const { partnerId: ownPartnerId } = await signUpPartner(first.context, { userId: person.userId, email: null, emailVerified: false, name: "Second Shop" });
      expect((await listUserPartners(first.context, person.userId)).map((partner) => [partner.partnerId, partner.role]).sort()).toEqual([[first.partnerId, "member"], [ownPartnerId, "owner"]].sort());
    });
  });
});

describe.skipIf(!client)("partner team", () => {
  it("queues each invitation email under the partner's brand, with no business, linking to the console's accept page", async () => {
    await rollbackTest(async (tx) => {
      const { context, partnerId, ownerActor } = await partnerWithTeam(tx, []);
      const { invitationId } = await invitePartnerMember(context, ownerActor, { email: " New.Person@Example.Invalid ", role: "admin" });
      const [message] = await asMigrator(tx, async () => await tx.select({ topic: outboxMessages.topic, businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(eq(outboxMessages.aggregateId, invitationId)));
      expect(message).toEqual({
        topic: "email.send",
        businessId: null,
        payload: { invitationId, email: "new.person@example.invalid", template: "invitation", url: expect.stringMatching(/^https:\/\/desk\.example\.test\/partner\/accept-invite\?token=[\w-]{43}$/), brand: { kind: "partner", partnerId }, replyTo: null },
      });
      const token = await invitationToken(tx, invitationId);
      expect(await previewPartnerInvitation(context, { tokenHash: hashPartnerToken(token) })).toEqual({ partnerName: expect.stringMatching(/^Partner /), email: "new.person@example.invalid", role: "admin", status: "pending", expired: false });
      // The invitation is found by the hash of its link's token, never by the token itself.
      expect(await previewPartnerInvitation(context, { tokenHash: token })).toBeNull();
    });
  });

  it("lets owners and admins invite, change roles and remove people, and keeps the owner role to owners", async () => {
    await rollbackTest(async (tx) => {
      const { context, ownerActor, actors: [admin, member, leaver], memberIds, owner } = await partnerWithTeam(tx, ["admin", "member", "member"]);
      const roles = async () => Object.fromEntries((await listPartnerTeam(context, ownerActor)).members.map((row) => [row.userId, row.role]));
      const pending = async () => (await listPartnerTeam(context, ownerActor)).invitations.map((row) => row.invitationId);
      expect(await roles()).toEqual({ [owner.userId]: "owner", [admin!.userId]: "admin", [member!.userId]: "member", [leaver!.userId]: "member" });

      // An admin runs the team below the owner role, and each change sticks.
      const helper = await invitePartnerMember(context, admin!, { email: "helper@example.invalid", role: "member" });
      expect(await pending()).toEqual([helper.invitationId]);
      await revokePartnerInvitation(context, admin!, { invitationId: helper.invitationId });
      expect(await pending()).toEqual([]);
      await changePartnerMemberRole(context, admin!, { memberId: memberIds[member!.userId]!, role: "admin" });
      expect((await roles())[member!.userId]).toBe("admin");
      await changePartnerMemberRole(context, admin!, { memberId: memberIds[member!.userId]!, role: "member" });
      expect((await roles())[member!.userId]).toBe("member");
      await removePartnerMember(context, admin!, { memberId: memberIds[leaver!.userId]! });
      expect(await roles()).toEqual({ [owner.userId]: "owner", [admin!.userId]: "admin", [member!.userId]: "member" });
      // Granting, changing or taking away the owner role is an owner's.
      await expect(invitePartnerMember(context, admin!, { email: "boss@example.invalid", role: "owner" })).rejects.toMatchObject({ status: 403, code: "owner_only" });
      await expect(changePartnerMemberRole(context, admin!, { memberId: memberIds[member!.userId]!, role: "owner" })).rejects.toMatchObject({ status: 403, code: "owner_only" });
      await expect(changePartnerMemberRole(context, admin!, { memberId: memberIds[owner.userId]!, role: "admin" })).rejects.toMatchObject({ status: 403, code: "owner_only" });
      await expect(removePartnerMember(context, admin!, { memberId: memberIds[owner.userId]! })).rejects.toMatchObject({ status: 403, code: "owner_only" });
      const ownerInvite = await invitePartnerMember(context, ownerActor, { email: "boss@example.invalid", role: "owner" });
      await expect(revokePartnerInvitation(context, admin!, { invitationId: ownerInvite.invitationId })).rejects.toMatchObject({ status: 403, code: "owner_only" });
      await revokePartnerInvitation(context, ownerActor, { invitationId: ownerInvite.invitationId });
      await expect(revokePartnerInvitation(context, ownerActor, { invitationId: ownerInvite.invitationId })).rejects.toMatchObject({ status: 409 });

      await changePartnerMemberRole(context, ownerActor, { memberId: memberIds[admin!.userId]!, role: "owner" });
      await removePartnerMember(context, admin!, { memberId: memberIds[member!.userId]! });
      expect(await roles()).toEqual({ [owner.userId]: "owner", [admin!.userId]: "owner" });
    });
  });

  it("refuses every team change from a member, while still showing them the team", async () => {
    await rollbackTest(async (tx) => {
      const { context, ownerActor, actors: [member], memberIds, owner } = await partnerWithTeam(tx, ["member"]);
      const pending = await invitePartnerMember(context, ownerActor, { email: "later@example.invalid", role: "member" });
      const team = await listPartnerTeam(context, member!);
      expect(team.role).toBe("member");
      expect(team.members).toHaveLength(2);
      expect(team.invitations.map((invitation) => invitation.invitationId)).toEqual([pending.invitationId]);
      // The role it was resolved with doesn't matter: the database's does.
      const claimsAdmin: PartnerMemberActor = { ...member!, role: "admin" };
      await expect(invitePartnerMember(context, claimsAdmin, { email: "friend@example.invalid", role: "member" })).rejects.toMatchObject({ status: 403 });
      await expect(changePartnerMemberRole(context, claimsAdmin, { memberId: memberIds[member!.userId]!, role: "admin" })).rejects.toMatchObject({ status: 403 });
      await expect(removePartnerMember(context, claimsAdmin, { memberId: memberIds[owner.userId]! })).rejects.toMatchObject({ status: 403 });
      await expect(revokePartnerInvitation(context, claimsAdmin, { invitationId: pending.invitationId })).rejects.toMatchObject({ status: 403 });
      // Row-level security refuses the change even without the domain's check.
      const direct = await withBusinessTransaction(context.db, { userId: member!.userId, actorType: "operator" }, async (inner) => await inner.execute(sql`update public.partner_members set role = 'owner' where user_id = ${member!.userId}::uuid returning id`));
      expect(direct.rows).toEqual([]);
    });
  });

  it("lets an admin's own SQL change only a member's role and status, and only an invitation's state", async () => {
    await rollbackTest(async (tx) => {
      const { context, ownerActor, actors: [admin], memberIds, owner } = await partnerWithTeam(tx, ["admin"]);
      const { partnerId: elsewhere } = await signUpPartner(context, { userId: admin!.userId, email: null, emailVerified: false, name: "Admin's Own Desk" });
      const { invitationId } = await invitePartnerMember(context, ownerActor, { email: "later@example.invalid", role: "member" });
      const asAdmin = async (statement: ReturnType<typeof sql>) => await withBusinessTransaction(context.db, { userId: admin!.userId, actorType: "operator" }, async (inner) => await inner.execute(statement)).then(() => null, (error: { cause?: { code?: string } }) => error.cause?.code);
      // Moving a row to another partner the admin runs, or to another person, or raising what an invitation grants.
      expect(await asAdmin(sql`update public.partner_members set partner_id = ${elsewhere}::uuid where id = ${memberIds[owner.userId]!}::uuid`)).toBe("42501");
      expect(await asAdmin(sql`update public.partner_members set user_id = ${admin!.userId}::uuid where id = ${memberIds[owner.userId]!}::uuid`)).toBe("42501");
      expect(await asAdmin(sql`update public.partner_invitations set role = 'owner', invited_by_user_id = ${owner.userId}::uuid where id = ${invitationId}::uuid`)).toBe("42501");
      expect(await asAdmin(sql`update public.partner_invitations set expires_at = now() + interval '1 year' where id = ${invitationId}::uuid`)).toBe("42501");
      expect((await listPartnerTeam(context, ownerActor)).members.map((row) => row.userId).sort()).toEqual([owner.userId, admin!.userId].sort());
      expect((await listPartnerTeam(context, ownerActor)).invitations).toEqual([expect.objectContaining({ invitationId, role: "member" })]);
    });
  });

  it("always keeps one owner", async () => {
    await rollbackTest(async (tx) => {
      const { context, ownerActor, memberIds, owner } = await partnerWithTeam(tx, ["owner"]);
      const second: PartnerMemberActor = { ...ownerActor, userId: Object.keys(memberIds).find((id) => id !== owner.userId)! };
      await changePartnerMemberRole(context, ownerActor, { memberId: memberIds[second.userId]!, role: "admin" });
      await expect(changePartnerMemberRole(context, ownerActor, { memberId: memberIds[owner.userId]!, role: "member" })).rejects.toMatchObject({ status: 409, code: "final_owner" });
      await expect(removePartnerMember(context, ownerActor, { memberId: memberIds[owner.userId]! })).rejects.toMatchObject({ status: 409, code: "final_owner" });
      expect((await listPartnerTeam(context, ownerActor)).members.find((row) => row.userId === owner.userId)?.role).toBe("owner");
    });
  });

  it("takes a removed member's access and the invitations they sent or received", async () => {
    await rollbackTest(async (tx) => {
      const { context, partnerId, ownerActor, actors: [admin], memberIds } = await partnerWithTeam(tx, ["admin"]);
      const sent = await invitePartnerMember(context, admin!, { email: "their-hire@example.invalid", role: "member" });
      const adminEmail = `${admin!.userId}@example.invalid`;
      const received = await invitePartnerMember(context, ownerActor, { email: adminEmail, role: "owner" });
      const untouched = await invitePartnerMember(context, ownerActor, { email: "someone@example.invalid", role: "member" });
      await removePartnerMember(context, ownerActor, { memberId: memberIds[admin!.userId]! });

      expect((await listPartnerTeam(context, ownerActor)).invitations.map((invitation) => invitation.invitationId)).toEqual([untouched.invitationId]);
      await expect(resolvePartnerActor(context, { userId: admin!.userId, partnerId })).rejects.toMatchObject({ status: 404 });
      await expect(listPartnerTeam(context, admin!)).rejects.toMatchObject({ status: 403 });
      expect(await listUserPartners(context, admin!.userId)).toEqual([]);
      await expect(acceptPartnerInvitation(context, { userId: admin!.userId, tokenHash: hashPartnerToken(await invitationToken(tx, received.invitationId)), email: adminEmail, emailVerified: true })).rejects.toMatchObject({ status: 409 });
      // The invitation the removed admin sent no longer works either.
      expect(await previewPartnerInvitation(context, { tokenHash: hashPartnerToken(await invitationToken(tx, sent.invitationId)) })).toMatchObject({ status: "revoked" });
    });
  });

  it("joins only the verified account the invitation went to, once, and keeps an active member's role", async () => {
    await rollbackTest(async (tx) => {
      const { context, partnerId, ownerActor, actors: [admin] } = await partnerWithTeam(tx, ["admin"]);
      const [invitee, stranger] = await asMigrator(tx, async () => {
        const made = [randomUUID(), randomUUID()].map((userId) => ({ userId, email: `${userId}@example.invalid` }));
        await tx.insert(users).values(made.map((person) => ({ id: person.userId, email: person.email, normalizedEmail: person.email, emailVerified: true })));
        return made;
      });
      const { invitationId } = await invitePartnerMember(context, ownerActor, { email: invitee!.email, role: "member" });
      const tokenHash = hashPartnerToken(await invitationToken(tx, invitationId));
      await expect(acceptPartnerInvitation(context, { userId: stranger!.userId, tokenHash, email: stranger!.email, emailVerified: true })).rejects.toMatchObject({ status: 403, code: "wrong_account" });
      await expect(acceptPartnerInvitation(context, { userId: invitee!.userId, tokenHash, email: invitee!.email, emailVerified: false })).rejects.toMatchObject({ status: 403, code: "wrong_account" });
      await expect(acceptPartnerInvitation(context, { userId: invitee!.userId, tokenHash: hashPartnerToken("made-up"), email: invitee!.email, emailVerified: true })).rejects.toMatchObject({ status: 404 });
      expect(await acceptPartnerInvitation(context, { userId: invitee!.userId, tokenHash, email: invitee!.email.toUpperCase(), emailVerified: true })).toEqual({ partnerId, role: "member" });
      await expect(acceptPartnerInvitation(context, { userId: invitee!.userId, tokenHash, email: invitee!.email, emailVerified: true })).rejects.toMatchObject({ status: 409 });

      // An admin who was invited again as a member stays an admin.
      const again = await invitePartnerMember(context, ownerActor, { email: `${admin!.userId}@example.invalid`, role: "member" });
      expect(await acceptPartnerInvitation(context, { userId: admin!.userId, tokenHash: hashPartnerToken(await invitationToken(tx, again.invitationId)), email: `${admin!.userId}@example.invalid`, emailVerified: true })).toEqual({ partnerId, role: "admin" });
    });
  });

  it("stops an invitation working once its sender can no longer send it", async () => {
    await rollbackTest(async (tx) => {
      const { context, ownerActor, actors: [admin], memberIds } = await partnerWithTeam(tx, ["admin"]);
      const [invitee] = await asMigrator(tx, async () => {
        const userId = randomUUID();
        await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, emailVerified: true });
        return [{ userId, email: `${userId}@example.invalid` }];
      });
      const { invitationId } = await invitePartnerMember(context, admin!, { email: invitee!.email, role: "admin" });
      await changePartnerMemberRole(context, ownerActor, { memberId: memberIds[admin!.userId]!, role: "member" });
      await expect(acceptPartnerInvitation(context, { userId: invitee!.userId, tokenHash: hashPartnerToken(await invitationToken(tx, invitationId)), email: invitee!.email, emailVerified: true })).rejects.toMatchObject({ status: 409, code: "invitation_stale" });
    });
  });
});

describe.skipIf(!client)("partner isolation", () => {
  it("never shows one partner's rows to another partner's members", async () => {
    vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
    await rollbackTest(async (tx) => {
      const first = await partnerWithTeam(tx, ["member"]);
      const second = await partnerWithTeam(tx, []);
      await invitePartnerMember(second.context, second.ownerActor, { email: "only-b@example.invalid", role: "member" });
      // The host's signup invitations hold other companies' emails; no operator reads them, owners included.
      await createPartnerSignupInvitation(first.context, { email: "next-partner@example.invalid" });
      const outsider = first.actors[0]!;
      const counts = await withBusinessTransaction(first.context.db, { userId: outsider.userId, actorType: "operator" }, async (inner) => (await inner.execute<{ partners: number; members: number; invitations: number; domains: number; listed: number; signupInvitations: number }>(sql`
        select
          (select count(*)::int from public.partners where id = ${second.partnerId}::uuid) as partners,
          (select count(*)::int from public.partner_members where partner_id = ${second.partnerId}::uuid) as members,
          (select count(*)::int from public.partner_invitations where partner_id = ${second.partnerId}::uuid) as invitations,
          (select count(*)::int from public.partner_domains where partner_id = ${second.partnerId}::uuid) as domains,
          (select count(*)::int from app.list_partner_members(${second.partnerId}::uuid)) as listed,
          (select count(*)::int from public.partner_signup_invitations) as "signupInvitations"
      `)).rows[0]);
      expect(counts).toEqual({ partners: 0, members: 0, invitations: 0, domains: 0, listed: 0, signupInvitations: 0 });
      const ownSignupInvitations = await withBusinessTransaction(first.context.db, { userId: first.owner.userId, actorType: "operator" }, async (inner) => (await inner.execute<{ count: number }>(sql`select count(*)::int as count from public.partner_signup_invitations`)).rows[0]?.count);
      expect(ownSignupInvitations).toBe(0);
      // Its own partner's rows are there.
      const own = await withBusinessTransaction(first.context.db, { userId: outsider.userId, actorType: "operator" }, async (inner) => (await inner.execute<{ count: number }>(sql`select count(*)::int as count from public.partner_members where partner_id = ${first.partnerId}::uuid`)).rows[0]?.count);
      expect(own).toBe(2);
      await expect(resolvePartnerActor(first.context, { userId: outsider.userId, partnerId: second.partnerId })).rejects.toMatchObject({ status: 404 });
      await expect(listPartnerTeam(first.context, { ...outsider, partnerId: second.partnerId })).rejects.toMatchObject({ status: 403 });
      await expect(invitePartnerMember(first.context, { kind: "member", partnerId: second.partnerId, userId: first.owner.userId, role: "owner" }, { email: "sneaky@example.invalid", role: "owner" })).rejects.toMatchObject({ status: 403 });
      // Nobody can create a partner or join one by writing the rows directly.
      const forged = await withBusinessTransaction(first.context.db, { userId: outsider.userId, actorType: "operator" }, async (inner) => await inner.execute(sql`insert into public.partner_members (partner_id, user_id, role) values (${second.partnerId}::uuid, ${outsider.userId}::uuid, 'owner')`)).then(() => null, (error: { cause?: { code?: string } }) => error.cause?.code);
      expect(forged).toBe("42501");
    });
  });
});

describe.skipIf(!client)("partner emails", () => {
  it("go out under the partner's name, from the partner base domain or else the host's address", async () => {
    await rollbackTest(async (tx) => {
      const { context, partnerId, owner } = await partnerWithTeam(tx, []);
      const partnerName = (await listUserPartners(context, owner.userId))[0]!.name;
      // The worker sends emails with no person or business in its context.
      await tx.execute(sql`set local role lobbystack_worker`);
      const brand = await brandForEmail(context, { kind: "partner", partnerId });
      expect(brand).toEqual({
        kind: "partner",
        partnerId,
        name: partnerName,
        logoUrl: null,
        faviconUrl: null,
        color: null,
        origin: "https://desk.example.test",
        links: { website: null, terms: null, privacy: null, support: null },
        email: { fromName: partnerName, fromAddress: "no-reply@desk.example.test", replyTo: null },
      });
      vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
      expect((await brandForEmail(context, { kind: "partner", partnerId })).email).toEqual({ fromName: partnerName, fromAddress: "no-reply@portal.example.test", replyTo: null });
      await expect(brandForEmail(context, { kind: "partner", partnerId: randomUUID() })).rejects.toThrow("was not found");
    });
  });
});
