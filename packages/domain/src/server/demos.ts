import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";

import { businessContextSnapshots, businessMemberships, businesses, calls, enqueueOutbox, knowledgeDocuments, partnerMembers, prospectDemos, receptionistProfiles, services, staff, staffServiceAssignments, websiteIngestionJobs, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { defaultCurrencyForTimezone, defaultGreeting, isPartnerAccessLevel, isUuid, normalizeRuntimeLocale, partnerFeatures, partnerOrigin, type PartnerAccessLevel, type PartnerRole } from "@lobbystack/shared";
import { type TelemetryEventName, type TelemetryProperties } from "@lobbystack/telemetry";

import { AuthorizationError } from "../authz";
import { announceBrandChange, brandForHostReference, hostBrandFromEnvironment } from "./brands";
import { businessShowsOnBrand, HOST_BRAND_SCOPE, type BrandScope } from "./businessAccess";
import type { DomainContext } from "./context";
import { normalizeWebsiteSourceUrl } from "./knowledgeUrl";
import { firstOnboardingStage } from "./onboarding";
import { closeCheckoutQuietly } from "./packageBilling";
import { deletePartnerBusinessInTransaction, reserveSubdomainIn, type PartnerActor, type PartnerMemberActor } from "./partners";
import { recordProductEventBestEffort } from "./productEvents";
import { PROSPECT_DEMO_BOOKING_POLICY, PROSPECT_DEMO_SMS_INSTRUCTIONS, prospectDemoSettingsIn, prospectDemoVoiceInstructions, type ProspectDemoSetting } from "./prospectDemoSettings";
import { saveReceptionistProfileInTransaction } from "./receptionistProfile";
import { NEW_BUSINESS_RECEPTIONIST_INSTRUCTIONS, partnerMemberNotOnTeam, rememberActiveBusinessInTransaction } from "./tenancy";
import { periodKeyFor } from "./usage";

// Prospect demos: an expiring receptionist built from a prospect's website,
// which the prospect tries on a public page and claims to keep. The host's
// demo operator makes the host's demos. Anyone on a partner's team makes the
// partner's from its console, under its brand: the demo is one of the
// partner's businesses from the start, with no owner, so its usage counts
// like any of its businesses', it opens only on the partner's domains, and
// claiming it keeps it with the partner at the access level the partner
// picked.

export type ProspectDemoPublicState = "preparing" | "active" | "claimed" | "revoked" | "expired" | "invalid";

export type ProspectDemoPreview = {
  state: ProspectDemoPublicState;
  businessName?: string;
  businessSlug?: string;
  websiteUrl?: string;
  locale?: string;
  suggestedPrompts?: string[];
};

const PROSPECT_DEMO_MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const PROSPECT_DEMO_MAX_SUGGESTED_PROMPTS = 6;
const PARTNER_DEMO_NAME_MAX_LENGTH = 120;

export type ProspectDemoStatus = {
  demoId: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  websiteUrl: string;
  status: string;
  locale: string;
  suggestedPrompts: string[];
  expiresAt: Date;
  publishedAt: Date | null;
  websiteIngestionStatus: string | null;
  /** Why the website crawl failed or can't run, for the demo's card. */
  websiteIngestionError: string | null;
  greetingReady: boolean;
  snapshotReady: boolean;
  promptsReady: boolean;
};

/** A demo as the partner console lists it. */
export type PartnerDemo = ProspectDemoStatus & {
  /** What the business's own operators get once someone claims it. */
  accessLevel: PartnerAccessLevel;
  /** What it used this month, as usage metering counts it for any of the partner's businesses: voice seconds and chats. A month runs in UTC. */
  usage: { periodKey: string; voiceSeconds: number; chats: number };
};

/** A demo just made, with the token its link carries. Only a hash of the token is kept. */
export type CreatedProspectDemo = { demoId: string; businessId: string; slug: string; token: string; status: "preparing"; websiteIngestionJobId: string };

/**
 * Who manages a demo: the host's demo operator, who manages the host's demos
 * they made, or someone on a partner's team, who manages every demo of the
 * partner. Whoever made a demo is its operator either way.
 */
type DemoManager = { kind: "operator"; userId: string } | { kind: "partner"; userId: string; partnerId: string };

function failure(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

const demoNotFound = () => failure("Prospect demo not found.", 404, "demo_not_found");
const notClaimable = () => failure("Demo is invalid, expired, or no longer claimable.", 409, "demo_not_claimable");

function tokenHash(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

function cleanSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96) || "prospect";
}

function cleanPrompts(values: string[] = []): string[] {
  return values.map((value) => value.trim()).filter(Boolean).slice(0, PROSPECT_DEMO_MAX_SUGGESTED_PROMPTS);
}

function generateToken(name: string): string {
  return `${cleanSlug(name)}-${randomBytes(12).toString("base64url")}`;
}

export { prospectDemoVoiceInstructions } from "./prospectDemoSettings";

/** The public page a demo's token opens, on the origin of the brand that made it. The token stays in the fragment, so no server or referrer sees it. */
export function prospectDemoUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/demo#${new URLSearchParams({ prospect_demo_token: token })}`;
}

/** The demos a manager may act on: the operator's own host demos, or every demo of the partner. */
function managedBy(manager: DemoManager): SQL {
  return manager.kind === "operator"
    ? and(eq(prospectDemos.operatorUserId, manager.userId), isNull(prospectDemos.partnerId))!
    : eq(prospectDemos.partnerId, manager.partnerId);
}

/**
 * Every prospect-demo event shares one stable PostHog person per demo. The demo
 * id is resolved server-side from the demo token and never returned to the
 * browser, so banner clicks and call activity coalesce without leaking the id
 * into the public page.
 */
export function getPostHogDistinctIdForProspectDemo(prospectDemoId: string): string {
  return `prospect_demo:${prospectDemoId}`;
}

/**
 * Prospect-demo product telemetry is durable audit data, not a control-flow
 * dependency. It is recorded after the authoritative operation and never fails
 * the demo path.
 */
async function recordProspectDemoEvent(
  context: DomainContext,
  input: {
    name: TelemetryEventName;
    businessId: string;
    prospectDemoId: string;
    actorType: "system" | "worker";
    properties?: TelemetryProperties;
  },
): Promise<void> {
  await recordProductEventBestEffort(context, {
    name: input.name,
    businessId: input.businessId,
    distinctId: getPostHogDistinctIdForProspectDemo(input.prospectDemoId),
    actorType: input.actorType,
    properties: {
      prospectDemoId: input.prospectDemoId,
      ...input.properties,
    },
  });
}

export async function recordProspectDemoCallStarted(
  context: DomainContext,
  input: { businessId: string; prospectDemoId: string; callId: string; channel?: string; provider?: string },
): Promise<void> {
  await recordProspectDemoEvent(context, {
    name: "prospect_demo.call_started",
    actorType: "worker",
    businessId: input.businessId,
    prospectDemoId: input.prospectDemoId,
    properties: {
      callId: input.callId,
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
    },
  });
}

export async function recordProspectDemoCallError(
  context: DomainContext,
  input: { businessId: string; prospectDemoId: string; callId?: string; reason: string },
): Promise<void> {
  await recordProspectDemoEvent(context, {
    name: "prospect_demo.call_error",
    actorType: "worker",
    businessId: input.businessId,
    prospectDemoId: input.prospectDemoId,
    properties: {
      reason: input.reason,
      ...(input.callId !== undefined ? { callId: input.callId } : {}),
    },
  });
}

async function resolveProspectDemoIdForCall(
  context: DomainContext,
  input: { businessId: string; callId: string },
): Promise<string | undefined> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [call] = await tx.select({ prospectDemoId: calls.prospectDemoId }).from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).limit(1);
    return call?.prospectDemoId ?? undefined;
  });
}

/**
 * Records the terminal state of a call once the caller has resolved the call's
 * business. It is a no-op for non-demo calls. A failed demo lookup counts as a
 * non-demo call so it never fails call completion; the event writes are
 * already best-effort.
 */
export async function recordProspectDemoCallOutcome(
  context: DomainContext,
  input: { businessId: string; callId: string; status: string; disposition?: string; providerDurationSeconds?: number },
): Promise<void> {
  const prospectDemoId = await resolveProspectDemoIdForCall(context, input).catch(() => undefined);
  if (!prospectDemoId) return;
  if (input.status === "failed") {
    await recordProspectDemoCallError(context, { businessId: input.businessId, prospectDemoId, callId: input.callId, reason: "call_failed" });
    return;
  }
  await recordProspectDemoEvent(context, {
    name: "prospect_demo.call_completed",
    actorType: "worker",
    businessId: input.businessId,
    prospectDemoId,
    properties: {
      callId: input.callId,
      status: input.status,
      ...(input.disposition !== undefined ? { disposition: input.disposition } : {}),
      ...(input.providerDurationSeconds !== undefined ? { providerDurationSeconds: input.providerDurationSeconds } : {}),
    },
  });
}

/** What a new demo is made from. */
type ProspectDemoInput = { name: string; websiteUrl: string; locale?: string; recipientEmail?: string; recipientName?: string; campaignId?: string; greeting?: string; services?: string[]; suggestedPrompts?: string[]; timezone?: string };

/** A new demo's ids, token and settings, checked before any transaction opens. */
function prepareDemo(input: ProspectDemoInput) {
  const name = input.name.trim();
  if (!name) throw failure("Business name is required.", 400, "invalid_name");
  const timezone = input.timezone?.trim() || "America/New_York";
  return {
    input,
    name,
    websiteUrl: normalizeWebsiteSourceUrl(input.websiteUrl.trim()),
    businessId: randomUUID(),
    demoId: randomUUID(),
    ingestionJobId: randomUUID(),
    slug: `${cleanSlug(name)}-${Date.now().toString(36)}`,
    token: generateToken(name),
    locale: normalizeRuntimeLocale(input.locale),
    timezone,
    suggestedPrompts: cleanPrompts(input.suggestedPrompts),
    serviceNames: (input.services ?? []).map((value) => value.trim()).filter(Boolean),
  };
}

/**
 * Inserts the demo's business, receptionist, staff, services and demo, and
 * queues the website read and the first snapshot. The transaction is the
 * system actor's, scoped to the new business. The host's operator prepares
 * the demo as the business's owner. A partner's demo is one of the
 * partner's businesses with no owner instead, which the partner's people
 * open as they open any other.
 */
async function insertDemoInTransaction(
  tx: DatabaseTransaction,
  demo: ReturnType<typeof prepareDemo>,
  owner: { operatorUserId: string; brandName: string; partner: { partnerId: string; accessLevel: PartnerAccessLevel } | null },
): Promise<CreatedProspectDemo> {
  const { input, name, businessId, demoId, ingestionJobId, slug, token, locale, timezone, suggestedPrompts } = demo;
  const { partner } = owner;
  await tx.insert(businesses).values({
    id: businessId,
    slug,
    name,
    timezone,
    currency: defaultCurrencyForTimezone(timezone),
    defaultLocale: locale,
    websiteUrl: demo.websiteUrl,
    businessType: "general",
    deploymentMode: process.env.DEPLOYMENT_MODE === "cloud" ? "cloud" : "development",
    // Whoever claims a partner's demo starts its onboarding where an owner the partner invited would.
    ...(partner ? { partnerId: partner.partnerId, partnerAccessLevel: partner.accessLevel, onboardingStage: firstOnboardingStage(partner) } : {}),
  });
  if (!partner) await tx.insert(businessMemberships).values({ businessId, userId: owner.operatorUserId, role: "business_owner", status: "active" });
  await tx.insert(receptionistProfiles).values({
    businessId,
    greeting: input.greeting?.trim() || defaultGreeting(name, locale),
    tone: "professional and friendly",
    summary: `${name} virtual receptionist`,
    bookingPolicy: PROSPECT_DEMO_BOOKING_POLICY,
    voiceInstructions: prospectDemoVoiceInstructions(owner.brandName),
    smsInstructions: PROSPECT_DEMO_SMS_INSTRUCTIONS,
    transferMode: "on_request",
  });
  const [defaultStaff] = await tx.insert(staff).values({ businessId, name: name, timezone }).returning({ id: staff.id });
  if (!defaultStaff) throw new Error("Default demo staff could not be created.");
  for (const [index, serviceName] of demo.serviceNames.entries()) {
    const [service] = await tx.insert(services).values({ businessId, name: serviceName, slug: `${cleanSlug(serviceName)}-${index + 1}`, durationMinutes: 30, active: true }).returning({ id: services.id });
    if (service) await tx.insert(staffServiceAssignments).values({ businessId, staffId: defaultStaff.id, serviceId: service.id });
  }
  await tx.insert(websiteIngestionJobs).values({ id: ingestionJobId, businessId, websiteUrl: demo.websiteUrl, provider: "firecrawl", status: "queued" });
  await tx.insert(prospectDemos).values({ id: demoId, businessId, tokenHash: tokenHash(token), status: "preparing", locale, suggestedPrompts, recipientEmail: input.recipientEmail?.trim().toLowerCase() || null, recipientName: input.recipientName?.trim() || null, campaignId: input.campaignId?.trim() || null, websiteUrl: demo.websiteUrl, businessName: name, operatorUserId: owner.operatorUserId, partnerId: partner?.partnerId ?? null, websiteIngestionJobId: ingestionJobId, expiresAt: new Date(Date.now() + PROSPECT_DEMO_MAX_AGE_MS) });
  await enqueueOutbox(tx, { topic: "knowledge.crawlWebsite", businessId, aggregateType: "website_ingestion_job", aggregateId: ingestionJobId, dedupeKey: `prospect-demo:${demoId}:crawl`, payload: { url: demo.websiteUrl, websiteIngestionJobId: ingestionJobId } });
  await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId, aggregateType: "prospect_demo", aggregateId: demoId, dedupeKey: `prospect-demo:${demoId}:snapshot:initial`, payload: { businessId, reason: "prospect_demo_created" } });
  return { demoId, businessId, slug, token, status: "preparing", websiteIngestionJobId: ingestionJobId };
}

/** Makes one of the host's demos, which its operator prepares as the demo business's owner. */
export async function createProspectDemo(
  context: DomainContext,
  input: ProspectDemoInput & { operatorUserId: string },
): Promise<CreatedProspectDemo> {
  const demo = prepareDemo(input);
  const brandName = (await brandForHostReference(context, { kind: "host" }))?.name ?? hostBrandFromEnvironment().name;
  return await withBusinessTransaction(context.db, { userId: input.operatorUserId, businessId: demo.businessId, actorType: "system" }, async (tx) => await insertDemoInTransaction(tx, demo, { operatorUserId: input.operatorUserId, brandName, partner: null }));
}

/** The demo's status in a system transaction scoped to its business, or a 404 when the manager can't act on it. */
async function readDemoStatus(context: DomainContext, manager: DemoManager, input: { demoId: string; businessId: string }): Promise<ProspectDemoStatus & { accessLevel: PartnerAccessLevel }> {
  return await withBusinessTransaction(context.db, { userId: manager.userId, businessId: input.businessId, actorType: "system" }, async (tx) => {
    const row = (await tx.select({ demo: prospectDemos, slug: businesses.slug, accessLevel: businesses.partnerAccessLevel, ingestionStatus: websiteIngestionJobs.status, ingestionError: websiteIngestionJobs.lastError, greeting: receptionistProfiles.greeting })
      .from(prospectDemos)
      .innerJoin(businesses, eq(businesses.id, prospectDemos.businessId))
      .leftJoin(websiteIngestionJobs, eq(websiteIngestionJobs.id, prospectDemos.websiteIngestionJobId))
      .leftJoin(receptionistProfiles, eq(receptionistProfiles.businessId, prospectDemos.businessId))
      .where(and(eq(prospectDemos.id, input.demoId), managedBy(manager))).limit(1))[0];
    if (!row) throw demoNotFound();
    const snapshot = (await tx.select({ id: businessContextSnapshots.id }).from(businessContextSnapshots).where(eq(businessContextSnapshots.businessId, row.demo.businessId)).orderBy(desc(businessContextSnapshots.generatedAt)).limit(1))[0];
    return { demoId: row.demo.id, businessId: row.demo.businessId, businessName: row.demo.businessName, businessSlug: row.slug, websiteUrl: row.demo.websiteUrl, status: row.demo.status, locale: row.demo.locale, suggestedPrompts: row.demo.suggestedPrompts, expiresAt: row.demo.expiresAt, publishedAt: row.demo.publishedAt, websiteIngestionStatus: row.ingestionStatus, websiteIngestionError: row.ingestionError ?? null, greetingReady: Boolean(row.greeting?.trim()), snapshotReady: Boolean(snapshot), promptsReady: row.demo.suggestedPrompts.length >= 2, accessLevel: row.accessLevel };
  });
}

export async function getProspectDemoStatus(context: DomainContext, input: { operatorUserId: string; demoId: string }): Promise<ProspectDemoStatus> {
  const manager: DemoManager = { kind: "operator", userId: input.operatorUserId };
  const { accessLevel: _accessLevel, ...status } = await readDemoStatus(context, manager, { demoId: input.demoId, businessId: await resolveDemoBusiness(context, manager, input.demoId) });
  return status;
}

export async function listProspectDemos(context: DomainContext, operatorUserId: string): Promise<ProspectDemoStatus[]> {
  const rows = await withBusinessTransaction(context.db, { userId: operatorUserId, actorType: "system" }, async (tx) => await tx.execute<{ demo_id: string }>(sql`select demo_id from app.list_operator_prospect_demos()`));
  return await Promise.all(rows.rows.map(({ demo_id }) => getProspectDemoStatus(context, { operatorUserId, demoId: demo_id })));
}

export async function setProspectDemoPrompts(context: DomainContext, input: { operatorUserId: string; demoId: string; suggestedPrompts: string[] }): Promise<string[]> {
  const prompts = cleanPrompts(input.suggestedPrompts);
  if (prompts.length < 2) throw failure("Two suggested prompts are required.", 400, "prompts_required");
  const manager: DemoManager = { kind: "operator", userId: input.operatorUserId };
  const businessId = await resolveDemoBusiness(context, manager, input.demoId);
  return await withBusinessTransaction(context.db, { userId: input.operatorUserId, businessId, actorType: "system" }, async (tx) => {
    const [demo] = await tx.update(prospectDemos)
      .set({ suggestedPrompts: prompts, updatedAt: new Date() })
      .where(and(eq(prospectDemos.id, input.demoId), managedBy(manager)))
      .returning({ suggestedPrompts: prospectDemos.suggestedPrompts });
    if (!demo) throw demoNotFound();
    return demo.suggestedPrompts;
  });
}

async function publishDemo(context: DomainContext, manager: DemoManager, input: { demoId: string; token: string; suggestedPrompts?: string[] | undefined }): Promise<{ status: "active"; expiresAt: Date }> {
  const businessId = await resolveDemoBusiness(context, manager, input.demoId);
  return await withBusinessTransaction(context.db, { userId: manager.userId, businessId, actorType: "system" }, async (tx) => {
    await requireManager(tx, manager);
    // A claim holds this row while it runs, so publishing waits for it and then sees the demo claimed.
    const demo = (await tx.select().from(prospectDemos).where(and(eq(prospectDemos.id, input.demoId), managedBy(manager))).limit(1).for("update"))[0];
    if (!demo) throw demoNotFound();
    if (demo.status === "claimed" || demo.status === "revoked") throw failure("Closed prospect demos cannot be published.", 409, "demo_closed");
    if (demo.expiresAt <= new Date()) throw failure("Prospect demo expired.", 409, "demo_expired");
    if (demo.tokenHash !== tokenHash(input.token)) throw failure("Prospect demo token mismatch.", 409, "demo_token_mismatch");
    const prompts = input.suggestedPrompts ? cleanPrompts(input.suggestedPrompts) : demo.suggestedPrompts;
    if (prompts.length < 2) throw failure("Two suggested prompts are required before publish.", 400, "prompts_required");
    const ingestion = demo.websiteIngestionJobId ? await tx.select({ status: websiteIngestionJobs.status }).from(websiteIngestionJobs).where(eq(websiteIngestionJobs.id, demo.websiteIngestionJobId)).limit(1) : [];
    const profile = await tx.select({ greeting: receptionistProfiles.greeting }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, demo.businessId)).limit(1);
    const snapshot = await tx.select({ id: businessContextSnapshots.id }).from(businessContextSnapshots).where(eq(businessContextSnapshots.businessId, demo.businessId)).limit(1);
    const indexedDocument = await tx.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, demo.businessId), eq(knowledgeDocuments.status, "indexed"))).limit(1);
    // Without a website crawler the demo answers from its greeting, services and prompts alone.
    const ingestionReady = ingestion[0]?.status === "unavailable" || (ingestion[0]?.status === "completed" && Boolean(indexedDocument[0]));
    if (!ingestionReady) throw failure("Website ingestion must be completed before publish.", 409, "demo_not_ready");
    if (!profile[0]?.greeting.trim()) throw failure("Greeting must be set before publish.", 409, "demo_not_ready");
    if (!snapshot[0]) throw failure("Business context snapshot must be ready before publish.", 409, "demo_not_ready");
    await tx.update(prospectDemos).set({ status: "active", suggestedPrompts: prompts, publishedAt: new Date(), updatedAt: new Date() }).where(eq(prospectDemos.id, demo.id));
    return { status: "active", expiresAt: demo.expiresAt };
  });
}

export async function publishProspectDemo(context: DomainContext, input: { operatorUserId: string; demoId: string; token: string; suggestedPrompts?: string[] }): Promise<{ status: "active"; expiresAt: Date }> {
  return await publishDemo(context, { kind: "operator", userId: input.operatorUserId }, input);
}

async function rotateDemoToken(context: DomainContext, manager: DemoManager, demoId: string): Promise<{ token: string }> {
  const businessId = await resolveDemoBusiness(context, manager, demoId);
  return await withBusinessTransaction(context.db, { userId: manager.userId, businessId, actorType: "system" }, async (tx) => {
    await requireManager(tx, manager);
    const demo = (await tx.select({ id: prospectDemos.id, businessName: prospectDemos.businessName, status: prospectDemos.status }).from(prospectDemos).where(and(eq(prospectDemos.id, demoId), managedBy(manager))).limit(1).for("update"))[0];
    if (!demo) throw demoNotFound();
    if (demo.status === "claimed" || demo.status === "revoked") throw failure("Cannot rotate token for a closed prospect demo.", 409, "demo_closed");
    const token = generateToken(demo.businessName);
    await tx.update(prospectDemos).set({ tokenHash: tokenHash(token), updatedAt: new Date() }).where(eq(prospectDemos.id, demo.id));
    return { token };
  });
}

export async function rotateProspectDemoToken(context: DomainContext, input: { operatorUserId: string; demoId: string }): Promise<{ token: string }> {
  return await rotateDemoToken(context, { kind: "operator", userId: input.operatorUserId }, input.demoId);
}

async function revokeDemo(context: DomainContext, manager: DemoManager, demoId: string): Promise<void> {
  const businessId = await resolveDemoBusiness(context, manager, demoId);
  await withBusinessTransaction(context.db, { userId: manager.userId, businessId, actorType: "system" }, async (tx) => {
    await requireManager(tx, manager);
    // A claim holds this row while it runs, so turning the demo off waits for it and never writes over a claim.
    const demo = (await tx.select({ id: prospectDemos.id, status: prospectDemos.status }).from(prospectDemos).where(and(eq(prospectDemos.id, demoId), managedBy(manager))).limit(1).for("update"))[0];
    if (!demo) throw demoNotFound();
    if (demo.status === "claimed") throw failure("Claimed prospect demos cannot be revoked.", 409, "demo_claimed");
    await tx.update(prospectDemos).set({ status: "revoked", updatedAt: new Date() }).where(eq(prospectDemos.id, demo.id));
    // A partner's people were never on its team, so only the host's operator has a place to leave.
    if (manager.kind === "operator") await detachProspectDemoOperator(tx, businessId);
  });
}

export async function revokeProspectDemo(context: DomainContext, input: { operatorUserId: string; demoId: string }): Promise<void> {
  await revokeDemo(context, { kind: "operator", userId: input.operatorUserId }, input.demoId);
}

/**
 * Closing a demo takes it out of the operator's workspaces: the operator's
 * membership is marked removed and its active business is cleared if it points
 * here. Demo listing and status resolve by operator_user_id, so they keep working.
 */
async function detachProspectDemoOperator(tx: DatabaseTransaction, businessId: string): Promise<void> {
  await tx.execute(sql`select app.detach_prospect_demo_operator(${businessId}::uuid)`);
}

export async function expireProspectDemos(context: DomainContext): Promise<number> {
  const result = await context.db.execute<{ count: string | number }>(sql`select app.expire_prospect_demos() as count`);
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * The business of a demo the manager may act on, or a 404. The partner's
 * people aren't on its demos' teams, so the database answers for them, and
 * only while they're on the partner's team.
 */
async function resolveDemoBusiness(context: DomainContext, manager: DemoManager, demoId: string): Promise<string> {
  if (!isUuid(demoId)) throw demoNotFound();
  const result = manager.kind === "operator"
    ? await withBusinessTransaction(context.db, { userId: manager.userId, actorType: "system" }, async (tx) => await tx.execute<{ business_id: string }>(sql`select business_id from app.resolve_operator_prospect_demo(${demoId})`))
    : await withBusinessTransaction(context.db, { userId: manager.userId, actorType: "operator" }, async (tx) => await tx.execute<{ business_id: string }>(sql`select business_id from app.list_partner_prospect_demos(${manager.partnerId}::uuid) where demo_id = ${demoId}::uuid`));
  const businessId = result.rows[0]?.business_id;
  if (!businessId) throw demoNotFound();
  return businessId;
}

/**
 * Refuses a partner's demo to anyone who left the partner's team since the
 * demo resolved, and returns their role on the team now. The host's operator
 * was checked by the resolver and has no role.
 */
async function requireManager(tx: DatabaseTransaction, manager: DemoManager): Promise<PartnerRole | null> {
  if (manager.kind === "operator") return null;
  const [member] = await tx.select({ role: partnerMembers.role }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, manager.partnerId), eq(partnerMembers.userId, manager.userId), eq(partnerMembers.status, "active"))).limit(1);
  if (!member) throw new AuthorizationError("You aren't on this partner's team.");
  return member.role;
}

function demosActor(actor: PartnerActor): PartnerMemberActor {
  if (actor.kind !== "member") throw new AuthorizationError("Platform keys can't manage a partner's demos.");
  return actor;
}

function partnerManager(member: PartnerMemberActor): DemoManager {
  return { kind: "partner", userId: member.userId, partnerId: member.partnerId };
}

/** Where the partner's demos open: the origin of its brand, on its own domain. */
async function partnerDemoOrigin(context: DomainContext, partnerId: string): Promise<string> {
  const brand = await brandForHostReference(context, { kind: "partner", partnerId });
  if (!brand) throw failure("Partner not found.", 404, "partner_not_found");
  return brand.origin;
}

/**
 * Makes a prospect demo under the partner's brand. Anyone on the partner's
 * team can. The demo's receptionist names the partner, never the host, and
 * its link opens on the partner's domain, so the partner needs a domain
 * first. The demo is one of the partner's businesses with no owner, at the
 * access level its own operators get once someone claims it: full access,
 * unless an owner or admin picks activity only, as they pick it for any of
 * the partner's businesses. Its calls and chats count like any of the
 * partner's businesses'. It stays out of the Businesses page until it's
 * claimed.
 */
export async function createPartnerDemo(
  context: DomainContext,
  actor: PartnerActor,
  input: ProspectDemoInput & { accessLevel?: string | undefined },
): Promise<CreatedProspectDemo & { accessLevel: PartnerAccessLevel; url: string }> {
  const member = demosActor(actor);
  const accessLevel = input.accessLevel ?? "full";
  if (!isPartnerAccessLevel(accessLevel)) throw failure("accessLevel must be full or activity.", 400, "invalid_access_level");
  if (input.name.trim().length > PARTNER_DEMO_NAME_MAX_LENGTH) throw failure(`Enter the business's name, up to ${PARTNER_DEMO_NAME_MAX_LENGTH} characters.`, 400, "invalid_name");
  const demo = prepareDemo(input);
  const brand = await brandForHostReference(context, { kind: "partner", partnerId: member.partnerId });
  if (!brand) throw failure("Partner not found.", 404, "partner_not_found");
  const { baseDomain } = partnerFeatures(process.env);
  const created = await withBusinessTransaction(context.db, { userId: member.userId, businessId: demo.businessId, actorType: "system" }, async (tx) => {
    const role = await requireManager(tx, partnerManager(member));
    if (role === "member" && accessLevel !== "full") throw new AuthorizationError("Only owners and admins can choose a demo's access level.");
    // A partner that signed up while the deployment had no base domain gets its subdomain now, if it can.
    const domain = baseDomain ? await reserveSubdomainIn(tx, member.partnerId, baseDomain) : { subdomain: null, changed: false };
    if (!domain.subdomain) throw failure("You need your own domain before you can make a demo.", 409, "partner_domain_required");
    const inserted = await insertDemoInTransaction(tx, demo, { operatorUserId: member.userId, brandName: brand.name, partner: { partnerId: member.partnerId, accessLevel } });
    return { inserted, subdomain: domain.subdomain, subdomainReserved: domain.changed };
  });
  if (created.subdomainReserved) await announceBrandChange(context, { kind: "partner", partnerId: member.partnerId });
  return { ...created.inserted, accessLevel, url: prospectDemoUrl(partnerOrigin(created.subdomain, process.env), created.inserted.token) };
}

/**
 * The partner's demos, newest first, with each one's readiness, the access
 * level it gives once claimed, and its minutes and chats this month. Anyone
 * on the team can read them. A demo whose business the partner released
 * leaves the list.
 */
export async function listPartnerDemos(context: DomainContext, actor: PartnerActor): Promise<PartnerDemo[]> {
  const member = demosActor(actor);
  const manager = partnerManager(member);
  const periodKey = periodKeyFor();
  const listed = await withBusinessTransaction(context.db, { userId: member.userId, actorType: "operator" }, async (tx) => {
    await requireManager(tx, manager);
    // The partner's members aren't on its demos' teams, so RLS shows them none; these functions answer instead.
    const demos = await tx.execute<{ demoId: string; businessId: string }>(sql`select demo_id as "demoId", business_id as "businessId" from app.list_partner_prospect_demos(${member.partnerId}::uuid)`);
    const used = await tx.execute<{ businessId: string; voiceSeconds: number; chats: number }>(
      sql`select business_id as "businessId", voice_seconds_used as "voiceSeconds", chats_used as "chats" from app.list_partner_business_usage(${member.partnerId}::uuid, ${periodKey})`,
    );
    return { demos: demos.rows, usage: new Map(used.rows.map((row) => [row.businessId, row])) };
  });
  const demos: PartnerDemo[] = [];
  // One at a time, so a long list never holds a connection per demo.
  for (const row of listed.demos) {
    const usage = listed.usage.get(row.businessId);
    demos.push({ ...await readDemoStatus(context, manager, row), usage: { periodKey, voiceSeconds: Number(usage?.voiceSeconds ?? 0), chats: Number(usage?.chats ?? 0) } });
  }
  return demos;
}

/** Publishes one of the partner's demos once it's ready, with the token of its current link. Anyone on the team can. */
export async function publishPartnerDemo(context: DomainContext, actor: PartnerActor, input: { demoId: string; token: string; suggestedPrompts?: string[] | undefined }): Promise<{ status: "active"; expiresAt: Date }> {
  return await publishDemo(context, partnerManager(demosActor(actor)), input);
}

/** Gives one of the partner's open demos a new link on the partner's domain. The old link stops working. Anyone on the team can. */
export async function rotatePartnerDemoToken(context: DomainContext, actor: PartnerActor, input: { demoId: string }): Promise<{ token: string; url: string }> {
  const member = demosActor(actor);
  const { token } = await rotateDemoToken(context, partnerManager(member), input.demoId);
  return { token, url: prospectDemoUrl(await partnerDemoOrigin(context, member.partnerId), token) };
}

/** Turns off one of the partner's demos that nobody claimed. Its link stops working. Anyone on the team can. */
export async function revokePartnerDemo(context: DomainContext, actor: PartnerActor, input: { demoId: string }): Promise<void> {
  await revokeDemo(context, partnerManager(demosActor(actor)), input.demoId);
}

/**
 * Deletes one of the partner's demos that nobody claimed, once it's closed:
 * turned off, or past its expiry. Its business goes with it, as deleting any
 * of the partner's businesses does, so nothing of it lingers in the console.
 * A claimed demo is one of the partner's businesses, which the Businesses
 * page deletes. Only owners and admins can.
 */
export async function deletePartnerDemo(context: DomainContext, actor: PartnerActor, input: { demoId: string }): Promise<void> {
  const member = demosActor(actor);
  const manager = partnerManager(member);
  const businessId = await resolveDemoBusiness(context, manager, input.demoId);
  const closes = await withBusinessTransaction(context.db, { userId: member.userId, businessId, actorType: "system" }, async (tx) => {
    if (await requireManager(tx, manager) === "member") throw new AuthorizationError("Only owners and admins can delete the partner's demos.");
    // A claim holds this row while it runs, so deleting waits for it and then sees the demo claimed.
    const demo = (await tx.select({ status: prospectDemos.status, expiresAt: prospectDemos.expiresAt }).from(prospectDemos).where(and(eq(prospectDemos.id, input.demoId), eq(prospectDemos.businessId, businessId), managedBy(manager))).limit(1).for("update"))[0];
    if (!demo) throw demoNotFound();
    if (demo.status === "claimed") throw failure("A claimed demo is one of your businesses. Delete it from the Businesses page.", 409, "demo_claimed");
    if (demo.status !== "revoked" && demo.expiresAt.getTime() > Date.now()) throw failure("Turn the demo off before you delete it.", 409, "demo_open");
    // Nobody claimed it, so nobody pays for it, but a package someone gave it is dropped all the same.
    return (await deletePartnerBusinessInTransaction(tx, { businessId, partnerId: member.partnerId, stripeConnect: Boolean(context.stripeConnect), by: "partner" })).checkout;
  });
  await closeCheckoutQuietly(context, closes);
}

type ResolvedDemo = { prospect_demo_id: string; business_id: string; partner_id: string | null };

/**
 * The demo a token names, with the partner its business belongs to now, or
 * undefined. A demo shows only on its business's brand, so a token from
 * another brand's demo answers like an unknown one.
 */
function demoOnBrand<T extends ResolvedDemo>(row: T | undefined, brand: BrandScope): T | undefined {
  return row && businessShowsOnBrand(row.partner_id ?? null, brand) ? row : undefined;
}

export async function previewProspectDemo(context: DomainContext, token: string, brand: BrandScope = HOST_BRAND_SCOPE): Promise<ProspectDemoPreview> {
  if (!token.trim()) return { state: "invalid" };
  const result = await context.db.execute<ResolvedDemo & {
    business_slug: string;
    business_name: string;
    website_url: string;
    locale: string;
    suggested_prompts: string[];
    status: string;
    expires_at: Date;
  }>(sql`select demo.prospect_demo_id, demo.business_id, demo.business_slug, demo.business_name, demo.website_url, demo.locale, demo.suggested_prompts, demo.status, demo.expires_at, app.business_partner(demo.business_id) as partner_id from app.resolve_prospect_demo_by_token(${tokenHash(token)}) demo`);
  const demo = demoOnBrand(result.rows[0], brand);
  if (!demo) return { state: "invalid" };
  const state: ProspectDemoPublicState = demo.status === "active" && new Date(demo.expires_at).getTime() <= Date.now() ? "expired" : demo.status as ProspectDemoPublicState;
  // Only a published demo is an honest "viewed" signal. The demo surfaces poll
  // this endpoint while a demo is preparing, and polling stops once it is active.
  if (state === "active" && demo.prospect_demo_id && demo.business_id) {
    await recordProspectDemoEvent(context, { name: "prospect_demo.viewed", actorType: "system", businessId: demo.business_id, prospectDemoId: demo.prospect_demo_id });
  }
  return {
    state,
    businessName: demo.business_name,
    businessSlug: demo.business_slug,
    websiteUrl: demo.website_url,
    locale: demo.locale,
    suggestedPrompts: Array.isArray(demo.suggested_prompts) ? demo.suggested_prompts : [],
  };
}

/**
 * Hands a published demo to the signed-in prospect, who becomes its owner.
 * The host's operator leaves its team. A partner's demo stays with the
 * partner, on the partner's domains, at the access level the partner picked:
 * it's claimed only on the partner's domain, never by someone on the
 * partner's team, and its owner starts onboarding where an owner the partner
 * invited would. Claiming it again as the same person is harmless.
 */
export async function claimProspectDemo(
  context: DomainContext,
  input: { userId: string; token: string; brand?: BrandScope | undefined },
): Promise<{ businessId: string; status: "claimed" | "already_claimed" }> {
  const brand = input.brand ?? HOST_BRAND_SCOPE;
  const hash = tokenHash(input.token);
  const resolved = await context.db.execute<ResolvedDemo>(sql`select demo.prospect_demo_id, demo.business_id, app.business_partner(demo.business_id) as partner_id from app.resolve_prospect_demo_by_token(${hash}) demo`);
  const found = demoOnBrand(resolved.rows[0], brand);
  const prospectDemoId = found?.prospect_demo_id;
  const businessId = found?.business_id;
  if (!businessId || !prospectDemoId) throw notClaimable();
  try {
    const result = await withBusinessTransaction(context.db, { userId: input.userId, businessId, actorType: "system" }, async (tx) => {
      const demo = (await tx.select({ id: prospectDemos.id, operatorUserId: prospectDemos.operatorUserId, status: prospectDemos.status, claimedByUserId: prospectDemos.claimedByUserId, expiresAt: prospectDemos.expiresAt })
        .from(prospectDemos)
        .where(and(eq(prospectDemos.businessId, businessId), eq(prospectDemos.tokenHash, hash)))
        .limit(1).for("update"))[0];
      if (!demo) throw notClaimable();
      const business = (await tx.select({ status: businesses.status, name: businesses.name, locale: businesses.defaultLocale, partnerId: businesses.partnerId, accessLevel: businesses.partnerAccessLevel }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
      // The business may have left its partner since the token resolved.
      if (business && !businessShowsOnBrand(business.partnerId, brand)) throw notClaimable();
      const partnerId = business?.partnerId ?? null;
      if (demo.status === "claimed") {
        if (demo.claimedByUserId !== input.userId) throw failure("This prospect demo has already been claimed.", 409, "demo_already_claimed");
        await rememberActiveBusinessInTransaction(tx, { userId: input.userId, businessId, partnerId });
        return { businessId, status: "already_claimed" as const };
      }
      if (demo.status !== "active" || demo.expiresAt.getTime() <= Date.now()) throw notClaimable();
      if (business?.status !== "active") throw failure("Prospect demo business is unavailable.", 409, "demo_business_unavailable");
      // The partner's people work in its businesses from the console, never on their teams.
      if (partnerId) {
        const [onPartnerTeam] = await tx.select({ id: partnerMembers.id }).from(partnerMembers).where(and(eq(partnerMembers.partnerId, partnerId), eq(partnerMembers.userId, input.userId), eq(partnerMembers.status, "active"))).limit(1);
        if (onPartnerTeam) throw partnerMemberNotOnTeam();
      }
      await tx.insert(businessMemberships).values({ businessId, userId: input.userId, role: "business_owner", status: "active" }).onConflictDoUpdate({
        target: [businessMemberships.businessId, businessMemberships.userId],
        set: { role: "business_owner", status: "active", updatedAt: new Date() },
      });
      // The business now belongs to the prospect, so the operator leaves its
      // team entirely. prospect_demos keeps the operator and claimant lineage.
      if (demo.operatorUserId !== input.userId) {
        await tx.delete(businessMemberships).where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.userId, demo.operatorUserId)));
      }
      const onboardingStage = partnerId ? firstOnboardingStage({ partnerId, accessLevel: business.accessLevel }) : "create_business";
      await tx.update(businesses).set({ onboardingStage, updatedAt: new Date() }).where(eq(businesses.id, businessId));
      // From now on its calls and texts are real. At activity only its owner can't change what the demo told the receptionist, so a partner's demo gets back what a new business is told.
      if (partnerId) await endDemoSettingsInTransaction(tx, { businessId, businessName: business.name, locale: business.locale });
      await tx.update(prospectDemos).set({ status: "claimed", claimedAt: new Date(), claimedByUserId: input.userId, updatedAt: new Date() }).where(eq(prospectDemos.id, demo.id));
      // The operator's users row is outside this claimant's RLS scope; the
      // resolver clears its active business if it still points at this demo.
      await detachProspectDemoOperator(tx, businessId);
      // The dashboard opens on the business, on the domains of its brand.
      await rememberActiveBusinessInTransaction(tx, { userId: input.userId, businessId, partnerId });
      return { businessId, status: "claimed" as const };
    });
    await recordProspectDemoEvent(context, { name: "prospect_demo.claim_succeeded", actorType: "system", businessId, prospectDemoId, properties: { status: result.status } });
    return result;
  } catch (error) {
    await recordProspectDemoEvent(context, { name: "prospect_demo.claim_failed", actorType: "system", businessId, prospectDemoId, properties: { reason: claimFailureReason(error) } });
    throw error;
  }
}

/** Puts back what a new business's receptionist is told wherever the demo's own settings are still in place. Settings someone changed during the demo stay. */
async function endDemoSettingsInTransaction(tx: DatabaseTransaction, input: { businessId: string; businessName: string; locale: string }): Promise<void> {
  const [profile] = await tx.select({ bookingPolicy: receptionistProfiles.bookingPolicy, voiceInstructions: receptionistProfiles.voiceInstructions, smsInstructions: receptionistProfiles.smsInstructions }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, input.businessId)).limit(1);
  if (!profile) return;
  const patch: Partial<Record<ProspectDemoSetting, string>> = {};
  for (const field of prospectDemoSettingsIn(profile)) patch[field] = NEW_BUSINESS_RECEPTIONIST_INSTRUCTIONS[field];
  if (!Object.keys(patch).length) return;
  await saveReceptionistProfileInTransaction(tx, { businessId: input.businessId, businessName: input.businessName, locale: normalizeRuntimeLocale(input.locale), patch });
}

function claimFailureReason(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "";
  if (code === "partner_member_not_on_team") return "partner_member";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("already been claimed")) return "already_claimed";
  if (message.includes("invalid, expired, or no longer claimable")) return "not_claimable";
  if (message.includes("unavailable")) return "business_unavailable";
  return "unknown";
}
