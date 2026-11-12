"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { KnowledgeAction, KnowledgeItem, KnowledgePage, KnowledgeSource } from "@lobbystack/domain";
import { requestJson } from "@/lib/request-json";

export type { KnowledgeAction, KnowledgeItem, KnowledgePage, KnowledgeSource };

const sourcesKey = (businessId: string | undefined, agentId: string | undefined) => ["knowledge-sources", businessId, agentId ?? null] as const;

function query(businessId: string, agentId?: string): string {
  return `businessId=${encodeURIComponent(businessId)}${agentId ? `&agentId=${encodeURIComponent(agentId)}` : ""}`;
}

/** The item an action names for a source row. */
export function sourceItem(source: Pick<KnowledgeSource, "kind" | "id">): KnowledgeItem {
  return { type: source.kind === "website" ? "website" : source.kind === "file" ? "file" : "snippet", id: source.id };
}

/**
 * The knowledge sources a page lists, and the calls that change them. Without
 * agentId, the business's shared sources. With one, that agent's own and the
 * shared ones with this agent's switch. A page refreshes its list while a
 * source is still being read.
 */
export function useKnowledgeSources(businessId: string | undefined, agentId?: string) {
  const queryClient = useQueryClient();
  const sources = useQuery({
    queryKey: sourcesKey(businessId, agentId),
    enabled: Boolean(businessId),
    queryFn: () => requestJson<{ own: KnowledgeSource[]; shared: KnowledgeSource[] }>(`/api/knowledge/sources?${query(businessId!, agentId)}`),
    // A website whose read stalled is looked at now and then, in case the worker picks it back up.
    refetchInterval: (current) => {
      const reading = [...(current.state.data?.own ?? []), ...(current.state.data?.shared ?? [])].filter((source) => ["pending", "processing"].includes(source.status));
      if (!reading.length) return false;
      return reading.every((source) => source.websiteImport?.stalled) ? 15_000 : 1500;
    },
  });
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["knowledge-sources", businessId] });
    await queryClient.invalidateQueries({ queryKey: ["knowledge-pages", businessId] });
    await queryClient.invalidateQueries({ queryKey: ["knowledge-content", businessId] });
  };
  const act = useMutation({
    mutationFn: (input: { action: KnowledgeAction; items: KnowledgeItem[] }) => requestJson<{ changed: number }>(`/api/knowledge/sources/actions?businessId=${encodeURIComponent(businessId!)}`, { method: "POST", body: JSON.stringify({ ...input, ...(agentId ? { agentId } : {}) }) }),
    onSuccess: invalidate,
  });
  const cancelImport = useMutation({
    mutationFn: (documentId: string) => requestJson(`/api/knowledge/${encodeURIComponent(documentId)}?businessId=${encodeURIComponent(businessId!)}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) }),
    onSuccess: invalidate,
  });
  return { sources, act, cancelImport, invalidate };
}

/** A website's pages, for its dialog. */
export function useWebsitePages(businessId: string | undefined, documentId: string | null, agentId?: string) {
  return useQuery({
    queryKey: ["knowledge-pages", businessId, documentId, agentId ?? null],
    enabled: Boolean(businessId && documentId),
    queryFn: () => requestJson<{ source: KnowledgeSource; pages: KnowledgePage[] }>(`/api/knowledge/sources/${encodeURIComponent(documentId!)}/pages?${query(businessId!, agentId)}`),
  });
}
