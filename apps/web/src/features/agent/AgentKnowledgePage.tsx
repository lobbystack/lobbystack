import { AnimatePresence, motion } from "framer-motion";
import { useAction, useConvex, useQuery } from "convex/react";
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
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
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
  const convex = useConvex();
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
  const [viewerTextByDocumentId, setViewerTextByDocumentId] = useState<Record<string, string>>({});
  const [loadingViewerIds, setLoadingViewerIds] = useState<string[]>([]);
  const [viewerErrorsByDocumentId, setViewerErrorsByDocumentId] = useState<Record<string, string>>({});
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

  function renderDocumentStatus(document: Doc<"knowledge_documents">) {
    if (document.status === "queued" || document.status === "indexing") {
      const progressValue = Math.max(
        0,
        Math.min(100, Math.round(document.processingProgress ?? (document.status === "indexing" ? 92 : 0))),
      );
      const label =
        document.status === "queued"
          ? t(`agent:sections.${section}.status.analyzing`)
          : getDocumentStatusLabel(document.status);

      return (
        <span className="inline-flex min-w-56 items-center gap-3 text-sm text-muted-foreground">
          <span>{label}</span>
          <Progress className="w-24" value={progressValue} />
          <span className="min-w-10 text-right text-xs tabular-nums">
            {progressValue}%
          </span>
        </span>
      );
    }

    return (
      <Badge
        variant={document.status === "error" ? "destructive" : document.status === "indexed" ? "secondary" : "outline"}
      >
        {getDocumentStatusLabel(document.status)}
      </Badge>
    );
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

  async function loadFullDocumentText(document: Doc<"knowledge_documents">): Promise<void> {
    const documentId = String(document._id);
    if (
      !document.extractedTextStorageId ||
      viewerTextByDocumentId[documentId] !== undefined ||
      loadingViewerIds.includes(documentId)
    ) {
      return;
    }

    setLoadingViewerIds((current) => [...current, documentId]);
    setViewerErrorsByDocumentId((current) => {
      if (!(documentId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[documentId];
      return next;
    });

    try {
      const viewerContent = await convex.query(api.ai.context.knowledge.getKnowledgeDocumentViewerContent, {
        businessId,
        documentId: document._id,
      });

      if (!viewerContent.extractedTextUrl) {
        setViewerTextByDocumentId((current) => ({
          ...current,
          [documentId]: viewerContent.textContent,
        }));
        return;
      }

      const response = await fetch(viewerContent.extractedTextUrl);
      if (!response.ok) {
        throw new Error("Failed to load full document text.");
      }

      const fullText = await response.text();
      setViewerTextByDocumentId((current) => ({
        ...current,
        [documentId]: fullText,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t(`agent:sections.${section}.previewError`);
      setViewerErrorsByDocumentId((current) => ({
        ...current,
        [documentId]: message,
      }));
    } finally {
      setLoadingViewerIds((current) => current.filter((id) => id !== documentId));
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
            onOpenChange={(open) => {
              if (open && "sourceType" in entry) {
                void loadFullDocumentText(entry);
              }
            }}
          >
            <div className="flex items-center gap-2 p-4">
              <CollapsibleTrigger className="flex min-w-0 flex-1 items-center outline-none">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="truncate font-semibold">{entry.title}</span>
                  {"sourceType" in entry ? (
                    <>
                      <Badge variant="outline">{t(`agent:sections.${section}.documentBadge`)}</Badge>
                      {renderDocumentStatus(entry)}
                      {entry.tags?.length && entry.tags[0] ? (
                        <Badge variant="secondary">{entry.tags[0]}</Badge>
                      ) : null}
                    </>
                  ) : entry.tags?.length && entry.tags[0] ? (
                    <Badge variant="secondary">{entry.tags[0]}</Badge>
                  ) : null}
                </div>
              </CollapsibleTrigger>
              <div className="flex shrink-0 items-center gap-2">
                <InlineConfirmDeleteButton
                  deleting={deletingEntryId === String(entry._id)}
                  onConfirm={() => {
                    void handleDelete(entry);
                  }}
                />
                <CollapsibleTrigger className="inline-flex items-center justify-center rounded-md p-1 outline-none">
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-open:rotate-180" />
                </CollapsibleTrigger>
              </div>
            </div>
            <CollapsibleContent>
              <div className="px-4 pb-5">
                {"sourceType" in entry ? (
                  <Textarea
                    className="max-h-80 resize-none overflow-y-auto text-sm leading-relaxed"
                    rows={8}
                    readOnly
                    value={
                      entry.status === "error"
                        ? viewerErrorsByDocumentId[String(entry._id)] ??
                          entry.error ??
                          t(`agent:sections.${section}.previewError`)
                        : (viewerTextByDocumentId[String(entry._id)] ?? "").trim()
                          ? (viewerTextByDocumentId[String(entry._id)] ?? "").trim()
                          : loadingViewerIds.includes(String(entry._id))
                            ? t(`agent:sections.${section}.previewPending`)
                        : entry.textContent?.trim()
                          ? entry.textContent.trim()
                          : t(`agent:sections.${section}.previewPending`)
                    }
                  />
                ) : (
                  <Textarea
                    className="max-h-80 resize-none overflow-y-auto text-sm leading-relaxed"
                    rows={8}
                    readOnly
                    value={entry.content}
                  />
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
