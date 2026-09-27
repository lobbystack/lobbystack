import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The whole OAuth flow in process against PostgreSQL with RLS: Better Auth's
// handler (DCR, authorize, consent, token, revoke), the consent decision, the
// MCP endpoint resolving tokens with the worker role, and the dashboard's
// grant management with the app role.

const setup = vi.hoisted(() => {
  const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
  if (testUrl) {
    const url = new URL(testUrl);
    if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
      throw new Error("OAuth integration tests require a dedicated local test database.");
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
    delete process.env.REDIS_URL;
  }
  return { testUrl };
});

vi.mock("./error-reporting", () => ({ reportServerError: vi.fn(async () => undefined) }));
vi.mock("./domain-context", async () => {
  const { getDatabase } = await import("./databases");
  return { createDomainContext: () => ({ db: getDatabase("lobbystack_app").db }), createWorkerDomainContext: () => ({ db: getDatabase("lobbystack_worker").db }) };
});

import { auditLogs, businessMemberships, businesses, createDatabaseClient, oauthAccessTokens, oauthConsents, receptionistProfiles, users, accounts } from "@lobbystack/db";
import { listOAuthGrants, revokeOAuthGrant } from "@lobbystack/domain";

import { getAuth } from "./auth";
import { getDatabase } from "./databases";
import { createLobbyStackMcpHttpHandler } from "./mcp/handler";
import { authorizationServerMetadataResponse } from "./mcp/oauth-metadata";
import { decideConsent } from "./oauth-consent";
import { hashReplacementPassword } from "./password";

const base = "http://localhost:3000";
const resource = `${base}/api/mcp`;
const redirectUri = "http://127.0.0.1:6276/oauth/callback";
const admin = setup.testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: setup.testUrl }) : undefined;
const b64url = (buffer: Buffer) => buffer.toString("base64url");
/** Drizzle wraps the PostgreSQL error; the cause carries its message. */
const permissionDenied = (error: unknown) => /permission denied/.test(String((error as { cause?: { message?: string } }).cause?.message ?? (error as Error).message));

type Session = { userId: string; cookie: string };
let owner: Session;
let businessA: string;
let businessB: string;
let viewerBusiness: string;
let clientId: string;
const cleanup = { users: [] as string[], businesses: [] as string[] };

async function auth(path: string, init: RequestInit = {}): Promise<Response> {
  return await getAuth().handler(new Request(`${base}/api/auth${path}`, init));
}

async function seedBusiness(name: string, userId: string, role: string): Promise<string> {
  const businessId = randomUUID();
  await admin!.db.insert(businesses).values({ id: businessId, slug: `oauth-it-${businessId}`, name, timezone: "UTC", businessType: "test" });
  await admin!.db.insert(receptionistProfiles).values({ businessId, greeting: "Hi", tone: "warm", summary: name, bookingPolicy: "Book", transferMode: "never", bookingMode: "instant" });
  await admin!.db.insert(businessMemberships).values({ businessId, userId, role });
  cleanup.businesses.push(businessId);
  return businessId;
}

async function signedInOwner(): Promise<Session> {
  const userId = randomUUID();
  const email = `oauth-it-${userId.slice(0, 8)}@example.com`;
  const password = `Pw-${randomBytes(12).toString("base64url")}9!`;
  const hash = await hashReplacementPassword(password);
  await admin!.db.insert(users).values({ id: userId, email, normalizedEmail: email, emailVerified: true, name: "Owner", passwordHash: hash, passwordAlgorithm: "lobbystack-scrypt-v1" });
  await admin!.db.insert(accounts).values({ userId, providerId: "credential", accountId: userId, password: hash });
  cleanup.users.push(userId);
  const response = await auth("/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email, password }) });
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().map((header) => header.split(";")[0]).join("; ");
  return { userId, cookie };
}

function pkce() {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

/** Runs authorize for the signed-in owner and returns the signed consent query. */
async function authorizeToConsent(session: Session, challenge: string, scope: string, extra: Record<string, string> = {}): Promise<string> {
  const url = new URL(`${base}/api/auth/oauth2/authorize`);
  for (const [name, value] of Object.entries({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope, state: randomUUID(), code_challenge: challenge, code_challenge_method: "S256", resource, ...extra })) url.searchParams.set(name, value);
  const response = await getAuth().handler(new Request(url, { headers: { cookie: session.cookie, accept: "application/json" } }));
  const body = await response.json() as { url?: string };
  return body.url ?? "";
}

async function approve(session: Session, consentUrl: string, businessId: string, scopes: string[]): Promise<string> {
  const url = await decideConsent({ userId: session.userId, headers: new Headers({ cookie: session.cookie }), decision: { oauthQuery: new URL(consentUrl, base).search.slice(1), accept: true, businessId, scopes } });
  return new URL(url).searchParams.get("code")!;
}

async function token(body: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await auth("/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function grant(businessId: string, scopes: string[]): Promise<{ access: string; refresh: string }> {
  const { verifier, challenge } = pkce();
  const consentUrl = await authorizeToConsent(owner, challenge, `${scopes.join(" ")} offline_access`);
  const code = await approve(owner, consentUrl, businessId, scopes);
  const issued = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource });
  expect(issued.status).toBe(200);
  return { access: String(issued.body.access_token), refresh: String(issued.body.refresh_token) };
}

const mcpHandler = setup.testUrl ? createLobbyStackMcpHttpHandler({ rateLimit: async () => ({ allowed: true, limit: 120, remaining: 119, resetAt: 0 }), log: () => undefined }) : undefined;

async function mcp(accessToken: string): Promise<Client> {
  const client = new Client({ name: "oauth-integration", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(resource), { requestInit: { headers: { authorization: `Bearer ${accessToken}` } }, fetch: async (input, init) => await mcpHandler!(new Request(input, init)) }));
  return client;
}

async function mcpStatus(accessToken: string): Promise<number> {
  const response = await mcpHandler!(new Request(resource, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } } }) }));
  return response.status;
}

describe.skipIf(!setup.testUrl)("OAuth for MCP against PostgreSQL with RLS", () => {
  beforeAll(async () => {
    owner = await signedInOwner();
    businessA = await seedBusiness("OAuth IT A", owner.userId, "business_owner");
    businessB = await seedBusiness("OAuth IT B", owner.userId, "business_admin");
    viewerBusiness = await seedBusiness("OAuth IT Viewer", owner.userId, "viewer");
    const registration = await auth("/oauth2/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Integration Client", redirect_uris: [redirectUri], token_endpoint_auth_method: "none" }) });
    expect(registration.status).toBe(201);
    clientId = (await registration.json() as { client_id: string }).client_id;
  });

  afterAll(async () => {
    if (admin) {
      if (cleanup.businesses.length) {
        await admin.db.delete(oauthAccessTokens).where(inArray(oauthAccessTokens.referenceId, cleanup.businesses));
        await admin.db.delete(businesses).where(inArray(businesses.id, cleanup.businesses));
      }
      if (cleanup.users.length) await admin.db.delete(users).where(inArray(users.id, cleanup.users));
    }
    await Promise.all([admin?.pool.end(), getDatabase("lobbystack_auth").pool.end(), getDatabase("lobbystack_app").pool.end(), getDatabase("lobbystack_worker").pool.end()]);
  });

  it("publishes authorization server metadata with PKCE, DCR and CIMD", async () => {
    const response = await authorizationServerMetadataResponse(new Request(`${base}/.well-known/oauth-authorization-server/api/auth`));
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toMatchObject({
      issuer: `${base}/api/auth`,
      authorization_endpoint: `${base}/api/auth/oauth2/authorize`,
      token_endpoint: `${base}/api/auth/oauth2/token`,
      registration_endpoint: `${base}/api/auth/oauth2/register`,
      revocation_endpoint: `${base}/api/auth/oauth2/revoke`,
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
      grant_types_supported: ["authorization_code", "refresh_token"],
      scopes_supported: expect.arrayContaining(["calls:read", "offline_access"]),
    });
  });

  it("registers web clients only with https redirect URIs", async () => {
    const web = await auth("/oauth2/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Web", redirect_uris: ["http://example.com/cb"], token_endpoint_auth_method: "none" }) });
    expect(web.status).toBe(400);
  });

  it("refuses a CIMD client_id that points at a private address, without fetching it", async () => {
    const url = new URL(`${base}/api/auth/oauth2/authorize`);
    const { challenge } = pkce();
    for (const [name, value] of Object.entries({ response_type: "code", client_id: "https://127.0.0.1/client.json", redirect_uri: "https://127.0.0.1/cb", scope: "calls:read", code_challenge: challenge, code_challenge_method: "S256" })) url.searchParams.set(name, value);
    const response = await getAuth().handler(new Request(url, { headers: { cookie: owner.cookie, accept: "application/json" } }));
    const body = JSON.stringify(await response.json().catch(() => ({})));
    expect(body).toMatch(/invalid_client|invalid_request/);
    expect(body).not.toContain("code=");
  });

  it("requires PKCE and rejects a wrong or missing verifier", async () => {
    const withoutPkce = await authorizeToConsent(owner, "", "calls:read", { code_challenge_method: "" });
    expect(new URL(withoutPkce).searchParams.get("error")).toBe("invalid_request");

    const { challenge } = pkce();
    const code = await approve(owner, await authorizeToConsent(owner, challenge, "calls:read"), businessA, ["calls:read"]);
    const wrong = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: pkce().verifier, resource });
    expect([400, 401]).toContain(wrong.status);
    expect(wrong.body.error_description).toBe("code verification failed");
    expect(wrong.body.access_token).toBeUndefined();

    const other = pkce();
    const code2 = await approve(owner, await authorizeToConsent(owner, other.challenge, "calls:read"), businessA, ["calls:read"]);
    const missing = await token({ grant_type: "authorization_code", code: code2, redirect_uri: redirectUri, client_id: clientId, resource });
    // Without a verifier a public client can't authenticate at all.
    expect([400, 401]).toContain(missing.status);
    expect(missing.body.access_token).toBeUndefined();
  });

  it("always asks for consent, and refuses businesses the person can't manage", async () => {
    const { challenge } = pkce();
    const consentUrl = await authorizeToConsent(owner, challenge, "calls:read offline_access");
    expect(new URL(consentUrl, base).pathname).toBe("/oauth/consent");
    await expect(approve(owner, consentUrl, viewerBusiness, ["calls:read"])).rejects.toMatchObject({ status: 403 });
  });

  it("issues opaque prefixed tokens limited to the approved scopes and business", async () => {
    const { access, refresh } = await grant(businessA, ["business:read", "knowledge:write"]);
    expect(access).toMatch(/^lsa_/);
    expect(refresh).toMatch(/^lsr_/);
    const [stored] = await admin!.db.select({ token: oauthAccessTokens.token, referenceId: oauthAccessTokens.referenceId, resources: oauthAccessTokens.resources }).from(oauthAccessTokens).where(eq(oauthAccessTokens.referenceId, businessA)).limit(1);
    expect(stored!.token).not.toContain(access.slice(4));
    expect(stored!.resources).toEqual([resource]);

    const client = await mcp(access);
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual(["add_knowledge", "get_business", "list_services", "list_staff"]);
    expect((await client.callTool({ name: "get_business", arguments: {} })).structuredContent).toMatchObject({ id: businessA });
    const added = await client.callTool({ name: "add_knowledge", arguments: { type: "faq", question: "Parking?", answer: "Behind the building." } });
    expect(added.isError ?? false).toBe(false);
    await client.close();

    const [grantRow] = await admin!.db.select({ id: oauthConsents.id }).from(oauthConsents).where(and(eq(oauthConsents.referenceId, businessA), eq(oauthConsents.clientId, clientId)));
    const [audit] = await admin!.db.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, businessA), eq(auditLogs.eventType, "api.knowledge.created")));
    expect(audit).toEqual({ actorUserId: owner.userId, payload: expect.objectContaining({ actor: "mcp", grantId: grantRow!.id }) });
    expect(JSON.stringify(audit!.payload)).not.toContain("lsa_");
  });

  it("keeps a business A token out of business B", async () => {
    const { access } = await grant(businessA, ["contacts:read", "contacts:write"]);
    const tokenB = await grant(businessB, ["contacts:read", "contacts:write"]);
    const clientB = await mcp(tokenB.access);
    const created = await clientB.callTool({ name: "create_contact", arguments: { name: "Only in B", phone: "+14165550911" } });
    const contactB = (created.structuredContent as { id: string }).id;
    await clientB.close();
    const clientA = await mcp(access);
    const lookup = await clientA.callTool({ name: "get_contact", arguments: { contact_id: contactB } });
    expect(lookup.isError).toBe(true);
    expect((lookup.content as Array<{ text: string }>)[0]!.text).toContain("not_found");
    await clientA.close();
  });

  it("rotates refresh tokens and ends the family when a rotated token is replayed", async () => {
    const { access, refresh } = await grant(businessA, ["calls:read"]);
    const rotated = await token({ grant_type: "refresh_token", refresh_token: refresh, client_id: clientId, resource });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refresh_token).not.toBe(refresh);
    expect(await mcpStatus(String(rotated.body.access_token))).toBe(200);
    const replay = await token({ grant_type: "refresh_token", refresh_token: refresh, client_id: clientId, resource });
    expect(replay.body.error).toBe("invalid_grant");
    expect(await mcpStatus(String(rotated.body.access_token))).toBe(401);
    expect(await mcpStatus(access)).toBe(401);
  });

  it("revokes a grant from the dashboard, and stops tokens when the owner loses the role", async () => {
    const tokens = await grant(businessB, ["calls:read"]);
    expect(await mcpStatus(tokens.access)).toBe(200);
    const context = { db: getDatabase("lobbystack_app").db };
    const listed = await listOAuthGrants(context, { userId: owner.userId, businessId: businessB });
    expect(listed.map((row) => row.clientName)).toContain("Integration Client");
    // The app role sees only this business's grants.
    expect((await listOAuthGrants(context, { userId: owner.userId, businessId: businessA })).every((row) => !listed.some((other) => other.id === row.id))).toBe(true);
    expect(await revokeOAuthGrant(context, { userId: owner.userId, businessId: businessA, grantId: listed[0]!.id })).toBe(false);
    expect(await revokeOAuthGrant(context, { userId: owner.userId, businessId: businessB, grantId: listed[0]!.id })).toBe(true);
    expect(await mcpStatus(tokens.access)).toBe(401);
    expect((await token({ grant_type: "refresh_token", refresh_token: tokens.refresh, client_id: clientId, resource })).body.error).toBe("invalid_grant");

    const again = await grant(businessB, ["calls:read"]);
    expect(await mcpStatus(again.access)).toBe(200);
    await admin!.db.update(businessMemberships).set({ role: "viewer" }).where(and(eq(businessMemberships.businessId, businessB), eq(businessMemberships.userId, owner.userId)));
    expect(await mcpStatus(again.access)).toBe(401);
    await admin!.db.update(businessMemberships).set({ role: "business_admin" }).where(and(eq(businessMemberships.businessId, businessB), eq(businessMemberships.userId, owner.userId)));
  });

  it("shows who connected each app, including other members, only to members of that business", async () => {
    // A second admin of business A connects the same client.
    const colleague = await signedInOwner();
    await admin!.db.insert(businessMemberships).values({ businessId: businessA, userId: colleague.userId, role: "business_admin" });
    const { verifier, challenge } = pkce();
    const code = await approve(colleague, await authorizeToConsent(colleague, challenge, "calls:read offline_access"), businessA, ["calls:read"]);
    expect((await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource })).status).toBe(200);
    const [colleagueRow] = await admin!.db.select({ email: users.email }).from(users).where(eq(users.id, colleague.userId));

    // The owner lists A's grants with the application role and sees the colleague's name and email.
    const context = { db: getDatabase("lobbystack_app").db };
    const listed = await listOAuthGrants(context, { userId: owner.userId, businessId: businessA });
    expect(listed.find((row) => row.grantedBy?.userId === colleague.userId)?.grantedBy).toEqual({ userId: colleague.userId, name: "Owner", email: colleagueRow!.email });

    // The function answers nothing outside an operator context for that business.
    const app = getDatabase("lobbystack_app").db;
    const bare = await app.execute<{ user_id: string }>(sql`select user_id from app.list_oauth_grantors(${businessA}::uuid)`);
    expect(bare.rows).toEqual([]);
    const outsider = await signedInOwner();
    const foreign = await app.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${outsider.userId}, true), set_config('app.business_id', ${businessA}, true), set_config('app.actor_type', 'operator', true)`);
      return await tx.execute<{ user_id: string }>(sql`select user_id from app.list_oauth_grantors(${businessA}::uuid)`);
    });
    expect(foreign.rows).toEqual([]);
  });

  it("revokes an access token through the RFC 7009 endpoint", async () => {
    const tokens = await grant(businessA, ["calls:read"]);
    const response = await auth("/oauth2/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: tokens.access, token_type_hint: "access_token", client_id: clientId }) });
    expect(response.status).toBe(200);
    expect(await mcpStatus(tokens.access)).toBe(401);
  });

  it("keeps the OAuth tables away from roles that have no policy", async () => {
    const worker = getDatabase("lobbystack_worker").db;
    await expect(worker.execute(sql`select count(*) from public.oauth_access_tokens`)).rejects.toSatisfy(permissionDenied);
    const app = getDatabase("lobbystack_app").db;
    // Without an operator context the app role sees no grants at all.
    const rows = await app.execute<{ count: string }>(sql`select count(*)::text as count from public.oauth_consents`);
    expect(rows.rows[0]!.count).toBe("0");
    await expect(app.execute(sql`select client_secret from public.oauth_clients`)).rejects.toSatisfy(permissionDenied);
    await expect(app.execute(sql`select token from public.oauth_access_tokens`)).rejects.toSatisfy(permissionDenied);
  });
});
