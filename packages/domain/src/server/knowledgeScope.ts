import { sql, type SQL } from "drizzle-orm";

/**
 * Whose knowledge a read covers. An agent reads the shared sources still on
 * for it plus its own. defaultAgent is that for the business's default agent,
 * which a flat snapshot answers as. shared is the business's own view: shared
 * sources that are on, as the business summary and opening hours read them.
 */
export type KnowledgeScope = { agentId: string } | { defaultAgent: true } | { shared: true };

/** The business's own facts, such as its summary and hours, come from shared knowledge that's on, never one agent's. */
export const BUSINESS_KNOWLEDGE_SCOPE: KnowledgeScope = { shared: true };

/** The scope an optional agent id reads: that agent, or the default agent. */
export function knowledgeScopeFor(agentId: string | null | undefined): KnowledgeScope {
  return agentId ? { agentId } : { defaultAgent: true };
}

function scopeAgent(businessId: string, scope: KnowledgeScope): SQL | null {
  if ("shared" in scope) return null;
  if ("agentId" in scope) return sql`${scope.agentId}::uuid`;
  return sql`(SELECT a.id FROM agents a WHERE a.business_id = ${businessId} AND a.is_default LIMIT 1)`;
}

/**
 * Whether a knowledge_documents row answers for the scope, as an SQL condition
 * on `alias`. It checks the row's own switch and its whole source's, its owner,
 * and the agent's exclusions on the row or its website. The caller filters by
 * business and status.
 */
export function documentInScope(alias: string, businessId: string, scope: KnowledgeScope): SQL {
  const d = sql.raw(alias);
  const own = sql`${d}.active AND ${d}.source_active
    AND NOT EXISTS (SELECT 1 FROM knowledge_documents website WHERE website.id = ${d}.website_document_id AND website.business_id = ${businessId} AND NOT website.source_active)`;
  const agent = scopeAgent(businessId, scope);
  if (!agent) return sql`(${own} AND ${d}.agent_id IS NULL)`;
  return sql`(${own} AND (${d}.agent_id IS NULL OR ${d}.agent_id = ${agent})
    AND NOT EXISTS (SELECT 1 FROM agent_knowledge_exclusions exclusion WHERE exclusion.business_id = ${businessId} AND exclusion.agent_id = ${agent}
      AND (exclusion.document_id = ${d}.id OR (exclusion.document_id = ${d}.website_document_id AND exclusion.scope = 'source'))))`;
}

/** Whether a knowledge_snippets row answers for the scope, as an SQL condition on `alias`. */
export function snippetInScope(alias: string, businessId: string, scope: KnowledgeScope): SQL {
  const s = sql.raw(alias);
  const agent = scopeAgent(businessId, scope);
  if (!agent) return sql`(${s}.active AND ${s}.agent_id IS NULL)`;
  return sql`(${s}.active AND (${s}.agent_id IS NULL OR ${s}.agent_id = ${agent})
    AND NOT EXISTS (SELECT 1 FROM agent_knowledge_exclusions exclusion WHERE exclusion.business_id = ${businessId} AND exclusion.agent_id = ${agent} AND exclusion.snippet_id = ${s}.id))`;
}
