import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, billingAccounts, businesses, businessInvitations, businessTemplateFiles, businessTemplates, createDatabaseClient, outboxMessages, partnerMembers, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { FakeStripeConnect } from "@lobbystack/providers/stripe/fakeStripeConnect";
import { onboardManifestSchema, type BusinessTemplate } from "@lobbystack/shared";

import { forgetCachedBrands } from "./brands";
import { applyStoredBusinessTemplate, deleteBusinessTemplate, exportBusinessTemplate, listBusinessTemplates, loadBusinessTemplateInTransaction, saveBusinessTemplate, type BusinessSetupDependencies, type TemplateStorage } from "./businessTemplates";
import { acceptPartnerInvitation, createPartnerBusiness, hashPartnerToken, invitePartnerMember, listPartnerBusinesses, signUpPartner, type PartnerMemberActor } from "./partners";
import { createPartnerPackage, recordStripeConnectEvent, startPartnerStripeOnboarding } from "./partnerStripe";
import {
  completeKnowledgeUploadForApi,
  createKnowledgeEntryForApi,
  createKnowledgeSourceForApi,
  createKnowledgeUploadForApi,
  createRuleForApi,
  createServiceForApi,
  getBusinessForApi,
  getReceptionistForApi,
  listKnowledgeEntriesForApi,
  listKnowledgeSourcesForApi,
  listRulesForApi,
  listServicesForApi,
  listStaffForApi,
  updateBusinessForApi,
  updateKnowledgeEntryForApi,
  updateReceptionistForApi,
  type PartnerMemberCaller,
} from "./publicApi/operations";
import { uploadObjectKey } from "./storage";
import type { DomainContext } from "./context";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Business template integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  vi.stubEnv("PARTNER_SIGNUP", "open");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
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

type Person = { userId: string; email: string };

/** Accounts made as the migrator; every call after this runs as the app role. */
async function people(tx: DatabaseTransaction, count: number): Promise<Person[]> {
  const made = Array.from({ length: count }, () => {
    const userId = randomUUID();
    return { userId, email: `${userId}@example.invalid` };
  });
  await tx.execute(sql`reset role`);
  await tx.insert(users).values(made.map((person) => ({ id: person.userId, email: person.email, normalizedEmail: person.email, name: `Person ${person.userId.slice(0, 4)}`, emailVerified: true })));
  await tx.execute(sql`set local role lobbystack_app`);
  return made;
}

/** Reads or writes as the migrator, then goes back to the app role. */
async function asMigrator<T>(tx: DatabaseTransaction, run: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  try {
    return await run();
  } finally {
    await tx.execute(sql`set local role lobbystack_app`);
  }
}

/**
 * The worker's context, as the admin's /api/v1 routes and the console's
 * template use it: each transaction runs as lobbystack_worker, whose actor
 * type the database trusts only on that role, then goes back to the app role.
 */
function workerContext(tx: DatabaseTransaction): DomainContext {
  const db = {
    async transaction<T>(callback: (inner: DatabaseTransaction) => Promise<T>): Promise<T> {
      await tx.execute(sql`set local session authorization lobbystack_worker`);
      try {
        return await tx.transaction(callback);
      } finally {
        await tx.execute(sql`reset session authorization`);
        await tx.execute(sql`set local role lobbystack_app`);
      }
    },
  };
  return { db: db as unknown as Database };
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("base64");

/** Storage in memory that checks a checksum it's given, as S3 and the local store do. */
function memoryStorage() {
  const objects = new Map<string, { body: Uint8Array; contentType: string; checksum: string }>();
  const storage: TemplateStorage = {
    async createUpload(input) { return { url: `https://storage.example.test/${input.key}`, headers: {} }; },
    async headObject(input) {
      const object = objects.get(input.key);
      return object ? { length: object.body.byteLength, contentType: object.contentType, checksum: object.checksum } : null;
    },
    async getObject(input) {
      const object = objects.get(input.key);
      if (!object) throw new Error(`No object at ${input.key}.`);
      return object.body;
    },
    async putObject(input) {
      if (input.checksum && input.checksum !== sha256(input.body)) throw new Error("Checksum mismatch.");
      objects.set(input.key, { body: input.body, contentType: input.contentType, checksum: sha256(input.body) });
    },
    async deleteObject(input) { objects.delete(input.key); },
    async createDownloadUrl(input) { return `https://storage.example.test/${input.key}`; },
  };
  return { storage, objects };
}

/** The link token in the email queued for an invitation. */
async function linkToken(tx: DatabaseTransaction, invitationId: string): Promise<string> {
  const [message] = await asMigrator(tx, async () => await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))));
  return new URL(String(message!.payload.url)).searchParams.get("token")!;
}

/** A refusal's error, or the database error a refused statement raised. */
async function refusal(promise: Promise<unknown>): Promise<{ status?: number; code?: string; message?: string }> {
  return await promise.then(() => ({}), (error: { cause?: { code?: string; message?: string } } & Record<string, unknown>) => (error.cause?.code ? error.cause : error) as { status?: number; code?: string; message?: string });
}

/** A partner signed up by its owner, with a member and an admin on its team. */
async function partner(tx: DatabaseTransaction, name: string) {
  const [owner, member, admin] = await people(tx, 3);
  const context = { db: tx as unknown as Database };
  const { partnerId } = await signUpPartner(context, { userId: owner!.userId, email: owner!.email, emailVerified: true, name });
  const ownerActor: PartnerMemberActor = { kind: "member", partnerId, userId: owner!.userId, role: "owner" };
  for (const [person, role] of [[member!, "member"], [admin!, "admin"]] as const) {
    const { invitationId } = await invitePartnerMember(context, ownerActor, { email: person.email, role });
    await acceptPartnerInvitation(context, { userId: person.userId, tokenHash: hashPartnerToken(await linkToken(tx, invitationId)), email: person.email, emailVerified: true });
  }
  return {
    context,
    partnerId,
    member: member!,
    admin: admin!,
    ownerActor,
    memberActor: { kind: "member", partnerId, userId: member!.userId, role: "member" } satisfies PartnerMemberActor,
    adminActor: { kind: "member", partnerId, userId: admin!.userId, role: "admin" } satisfies PartnerMemberActor,
  };
}

type Acme = Awaited<ReturnType<typeof partner>>;

const GREETING = "Thanks for calling. How can we help your smile today?";

/**
 * Harbor Dental, set up through the API's operations as the partner's admin:
 * French callers, Monday hours, its own website, a receptionist with a
 * transfer number, a service only its own staff member takes and one turned
 * off, a rule, an FAQ and a text, an FAQ turned off, its own site and a guide
 * on another site as sources, and a document.
 */
async function harborDental(tx: DatabaseTransaction, acme: Acme, setup: BusinessSetupDependencies): Promise<string> {
  const { businessId } = await createPartnerBusiness(acme.context, acme.adminActor, { name: "Harbor Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@harbor.invalid" });
  const caller: PartnerMemberCaller = { businessId, partnerId: acme.partnerId, userId: acme.admin.userId, actor: "partner_member" };
  const { worker, storage } = setup;
  await updateBusinessForApi(worker, caller, { locale: "fr", website_url: "https://harbor.example.com", hours: [{ day: "monday", open: "08:00", close: "17:00" }] });
  await updateReceptionistForApi(worker, caller, { greeting: GREETING, tone: "warm", summary: "A family dental clinic by the harbor.", transfer_mode: "on_request", transfer_number: "+14165550100", booking_mode: "request" });
  const [staffMember] = await listStaffForApi(worker, caller);
  await createServiceForApi(worker, caller, { name: "Cleaning", description: "A checkup and a cleaning.", duration_minutes: 45, staff_ids: [staffMember!.id] });
  await createServiceForApi(worker, caller, { name: "Whitening", duration_minutes: 60, active: false });
  await createRuleForApi(worker, caller, { title: "Emergencies", content: "Send dental emergencies to the dentist on call." });
  await createKnowledgeEntryForApi(worker, caller, { type: "faq", question: "Do you take new patients?", answer: "Yes, every weekday." });
  const retired = await createKnowledgeEntryForApi(worker, caller, { type: "faq", question: "Do you open on Sundays?", answer: "Not anymore." });
  await updateKnowledgeEntryForApi(worker, caller, retired.id, { active: false });
  await createKnowledgeEntryForApi(worker, caller, { type: "text", title: "Parking", content: "Park behind the building." });
  await createKnowledgeSourceForApi(worker, caller, { type: "website", url: "https://harbor.example.com" });
  await createKnowledgeSourceForApi(worker, caller, { type: "website", url: "https://www.harbor.example.com/services" });
  await createKnowledgeSourceForApi(worker, caller, { type: "website", url: "https://dental-guide.example.org/faq" });
  const bytes = new TextEncoder().encode("Cleaning: $120\nWhitening: $300\n");
  const upload = await createKnowledgeUploadForApi(worker, caller, { file_name: "prices.txt", content_type: "text/plain", length: bytes.byteLength, checksum_sha256: sha256(bytes) }, storage);
  await storage.putObject({ key: uploadObjectKey(businessId, "knowledge", upload.upload_id, "prices.txt"), body: bytes, contentType: "text/plain", checksum: sha256(bytes) });
  await completeKnowledgeUploadForApi(worker, caller, upload.upload_id, { title: "Price list", tags: ["pricing"] }, storage);
  return businessId;
}

// Harbor's own website and the pages read from it describe Harbor alone, so the template leaves them out.
const harborTemplate = {
  business: { name: "Harbor Dental", timezone: "America/Toronto", locale: "fr", business_type: "dental", hours: [{ day: "monday", open: "08:00", close: "17:00" }] },
  receptionist: expect.objectContaining({ greeting: GREETING, tone: "warm", summary: "A family dental clinic by the harbor.", transfer_mode: "on_request", booking_mode: "request" }),
  services: [
    { name: "Cleaning", slug: "cleaning", description: "A checkup and a cleaning.", duration_minutes: 45, active: true },
    { name: "Whitening", slug: "whitening", duration_minutes: 60, active: false },
  ],
  rules: [{ title: "Emergencies", content: "Send dental emergencies to the dentist on call.", active: true }],
  knowledge: {
    websites: ["https://dental-guide.example.org/faq"],
    read_full_site: false,
    files: [{ path: "prices.txt", title: "Price list", tags: ["pricing"] }],
    faqs: [{ question: "Do you take new patients?", answer: "Yes, every weekday." }],
    texts: [{ title: "Parking", content: "Park behind the building." }],
  },
};

describe.skipIf(!client)("business templates", () => {
  it("saves a business's setup in the onboard file format, without its ids, plan, numbers or owner, and starts a new business with it", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const { storage, objects } = memoryStorage();
      const setup = { worker: workerContext(tx), storage };
      const harbor = await harborDental(tx, acme, setup);

      const exported = await exportBusinessTemplate(acme.context, acme.adminActor, harbor);
      expect(exported).toEqual(harborTemplate);
      // The transfer number, the service's staff and the business's own ids stay with it, and the file reads as a manifest.
      expect(exported.receptionist).not.toHaveProperty("transfer_number");
      expect(Object.keys(exported).sort()).toEqual(["business", "knowledge", "receptionist", "rules", "services"]);
      expect(JSON.stringify(exported)).not.toContain(harbor);
      expect(onboardManifestSchema.safeParse(exported).success).toBe(true);

      const saved = await saveBusinessTemplate(acme.context, acme.adminActor, { businessId: harbor, name: "  Dental   clinic " }, setup);
      expect(saved).toMatchObject({ name: "Dental clinic", template: exported });
      // Anyone on the team sees it, members included.
      expect(await listBusinessTemplates(acme.context, acme.memberActor)).toEqual([saved]);
      // The template keeps a copy of the document of its own.
      const [copy] = await asMigrator(tx, async () => await tx.select().from(businessTemplateFiles).where(eq(businessTemplateFiles.templateId, saved.templateId)));
      expect(copy).toMatchObject({ partnerId: acme.partnerId, path: "prices.txt", contentType: "text/plain" });
      expect(copy!.objectKey).toMatch(new RegExp(`^partners/${acme.partnerId}/templates/${saved.templateId}/`));
      expect(new TextDecoder().decode(objects.get(copy!.objectKey)!.body)).toBe("Cleaning: $120\nWhitening: $300\n");

      const { businessId: pier, invitationId } = await createPartnerBusiness(acme.context, acme.adminActor, { name: "Pier Dental", timezone: "America/Vancouver", businessType: "service_company", accessLevel: "activity", ownerEmail: "owner@pier.invalid", templateId: saved.templateId }, setup);
      const caller: PartnerMemberCaller = { businessId: pier, partnerId: acme.partnerId, userId: acme.admin.userId, actor: "partner_member" };
      const { worker } = setup;
      // Its name and time zone are its own; the rest is the template's.
      expect(await getBusinessForApi(worker, caller)).toMatchObject({ name: "Pier Dental", timezone: "America/Vancouver", locale: "fr", business_type: "dental", website_url: null, hours: [{ day: "monday", open: "08:00", close: "17:00" }] });
      expect(await getReceptionistForApi(worker, caller)).toMatchObject({ greeting: GREETING, tone: "warm", summary: "A family dental clinic by the harbor.", summary_source: "operator", booking_mode: "request", transfer_number: null });
      expect((await listServicesForApi(worker, caller, { includeInactive: true })).map((service) => [service.name, service.active, service.staff_ids])).toEqual([["Cleaning", true, []], ["Whitening", false, []]]);
      expect((await listRulesForApi(worker, caller)).map((rule) => rule.title)).toEqual(["Emergencies"]);
      expect((await listKnowledgeEntriesForApi(worker, caller, {})).data.map((entry) => [entry.type, entry.title]).sort()).toEqual([["faq", "Do you take new patients?"], ["text", "Parking"]]);
      const sources = (await listKnowledgeSourcesForApi(worker, caller, {})).data;
      expect(sources.map((source) => [source.type, source.title]).sort()).toEqual([["file", "Price list"], ["website", "https://dental-guide.example.org/faq"]]);
      // The document uploaded from the template's copy, under the new business.
      expect([...objects.keys()].filter((key) => key.startsWith(`${pier}/knowledge/`)).map((key) => new TextDecoder().decode(objects.get(key)!.body))).toEqual(["Cleaning: $120\nWhitening: $300\n"]);

      // The partner's admin read Harbor's setup without opening it, so Harbor's audit log records each read, and the template it was for.
      const exportsOfHarbor = await asMigrator(tx, async () => await tx.select({ actorUserId: auditLogs.actorUserId, entityId: auditLogs.entityId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, harbor), eq(auditLogs.eventType, "partner.business_setup_exported"))).orderBy(auditLogs.createdAt, auditLogs.id));
      expect(exportsOfHarbor).toEqual(expect.arrayContaining([
        { actorUserId: acme.admin.userId, entityId: harbor, payload: { partnerId: acme.partnerId, partnerRole: "admin" } },
        { actorUserId: acme.admin.userId, entityId: harbor, payload: { partnerId: acme.partnerId, partnerRole: "admin", templateId: saved.templateId, templateName: "Dental clinic" } },
      ]));
      expect(exportsOfHarbor).toHaveLength(2);

      // The owner's invitation went out once the template was applied, and the audit log names the template and the partner's admin.
      const recorded = await asMigrator(tx, async () => ({
        invitation: await tx.select({ email: businessInvitations.email }).from(businessInvitations).where(eq(businessInvitations.id, invitationId)),
        email: await tx.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, invitationId), eq(outboxMessages.topic, "email.send"))),
        created: await tx.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, pier), eq(auditLogs.eventType, "partner.business_created"))),
        service: await tx.select({ actorUserId: auditLogs.actorUserId, payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, pier), eq(auditLogs.eventType, "api.service.created"))),
      }));
      expect(recorded.invitation).toEqual([{ email: "owner@pier.invalid" }]);
      expect(recorded.email).toHaveLength(1);
      expect(recorded.created).toEqual([{ actorUserId: acme.admin.userId, payload: { partnerId: acme.partnerId, accessLevel: "activity", packageId: null, ownerInvitationId: invitationId, templateId: saved.templateId } }]);
      expect(recorded.service[0]).toEqual({ actorUserId: acme.admin.userId, payload: { actor: "partner_member", partnerId: acme.partnerId } });

      // Applying it again changes nothing, as a rerun of lobbystack onboard doesn't.
      const stored = await withBusinessTransaction(acme.context.db, { userId: acme.admin.userId, actorType: "operator" }, async (inner) => await loadBusinessTemplateInTransaction(inner, { partnerId: acme.partnerId, templateId: saved.templateId }));
      const again = await applyStoredBusinessTemplate(setup, { partnerId: acme.partnerId, userId: acme.admin.userId, businessId: pier, template: stored, keep: { name: "Pier Dental", timezone: "America/Vancouver" } });
      expect(again.changes.filter((change) => change.action !== "unchanged")).toEqual([]);
      expect(again.changes.map((change) => change.step)).toEqual(["details", "receptionist", "service Cleaning", "service Whitening", "rule Emergencies", "websites", "files", "FAQ Do you take new patients?", "text Parking"]);
    });
  });

  it("names the new business wherever the saved receptionist, services, rules and knowledge named the one it came from, by the whole name", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const setup = { worker: workerContext(tx), storage: memoryStorage().storage };
      const { businessId } = await createPartnerBusiness(acme.context, acme.adminActor, { name: "Harbor Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@harbor.invalid" });
      const caller: PartnerMemberCaller = { businessId, partnerId: acme.partnerId, userId: acme.admin.userId, actor: "partner_member" };
      // Harbor Dentalview is another name, which stays.
      await updateReceptionistForApi(setup.worker, caller, { greeting: "Thanks for calling Harbor Dental. How can we help?", voice_instructions: "Say Harbor Dental opens at 8, next to Harbor Dentalview." });
      await createServiceForApi(setup.worker, caller, { name: "Harbor Dental checkup", description: "A Harbor Dental cleaning.", duration_minutes: 30 });
      await createRuleForApi(setup.worker, caller, { title: "Harbor Dental hours", content: "Harbor Dental closes on Sundays." });
      await createKnowledgeEntryForApi(setup.worker, caller, { type: "faq", question: "Where is Harbor Dental?", answer: "Harbor Dental is on Main Street." });
      const saved = await saveBusinessTemplate(acme.context, acme.adminActor, { businessId, name: "Dental" }, setup);
      // A name with $& in it goes in as written.
      const { businessId: pier } = await createPartnerBusiness(acme.context, acme.adminActor, { name: "Pier $& Dental", timezone: "America/Vancouver", businessType: "service_company", accessLevel: "full", ownerEmail: "owner@pier.invalid", templateId: saved.templateId }, setup);
      const at = { ...caller, businessId: pier };
      expect(await getReceptionistForApi(setup.worker, at)).toMatchObject({ greeting: "Thanks for calling Pier $& Dental. How can we help?", voice_instructions: "Say Pier $& Dental opens at 8, next to Harbor Dentalview." });
      expect((await listServicesForApi(setup.worker, at, { includeInactive: true })).map((service) => [service.name, service.description])).toEqual([["Pier $& Dental checkup", "A Pier $& Dental cleaning."]]);
      expect((await listRulesForApi(setup.worker, at)).map((rule) => [rule.title, rule.content])).toEqual([["Pier $& Dental hours", "Pier $& Dental closes on Sundays."]]);
      expect((await listKnowledgeEntriesForApi(setup.worker, at, {})).data.map((entry) => [entry.title, entry.content])).toEqual([["Where is Pier $& Dental?", "Pier $& Dental is on Main Street."]]);
    });
  });

  it("leaves out a greeting written for the business's name and a summary no person wrote", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const { businessId } = await createPartnerBusiness(acme.context, acme.adminActor, { name: "Fresh Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@fresh.invalid" });
      const exported: BusinessTemplate = await exportBusinessTemplate(acme.context, acme.adminActor, businessId);
      expect(exported.business).toEqual({ name: "Fresh Dental", timezone: "America/Toronto", locale: "en", business_type: "dental" });
      expect(exported.receptionist).not.toHaveProperty("greeting");
      expect(exported.receptionist).not.toHaveProperty("summary");
      expect(exported).not.toHaveProperty("knowledge");
    });
  });

  it("keeps each partner's templates to its own team, and saving, deleting and applying them to owners and admins", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const bright = await partner(tx, "Bright Desk");
      const { storage, objects } = memoryStorage();
      const setup = { worker: workerContext(tx), storage };
      const harbor = await harborDental(tx, acme, setup);
      const { businessId: beacon } = await createPartnerBusiness(bright.context, bright.adminActor, { name: "Beacon Vets", timezone: "America/Toronto", businessType: "vet", accessLevel: "full", ownerEmail: "owner@beacon.invalid" });

      // A member works inside businesses but doesn't manage templates.
      expect(await refusal(saveBusinessTemplate(acme.context, acme.memberActor, { businessId: harbor, name: "Dental" }, setup))).toMatchObject({ status: 403 });
      expect(await refusal(exportBusinessTemplate(acme.context, acme.memberActor, harbor))).toMatchObject({ status: 403 });
      // Another partner's business, or one that doesn't exist, answers as not found.
      expect(await refusal(exportBusinessTemplate(acme.context, acme.adminActor, beacon))).toMatchObject({ status: 404, code: "business_not_found" });
      expect(await refusal(saveBusinessTemplate(bright.context, bright.adminActor, { businessId: harbor, name: "Dental" }, setup))).toMatchObject({ status: 404, code: "business_not_found" });
      expect(await refusal(saveBusinessTemplate(acme.context, acme.adminActor, { businessId: harbor, name: " " }, setup))).toMatchObject({ status: 400, code: "invalid_name" });

      const saved = await saveBusinessTemplate(acme.context, acme.adminActor, { businessId: harbor, name: "Dental" }, setup);
      expect(await listBusinessTemplates(bright.context, bright.memberActor)).toEqual([]);
      // Bright can't start a business from Acme's template, and a member can't create one at all.
      const refusedForBright = await refusal(createPartnerBusiness(bright.context, bright.adminActor, { name: "Copy", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@copy.invalid", templateId: saved.templateId }, setup));
      expect(refusedForBright).toMatchObject({ status: 404, code: "template_not_found" });
      expect(await refusal(createPartnerBusiness(acme.context, acme.memberActor, { name: "Copy", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@copy.invalid", templateId: saved.templateId }, setup))).toMatchObject({ status: 403 });

      // Row-level security shows the templates only to someone on the partner's team, as an operator or the system actor.
      const visible = (userId: string, actorType: "operator" | "system") => withBusinessTransaction(acme.context.db, { userId, actorType }, async (inner) => (await inner.select({ id: businessTemplates.id }).from(businessTemplates)).map((row) => row.id));
      expect(await visible(acme.member.userId, "operator")).toEqual([saved.templateId]);
      expect(await visible(acme.member.userId, "system")).toEqual([saved.templateId]);
      expect(await visible(bright.admin.userId, "operator")).toEqual([]);
      const [client] = await people(tx, 1);
      expect(await visible(client!.userId, "system")).toEqual([]);
      // A member can't save one by writing the rows themselves, nor delete one.
      const memberInsert = await refusal(withBusinessTransaction(acme.context.db, { userId: acme.member.userId, actorType: "operator" }, async (inner) => await inner.insert(businessTemplates).values({ partnerId: acme.partnerId, name: "Mine", manifest: {} })));
      expect(memberInsert).toMatchObject({ code: "42501" });
      const memberDelete = await withBusinessTransaction(acme.context.db, { userId: acme.member.userId, actorType: "operator" }, async (inner) => await inner.delete(businessTemplates).where(eq(businessTemplates.id, saved.templateId)).returning({ id: businessTemplates.id }));
      expect(memberDelete).toEqual([]);
      expect(await refusal(deleteBusinessTemplate(acme.context, acme.memberActor, { templateId: saved.templateId }))).toMatchObject({ status: 403 });
      expect(await refusal(deleteBusinessTemplate(bright.context, bright.adminActor, { templateId: saved.templateId }))).toMatchObject({ status: 404, code: "template_not_found" });

      // Deleting it queues the deletion of its copies, and businesses made from it keep what it set up.
      const { businessId: pier } = await createPartnerBusiness(acme.context, acme.adminActor, { name: "Pier Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@pier.invalid", templateId: saved.templateId }, setup);
      const [copy] = await asMigrator(tx, async () => await tx.select({ objectKey: businessTemplateFiles.objectKey }).from(businessTemplateFiles).where(eq(businessTemplateFiles.templateId, saved.templateId)));
      await deleteBusinessTemplate(acme.context, acme.adminActor, { templateId: saved.templateId });
      expect(await listBusinessTemplates(acme.context, acme.adminActor)).toEqual([]);
      const cleanup = await asMigrator(tx, async () => await tx.select({ businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, saved.templateId), eq(outboxMessages.topic, "privacy.deleteStoredObjects"))));
      expect(cleanup).toEqual([{ businessId: null, payload: { objectKeys: [copy!.objectKey] } }]);
      expect(objects.has(copy!.objectKey)).toBe(true);
      expect((await listRulesForApi(setup.worker, { businessId: pier, partnerId: acme.partnerId, userId: acme.admin.userId, actor: "partner_member" })).map((rule) => rule.title)).toEqual(["Emergencies"]);
    });
  });

  it("leaves no business and sends no invitation when its template can't be applied", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const { storage, objects } = memoryStorage();
      const setup = { worker: workerContext(tx), storage };
      const harbor = await harborDental(tx, acme, setup);
      const saved = await saveBusinessTemplate(acme.context, acme.adminActor, { businessId: harbor, name: "Dental" }, setup);
      // The template's copy of its document is gone from storage.
      for (const key of [...objects.keys()].filter((candidate) => candidate.startsWith("partners/"))) objects.delete(key);

      await expect(createPartnerBusiness(acme.context, acme.adminActor, { name: "Pier Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@pier.invalid", templateId: saved.templateId }, setup)).rejects.toThrow();
      expect((await listPartnerBusinesses(acme.context, acme.adminActor)).map((business) => business.name)).toEqual(["Harbor Dental"]);
      const left = await asMigrator(tx, async () => ({
        businesses: await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.partnerId, acme.partnerId), eq(businesses.name, "Pier Dental"))),
        invitations: await tx.select({ id: businessInvitations.id }).from(businessInvitations).where(eq(businessInvitations.email, "owner@pier.invalid")),
      }));
      expect(left).toEqual({ businesses: [], invitations: [] });
    });
  });

  it("deletes the business it couldn't finish even when the admin stopped being one meanwhile", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const { storage } = memoryStorage();
      const setup = { worker: workerContext(tx), storage };
      const harbor = await harborDental(tx, acme, setup);
      const saved = await saveBusinessTemplate(acme.context, acme.adminActor, { businessId: harbor, name: "Dental" }, setup);
      // While the template uploads its document, an owner makes the admin a member, and the document's copy can't be read.
      const failing: TemplateStorage = {
        ...storage,
        async getObject(input) {
          if (!input.key.startsWith("partners/")) return await storage.getObject(input);
          await asMigrator(tx, async () => await tx.update(partnerMembers).set({ role: "member" }).where(and(eq(partnerMembers.partnerId, acme.partnerId), eq(partnerMembers.userId, acme.admin.userId))));
          throw new Error("Storage is unavailable.");
        },
      };

      await expect(createPartnerBusiness(acme.context, acme.adminActor, { name: "Pier Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@pier.invalid", templateId: saved.templateId }, { worker: setup.worker, storage: failing })).rejects.toThrow("Storage is unavailable.");
      const left = await asMigrator(tx, async () => await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.partnerId, acme.partnerId), eq(businesses.name, "Pier Dental"))));
      expect(left).toEqual([]);
    });
  });

  it("queues the deletion of a document the template uploaded to a business it couldn't finish", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const { storage } = memoryStorage();
      const setup = { worker: workerContext(tx), storage };
      const harbor = await harborDental(tx, acme, setup);
      const saved = await saveBusinessTemplate(acme.context, acme.adminActor, { businessId: harbor, name: "Dental" }, setup);
      const pier = randomUUID();
      // The new business reserves the upload, and then storage refuses its bytes.
      const failing: TemplateStorage = {
        ...storage,
        async putObject(input) {
          if (input.key.startsWith(`${pier}/`)) throw new Error("Storage is unavailable.");
          await storage.putObject(input);
        },
      };

      await expect(createPartnerBusiness(acme.context, acme.adminActor, { businessId: pier, name: "Pier Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@pier.invalid", templateId: saved.templateId }, { worker: setup.worker, storage: failing })).rejects.toThrow("Storage is unavailable.");
      const left = await asMigrator(tx, async () => ({
        businesses: await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, pier)),
        cleanup: await tx.select({ businessId: outboxMessages.businessId, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.aggregateId, pier), eq(outboxMessages.topic, "privacy.deleteStoredObjects"))),
      }));
      expect(left).toEqual({ businesses: [], cleanup: [{ businessId: null, payload: { objectKeys: [expect.stringMatching(new RegExp(`^${pier}/knowledge/[^/]+/prices\\.txt$`))] } }] });
    });
  });

  it("sells a package and applies a template to one new business, drops both with a business the template couldn't set up, and applies none for a platform key", async () => {
    vi.stubEnv("STRIPE_CONNECT_SECRET_KEY", "sk_test_platform");
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_test_platform");
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const stripe = new FakeStripeConnect();
      const context = { ...acme.context, stripeConnect: stripe };
      const { accountId } = await startPartnerStripeOnboarding(context, acme.ownerActor, { country: "CA", returnUrl: "https://acme.portal.example.test/partner/p/stripe?onboarding=return", refreshUrl: "https://acme.portal.example.test/partner/p/stripe?onboarding=refresh" });
      stripe.updateAccount(accountId, { currency: "CAD", detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, disabledReason: null });
      const accountUpdate = stripe.delivery("account.updated", { accountId });
      await recordStripeConnectEvent(context, stripe.verifyWebhook(accountUpdate.body, accountUpdate.signature));
      const frontDesk = await createPartnerPackage(context, acme.ownerActor, { name: "Front desk", monthlyPriceMinor: 14900, setupFeeMinor: 0, voiceMinutes: 300, chats: 1000 });
      const { storage } = memoryStorage();
      const setup = { worker: workerContext(tx), storage };
      const rulesOnly = randomUUID();
      const localSite = randomUUID();
      const rule = { title: "Emergencies", content: "Send emergencies to the dentist on call." };
      await asMigrator(tx, async () => await tx.insert(businessTemplates).values([
        { id: rulesOnly, partnerId: acme.partnerId, name: "Rules", manifest: { business: { name: "Template", timezone: "America/Toronto", business_type: "dental" }, rules: [rule] } },
        // The API refuses the website, after the rule went in.
        { id: localSite, partnerId: acme.partnerId, name: "Local site", manifest: { business: { name: "Template", timezone: "America/Toronto", business_type: "dental" }, rules: [rule], knowledge: { websites: ["https://localhost"] } } },
      ]));
      const pierInput = { name: "Pier Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@pier.invalid" };

      const { businessId: pier, invitationId } = await createPartnerBusiness(context, acme.adminActor, { ...pierInput, packageId: frontDesk.packageId, templateId: rulesOnly }, setup);
      const caller: PartnerMemberCaller = { businessId: pier, partnerId: acme.partnerId, userId: acme.admin.userId, actor: "partner_member" };
      expect((await listRulesForApi(setup.worker, caller)).map((row) => row.title)).toEqual(["Emergencies"]);
      const recorded = await asMigrator(tx, async () => ({
        account: await tx.select({ packageId: billingAccounts.packageId }).from(billingAccounts).where(eq(billingAccounts.businessId, pier)),
        created: await tx.select({ payload: auditLogs.payload }).from(auditLogs).where(and(eq(auditLogs.businessId, pier), eq(auditLogs.eventType, "partner.business_created"))),
      }));
      expect(recorded.account).toEqual([{ packageId: frontDesk.packageId }]);
      expect(recorded.created).toEqual([{ payload: { partnerId: acme.partnerId, accessLevel: "full", packageId: frontDesk.packageId, ownerInvitationId: invitationId, templateId: rulesOnly } }]);

      await expect(createPartnerBusiness(context, acme.adminActor, { ...pierInput, name: "Harbor Dental", ownerEmail: "owner@harbor.invalid", packageId: frontDesk.packageId, templateId: localSite }, setup)).rejects.toMatchObject({ status: 409, code: "template_failed" });
      const left = await asMigrator(tx, async () => await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.partnerId, acme.partnerId), eq(businesses.name, "Harbor Dental"))));
      expect(left).toEqual([]);

      // A key the partner never made is refused before anything is made. partnerKeyApi.integration.test.ts covers real keys.
      const key = { kind: "key" as const, partnerId: acme.partnerId, platformKeyId: randomUUID() };
      expect(await refusal(createPartnerBusiness(context, key, { ...pierInput, name: "Beacon Dental", ownerEmail: "owner@beacon.invalid", templateId: rulesOnly }, setup))).toMatchObject({ status: 401 });
      const beacon = await asMigrator(tx, async () => await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.name, "Beacon Dental")));
      expect(beacon).toEqual([]);
    });
  });

  it("answers template_failed, and leaves no business or invitation, when the API refuses part of a template", async () => {
    await rollbackTest(async (tx) => {
      const acme = await partner(tx, "Acme Reception");
      const { storage } = memoryStorage();
      const setup = { worker: workerContext(tx), storage };
      // A saved template the format accepts, with a rule the API takes and then a website it refuses, as a template saved before a rule changed would be.
      const templateId = randomUUID();
      await asMigrator(tx, async () => await tx.insert(businessTemplates).values({
        id: templateId,
        partnerId: acme.partnerId,
        name: "Local site",
        manifest: { business: { name: "Template", timezone: "America/Toronto", business_type: "dental" }, rules: [{ title: "Emergencies", content: "Send emergencies to the dentist on call." }], knowledge: { websites: ["https://localhost"] } },
      }));

      await expect(createPartnerBusiness(acme.context, acme.adminActor, { name: "Pier Dental", timezone: "America/Toronto", businessType: "dental", accessLevel: "full", ownerEmail: "owner@pier.invalid", templateId }, setup)).rejects.toMatchObject({ status: 409, code: "template_failed", cause: { status: 400 } });
      expect(await listPartnerBusinesses(acme.context, acme.adminActor)).toEqual([]);
      const left = await asMigrator(tx, async () => ({
        businesses: await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.partnerId, acme.partnerId)),
        invitations: await tx.select({ id: businessInvitations.id }).from(businessInvitations).where(eq(businessInvitations.email, "owner@pier.invalid")),
      }));
      expect(left).toEqual({ businesses: [], invitations: [] });
    });
  });
});
