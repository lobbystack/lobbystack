import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Agency connections end to end against PostgreSQL with RLS: Better Auth's
// handler (registration, authorize, consent, token), the consent decision
// for a partner, the MCP endpoint resolving agency tokens and partner
// platform keys with the worker role, the partner operations on the app
// role, and the console's listing and disconnecting.

const setup = vi.hoisted(() => {
  const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
  if (testUrl) {
    const url = new URL(testUrl);
    if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
      throw new Error("Agency MCP integration tests require a dedicated local test database.");
    }
    const roleUrl = (role: string) => {
      const withRole = new URL(testUrl);
      withRole.searchParams.set("options", `-c role=${role}`);
      return withRole.toString();
    };
    process.env.DATABASE_URL = testUrl;
    process.env.LOBBYSTACK_AUTH_DATABASE_URL = roleUrl("lobbystack_auth");
    process.env.LOBBYSTACK_APP_DATABASE_URL = roleUrl("lobbystack_app");
    process.env.LOBBYSTACK_WORKER_DATABASE_URL = roleUrl("lobbystack_worker");
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.DEPLOYMENT_MODE = "cloud";
    process.env.PARTNER_SIGNUP = "open";
    process.env.PARTNER_BASE_DOMAIN = "portal.example.test";
    process.env.EMAIL_FROM = "Front Desk <no-reply@desk.example.test>";
    process.env.PLATFORM_API_KEYS = "";
    delete process.env.REDIS_URL;
  }
  return { testUrl };
});

vi.mock("../error-reporting", () => ({ reportServerError: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../domain-context", async () => {
  const { getDatabase } = await import("../databases");
  return { createDomainContext: () => ({ db: getDatabase("lobbystack_app").db }), createWorkerDomainContext: () => ({ db: getDatabase("lobbystack_worker").db }) };
});

import { accounts, auditLogs, businesses, createDatabaseClient, oauthAccessTokens, oauthConsents, oauthRefreshTokens, outboxMessages, partnerAuditLogs, partnerMembers, partners, users } from "@lobbystack/db";
import { acceptPartnerInvitation, changePartnerMemberRole, createPartnerBusiness, createPartnerPlatformKey, hashPartnerToken, invitePartnerMember, listGrantablePartners, listPartnerOAuthGrants, openPartnerBusiness, removePartnerMember, revokePartnerOAuthGrant, signUpPartner, type DomainContext, type PartnerMemberActor } from "@lobbystack/domain";
import type { ApiKeyScope } from "@lobbystack/shared";

import { getAuth } from "../auth";
import { getDatabase } from "../databases";
import { decideConsent } from "../oauth-consent";
import { hashReplacementPassword } from "../password";
import { createLobbyStackMcpHttpHandler } from "./handler";

const base = "http://localhost:3000";
const resource = `${base}/api/mcp`;
const redirectUri = "http://127.0.0.1:6276/oauth/callback";
const admin = setup.testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: setup.testUrl }) : undefined;
const b64url = (buffer: Buffer) => buffer.toString("base64url");
const app = (): DomainContext => ({ db: getDatabase("lobbystack_app").db });

type Person = { userId: string; email: string; cookie: string };
type Team = { partnerId: string; owner: Person; admin: Person; member: Person; actor: (person: Person) => PartnerMemberActor };
let clientId: string;
let northwind: Team;
let bright: Team;
let northwindBusiness: string;
let brightBusiness: string;
const cleanup = { users: [] as string[], partners: [] as string[] };
// Sign-in allows 5 a minute per address, so each person signs in from their own.
let signIns = Math.floor(Math.random() * 250);

async function auth(path: string, init: RequestInit = {}): Promise<Response> {
  return await getAuth().handler(new Request(`${base}/api/auth${path}`, init));
}

async function signedInPerson(): Promise<Person> {
  const userId = randomUUID();
  const email = `agency-it-${userId.slice(0, 8)}@example.com`;
  const password = `Pw-${randomBytes(12).toString("base64url")}9!`;
  const hash = await hashReplacementPassword(password);
  await admin!.db.insert(users).values({ id: userId, email, normalizedEmail: email, emailVerified: true, name: "Agency Person", passwordHash: hash, passwordAlgorithm: "lobbystack-scrypt-v1" });
  await admin!.db.insert(accounts).values({ userId, providerId: "credential", accountId: userId, password: hash });
  cleanup.users.push(userId);
  const response = await auth("/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: base, "x-forwarded-for": `198.51.100.${1 + (signIns++ % 250)}` }, body: JSON.stringify({ email, password }) });
  expect(response.status).toBe(200);
  return { userId, email, cookie: response.headers.getSetCookie().map((header) => header.split(";")[0]).join("; ") };
}

async function invitationToken(invitationId: string): Promise<string> {
  const [message] = await admin!.db.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send")));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

/** A partner signed up by its owner, with an admin and a member who accepted their invitations. */
async function team(name: string): Promise<Team> {
  const [owner, adminPerson, member] = [await signedInPerson(), await signedInPerson(), await signedInPerson()];
  const { partnerId } = await signUpPartner(app(), { userId: owner.userId, email: owner.email, emailVerified: true, name });
  cleanup.partners.push(partnerId);
  const actor = (person: Person): PartnerMemberActor => ({ kind: "member", partnerId, userId: person.userId, role: "member" });
  for (const [person, role] of [[adminPerson, "admin"], [member, "member"]] as const) {
    const { invitationId } = await invitePartnerMember(app(), { ...actor(owner), role: "owner" }, { email: person.email, role });
    await acceptPartnerInvitation(app(), { userId: person.userId, tokenHash: hashPartnerToken(await invitationToken(invitationId)), email: person.email, emailVerified: true });
  }
  return { partnerId, owner, admin: adminPerson, member, actor };
}

async function partnerBusiness(owner: Team, name: string): Promise<string> {
  const created = await createPartnerBusiness(app(), { ...owner.actor(owner.owner), role: "owner" }, { name, timezone: "America/Chicago", businessType: "hvac", accessLevel: "activity", ownerEmail: `${randomUUID()}@example.invalid` });
  return created.businessId;
}

function pkce() {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

async function authorizeToConsent(person: Person, challenge: string, scope: string): Promise<string> {
  const url = new URL(`${base}/api/auth/oauth2/authorize`);
  for (const [name, value] of Object.entries({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope, state: randomUUID(), code_challenge: challenge, code_challenge_method: "S256", resource })) url.searchParams.set(name, value);
  const response = await getAuth().handler(new Request(url, { headers: { cookie: person.cookie, accept: "application/json" } }));
  return ((await response.json()) as { url?: string }).url ?? "";
}

/** Runs the whole OAuth flow for an agency connection and returns its access token. */
async function agencyGrant(person: Person, partnerId: string, scopes: string[]): Promise<string> {
  const { verifier, challenge } = pkce();
  const consentUrl = await authorizeToConsent(person, challenge, `${scopes.join(" ")} offline_access`);
  const redirect = await decideConsent({ userId: person.userId, headers: new Headers({ cookie: person.cookie }), decision: { oauthQuery: new URL(consentUrl, base).search.slice(1), accept: true, partnerId, scopes } });
  const code = new URL(redirect).searchParams.get("code")!;
  const response = await auth("/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource }) });
  expect(response.status).toBe(200);
  return String(((await response.json()) as { access_token: string }).access_token);
}

const mcpHandler = setup.testUrl ? createLobbyStackMcpHttpHandler({ rateLimit: async () => ({ allowed: true, limit: 120, remaining: 119, resetAt: 0 }), partnerLimit: async () => undefined, log: () => undefined }) : undefined;

async function mcp(token: string): Promise<Client> {
  const client = new Client({ name: "agency-integration", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(resource), { requestInit: { headers: { authorization: `Bearer ${token}` } }, fetch: async (input, init) => await mcpHandler!(new Request(input, init)) }));
  return client;
}

async function mcpStatus(token: string): Promise<number> {
  const response = await mcpHandler!(new Request(resource, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } } }) }));
  return response.status;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ data?: Record<string, unknown> & { data?: Array<Record<string, unknown>> }; error?: { code: string; message: string } }> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) return { error: (JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as { error: { code: string; message: string } }).error };
  return { data: result.structuredContent as Record<string, unknown> & { data?: Array<Record<string, unknown>> } };
}

/** Puts the person on the team with this role, as accepting an invitation does, and returns their member id. */
async function join(owner: Team, person: Person, role: "admin" | "member"): Promise<string> {
  const { invitationId } = await invitePartnerMember(app(), { ...owner.actor(owner.owner), role: "owner" }, { email: person.email, role });
  await acceptPartnerInvitation(app(), { userId: person.userId, tokenHash: hashPartnerToken(await invitationToken(invitationId)), email: person.email, emailVerified: true });
  return await memberId(owner, person);
}

async function memberId(owner: Team, person: Person): Promise<string> {
  const [row] = await admin!.db.select({ id: partnerMembers.id }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, owner.partnerId), eq(partnerMembers.userId, person.userId)));
  return row!.id;
}

const opensOf = async (businessId: string, person: Person) => await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), eq(auditLogs.eventType, "partner.business_opened"), eq(auditLogs.actorUserId, person.userId)));

const setRole = async (partnerId: string, person: Person, role: "owner" | "admin" | "member") => { await admin!.db.update(partnerMembers).set({ role }).where(and(eq(partnerMembers.partnerId, partnerId), eq(partnerMembers.userId, person.userId))); };

describe.skipIf(!setup.testUrl)("agency connections to the MCP server against PostgreSQL with RLS", () => {
  beforeAll(async () => {
    const registration = await auth("/oauth2/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Agency Client", redirect_uris: [redirectUri], token_endpoint_auth_method: "none" }) });
    expect(registration.status).toBe(201);
    clientId = ((await registration.json()) as { client_id: string }).client_id;
    northwind = await team("Northwind Agency");
    bright = await team("Bright Desk");
    northwindBusiness = await partnerBusiness(northwind, "Joe's Heating");
    brightBusiness = await partnerBusiness(bright, "Bright Client");
  }, 60_000);

  afterAll(async () => {
    if (admin) {
      if (cleanup.partners.length) {
        const owned = await admin.db.select({ id: businesses.id }).from(businesses).where(inArray(businesses.partnerId, cleanup.partners));
        if (owned.length) await admin.db.delete(businesses).where(inArray(businesses.id, owned.map((row) => row.id)));
        await admin.db.delete(oauthAccessTokens).where(inArray(oauthAccessTokens.referenceId, cleanup.partners.map((id) => `partner:${id}`)));
        await admin.db.delete(partners).where(inArray(partners.id, cleanup.partners));
      }
      if (cleanup.users.length) await admin.db.delete(users).where(inArray(users.id, cleanup.users));
    }
    await Promise.all([admin?.pool.end(), getDatabase("lobbystack_auth").pool.end(), getDatabase("lobbystack_app").pool.end(), getDatabase("lobbystack_worker").pool.end()]);
  });

  it("offers on the consent page only the agencies the person is on, and refuses another", async () => {
    expect((await listGrantablePartners(app(), northwind.member.userId)).map((partner) => partner.partnerId)).toEqual([northwind.partnerId]);
    const { challenge } = pkce();
    const consentUrl = await authorizeToConsent(northwind.member, challenge, "partner:read offline_access");
    await expect(decideConsent({ userId: northwind.member.userId, headers: new Headers({ cookie: northwind.member.cookie }), decision: { oauthQuery: new URL(consentUrl, base).search.slice(1), accept: true, partnerId: bright.partnerId, scopes: ["partner:read"] } })).rejects.toMatchObject({ status: 403 });
    // Someone removed from the team gets no agency to pick.
    const leaver = await signedInPerson();
    const { invitationId } = await invitePartnerMember(app(), { ...northwind.actor(northwind.owner), role: "owner" }, { email: leaver.email, role: "member" });
    await acceptPartnerInvitation(app(), { userId: leaver.userId, tokenHash: hashPartnerToken(await invitationToken(invitationId)), email: leaver.email, emailVerified: true });
    await admin!.db.update(partnerMembers).set({ status: "removed" }).where(and(eq(partnerMembers.partnerId, northwind.partnerId), eq(partnerMembers.userId, leaver.userId)));
    expect(await listGrantablePartners(app(), leaver.userId)).toEqual([]);
  });

  it("works for the partner while the person is on its team, with their role at the time of each request", async () => {
    const token = await agencyGrant(northwind.member, northwind.partnerId, ["partner:read", "partner.businesses:write", "business:read", "calls:read"]);
    expect(token).toMatch(/^lsa_/);
    const [approval] = await admin!.db.select({ actorUserId: partnerAuditLogs.actorUserId, payload: partnerAuditLogs.payload }).from(partnerAuditLogs).where(and(eq(partnerAuditLogs.partnerId, northwind.partnerId), eq(partnerAuditLogs.eventType, "oauth_grant.approved"), eq(partnerAuditLogs.actorUserId, northwind.member.userId)));
    expect(approval?.payload).toMatchObject({ clientId, partnerRole: "member", scopes: expect.arrayContaining(["partner:read"]) });

    const client = await mcp(token);
    const tools = Object.fromEntries((await client.listTools()).tools.map((tool) => [tool.name, tool]));
    expect(tools.delete_business!.annotations).toMatchObject({ destructiveHint: true });
    expect(tools.list_businesses!.annotations).toMatchObject({ readOnlyHint: true });
    expect(tools.get_business!.inputSchema.required).toContain("business_id");
    expect((await call(client, "get_partner")).data).toMatchObject({ id: northwind.partnerId, name: "Northwind Agency", pool: null });
    const listed = (await call(client, "list_businesses")).data!.data!;
    expect(listed.map((row) => row.id)).toEqual([northwindBusiness]);
    // Members never see billing.
    expect(listed[0]!.billing).toBeNull();
    expect((await call(client, "get_business_billing", { business_id: northwindBusiness })).error).toMatchObject({ code: "forbidden" });

    // A member can't delete a business; once made an admin, the next request can.
    expect((await call(client, "delete_business", { business_id: northwindBusiness })).error).toMatchObject({ code: "forbidden" });
    const doomed = await partnerBusiness(northwind, "Short-lived");
    await setRole(northwind.partnerId, northwind.member, "admin");
    expect((await call(client, "delete_business", { business_id: doomed })).data).toEqual({ id: doomed, deleted: true });
    await setRole(northwind.partnerId, northwind.member, "member");
    expect((await call(client, "delete_business", { business_id: northwindBusiness })).error).toMatchObject({ code: "forbidden" });
    await client.close();

    // Removed from the team, the person's connection stops at once.
    await admin!.db.update(partnerMembers).set({ status: "removed" }).where(and(eq(partnerMembers.partnerId, northwind.partnerId), eq(partnerMembers.userId, northwind.member.userId)));
    expect(await mcpStatus(token)).toBe(401);
    await admin!.db.update(partnerMembers).set({ status: "active" }).where(and(eq(partnerMembers.partnerId, northwind.partnerId), eq(partnerMembers.userId, northwind.member.userId)));
  });

  it("reaches only the partner's own businesses, through an open the business's audit log records", async () => {
    const token = await agencyGrant(northwind.admin, northwind.partnerId, ["partner:read", "business:read", "calls:read"]);
    const client = await mcp(token);
    // An activity-only business still gets the partner's full access, as in the console.
    expect((await call(client, "get_business", { business_id: northwindBusiness })).data).toMatchObject({ id: northwindBusiness, name: "Joe's Heating" });
    expect((await call(client, "list_calls", { business_id: northwindBusiness })).data).toMatchObject({ data: [] });
    const opens = await admin!.db.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, northwindBusiness), eq(auditLogs.eventType, "partner.business_opened"), eq(auditLogs.actorUserId, northwind.admin.userId)));
    // Two calls, one open: the open lasts hours, so the second call reuses it.
    expect(opens).toHaveLength(1);
    expect(opens[0]!.payload).toMatchObject({ partnerId: northwind.partnerId, partnerRole: "admin" });
    // Another partner's business answers as one that doesn't exist, and nothing opens it.
    expect((await call(client, "get_business", { business_id: brightBusiness })).error).toMatchObject({ code: "not_found" });
    expect((await call(client, "get_business", { business_id: randomUUID() })).error).toMatchObject({ code: "not_found" });
    expect(await admin!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, brightBusiness), eq(auditLogs.eventType, "partner.business_opened"), eq(auditLogs.actorUserId, northwind.admin.userId)))).toEqual([]);
    await client.close();
  });

  it("keeps billing to owners for people, and to an owner's billing scopes for keys", async () => {
    // An admin can't grant the billing scopes on the consent page.
    const { challenge } = pkce();
    const adminConsent = await authorizeToConsent(northwind.admin, challenge, "partner.billing:read offline_access");
    await expect(decideConsent({ userId: northwind.admin.userId, headers: new Headers({ cookie: northwind.admin.cookie }), decision: { oauthQuery: new URL(adminConsent, base).search.slice(1), accept: true, partnerId: northwind.partnerId, scopes: ["partner.billing:read"] } })).rejects.toMatchObject({ status: 403, code: "owner_only" });

    const ownerToken = await agencyGrant(northwind.owner, northwind.partnerId, ["partner:read", "partner.billing:read"]);
    const ownerClient = await mcp(ownerToken);
    expect((await call(ownerClient, "get_billing")).data).toMatchObject({ tier: "free" });
    // The owner made an admin keeps the grant, but billing follows the role on the next request.
    const coOwner = northwind.admin;
    await setRole(northwind.partnerId, coOwner, "owner");
    await setRole(northwind.partnerId, northwind.owner, "admin");
    expect((await call(ownerClient, "get_billing")).error).toMatchObject({ code: "forbidden" });
    expect((await call(ownerClient, "get_partner")).data).toMatchObject({ pool: null });
    await setRole(northwind.partnerId, northwind.owner, "owner");
    await setRole(northwind.partnerId, coOwner, "admin");
    await ownerClient.close();

    // A key reads billing only with the scope an owner granted it, as on the v1 Partner endpoints.
    const ownerActor = { ...northwind.actor(northwind.owner), role: "owner" as const };
    const withBilling = await createPartnerPlatformKey(app(), ownerActor, { name: "Assistant", scopes: ["partner:read", "partner.billing:read"] satisfies ApiKeyScope[] });
    const keyClient = await mcp(withBilling.key);
    expect((await call(keyClient, "get_billing")).data).toMatchObject({ tier: "free" });
    await keyClient.close();
    const without = await createPartnerPlatformKey(app(), ownerActor, { name: "Assistant", scopes: ["partner:read"] satisfies ApiKeyScope[] });
    const plainClient = await mcp(without.key);
    expect((await plainClient.listTools()).tools.map((tool) => tool.name)).not.toContain("get_billing");
    await plainClient.close();
  });

  it("lets a partner's platform key act on its own businesses only", async () => {
    const created = await createPartnerPlatformKey(app(), { ...northwind.actor(northwind.owner), role: "owner" }, { name: "Coding assistant", scopes: ["partner:read", "business:read"] satisfies ApiKeyScope[] });
    const client = await mcp(created.key);
    expect((await call(client, "list_businesses")).data!.data!.map((row) => row.id)).toContain(northwindBusiness);
    expect((await call(client, "get_business", { business_id: northwindBusiness })).data).toMatchObject({ id: northwindBusiness });
    expect((await call(client, "get_business", { business_id: brightBusiness })).error).toMatchObject({ code: "not_found" });
    await client.close();
  });

  it("lists agency connections for owners and admins, the person's own for a member, and disconnects them", async () => {
    const memberToken = await agencyGrant(northwind.member, northwind.partnerId, ["partner:read"]);
    const adminToken = await agencyGrant(northwind.admin, northwind.partnerId, ["partner:read"]);
    const memberView = await listPartnerOAuthGrants(app(), northwind.actor(northwind.member));
    expect(memberView.length).toBeGreaterThan(0);
    expect(memberView.every((grant) => grant.grantedBy?.userId === northwind.member.userId)).toBe(true);
    const adminView = await listPartnerOAuthGrants(app(), northwind.actor(northwind.admin));
    expect(new Set(adminView.map((grant) => grant.grantedBy?.userId))).toEqual(new Set([northwind.member.userId, northwind.admin.userId, northwind.owner.userId]));
    // Another partner's team sees none of them.
    expect(await listPartnerOAuthGrants(app(), { ...bright.actor(bright.owner), partnerId: bright.partnerId })).toEqual([]);

    // A member can't disconnect someone else's.
    const adminsGrant = adminView.find((grant) => grant.grantedBy?.userId === northwind.admin.userId)!;
    expect(await revokePartnerOAuthGrant(app(), northwind.actor(northwind.member), { grantId: adminsGrant.id })).toBe(false);
    expect(await mcpStatus(adminToken)).toBe(200);
    // An admin can, and the client's next request fails.
    const membersGrant = memberView[0]!;
    expect(await revokePartnerOAuthGrant(app(), northwind.actor(northwind.admin), { grantId: membersGrant.id })).toBe(true);
    expect(await mcpStatus(memberToken)).toBe(401);
    const [revoked] = await admin!.db.select({ actorUserId: partnerAuditLogs.actorUserId }).from(partnerAuditLogs).where(and(eq(partnerAuditLogs.partnerId, northwind.partnerId), eq(partnerAuditLogs.eventType, "oauth_grant.revoked"), eq(partnerAuditLogs.entityId, membersGrant.id)));
    expect(revoked?.actorUserId).toBe(northwind.admin.userId);
    // The person disconnects their own.
    expect(await revokePartnerOAuthGrant(app(), northwind.actor(northwind.admin), { grantId: adminsGrant.id })).toBe(true);
    expect(await mcpStatus(adminToken)).toBe(401);
  });

  it("ends a person's agency connections when they're removed from the team, so re-adding them doesn't bring them back", async () => {
    const person = await signedInPerson();
    const id = await join(northwind, person, "admin");
    const token = await agencyGrant(person, northwind.partnerId, ["partner:read"]);
    // Their connection to another partner stays.
    await join(bright, person, "member");
    const brightToken = await agencyGrant(person, bright.partnerId, ["partner:read"]);
    expect(await mcpStatus(token)).toBe(200);

    // A role change changes what they may do, and keeps the connection.
    await changePartnerMemberRole(app(), { ...northwind.actor(northwind.owner), role: "owner" }, { memberId: id, role: "member" });
    expect(await mcpStatus(token)).toBe(200);

    await removePartnerMember(app(), { ...northwind.actor(northwind.owner), role: "owner" }, { memberId: id });
    expect(await mcpStatus(token)).toBe(401);
    const reference = `partner:${northwind.partnerId}`;
    expect(await admin!.db.select({ id: oauthConsents.id }).from(oauthConsents).where(and(eq(oauthConsents.userId, person.userId), eq(oauthConsents.referenceId, reference)))).toEqual([]);
    const live = (table: typeof oauthAccessTokens | typeof oauthRefreshTokens) => admin!.db.select({ id: table.id, revoked: table.revoked }).from(table).where(and(eq(table.userId, person.userId), eq(table.referenceId, reference)));
    expect((await live(oauthAccessTokens)).length).toBeGreaterThan(0);
    expect((await live(oauthAccessTokens)).every((row) => row.revoked !== null)).toBe(true);
    expect((await live(oauthRefreshTokens)).length).toBeGreaterThan(0);
    expect((await live(oauthRefreshTokens)).every((row) => row.revoked !== null)).toBe(true);
    const [revoked] = await admin!.db.select({ actorUserId: partnerAuditLogs.actorUserId, payload: partnerAuditLogs.payload }).from(partnerAuditLogs).where(and(eq(partnerAuditLogs.partnerId, northwind.partnerId), eq(partnerAuditLogs.eventType, "oauth_grant.revoked"), sql`${partnerAuditLogs.payload}->>'grantedByUserId' = ${person.userId}`));
    expect(revoked).toMatchObject({ actorUserId: northwind.owner.userId, payload: { reason: "member_removed", clientId } });
    expect(await mcpStatus(brightToken)).toBe(200);

    // Back on the team, the old connection stays ended until they connect again.
    await join(northwind, person, "member");
    expect(await mcpStatus(token)).toBe(401);
    expect(await mcpStatus(await agencyGrant(person, northwind.partnerId, ["partner:read"]))).toBe(200);
  });

  it("refuses another partner's business even while the person holds a fresh open of it from that partner's console", async () => {
    const person = await signedInPerson();
    await join(northwind, person, "admin");
    const brightId = await join(bright, person, "admin");
    const theirs = await partnerBusiness(bright, "Bright Other");
    await openPartnerBusiness(app(), { userId: person.userId, businessId: theirs, partnerId: bright.partnerId });
    const token = await agencyGrant(person, northwind.partnerId, ["partner:read", "business:read", "calls:read"]);
    const client = await mcp(token);
    expect((await call(client, "get_business", { business_id: theirs })).error).toMatchObject({ code: "not_found" });
    expect((await call(client, "list_calls", { business_id: theirs })).error).toMatchObject({ code: "not_found" });
    // Off Bright's team, the open still running reaches nothing either.
    await removePartnerMember(app(), { ...bright.actor(bright.owner), role: "owner" }, { memberId: brightId });
    expect((await call(client, "get_business", { business_id: theirs })).error).toMatchObject({ code: "not_found" });
    // Only the console's open is in the business's audit log.
    expect(await opensOf(theirs, person)).toHaveLength(1);
    await client.close();
  });

  it("refuses a business that's no longer active, even with a fresh open of it", async () => {
    const person = await signedInPerson();
    await join(northwind, person, "admin");
    const suspended = await partnerBusiness(northwind, "Paused Plumbing");
    await openPartnerBusiness(app(), { userId: person.userId, businessId: suspended, partnerId: northwind.partnerId });
    await admin!.db.update(businesses).set({ status: "suspended" }).where(eq(businesses.id, suspended));
    const client = await mcp(await agencyGrant(person, northwind.partnerId, ["partner:read", "business:read"]));
    expect((await call(client, "get_business", { business_id: suspended })).error).toMatchObject({ code: "not_found" });
    await client.close();
  });

  it("reuses a fresh open the person made in the console, without another audit row", async () => {
    const person = await signedInPerson();
    await join(northwind, person, "admin");
    const business = await partnerBusiness(northwind, "Fresh Furnaces");
    await openPartnerBusiness(app(), { userId: person.userId, businessId: business, partnerId: northwind.partnerId });
    const client = await mcp(await agencyGrant(person, northwind.partnerId, ["partner:read", "business:read"]));
    expect((await call(client, "get_business", { business_id: business })).data).toMatchObject({ id: business });
    expect((await call(client, "get_business", { business_id: business })).data).toMatchObject({ id: business });
    expect(await opensOf(business, person)).toHaveLength(1);
    await client.close();
  });
});
