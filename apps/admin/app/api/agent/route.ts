import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { readAgentSettingsChange, requireActiveAgentInTransaction, saveAgentSettingsInTransaction, staffFirstBlockInTransaction, updateBusinessInTransaction, withBusinessSummary } from "@lobbystack/domain";
import { agents, businesses, defaultAgentOf, knowledgeDocuments, knowledgeSnippets } from "@lobbystack/db";
import { isUuid, normalizeRuntimeLocale } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

// With ?agentId=, that active agent's settings and staff-first block; without it, the default agent's.
export const GET = operatorRoute(async ({ request, businessId, transaction }) => {
  const agentId = new URL(request.url).searchParams.get("agentId");
  if (agentId !== null && !isUuid(agentId)) return jsonError("agentId must be a UUID.", 400, "invalid_request");
  return NextResponse.json(await transaction(async (tx) => {
    const agent = agentId ? await requireActiveAgentInTransaction(tx, businessId, agentId) : undefined;
    const staffFirstBlock = await staffFirstBlockInTransaction(tx, businessId, agent?.id);
    const [business, profile, snippet, document] = await Promise.all([
      tx.select({ id: businesses.id, name: businesses.name, timezone: businesses.timezone, defaultLocale: businesses.defaultLocale, teamLocale: businesses.teamLocale, currency: businesses.currency }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
      agent ? [agent] : tx.select().from(agents).where(defaultAgentOf(businessId)).limit(1),
      tx.select({ id: knowledgeSnippets.id }).from(knowledgeSnippets).where(and(eq(knowledgeSnippets.businessId, businessId), eq(knowledgeSnippets.active, true))).limit(1),
      tx.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.active, true), eq(knowledgeDocuments.status, "indexed"))).limit(1),
    ]);
    // The same sources the summary rewrite reads; without any, "Rewrite with AI" has nothing to go on.
    // The profile carries the business's summary, which every agent shares.
    return { business: business[0] ?? null, profile: profile[0] ? await withBusinessSummary(tx, profile[0]) : null, hasKnowledgeSources: snippet.length > 0 || document.length > 0, staffFirstBlock };
  }));
});

export const PATCH = operatorRoute(async ({ businessId, body, transaction }) => NextResponse.json(await transaction(async (tx) => {
  // The field rules live in the domain, which the v1 API shares.
  const { name, patch, locale, teamLocale, timezone, currency, regenerateSummary } = readAgentSettingsChange(body);

  const business = (await tx.select({ name: businesses.name, defaultLocale: businesses.defaultLocale }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
  if (!business) throw jsonError("Business not found.", 404);
  const previousLocale = normalizeRuntimeLocale(business.defaultLocale);

  // Opening hours keep their clock times in a new zone; booked appointments keep theirs.
  if (locale !== undefined || teamLocale !== undefined || timezone !== undefined || currency !== undefined) {
    await updateBusinessInTransaction(tx, { businessId, ...(locale !== undefined ? { defaultLocale: locale } : {}), ...(teamLocale !== undefined ? { teamLocale } : {}), ...(timezone !== undefined ? { timezone } : {}), ...(currency !== undefined ? { currency } : {}) });
  }

  const profile = await saveAgentSettingsInTransaction(tx, { businessId, businessName: business.name, locale: locale ?? previousLocale, name, patch, regenerateSummary });
  if (!profile) throw jsonError("Agent profile could not be saved.", 500);
  return { profile };
}, { minimumRole: "business_admin" })));
