import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { agentRules, auditLogs, businesses, businessInvitations, createDatabaseClient, knowledgeSnippets, outboxMessages, partners, receptionistProfiles, services, users } from "@lobbystack/db";
import { createPartnerPlatformKey, forgetCachedBrands, revokePartnerPlatformKey, signUpPartner, type DomainContext, type PartnerMemberActor } from "@lobbystack/domain";
import { apiOperations, type ApiOperation } from "@lobbystack/shared";

// lobbystack onboard with a partner's platform key, end to end: the CLI, run
// through its own test harness, sends its requests to the admin's v1 route
// handlers, which resolve the key and act on PostgreSQL with RLS, under the
// lobbystack_worker role as the admin does, and lobbystack_app where the
// console's partner operations run.

const setup = vi.hoisted(() => {
  const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
  if (testUrl) {
    const url = new URL(testUrl);
    if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
      throw new Error("The onboard integration test requires a dedicated local test database.");
    }
  }
  return { testUrl, contexts: undefined as undefined | { app: () => unknown; worker: () => unknown } };
});

vi.mock("../error-reporting", () => ({ reportServerError: vi.fn(async () => undefined) }));
// The phone number routes' server-only modules, which onboarding with a partner's key never reaches.
vi.mock("../twilio-provider", () => ({ getTwilioProvider: vi.fn(), getNumberClaimTokenSecret: vi.fn() }));
vi.mock("../phone-number-search-limit", () => ({ checkPhoneNumberSearchLimit: vi.fn() }));
// Point the routes' context factories at the test database's role pools.
vi.mock("../domain-context", () => ({
  createDomainContext: () => { if (!setup.contexts) throw new Error("No test database."); return setup.contexts.app(); },
  createWorkerDomainContext: () => { if (!setup.contexts) throw new Error("No test database."); return setup.contexts.worker(); },
}));
// The limiters keep their counts in Redis and have their own tests.
vi.mock("./rate-limit", async (importOriginal) => ({ ...(await importOriginal<typeof import("./rate-limit")>()), enforceApiRateLimit: vi.fn(async () => ({ allowed: true, limit: 120, remaining: 119, resetAt: 0 })) }));
vi.mock("../fixed-window-limit", () => ({ enforceFixedWindow: vi.fn(async () => ({ allowed: true })), fixedWindowLimit: (...args: unknown[]) => args }));

import { exitCodes } from "../../../../../packages/cli/src/errors";
import { runCli } from "../../../../../packages/cli/src/testing";
import { v1 } from "./routes";

function roleUrl(role: string): string {
  const url = new URL(setup.testUrl!);
  url.searchParams.set("options", `-c role=${role}`);
  return url.toString();
}

const migrator = setup.testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: setup.testUrl }) : undefined;
const app = setup.testUrl ? createDatabaseClient("lobbystack_app", { DATABASE_URL: roleUrl("lobbystack_app") }) : undefined;
const worker = setup.testUrl ? createDatabaseClient("lobbystack_worker", { DATABASE_URL: roleUrl("lobbystack_worker") }) : undefined;
if (app && worker) setup.contexts = { app: () => ({ db: app.db }), worker: () => ({ db: worker.db }) };
const appContext = (): DomainContext => ({ db: app!.db });

const environment = {
  APP_BASE_URL: "https://desk.example.test",
  DEPLOYMENT_MODE: "cloud",
  PARTNER_SIGNUP: "open",
  PARTNER_BASE_DOMAIN: "portal.example.test",
  MARKETING_HOSTS: "",
  EMAIL_FROM: "Front Desk <no-reply@desk.example.test>",
  PLATFORM_API_KEYS: "",
};

/** Hands each request to the v1 route handler its path and method bind, as the route files under app/api/v1 do. */
async function adminFetch(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const path = new URL(request.url).pathname.replace(/^\/api\/v1/, "");
  for (const [operationId, operation] of Object.entries(apiOperations) as Array<[keyof typeof v1, ApiOperation]>) {
    if (operation.method !== request.method) continue;
    const names: string[] = [];
    const pattern = new RegExp(`^${operation.path.replace(/\{([a-z_]+)\}/g, (_match, name: string) => { names.push(name); return "([^/]+)"; })}$`);
    const match = pattern.exec(path);
    if (!match) continue;
    const params = Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1]!)]));
    const handler = v1[operationId] as (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
    return await handler(request, { params: Promise.resolve(params) });
  }
  return Response.json({ error: { code: "not_found", message: `No route for ${request.method} ${path}.` } }, { status: 404 });
}

const made = { userIds: [] as string[], partnerIds: [] as string[], businessIds: [] as string[], directories: [] as string[] };

afterAll(async () => {
  if (migrator) {
    if (made.businessIds.length) {
      await migrator.db.delete(outboxMessages).where(inArray(outboxMessages.businessId, made.businessIds));
      await migrator.db.delete(businesses).where(inArray(businesses.id, made.businessIds));
    }
    if (made.partnerIds.length) await migrator.db.delete(partners).where(inArray(partners.id, made.partnerIds));
    if (made.userIds.length) await migrator.db.delete(users).where(inArray(users.id, made.userIds));
  }
  await Promise.all(made.directories.map(async (directory) => await rm(directory, { recursive: true, force: true })));
  await Promise.all([migrator?.pool.end(), app?.pool.end(), worker?.pool.end()]);
});

describe.skipIf(!setup.testUrl)("lobbystack onboard with a partner's platform key, through the admin's v1 routes", () => {
  it("creates the partner's business with its owner's invitation, sets it up, changes nothing on a rerun, and stops once the key is revoked", async () => {
    for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
    try {
      const ownerId = randomUUID();
      const ownerEmail = `${ownerId}@example.invalid`;
      await migrator!.db.insert(users).values({ id: ownerId, email: ownerEmail, normalizedEmail: ownerEmail, name: "Olive", emailVerified: true });
      made.userIds.push(ownerId);
      const { partnerId } = await signUpPartner(appContext(), { userId: ownerId, email: ownerEmail, emailVerified: true, name: `Acme Agency ${ownerId.slice(0, 8)}` });
      made.partnerIds.push(partnerId);
      const owner: PartnerMemberActor = { kind: "member", partnerId, userId: ownerId, role: "owner" };
      const { key, platformKey } = await createPartnerPlatformKey(appContext(), owner, { name: "Client onboarding", scopes: ["businesses:create", "business:read", "business:write", "knowledge:read", "knowledge:write", "team:manage"] });

      const directory = await mkdtemp(join(tmpdir(), "lobbystack-onboard-"));
      made.directories.push(directory);
      const manifest = join(directory, "harbor.yaml");
      const clientEmail = `owner-${randomUUID()}@harbor.example`;
      await writeFile(manifest, [
        "business:",
        "  name: Harbor Dental",
        "  timezone: America/Halifax",
        "  locale: fr",
        "  access_level: activity",
        "  hours:",
        "    - { day: mon, open: \"08:00\", close: \"17:00\" }",
        "receptionist:",
        "  greeting: Merci d'appeler Harbor Dental.",
        "services:",
        "  - { name: Cleaning, duration_minutes: 45 }",
        "rules:",
        "  - title: Emergencies",
        "    content: Send dental emergencies to the on-call dentist.",
        "knowledge:",
        "  faqs:",
        "    - question: Do you see children?",
        "      answer: Yes, from age three.",
        `owner: { email: ${clientEmail} }`,
        "",
      ].join("\n"));
      const onboard = async (args: string[] = []) => await runCli(["onboard", manifest, "--yes", "--json", ...args], { fetch: adminFetch as typeof fetch, env: { LOBBYSTACK_API_KEY: key } });

      const first = await onboard();
      expect(first.err).toBe("");
      expect(first.code).toBe(exitCodes.ok);
      const result = JSON.parse(first.out) as { business_id: string; changes: Array<{ step: string; action: string }>; waiting: string[]; failed: string[] };
      const businessId = result.business_id;
      made.businessIds.push(businessId);
      expect(result.waiting).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(result.changes).toEqual(expect.arrayContaining([
        expect.objectContaining({ step: "business", action: "created" }),
        expect.objectContaining({ step: "owner", action: "invited" }),
        expect.objectContaining({ step: "onboarding", action: "left open" }),
      ]));

      // The business is the partner's, at the access level the manifest asked for, and set up as it says.
      const [business] = await migrator!.db.select({ partnerId: businesses.partnerId, accessLevel: businesses.partnerAccessLevel, timezone: businesses.timezone, locale: businesses.defaultLocale }).from(businesses).where(eq(businesses.id, businessId));
      expect(business).toEqual({ partnerId, accessLevel: "activity", timezone: "America/Halifax", locale: "fr" });
      expect((await migrator!.db.select({ greeting: receptionistProfiles.greeting }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)))[0]?.greeting).toBe("Merci d'appeler Harbor Dental.");
      expect((await migrator!.db.select({ name: services.name }).from(services).where(eq(services.businessId, businessId))).map((row) => row.name)).toContain("Cleaning");
      expect((await migrator!.db.select({ title: agentRules.title }).from(agentRules).where(eq(agentRules.businessId, businessId))).map((row) => row.title)).toEqual(["Emergencies"]);
      expect(await migrator!.db.select({ id: knowledgeSnippets.id }).from(knowledgeSnippets).where(eq(knowledgeSnippets.businessId, businessId))).toHaveLength(1);
      // The key invited the owner as the partner, and never sent a claim link.
      const invitations = await migrator!.db.select().from(businessInvitations).where(eq(businessInvitations.businessId, businessId));
      expect(invitations).toEqual([expect.objectContaining({ normalizedEmail: clientEmail, role: "business_owner", transfersOwnership: false, invitedByUserId: null, invitedByPlatformKeyId: platformKey.id })]);
      // Every change is the key's, acting as the partner.
      const audits = await migrator!.db.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(eq(auditLogs.businessId, businessId));
      expect(audits.length).toBeGreaterThan(3);
      for (const entry of audits) expect(entry).toMatchObject({ actorUserId: null, payload: { platformKeyId: platformKey.id, partnerId } });

      // A rerun finds the business and changes nothing.
      const second = await onboard();
      expect(second.code).toBe(exitCodes.ok);
      const rerun = JSON.parse(second.out) as { business_id: string; changes: Array<{ step: string; action: string }> };
      expect(rerun.business_id).toBe(businessId);
      expect(rerun.changes.filter((change) => !["found", "unchanged", "left open"].includes(change.action))).toEqual([]);
      expect(await migrator!.db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.businessId, businessId))).toHaveLength(audits.length);

      // Revoked in the console, the key stops working at once.
      await revokePartnerPlatformKey(appContext(), owner, { platformKeyId: platformKey.id });
      const revoked = await onboard();
      expect(revoked.code).toBe(exitCodes.auth);
      expect(revoked.err).toContain("The API key is invalid or has been revoked.");
      expect(await migrator!.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId)))).toHaveLength(audits.length);
    } finally {
      vi.unstubAllEnvs();
      forgetCachedBrands();
    }
  });
});
