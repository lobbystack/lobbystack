import { AnimatePresence, motion } from "framer-motion";
import { useAction, useConvex, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Trash2 } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import type { KnowledgeSection } from "../../../../../convex/lib/knowledgeSections";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { captureAnalyticsException } from "@/lib/analytics";
type AgentKnowledgePageProps = {
  businessId: Id<"businesses">;
  section: KnowledgeSection;
};

type KnowledgeEntry = Doc<"knowledge_documents"> | Doc<"knowledge_snippets">;

type InlineConfirmDeleteButtonProps = {
  deleting: boolean;
  disabled?: boolean;
  onConfirm: () => void;
};

const fullDocumentTextMemoryCache = new Map<string, string>();
const VIEWER_TEXT_SESSION_STORAGE_PREFIX = "agent-knowledge-viewer-text:";
const MAX_PERSISTED_VIEWER_TEXT_BYTES = 512 * 1024;

function getViewerCachePrefix(documentId: string): string {
  return `${VIEWER_TEXT_SESSION_STORAGE_PREFIX}${documentId}:`;
}

function getViewerCacheKey(document: Doc<"knowledge_documents">): string {
  return `${getViewerCachePrefix(String(document._id))}${document.lastIndexedAt ?? "pending"}:${document.contentHash ?? "none"}`;
}

function clearViewerCacheForDocument(documentId: string): void {
  const prefix = getViewerCachePrefix(documentId);

  for (const key of fullDocumentTextMemoryCache.keys()) {
    if (key.startsWith(prefix)) {
      fullDocumentTextMemoryCache.delete(key);
    }
  }

  if (typeof window === "undefined") {
    return;
  }

  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(prefix)) {
      window.sessionStorage.removeItem(key);
    }
  }
}

function readCachedViewerText(cacheKey: string): string | null {
  const inMemory = fullDocumentTextMemoryCache.get(cacheKey);
  if (inMemory !== undefined) {
    return inMemory;
  }

  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.sessionStorage.getItem(cacheKey);
  if (stored !== null) {
    fullDocumentTextMemoryCache.set(cacheKey, stored);
  }
  return stored;
}

function writeCachedViewerText(document: Doc<"knowledge_documents">, text: string): void {
  const documentId = String(document._id);
  const cacheKey = getViewerCacheKey(document);

  clearViewerCacheForDocument(documentId);
  fullDocumentTextMemoryCache.set(cacheKey, text);

  if (typeof window === "undefined" || new Blob([text]).size > MAX_PERSISTED_VIEWER_TEXT_BYTES) {
    return;
  }

  try {
    window.sessionStorage.setItem(cacheKey, text);
  } catch {
    // Ignore browser storage quota failures and keep the in-memory cache.
  }
}

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
  const [viewerCacheKeyByDocumentId, setViewerCacheKeyByDocumentId] = useState<Record<string, string>>({});
  const [loadingViewerIds, setLoadingViewerIds] = useState<string[]>([]);
  const [viewerErrorsByDocumentId, setViewerErrorsByDocumentId] = useState<Record<string, string>>({});
  const visibleEntries = entries.filter((entry) => !optimisticDeletedIds.includes(String(entry._id)));
  const isLoadingKnowledge = knowledge === undefined;

  function getLoadedViewerText(document: Doc<"knowledge_documents">): string | undefined {
    const documentId = String(document._id);
    const cacheKey = getViewerCacheKey(document);
    return viewerCacheKeyByDocumentId[documentId] === cacheKey
      ? viewerTextByDocumentId[documentId]
      : undefined;
  }

  function setLoadedViewerText(document: Doc<"knowledge_documents">, text: string): void {
    const documentId = String(document._id);
    const cacheKey = getViewerCacheKey(document);

    setViewerTextByDocumentId((current) => ({
      ...current,
      [documentId]: text,
    }));
    setViewerCacheKeyByDocumentId((current) => ({
      ...current,
      [documentId]: cacheKey,
    }));
  }

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
        clearViewerCacheForDocument(entryId);
        setViewerTextByDocumentId((current) => {
          if (!(entryId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[entryId];
          return next;
        });
        setViewerCacheKeyByDocumentId((current) => {
          if (!(entryId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[entryId];
          return next;
        });
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
    const loadedViewerText = getLoadedViewerText(document);
    const cachedText = readCachedViewerText(getViewerCacheKey(document));
    if (
      !document.extractedTextStorageId ||
      loadedViewerText !== undefined ||
      loadingViewerIds.includes(documentId) ||
      cachedText !== null
    ) {
      if (cachedText !== null && loadedViewerText === undefined) {
        setLoadedViewerText(document, cachedText);
      }
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

    let fallbackText = document.textContent ?? "";
    try {
      const viewerContent = await convex.query(api.ai.context.knowledge.getKnowledgeDocumentViewerContent, {
        businessId,
        documentId: document._id,
      });
      fallbackText = viewerContent.textContent;

      if (!viewerContent.extractedTextUrl) {
        writeCachedViewerText(document, viewerContent.textContent);
        setLoadedViewerText(document, viewerContent.textContent);
        return;
      }

      const response = await fetch(viewerContent.extractedTextUrl);
      if (!response.ok) {
        throw new Error("Failed to load full document text.");
      }

      const fullText = await response.text();
      writeCachedViewerText(document, fullText);
      setLoadedViewerText(document, fullText);
    } catch (error) {
      if (fallbackText.trim()) {
        writeCachedViewerText(document, fallbackText);
        setLoadedViewerText(document, fallbackText);
        return;
      }
      captureAnalyticsException(error, {
        businessId: String(businessId),
        section,
        operation: "knowledge_document_preview",
        documentId,
      });
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
        {isLoadingKnowledge ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div className="rounded-2xl border border-border/70 bg-card p-4" key={index}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
            </div>
          ))
        ) : null}

        {knowledge && visibleEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            <p>{t(`agent:sections.${section}.emptyState`)}</p>
          </div>
        ) : null}

        {visibleEntries.map((entry) => (
          (() => {
            const loadedViewerText =
              "sourceType" in entry ? getLoadedViewerText(entry) : undefined;

            return (
              <Collapsible
                className="group rounded-2xl border border-border/70 bg-card"
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
                      loadingViewerIds.includes(String(entry._id)) &&
                      !loadedViewerText?.trim() &&
                      !entry.textContent?.trim() ? (
                        <div className="space-y-3 rounded-md border border-border/70 p-4">
                          {Array.from({ length: 6 }).map((_, index) => (
                            <Skeleton className="h-4 w-full" key={index} />
                          ))}
                        </div>
                      ) : (
                        <Textarea
                          className="max-h-80 resize-none overflow-y-auto text-sm leading-relaxed"
                          rows={8}
                          readOnly
                          value={
                            entry.status === "error"
                              ? viewerErrorsByDocumentId[String(entry._id)] ??
                                entry.error ??
                                t(`agent:sections.${section}.previewError`)
                              : loadedViewerText?.trim()
                                ? loadedViewerText.trim()
                                : entry.textContent?.trim()
                                  ? entry.textContent.trim()
                                  : t(`agent:sections.${section}.previewPending`)
                          }
                        />
                      )
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
            );
          })()
        ))}
      </div>
    </div>
  );
}
