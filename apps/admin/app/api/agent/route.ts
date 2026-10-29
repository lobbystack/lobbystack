import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { readReceptionistSettingsChange, saveReceptionistProfileInTransaction, updateBusinessInTransaction } from "@lobbystack/domain";
import { businesses, knowledgeDocuments, knowledgeSnippets, receptionistProfiles } from "@lobbystack/db";
import { normalizeRuntimeLocale } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx) => {
  const [business, profile, snippet, document] = await Promise.all([
    tx.select({ id: businesses.id, name: businesses.name, timezone: businesses.timezone, defaultLocale: businesses.defaultLocale, teamLocale: businesses.teamLocale, currency: businesses.currency }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
    tx.select().from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)).limit(1),
    tx.select({ id: knowledgeSnippets.id }).from(knowledgeSnippets).where(and(eq(knowledgeSnippets.businessId, businessId), eq(knowledgeSnippets.active, true))).limit(1),
    tx.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.active, true), eq(knowledgeDocuments.status, "indexed"))).limit(1),
  ]);
  // The same sources the summary rewrite reads; without any, "Rewrite with AI" has nothing to go on.
  return { business: business[0] ?? null, profile: profile[0] ?? null, hasKnowledgeSources: snippet.length > 0 || document.length > 0 };
})));

export const PATCH = operatorRoute(async ({ businessId, body, transaction }) => NextResponse.json(await transaction(async (tx) => {
  // The field rules live in the domain, which the v1 API shares.
  const { patch, locale, teamLocale, timezone, currency, regenerateSummary } = readReceptionistSettingsChange(body);

  const business = (await tx.select({ name: businesses.name, defaultLocale: businesses.defaultLocale }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
  if (!business) throw jsonError("Business not found.", 404);
  const previousLocale = normalizeRuntimeLocale(business.defaultLocale);

  // Opening hours keep their clock times in a new zone; booked appointments keep theirs.
  if (locale !== undefined || teamLocale !== undefined || timezone !== undefined || currency !== undefined) {
    await updateBusinessInTransaction(tx, { businessId, ...(locale !== undefined ? { defaultLocale: locale } : {}), ...(teamLocale !== undefined ? { teamLocale } : {}), ...(timezone !== undefined ? { timezone } : {}), ...(currency !== undefined ? { currency } : {}) });
  }

  const profile = await saveReceptionistProfileInTransaction(tx, { businessId, businessName: business.name, locale: locale ?? previousLocale, patch, regenerateSummary });
  if (!profile) throw jsonError("Receptionist profile could not be saved.", 500);
  return { profile };
}, { minimumRole: "business_admin" })));
