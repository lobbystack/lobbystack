"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import { useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { requestJson } from "@/lib/request-json";
import { itemUsedBy, receptionistUsesItem } from "@/lib/receptionist-usage";
import { ReceptionistPage, receptionistsQueryKey, useReceptionistsOverview } from "./receptionist-page";
import { SharedToggleList, type SharedToggleItem } from "./shared-toggle-list";

type Document = { id: string; title: string; status: string; active?: boolean; sourceUrl: string | null };
type Snippet = { id: string; title: string; content: string; active: boolean };

/** Which of the business's knowledge this receptionist uses. Everything is on by default. */
export function ReceptionistKnowledgeSurface({ agentId }: { agentId: string }) {
  const { t } = useTranslation("receptionists");
  const navigation = useNavigationSnapshot();
  const queryClient = useQueryClient();
  const businessId = navigation?.businessId;
  const overview = useReceptionistsOverview();
  const documents = useQuery({ queryKey: ["knowledge", businessId], enabled: Boolean(businessId), queryFn: () => requestJson<{ documents: Document[] }>(`/api/knowledge?businessId=${encodeURIComponent(businessId!)}`) });
  const snippets = useQuery({ queryKey: ["knowledge-snippets", businessId], enabled: Boolean(businessId), queryFn: () => requestJson<{ snippets: Snippet[] }>(`/api/knowledge/snippets?businessId=${encodeURIComponent(businessId!)}`) });
  const usage = overview.data?.usage;

  const items: Array<SharedToggleItem & { kind: "document" | "snippet" }> = usage ? [
    ...(documents.data?.documents ?? []).filter((document) => document.active !== false).map((document) => ({ kind: "document" as const, id: document.id, title: document.title, ...(document.sourceUrl ? { description: document.sourceUrl } : {}), enabled: receptionistUsesItem(usage, { kind: "document", id: document.id }, agentId), usedBy: itemUsedBy(usage, { kind: "document", id: document.id }) })),
    ...(snippets.data?.snippets ?? []).filter((snippet) => snippet.active).map((snippet) => ({ kind: "snippet" as const, id: snippet.id, title: snippet.title, description: snippet.content, enabled: receptionistUsesItem(usage, { kind: "snippet", id: snippet.id }, agentId), usedBy: itemUsedBy(usage, { kind: "snippet", id: snippet.id }) })),
  ] : [];

  return (
    <ReceptionistPage agentId={agentId} description={t("knowledge.description")} section="knowledge">
      {!usage || documents.isLoading || snippets.isLoading ? <Skeleton className="h-64 w-full rounded-xl" /> : (
        <SharedToggleList
          canManage={navigation?.canManage ?? false}
          receptionistCount={navigation?.receptionists.length ?? 1}
          description={t("knowledge.listDescription")}
          emptyLabel={t("knowledge.empty")}
          items={items}
          manageHref="/knowledge"
          manageLabel={t("knowledge.manage")}
          onToggle={async (item, enabled) => {
            const kind = items.find((candidate) => candidate.id === item.id)?.kind;
            await requestJson(`/api/receptionists/${encodeURIComponent(agentId)}?businessId=${encodeURIComponent(businessId!)}`, { method: "PATCH", body: JSON.stringify(kind === "snippet" ? { kind: "knowledge_snippet", snippetId: item.id, enabled } : { kind: "knowledge_document", documentId: item.id, enabled }) });
            await queryClient.invalidateQueries({ queryKey: receptionistsQueryKey(businessId) });
          }}
          title={t("knowledge.listTitle")}
        />
      )}
    </ReceptionistPage>
  );
}
