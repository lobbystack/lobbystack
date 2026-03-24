import { AnimatePresence, motion } from "framer-motion";
import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Trash2 } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AgentSection } from "./sections";

type AgentKnowledgePageProps = {
  businessId: Id<"businesses">;
  section: AgentSection;
};

type KnowledgeEntry = Doc<"knowledge_documents"> | Doc<"knowledge_snippets">;

type InlineConfirmDeleteButtonProps = {
  deleting: boolean;
  disabled?: boolean;
  onConfirm: () => void;
};

function InlineConfirmDeleteButton({
  deleting,
  disabled = false,
  onConfirm,
}: InlineConfirmDeleteButtonProps) {
  const { t } = useTranslation("agent");
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (!isConfirming || deleting) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsConfirming(false);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [deleting, isConfirming]);

  useEffect(() => {
    if (!deleting) {
      return;
    }

    setIsConfirming(false);
  }, [deleting]);

  return (
    <motion.div layout className="overflow-hidden">
      <AnimatePresence initial={false} mode="wait">
        {isConfirming ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.96, x: 8 }}
            initial={{ opacity: 0, scale: 0.96, x: 8 }}
            key="confirm-delete"
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <Button
              disabled={disabled || deleting}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onConfirm();
              }}
              size="sm"
              title={t("actions.confirmDelete")}
              type="button"
              variant="destructive"
            >
              {t("actions.confirmDelete")}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.96, x: -8 }}
            initial={{ opacity: 0, scale: 0.96, x: -8 }}
            key="delete-icon"
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <Button
              aria-label={t("actions.delete")}
              disabled={disabled || deleting}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsConfirming(true);
              }}
              size="icon-sm"
              title={t("actions.delete")}
              type="button"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function AgentKnowledgePage({ businessId, section }: AgentKnowledgePageProps) {
  const { t } = useTranslation(["agent", "knowledge"]);
  const deleteKnowledgeEntry = useAction(api.ai.context.knowledge.deleteKnowledgeEntry);
  const knowledge = useQuery(api.ai.context.knowledge.listKnowledge, {
    businessId,
    section,
  });
  const documents = (knowledge?.documents ?? []) as Array<Doc<"knowledge_documents">>;
  const snippets = (knowledge?.snippets ?? []) as Array<Doc<"knowledge_snippets">>;
  const entries = [...documents, ...snippets].sort((left, right) => right._creationTime - left._creationTime);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<string[]>([]);
  const visibleEntries = entries.filter((entry) => !optimisticDeletedIds.includes(String(entry._id)));

  function getDocumentStatusLabel(status: Doc<"knowledge_documents">["status"]): string {
    switch (status) {
      case "queued":
        return t(`agent:sections.${section}.status.queued`);
      case "indexing":
        return t(`agent:sections.${section}.status.indexing`);
      case "indexed":
        return t(`agent:sections.${section}.status.indexed`);
      case "error":
        return t(`agent:sections.${section}.status.error`);
      default:
        return status;
    }
  }

  async function handleDelete(entry: KnowledgeEntry): Promise<void> {
    const entryId = String(entry._id);
    setDeletingEntryId(entryId);
    setOptimisticDeletedIds((current) => [...current, entryId]);
    try {
      if ("sourceType" in entry) {
        await deleteKnowledgeEntry({
          businessId,
          documentId: entry._id,
        });
      } else {
        await deleteKnowledgeEntry({
          businessId,
          snippetId: entry._id,
        });
      }
      setOptimisticDeletedIds((current) => current.filter((id) => id !== entryId));
    } catch (error) {
      setOptimisticDeletedIds((current) => current.filter((id) => id !== entryId));
      throw error;
    } finally {
      setDeletingEntryId(null);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        {knowledge && visibleEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            <p>{t(`agent:sections.${section}.emptyState`)}</p>
          </div>
        ) : null}

        {visibleEntries.map((entry) => (
          <Collapsible
            className="group rounded-2xl border border-border/70 bg-card shadow-sm"
            key={entry._id}
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between p-4 outline-none">
              <div className="flex items-center gap-3">
                <span className="font-semibold">{entry.title}</span>
                {"sourceType" in entry ? (
                  <>
                    <Badge variant="outline">{t(`agent:sections.${section}.documentBadge`)}</Badge>
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
              <div className="flex items-center gap-1">
                <InlineConfirmDeleteButton
                  deleting={deletingEntryId === String(entry._id)}
                  onConfirm={() => {
                    void handleDelete(entry);
                  }}
                />
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-open:rotate-180" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4">
                {"sourceType" in entry ? (
                  <div className="rounded-xl bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
                    {entry.status === "error"
                      ? entry.error ?? t(`agent:sections.${section}.previewError`)
                      : entry.textContent?.trim()
                        ? `${entry.textContent.trim().slice(0, 280)}${entry.textContent.trim().length > 280 ? "…" : ""}`
                        : t(`agent:sections.${section}.previewPending`)}
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
