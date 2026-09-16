import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { businessContextSnapshots, businessMemberships, businesses, enqueueOutbox, knowledgeDocuments, prospectDemos, receptionistProfiles, services, staff, staffServiceAssignments, users, websiteIngestionJobs, withBusinessTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";
import { normalizeWebsiteSourceUrl } from "./knowledgeUrl";

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
  greetingReady: boolean;
  snapshotReady: boolean;
  promptsReady: boolean;
};

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

export async function createProspectDemo(
  context: DomainContext,
  input: { operatorUserId: string; name: string; websiteUrl: string; locale?: string; recipientEmail?: string; recipientName?: string; campaignId?: string; greeting?: string; services?: string[]; suggestedPrompts?: string[]; timezone?: string },
): Promise<{ demoId: string; businessId: string; slug: string; token: string; status: "preparing"; websiteIngestionJobId: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("Business name is required.");
  const normalizedWebsiteUrl = normalizeWebsiteSourceUrl(input.websiteUrl.trim());
  const businessId = randomUUID();
  const demoId = randomUUID();
  const ingestionJobId = randomUUID();
  const slug = `${cleanSlug(name)}-${Date.now().toString(36)}`;
  const token = generateToken(name);
  const locale = input.locale === "fr" ? "fr" : "en";
  const timezone = input.timezone?.trim() || "America/New_York";
  const suggestedPrompts = cleanPrompts(input.suggestedPrompts);
  const serviceNames = (input.services ?? []).map((value) => value.trim()).filter(Boolean);
  return await withBusinessTransaction(context.db, { userId: input.operatorUserId, businessId, actorType: "system" }, async (tx) => {
    await tx.insert(businesses).values({ id: businessId, slug, name, timezone, defaultLocale: locale, websiteUrl: normalizedWebsiteUrl, businessType: "general", deploymentMode: process.env.DEPLOYMENT_MODE === "cloud" ? "cloud" : "development" });
    await tx.insert(businessMemberships).values({ businessId, userId: input.operatorUserId, role: "business_owner", status: "active" });
    await tx.insert(receptionistProfiles).values({
      businessId,
      greeting: input.greeting?.trim() || `Thanks for calling ${name}.`,
      tone: "professional and friendly",
      summary: `${name} virtual receptionist`,
      bookingPolicy: "Do not book appointments during this prospect demo.",
      voiceInstructions: "This is a LobbyStack prospect demo. Answer from public business knowledge. Collect sample contact details for a quote or service request. Do not book appointments, transfer calls, or promise outbound messages.",
      smsInstructions: "Do not send SMS during prospect demos.",
      transferMode: "on_request",
    });
    const [defaultStaff] = await tx.insert(staff).values({ businessId, name: name, timezone }).returning({ id: staff.id });
    if (!defaultStaff) throw new Error("Default demo staff could not be created.");
    for (const [index, serviceName] of serviceNames.entries()) {
      const [service] = await tx.insert(services).values({ businessId, name: serviceName, slug: `${cleanSlug(serviceName)}-${index + 1}`, durationMinutes: 30, active: true }).returning({ id: services.id });
      if (service) await tx.insert(staffServiceAssignments).values({ businessId, staffId: defaultStaff.id, serviceId: service.id });
    }
    await tx.insert(websiteIngestionJobs).values({ id: ingestionJobId, businessId, websiteUrl: normalizedWebsiteUrl, provider: "firecrawl", status: "queued" });
    await tx.insert(prospectDemos).values({ id: demoId, businessId, tokenHash: tokenHash(token), status: "preparing", locale, suggestedPrompts, recipientEmail: input.recipientEmail?.trim().toLowerCase() || null, recipientName: input.recipientName?.trim() || null, campaignId: input.campaignId?.trim() || null, websiteUrl: normalizedWebsiteUrl, businessName: name, operatorUserId: input.operatorUserId, websiteIngestionJobId: ingestionJobId, expiresAt: new Date(Date.now() + PROSPECT_DEMO_MAX_AGE_MS) });
    await enqueueOutbox(tx, { topic: "knowledge.crawlWebsite", businessId, aggregateType: "website_ingestion_job", aggregateId: ingestionJobId, dedupeKey: `prospect-demo:${demoId}:crawl`, payload: { url: normalizedWebsiteUrl, websiteIngestionJobId: ingestionJobId } });
    await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId, aggregateType: "prospect_demo", aggregateId: demoId, dedupeKey: `prospect-demo:${demoId}:snapshot:initial`, payload: { businessId, reason: "prospect_demo_created" } });
    return { demoId, businessId, slug, token, status: "preparing", websiteIngestionJobId: ingestionJobId };
  });
}

export async function getProspectDemoStatus(context: DomainContext, input: { operatorUserId: string; demoId: string }): Promise<ProspectDemoStatus> {
  const businessId = await resolveOperatorDemoBusiness(context, input);
  return await withBusinessTransaction(context.db, { userId: input.operatorUserId, businessId, actorType: "system" }, async (tx) => {
    const row = (await tx.select({ demo: prospectDemos, slug: businesses.slug, ingestionStatus: websiteIngestionJobs.status, greeting: receptionistProfiles.greeting })
      .from(prospectDemos)
      .innerJoin(businesses, eq(businesses.id, prospectDemos.businessId))
      .leftJoin(websiteIngestionJobs, eq(websiteIngestionJobs.id, prospectDemos.websiteIngestionJobId))
      .leftJoin(receptionistProfiles, eq(receptionistProfiles.businessId, prospectDemos.businessId))
      .where(and(eq(prospectDemos.id, input.demoId), eq(prospectDemos.operatorUserId, input.operatorUserId))).limit(1))[0];
    if (!row) throw new Error("Prospect demo not found.");
    const snapshot = (await tx.select({ id: businessContextSnapshots.id }).from(businessContextSnapshots).where(eq(businessContextSnapshots.businessId, row.demo.businessId)).orderBy(desc(businessContextSnapshots.generatedAt)).limit(1))[0];
    return { demoId: row.demo.id, businessId: row.demo.businessId, businessName: row.demo.businessName, businessSlug: row.slug, websiteUrl: row.demo.websiteUrl, status: row.demo.status, locale: row.demo.locale, suggestedPrompts: row.demo.suggestedPrompts, expiresAt: row.demo.expiresAt, publishedAt: row.demo.publishedAt, websiteIngestionStatus: row.ingestionStatus, greetingReady: Boolean(row.greeting?.trim()), snapshotReady: Boolean(snapshot), promptsReady: row.demo.suggestedPrompts.length >= 2 };
  });
}

export async function listProspectDemos(context: DomainContext, operatorUserId: string): Promise<ProspectDemoStatus[]> {
  const rows = await withBusinessTransaction(context.db, { userId: operatorUserId, actorType: "system" }, async (tx) => await tx.execute<{ demo_id: string }>(sql`select demo_id from app.list_operator_prospect_demos()`));
  return await Promise.all(rows.rows.map(({ demo_id }) => getProspectDemoStatus(context, { operatorUserId, demoId: demo_id })));
}

export async function setProspectDemoPrompts(context: DomainContext, input: { operatorUserId: string; demoId: string; suggestedPrompts: string[] }): Promise<string[]> {
  const prompts = cleanPrompts(input.suggestedPrompts);
  if (prompts.length < 2) throw new Error("Two suggested prompts are required.");
  const businessId = await resolveOperatorDemoBusiness(context, input);
  return await withBusinessTransaction(context.db, { userId: input.operatorUserId, businessId, actorType: "system" }, async (tx) => {
    const [demo] = await tx.update(prospectDemos)
      .set({ suggestedPrompts: prompts, updatedAt: new Date() })
      .where(and(eq(prospectDemos.id, input.demoId), eq(prospectDemos.operatorUserId, input.operatorUserId)))
      .returning({ suggestedPrompts: prospectDemos.suggestedPrompts });
    if (!demo) throw new Error("Prospect demo not found.");
    return demo.suggestedPrompts;
  });
}

export async function publishProspectDemo(context: DomainContext, input: { operatorUserId: string; demoId: string; token: string; suggestedPrompts?: string[] }): Promise<{ status: "active"; expiresAt: Date }> {
  const businessId = await resolveOperatorDemoBusiness(context, input);
  return await withBusinessTransaction(context.db, { userId: input.operatorUserId, businessId, actorType: "system" }, async (tx) => {
    const demo = (await tx.select().from(prospectDemos).where(and(eq(prospectDemos.id, input.demoId), eq(prospectDemos.operatorUserId, input.operatorUserId))).limit(1))[0];
    if (!demo) throw new Error("Prospect demo not found.");
    if (demo.status === "claimed" || demo.status === "revoked") throw new Error("Closed prospect demos cannot be published.");
    if (demo.expiresAt <= new Date()) throw new Error("Prospect demo expired.");
    if (demo.tokenHash !== tokenHash(input.token)) throw new Error("Prospect demo token mismatch.");
    const prompts = input.suggestedPrompts ? cleanPrompts(input.suggestedPrompts) : demo.suggestedPrompts;
    if (prompts.length < 2) throw new Error("Two suggested prompts are required before publish.");
    const ingestion = demo.websiteIngestionJobId ? await tx.select({ status: websiteIngestionJobs.status }).from(websiteIngestionJobs).where(eq(websiteIngestionJobs.id, demo.websiteIngestionJobId)).limit(1) : [];
    const profile = await tx.select({ greeting: receptionistProfiles.greeting }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, demo.businessId)).limit(1);
    const snapshot = await tx.select({ id: businessContextSnapshots.id }).from(businessContextSnapshots).where(eq(businessContextSnapshots.businessId, demo.businessId)).limit(1);
    const indexedDocument = await tx.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, demo.businessId), eq(knowledgeDocuments.status, "indexed"))).limit(1);
    if (ingestion[0]?.status !== "completed" || !indexedDocument[0]) throw new Error("Website ingestion must be completed before publish.");
    if (!profile[0]?.greeting.trim()) throw new Error("Greeting must be set before publish.");
    if (!snapshot[0]) throw new Error("Business context snapshot must be ready before publish.");
    await tx.update(prospectDemos).set({ status: "active", suggestedPrompts: prompts, publishedAt: new Date(), updatedAt: new Date() }).where(eq(prospectDemos.id, demo.id));
    return { status: "active", expiresAt: demo.expiresAt };
  });
}

export async function rotateProspectDemoToken(context: DomainContext, input: { operatorUserId: string; demoId: string }): Promise<{ token: string }> {
  const businessId = await resolveOperatorDemoBusiness(context, input);
  return await withBusinessTransaction(context.db, { userId: input.operatorUserId, businessId, actorType: "system" }, async (tx) => {
    const demo = (await tx.select({ id: prospectDemos.id, businessName: prospectDemos.businessName, status: prospectDemos.status }).from(prospectDemos).where(and(eq(prospectDemos.id, input.demoId), eq(prospectDemos.operatorUserId, input.operatorUserId))).limit(1))[0];
    if (!demo) throw new Error("Prospect demo not found.");
    if (demo.status === "claimed" || demo.status === "revoked") throw new Error("Cannot rotate token for a closed prospect demo.");
    const token = generateToken(demo.businessName);
    await tx.update(prospectDemos).set({ tokenHash: tokenHash(token), updatedAt: new Date() }).where(eq(prospectDemos.id, demo.id));
    return { token };
  });
}

export async function revokeProspectDemo(context: DomainContext, input: { operatorUserId: string; demoId: string }): Promise<void> {
  const businessId = await resolveOperatorDemoBusiness(context, input);
  await withBusinessTransaction(context.db, { userId: input.operatorUserId, businessId, actorType: "system" }, async (tx) => {
    const demo = (await tx.select({ id: prospectDemos.id, status: prospectDemos.status }).from(prospectDemos).where(and(eq(prospectDemos.id, input.demoId), eq(prospectDemos.operatorUserId, input.operatorUserId))).limit(1))[0];
    if (!demo) throw new Error("Prospect demo not found.");
    if (demo.status === "claimed") throw new Error("Claimed prospect demos cannot be revoked.");
    await tx.update(prospectDemos).set({ status: "revoked", updatedAt: new Date() }).where(eq(prospectDemos.id, demo.id));
  });
}

export async function expireProspectDemos(context: DomainContext): Promise<number> {
  const result = await context.db.execute<{ count: string | number }>(sql`select app.expire_prospect_demos() as count`);
  return Number(result.rows[0]?.count ?? 0);
}

async function resolveOperatorDemoBusiness(context: DomainContext, input: { operatorUserId: string; demoId: string }): Promise<string> {
  const result = await withBusinessTransaction(context.db, { userId: input.operatorUserId, actorType: "system" }, async (tx) => await tx.execute<{ business_id: string }>(sql`select business_id from app.resolve_operator_prospect_demo(${input.demoId})`));
  const businessId = result.rows[0]?.business_id;
  if (!businessId) throw new Error("Prospect demo not found.");
  return businessId;
}

export async function previewProspectDemo(context: DomainContext, token: string): Promise<ProspectDemoPreview> {
  if (!token.trim()) return { state: "invalid" };
  const result = await context.db.execute<{
    business_slug: string;
    business_name: string;
    website_url: string;
    locale: string;
    suggested_prompts: string[];
    status: string;
    expires_at: Date;
  }>(sql`select business_slug, business_name, website_url, locale, suggested_prompts, status, expires_at from app.resolve_prospect_demo_by_token(${tokenHash(token)})`);
  const demo = result.rows[0];
  if (!demo) return { state: "invalid" };
  const state: ProspectDemoPublicState = demo.status === "active" && new Date(demo.expires_at).getTime() <= Date.now() ? "expired" : demo.status as ProspectDemoPublicState;
  return {
    state,
    businessName: demo.business_name,
    businessSlug: demo.business_slug,
    websiteUrl: demo.website_url,
    locale: demo.locale,
    suggestedPrompts: Array.isArray(demo.suggested_prompts) ? demo.suggested_prompts : [],
  };
}

export async function claimProspectDemo(
  context: DomainContext,
  input: { userId: string; token: string },
): Promise<{ businessId: string; status: "claimed" | "already_claimed" }> {
  const hash = tokenHash(input.token);
  const resolved = await context.db.execute<{ business_id: string }>(sql`select business_id from app.resolve_prospect_demo_by_token(${hash})`);
  const businessId = resolved.rows[0]?.business_id;
  if (!businessId) throw new Error("Demo is invalid, expired, or no longer claimable.");
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId, actorType: "system" }, async (tx) => {
    const demo = (await tx.select({ id: prospectDemos.id, operatorUserId: prospectDemos.operatorUserId, status: prospectDemos.status, claimedByUserId: prospectDemos.claimedByUserId, expiresAt: prospectDemos.expiresAt })
      .from(prospectDemos)
      .where(and(eq(prospectDemos.businessId, businessId), eq(prospectDemos.tokenHash, hash)))
      .limit(1).for("update"))[0];
    if (!demo) throw new Error("Demo is invalid, expired, or no longer claimable.");
    if (demo.status === "claimed") {
      if (demo.claimedByUserId !== input.userId) throw new Error("This prospect demo has already been claimed.");
      await tx.update(users).set({ activeBusinessId: businessId, updatedAt: new Date() }).where(eq(users.id, input.userId));
      return { businessId, status: "already_claimed" };
    }
    if (demo.status !== "active" || demo.expiresAt.getTime() <= Date.now()) throw new Error("Demo is invalid, expired, or no longer claimable.");
    const business = (await tx.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
    if (business?.status !== "active") throw new Error("Prospect demo business is unavailable.");
    await tx.insert(businessMemberships).values({ businessId, userId: input.userId, role: "business_owner", status: "active" }).onConflictDoUpdate({
      target: [businessMemberships.businessId, businessMemberships.userId],
      set: { role: "business_owner", status: "active", updatedAt: new Date() },
    });
    if (demo.operatorUserId !== input.userId) {
      await tx.delete(businessMemberships).where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.userId, demo.operatorUserId)));
    }
    await tx.update(businesses).set({ onboardingStage: "create_business", updatedAt: new Date() }).where(eq(businesses.id, businessId));
    await tx.update(prospectDemos).set({ status: "claimed", claimedAt: new Date(), claimedByUserId: input.userId, updatedAt: new Date() }).where(eq(prospectDemos.id, demo.id));
    await tx.update(users).set({ activeBusinessId: businessId, updatedAt: new Date() }).where(eq(users.id, input.userId));
    return { businessId, status: "claimed" };
  });
}
