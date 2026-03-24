import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type AgentKnowledgePageProps = {
  businessId: Id<"businesses">;
};

export function AgentKnowledgePage({ businessId }: AgentKnowledgePageProps) {
  const { t } = useTranslation(["agent", "knowledge"]);
  const knowledge = useQuery(api.ai.context.knowledge.listKnowledge, {
    businessId,
  });
  const documents = (knowledge?.documents ?? []) as Array<Doc<"knowledge_documents">>;
  const snippets = (knowledge?.snippets ?? []) as Array<Doc<"knowledge_snippets">>;
  const entries = [...documents, ...snippets].sort((left, right) => right._creationTime - left._creationTime);

  function getDocumentStatusLabel(status: Doc<"knowledge_documents">["status"]): string {
    switch (status) {
      case "queued":
        return t("agent:sections.knowledge.status.queued");
      case "indexing":
        return t("agent:sections.knowledge.status.indexing");
      case "indexed":
        return t("agent:sections.knowledge.status.indexed");
      case "error":
        return t("agent:sections.knowledge.status.error");
      default:
        return status;
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        {knowledge && entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            <p>{t("agent:sections.knowledge.emptyState")}</p>
          </div>
        ) : null}

        {entries.map((entry) => (
          <Collapsible
            className="group rounded-2xl border border-border/70 bg-card shadow-sm"
            key={entry._id}
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between p-4 outline-none">
              <div className="flex items-center gap-3">
                <span className="font-semibold">{entry.title}</span>
                {"sourceType" in entry ? (
                  <>
                    <Badge variant="outline">{t("agent:sections.knowledge.documentBadge")}</Badge>
                    <Badge
                      variant={entry.status === "error" ? "destructive" : entry.status === "indexed" ? "secondary" : "outline"}
                    >
                      {getDocumentStatusLabel(entry.status)}
                    </Badge>
                    {entry.tags?.length && entry.tags[0] ? (
                      <Badge variant="secondary">{entry.tags[0]}</Badge>
                    ) : null}
                  </>
                ) : entry.tags?.length && entry.tags[0] ? (
                  <Badge variant="secondary">{entry.tags[0]}</Badge>
                ) : null}
              </div>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-open:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4">
                {"sourceType" in entry ? (
                  <div className="rounded-xl bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
                    {entry.status === "error"
                      ? entry.error ?? t("agent:sections.knowledge.previewError")
                      : entry.textContent?.trim()
                        ? `${entry.textContent.trim().slice(0, 280)}${entry.textContent.trim().length > 280 ? "…" : ""}`
                        : t("agent:sections.knowledge.previewPending")}
                  </div>
                ) : (
                  <div className="rounded-xl bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
                    {entry.content}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
