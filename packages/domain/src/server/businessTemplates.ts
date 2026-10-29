import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, ne } from "drizzle-orm";

import { auditLogs, businessTemplateFiles, businessTemplates, businesses, enqueueOutbox, knowledgeDocuments, receptionistProfiles, storageObjects, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import {
  applyBusinessTemplate,
  businessTemplateSchema,
  isDefaultGreeting,
  isFullSiteRead,
  knowledgeUploadContentTypes,
  normalizeRuntimeLocale,
  PUBLIC_API_MAX_PAGE_SIZE,
  setupFiles,
  type ApplyResult,
  type BusinessSetupPort,
  type BusinessTemplate,
  type PartnerRole,
  websiteKey,
} from "@lobbystack/shared";

import { AuthorizationError } from "../authz";
import type { DomainContext } from "./context";
import { actorUserId, keyAuditFields, partnerActorRole, partnerRls } from "./partnerActors";
import type { PartnerActor } from "./partners";
import { prospectDemoSettingsIn } from "./prospectDemoSettings";
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
  updateBusinessForApi,
  updateKnowledgeEntryForApi,
  updateReceptionistForApi,
  updateRuleForApi,
  updateServiceForApi,
  type PartnerMemberCaller,
  type PlatformKeyCaller,
} from "./publicApi/operations";
import { listKnowledgeEntryResources, listKnowledgeSourceResources, listServiceResources, loadBusinessResource, serializeReceptionist, serializeRule, type Page } from "./publicApi/resources";
import { listAgentRulesInTransaction } from "./rules";
import { storageFileName, uploadObjectKey, type BinaryStorageProvider } from "./storage";

// Business templates: a partner saves one of its businesses' setup in the
// lobbystack onboard file format and starts new businesses from it. Applying
// one runs the same compare-then-change steps as lobbystack onboard, from
// packages/shared, through a port that calls the v1 API's operations
// in-process. A template keeps its own copy of each document, so it outlives
// the business it came from.

export const BUSINESS_TEMPLATE_NAME_MAX_LENGTH = 120;

/** Where saving a template copies documents from and to, and applying one uploads them. */
export type TemplateStorage = BinaryStorageProvider & { getObject(input: { key: string }): Promise<Uint8Array> };

/** What saving or applying a template needs beyond the app's context: the worker's, which the API's operations run in, and storage. */
export type BusinessSetupDependencies = { worker: DomainContext; storage: TemplateStorage };

/** A template as the console lists it. */
export type PartnerTemplate = {
  templateId: string;
  name: string;
  createdAt: string;
  template: BusinessTemplate;
};

/** A document a template holds, and its stored copy. */
type TemplateFileCopy = { path: string; objectKey: string; contentType: string; length: number; checksum: string };

/** A document of the business a template lists, where the business stores it. An old upload may have no length or checksum recorded. */
type SourceDocument = { path: string; objectKey: string; contentType: KnowledgeUploadContentType; length: number | null; checksum: string | null };

type KnowledgeUploadContentType = (typeof knowledgeUploadContentTypes)[number];

const isKnowledgeUploadContentType = (value: string): value is KnowledgeUploadContentType => (knowledgeUploadContentTypes as readonly string[]).includes(value);

/** A template as applying one reads it. */
export type StoredBusinessTemplate = { templateId: string; name: string; template: BusinessTemplate; files: TemplateFileCopy[] };

function failure(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

const templateNotFound = () => failure("Template not found.", 404, "template_not_found");
const businessNotFound = () => failure("Business not found.", 404, "business_not_found");

/** Who works with templates: anyone on the team reads them, and a key acts as an admin. */
function templatesActor(actor: PartnerActor): PartnerActor {
  return actor;
}

/** The actor's role on the partner as the database has it now. */
async function currentRole(tx: DatabaseTransaction, member: PartnerActor): Promise<PartnerRole> {
  return await partnerActorRole(tx, member);
}

async function requireTemplateManager(tx: DatabaseTransaction, member: PartnerActor): Promise<PartnerRole> {
  const role = await currentRole(tx, member);
  if (role === "member") throw new AuthorizationError("Only owners and admins can manage the partner's templates.");
  return role;
}

async function allPages<T>(page: (cursor: string | undefined) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const next = await page(cursor);
    items.push(...next.data);
    cursor = next.has_more && next.next_cursor ? next.next_cursor : undefined;
  } while (cursor);
  return items;
}

/** A name no earlier entry has, by adding " (2)", " (3)" and so on before any extension. */
function uniqueName(name: string, taken: Set<string>, key: (value: string) => string = (value) => value): string {
  const dot = name.lastIndexOf(".");
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let candidate = name;
  for (let copy = 2; taken.has(key(candidate)); copy++) candidate = `${stem} (${copy})${extension}`;
  taken.add(key(candidate));
  return candidate;
}

/** A website's host without a leading www., which tells the business's own site apart from others. */
function siteHost(url: string): string | null {
  try {
    return new URL(websiteKey(url)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Reads the business's setup in the system actor's transaction, which the
 * caller scoped to the business after checking it's the partner's. What
 * belongs to the business alone stays out (see businessTemplateSchema), and
 * so do the entries and sources it turned off. Its own website stays out too,
 * with the sources read from that site, since they describe this business
 * and no other. The greeting stays out while it's the one written for the
 * business's name, the summary unless a person wrote it, and the settings a
 * prospect demo writes for itself while they're still in place.
 */
async function readBusinessSetup(tx: DatabaseTransaction, businessId: string): Promise<{ template: BusinessTemplate; files: SourceDocument[] }> {
  const business = await loadBusinessResource(tx, businessId);
  if (!business) throw businessNotFound();
  const locale = normalizeRuntimeLocale(business.locale);
  const [profile] = await tx.select().from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)).limit(1);
  const receptionist = profile ? serializeReceptionist(profile) : null;
  const demoOnly = profile ? prospectDemoSettingsIn(profile) : new Set();
  const services = await listServiceResources(tx, businessId, { includeInactive: true });
  const rules = (await listAgentRulesInTransaction(tx, { businessId })).map(serializeRule);
  const page = { limit: PUBLIC_API_MAX_PAGE_SIZE };
  // Entries and sources list newest first; a template keeps the order they were added in.
  const entries = (type: "faq" | "text") => allPages(async (cursor) => await listKnowledgeEntryResources(tx, businessId, { ...page, type, cursor })).then((rows) => rows.filter((row) => row.active).reverse());
  const faqs = await entries("faq");
  const texts = await entries("text");
  const ownSite = business.website_url ? siteHost(business.website_url) : null;
  const websites = (await allPages(async (cursor) => await listKnowledgeSourceResources(tx, businessId, { ...page, type: "website", cursor })))
    .filter((source) => source.active && !(ownSite && siteHost(String(source.url)) === ownSite))
    .reverse();
  const documents = await tx
    .select({ title: knowledgeDocuments.title, tags: knowledgeDocuments.tags, objectKey: storageObjects.objectKey, fileName: storageObjects.fileName, contentType: storageObjects.contentType, length: storageObjects.contentLength, checksum: storageObjects.checksum })
    .from(knowledgeDocuments)
    .innerJoin(storageObjects, and(eq(storageObjects.id, knowledgeDocuments.storageObjectId), eq(storageObjects.businessId, businessId)))
    .where(and(eq(knowledgeDocuments.businessId, businessId), ne(knowledgeDocuments.sourceType, "website"), eq(knowledgeDocuments.active, true), eq(storageObjects.purpose, "knowledge"), eq(storageObjects.status, "ready")))
    .orderBy(asc(knowledgeDocuments.createdAt), asc(knowledgeDocuments.id));

  // Applying finds a document by its title, so each needs its own, and its own path.
  const paths = new Set<string>();
  const titles = new Set<string>();
  const files: Array<SourceDocument & { title: string; tags: string[] }> = [];
  for (const document of documents) {
    // Applying uploads each copy as the API does, so a type it no longer takes stays out.
    if (!isKnowledgeUploadContentType(document.contentType)) continue;
    const path = uniqueName(storageFileName(document.fileName), paths, (value) => value.toLowerCase());
    files.push({ path, title: uniqueName(document.title.trim() || path, titles), tags: Array.isArray(document.tags) ? document.tags.filter((tag): tag is string => typeof tag === "string") : [], objectKey: document.objectKey, contentType: document.contentType, length: document.length, checksum: document.checksum });
  }

  const draft = {
    business: {
      name: business.name,
      timezone: business.timezone,
      locale,
      business_type: business.business_type,
      ...(business.hours.length ? { hours: business.hours } : {}),
    },
    ...(receptionist ? {
      receptionist: {
        ...(isDefaultGreeting(receptionist.greeting, business.name, locale) ? {} : { greeting: receptionist.greeting }),
        tone: receptionist.tone,
        ...(receptionist.summary_source === "operator" ? { summary: receptionist.summary } : {}),
        ...(demoOnly.has("bookingPolicy") ? {} : { booking_policy: receptionist.booking_policy }),
        ...(demoOnly.has("voiceInstructions") ? {} : { voice_instructions: receptionist.voice_instructions }),
        ...(demoOnly.has("smsInstructions") ? {} : { sms_instructions: receptionist.sms_instructions }),
        chat_instructions: receptionist.chat_instructions,
        transfer_mode: receptionist.transfer_mode,
        booking_mode: receptionist.booking_mode,
        voice: receptionist.voice,
        appointment_change_policy: receptionist.appointment_change_policy,
      },
    } : {}),
    ...(services.length ? { services: services.map((service) => ({ name: service.name, slug: service.slug, ...(service.description ? { description: service.description } : {}), duration_minutes: service.duration_minutes, active: service.active })) } : {}),
    ...(rules.length ? { rules: rules.map((rule) => ({ title: rule.title, content: rule.content, active: rule.active })) } : {}),
    knowledge: {
      ...(websites.length ? { websites: websites.map((website) => String(website.url)), read_full_site: websites.every(isFullSiteRead) } : {}),
      ...(files.length ? { files: files.map((file) => ({ path: file.path, ...(file.title === file.path ? {} : { title: file.title }), ...(file.tags.length ? { tags: file.tags } : {}) })) } : {}),
      ...(faqs.length ? { faqs: faqs.map((faq) => ({ question: faq.title, answer: faq.content })) } : {}),
      ...(texts.length ? { texts: texts.map((text) => ({ title: text.title, content: text.content })) } : {}),
    },
  };
  if (!Object.keys(draft.knowledge).length) delete (draft as { knowledge?: unknown }).knowledge;
  const parsed = businessTemplateSchema.safeParse(draft);
  if (!parsed.success) {
    // The dashboard allows a few things the API doesn't, such as a rule longer than calls read.
    const issue = parsed.error.issues[0]!;
    throw failure(`A template can't hold part of this business's setup (${issue.path.join(".")}: ${issue.message}). Change it in the business, then save the template again.`, 409, "template_invalid");
  }
  return { template: parsed.data, files: files.map(({ path, objectKey, contentType, length, checksum }) => ({ path, objectKey, contentType, length, checksum })) };
}

/**
 * The business's setup and its documents, once the actor may manage templates
 * and the business is one of the partner's. The partner's people read it
 * without opening the business, so its audit log records who read it, and
 * for which template, in the same transaction, as it records an open.
 */
async function exportSetup(context: DomainContext, member: PartnerActor, businessId: string, template?: { templateId: string; name: string }): Promise<{ template: BusinessTemplate; files: SourceDocument[] }> {
  // The partner's people aren't on its businesses' teams, so the business's rows show only to the system actor.
  return await withBusinessTransaction(context.db, { ...partnerRls(member), businessId, actorType: "system" }, async (tx) => {
    const partnerRole = await requireTemplateManager(tx, member);
    const [business] = await tx.select({ partnerId: businesses.partnerId, status: businesses.status }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
    // Another partner's business, a direct one, or one no longer active answers as one that doesn't exist.
    if (business?.status !== "active" || business.partnerId !== member.partnerId.toLowerCase()) throw businessNotFound();
    const setup = await readBusinessSetup(tx, businessId);
    await tx.insert(auditLogs).values({ businessId, actorUserId: actorUserId(member), eventType: "partner.business_setup_exported", entityType: "business", entityId: businessId, payload: { partnerId: member.partnerId, partnerRole, ...keyAuditFields(member), ...(template ? { templateId: template.templateId, templateName: template.name } : {}) } });
    return setup;
  });
}

/**
 * One of the partner's businesses' setup in the lobbystack onboard file
 * format, without its ids, slug, plan, phone numbers, owner, onboarding or
 * own website. Only owners and admins can read it, and the business's audit
 * log records who did.
 */
export async function exportBusinessTemplate(context: DomainContext, actor: PartnerActor, businessId: string): Promise<BusinessTemplate> {
  return (await exportSetup(context, templatesActor(actor), businessId)).template;
}

function sha256Base64(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("base64");
}

async function removeCopies(storage: TemplateStorage, keys: readonly string[]): Promise<void> {
  await Promise.allSettled(keys.map(async (key) => await storage.deleteObject({ key })));
}

/**
 * Saves one of the partner's businesses' setup as a template under a name,
 * with a copy of each of its documents. Only owners and admins can, and the
 * business's audit log records who read its setup for which template.
 */
export async function saveBusinessTemplate(context: DomainContext, actor: PartnerActor, input: { businessId: string; name: string }, dependencies: Pick<BusinessSetupDependencies, "storage">): Promise<PartnerTemplate> {
  const member = templatesActor(actor);
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name || name.length > BUSINESS_TEMPLATE_NAME_MAX_LENGTH) throw failure(`Enter the template's name, up to ${BUSINESS_TEMPLATE_NAME_MAX_LENGTH} characters.`, 400, "invalid_name");
  const templateId = randomUUID();
  const { template, files } = await exportSetup(context, member, input.businessId, { templateId, name });
  const copies: Array<TemplateFileCopy & { id: string }> = [];
  try {
    for (const file of files) {
      const id = randomUUID();
      const objectKey = `partners/${member.partnerId}/templates/${templateId}/${id}/${storageFileName(file.path)}`;
      const body = await dependencies.storage.getObject({ key: file.objectKey });
      const checksum = sha256Base64(body);
      // The copy has to be the bytes the upload was checked against, when it was.
      if ((file.length !== null && body.byteLength !== file.length) || (file.checksum !== null && checksum !== file.checksum)) throw failure(`The stored copy of ${file.path} doesn't match it. Upload it to the business again, then save the template again.`, 409, "template_file_mismatch");
      await dependencies.storage.putObject({ key: objectKey, body, contentType: file.contentType, checksum });
      copies.push({ id, path: file.path, objectKey, contentType: file.contentType, length: body.byteLength, checksum });
    }
    const createdAt = await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
      await requireTemplateManager(tx, member);
      const [saved] = await tx.insert(businessTemplates).values({ id: templateId, partnerId: member.partnerId, name, manifest: template as Record<string, unknown>, createdByUserId: actorUserId(member) }).returning({ createdAt: businessTemplates.createdAt });
      if (copies.length) await tx.insert(businessTemplateFiles).values(copies.map((copy) => ({ id: copy.id, templateId, partnerId: member.partnerId, path: copy.path, objectKey: copy.objectKey, contentType: copy.contentType, contentLength: copy.length, checksum: copy.checksum })));
      return saved!.createdAt;
    });
    return { templateId, name, createdAt: createdAt.toISOString(), template };
  } catch (error) {
    // Nothing points at the copies until the template is saved.
    await removeCopies(dependencies.storage, copies.map((copy) => copy.objectKey));
    throw error;
  }
}

/** The partner's templates, newest first. Anyone on the team can read them. */
export async function listBusinessTemplates(context: DomainContext, actor: PartnerActor): Promise<PartnerTemplate[]> {
  const member = templatesActor(actor);
  return await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "operator" }, async (tx) => {
    await currentRole(tx, member);
    const rows = await tx.select({ templateId: businessTemplates.id, name: businessTemplates.name, manifest: businessTemplates.manifest, createdAt: businessTemplates.createdAt }).from(businessTemplates).where(eq(businessTemplates.partnerId, member.partnerId)).orderBy(desc(businessTemplates.createdAt), desc(businessTemplates.id));
    return rows.map((row) => ({ templateId: row.templateId, name: row.name, createdAt: row.createdAt.toISOString(), template: businessTemplateSchema.parse(row.manifest) }));
  });
}

/**
 * Deletes one of the partner's templates. The worker then deletes its copies
 * of the documents. Businesses made from it keep what it set up. Only owners
 * and admins can.
 */
export async function deleteBusinessTemplate(context: DomainContext, actor: PartnerActor, input: { templateId: string }): Promise<void> {
  const member = templatesActor(actor);
  // The job that deletes the copies belongs to no business, which only the system actor can queue.
  await withBusinessTransaction(context.db, { ...partnerRls(member), actorType: "system" }, async (tx) => {
    await requireTemplateManager(tx, member);
    const files = await tx.select({ objectKey: businessTemplateFiles.objectKey }).from(businessTemplateFiles).where(and(eq(businessTemplateFiles.templateId, input.templateId), eq(businessTemplateFiles.partnerId, member.partnerId)));
    const deleted = await tx.delete(businessTemplates).where(and(eq(businessTemplates.id, input.templateId), eq(businessTemplates.partnerId, member.partnerId))).returning({ id: businessTemplates.id });
    if (!deleted.length) throw templateNotFound();
    if (!files.length) return;
    await enqueueOutbox(tx, {
      topic: "privacy.deleteStoredObjects",
      aggregateType: "business_template",
      aggregateId: input.templateId,
      dedupeKey: `business-template:${input.templateId}:delete-stored-objects`,
      payload: { objectKeys: files.map((file) => file.objectKey) },
    });
  });
}

/**
 * Reads one of the partner's templates inside the caller's transaction, as
 * the person in it: someone on the partner's team, acting as an operator or
 * the system actor. Another partner's template answers as one that doesn't
 * exist.
 */
export async function loadBusinessTemplateInTransaction(tx: DatabaseTransaction, input: { partnerId: string; templateId: string }): Promise<StoredBusinessTemplate> {
  const [row] = await tx.select({ templateId: businessTemplates.id, name: businessTemplates.name, manifest: businessTemplates.manifest }).from(businessTemplates).where(and(eq(businessTemplates.id, input.templateId), eq(businessTemplates.partnerId, input.partnerId))).limit(1);
  if (!row) throw templateNotFound();
  const files = await tx.select({ path: businessTemplateFiles.path, objectKey: businessTemplateFiles.objectKey, contentType: businessTemplateFiles.contentType, length: businessTemplateFiles.contentLength, checksum: businessTemplateFiles.checksum }).from(businessTemplateFiles).where(eq(businessTemplateFiles.templateId, row.templateId));
  return { templateId: row.templateId, name: row.name, template: businessTemplateSchema.parse(row.manifest), files };
}

/**
 * The setup port the console applies a template through: the v1 API's
 * operations in-process, on one of the partner's businesses, as the partner
 * member. The template's documents upload from its stored copies.
 */
export function inProcessSetupPort(dependencies: BusinessSetupDependencies, caller: PartnerMemberCaller | PlatformKeyCaller, files: readonly TemplateFileCopy[]): BusinessSetupPort {
  const { worker, storage } = dependencies;
  const page = { limit: PUBLIC_API_MAX_PAGE_SIZE };
  return {
    getBusiness: async () => await getBusinessForApi(worker, caller),
    updateBusiness: async (changes) => await updateBusinessForApi(worker, caller, changes),
    getReceptionist: async () => await getReceptionistForApi(worker, caller),
    updateReceptionist: async (changes) => await updateReceptionistForApi(worker, caller, changes),
    listServices: async () => await listServicesForApi(worker, caller, { includeInactive: true }),
    createService: async (service) => await createServiceForApi(worker, caller, service),
    updateService: async (serviceId, changes) => await updateServiceForApi(worker, caller, serviceId, changes),
    listRules: async () => await listRulesForApi(worker, caller),
    createRule: async (rule) => await createRuleForApi(worker, caller, rule),
    updateRule: async (ruleId, changes) => await updateRuleForApi(worker, caller, ruleId, changes),
    listKnowledgeEntries: async (type) => await allPages(async (cursor) => await listKnowledgeEntriesForApi(worker, caller, { ...page, type, cursor })),
    createKnowledgeEntry: async (entry) => await createKnowledgeEntryForApi(worker, caller, entry),
    updateKnowledgeEntry: async (entryId, changes) => await updateKnowledgeEntryForApi(worker, caller, entryId, changes),
    listKnowledgeSources: async (type) => await allPages(async (cursor) => await listKnowledgeSourcesForApi(worker, caller, { ...page, type, cursor })),
    addWebsite: async (url) => await createKnowledgeSourceForApi(worker, caller, { type: "website", url }),
    async uploadFile(file) {
      const copy = files.find((candidate) => candidate.path === file.path);
      if (!copy) throw new Error(`The template has no stored copy of ${file.path}.`);
      const fileName = file.path.split("/").at(-1)!;
      const body = await storage.getObject({ key: copy.objectKey });
      const upload = await createKnowledgeUploadForApi(worker, caller, { file_name: fileName, content_type: copy.contentType as KnowledgeUploadContentType, length: copy.length, checksum_sha256: copy.checksum }, storage);
      // The bytes go straight to the key the upload reserved, as a browser's would to its signed URL.
      await storage.putObject({ key: uploadObjectKey(caller.businessId, "knowledge", upload.upload_id, fileName), body, contentType: copy.contentType, checksum: copy.checksum });
      return await completeKnowledgeUploadForApi(worker, caller, upload.upload_id, { ...(file.title ? { title: file.title } : {}), ...(file.tags?.length ? { tags: file.tags } : {}) }, storage);
    },
  };
}

// The receptionist's settings that take one of a few values rather than words.
const RECEPTIONIST_CHOICES = new Set(["transfer_mode", "booking_mode", "voice", "appointment_change_policy"]);

/**
 * The template's own words, with the business it was saved from renamed to
 * the one it sets up: the receptionist's text, and each service's, rule's,
 * FAQ's and text's. Only the whole name counts, so Harbor doesn't touch
 * Harborview, and the new name goes in as written, whatever it holds.
 */
function renameBusinessIn(template: BusinessTemplate, from: string, to: string): BusinessTemplate {
  const name = from.trim();
  if (!name || name === to) return template;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu");
  const rename = (value: string) => value.replace(pattern, () => to);
  const receptionist = template.receptionist
    ? Object.fromEntries(Object.entries(template.receptionist).map(([key, value]) => [key, typeof value === "string" && !RECEPTIONIST_CHOICES.has(key) ? rename(value) : value])) as BusinessTemplate["receptionist"]
    : undefined;
  return {
    ...template,
    ...(receptionist ? { receptionist } : {}),
    ...(template.services ? { services: template.services.map((service) => ({ ...service, name: rename(service.name), ...(service.description ? { description: rename(service.description) } : {}) })) } : {}),
    ...(template.rules ? { rules: template.rules.map((rule) => ({ ...rule, title: rename(rule.title), content: rename(rule.content) })) } : {}),
    ...(template.knowledge ? { knowledge: {
      ...template.knowledge,
      ...(template.knowledge.faqs ? { faqs: template.knowledge.faqs.map((faq) => ({ question: rename(faq.question), answer: rename(faq.answer) })) } : {}),
      ...(template.knowledge.texts ? { texts: template.knowledge.texts.map((text) => ({ title: rename(text.title), content: rename(text.content) })) } : {}),
    } } : {}),
  };
}

/**
 * Applies a stored template to one of the partner's businesses that the
 * caller has checked is the partner's, as the partner member. The business's
 * name and time zone stay as given: they're its own, not the template's. A
 * greeting or instructions that name the business the template was saved from
 * name the new business instead, and so do its services, rules, FAQs and
 * texts, so callers don't hear the wrong one.
 */
export async function applyStoredBusinessTemplate(dependencies: BusinessSetupDependencies, input: { partnerId: string; businessId: string; template: StoredBusinessTemplate; keep: { name: string; timezone: string } } & ({ userId: string } | { platformKeyId: string })): Promise<ApplyResult> {
  // A key sets the business up as itself, as its own v1 requests would.
  const caller: PartnerMemberCaller | PlatformKeyCaller = "userId" in input
    ? { businessId: input.businessId, partnerId: input.partnerId, userId: input.userId, actor: "partner_member" }
    : { businessId: input.businessId, partnerId: input.partnerId, platformKeyId: input.platformKeyId, groupId: input.partnerId, actor: "platform_key" };
  const saved = renameBusinessIn(input.template.template, input.template.template.business.name, input.keep.name);
  const template: BusinessTemplate = { ...saved, business: { ...saved.business, ...input.keep } };
  // Only documents the template lists and holds a copy of are uploaded.
  const held = new Set(input.template.files.map((file) => file.path));
  const listed = setupFiles(template.knowledge).filter((file) => held.has(file.path));
  const knowledge = template.knowledge ? { ...template.knowledge, ...(template.knowledge.files ? { files: listed } : {}) } : undefined;
  return await applyBusinessTemplate(inProcessSetupPort(dependencies, caller, input.template.files), { ...template, ...(knowledge ? { knowledge } : {}) });
}
