"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, FileText, Globe, MoreHorizontal, Pause, Pencil, Play, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AddKnowledgeSheet } from "@/components/add-knowledge-sheet";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { ImportWebsiteKnowledgeSheet } from "@/components/import-website-knowledge-sheet";
import { useTelemetry } from "@/components/product-analytics";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { UploadKnowledgeDocumentSheet } from "@/components/upload-knowledge-document-sheet";
import { sourceItem, type KnowledgeAction, type KnowledgeItem, type KnowledgeSource } from "@/hooks/use-knowledge-sources";
import { requestJson } from "@/lib/request-json";
import { uploadKnowledgeDocument } from "@/lib/storage-upload";
import { isImporting } from "./knowledge-sources-table";

export type KnowledgeForm = "text" | "website" | "upload";

/** The Add knowledge button and its menu: upload a file, import a website, or write text. */
export function AddKnowledgeMenu({ onPick }: { onPick: (form: KnowledgeForm) => void }) {
  const { t } = useTranslation("agent");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button"><Plus data-icon="inline-start" />{t("sections.knowledge.addKnowledge")}<ChevronDown data-icon="inline-end" /></Button>} />
      <DropdownMenuContent align="end" className="min-w-44 w-auto">
        <DropdownMenuItem onClick={() => onPick("upload")}><Upload />{t("sections.knowledge.addKnowledgeOptions.upload")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("website")}><Globe />{t("sections.knowledge.addKnowledgeOptions.website")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("text")}><FileText />{t("sections.knowledge.addKnowledgeOptions.text")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The sheets that add knowledge and edit an entry, the same on the business
 * page and an agent's page. With agentId, what they add is that agent's alone.
 */
export function KnowledgeForms({ businessId, agentId, form, editing, onClose, onSaved }: { businessId: string; agentId?: string | undefined; form: KnowledgeForm | null; editing: KnowledgeSource | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation("agent");
  const telemetry = useTelemetry();
  const owner = agentId ? { agentId } : {};
  const addWebsite = useMutation({
    mutationFn: async (sourceUrl: string) => {
      try {
        return await requestJson(`/api/knowledge?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ businessId, sourceType: "website", title: sourceUrl, sourceUrl, ...owner }) });
      } catch (error) {
        // A website already in another scope: say where, in the person's language.
        const { code, payload } = error as { code?: string; payload?: { agentName?: string | null } };
        if (code === "knowledge_website_in_shared") throw new Error(t("sections.knowledge.websiteImport.inShared"));
        if (code === "knowledge_website_in_agent" && payload?.agentName) throw new Error(t("sections.knowledge.websiteImport.inAgent", { name: payload.agentName }));
        throw error;
      }
    },
    onSuccess: onSaved,
    meta: { inlineError: true },
  });
  const saveSnippet = useMutation({
    mutationFn: (input: { title: string; content: string; tags: string[]; priority: number; active: boolean }) => editing
      ? requestJson(`/api/knowledge/snippets/${encodeURIComponent(editing.id)}?businessId=${encodeURIComponent(businessId)}`, { method: "PATCH", body: JSON.stringify({ id: editing.id, ...input }) })
      : requestJson(`/api/knowledge/snippets?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ ...input, ...owner }) }),
    onSuccess: onSaved,
  });
  const upload = useMutation({
    mutationFn: ({ file, contentType, title, tags }: { file: File; contentType: string; title: string; tags: string[] }) => uploadKnowledgeDocument({ businessId, file, contentType, title, tags, ...owner }, t("sections.knowledge.uploadValidation.uploadFailed")),
    onMutate: (variables) => telemetry.track("web.knowledge.upload_started", { businessId, section: "knowledge", contentType: variables.contentType }),
    onSuccess: async (_data, variables) => { telemetry.track("web.knowledge.upload_completed", { businessId, section: "knowledge", contentType: variables.contentType }); await onSaved(); },
    meta: { inlineError: true },
  });
  return (
    <>
      <AddKnowledgeSheet mode={editing ? "edit" : "create"} onOpenChange={(open) => { if (!open) onClose(); }} open={form === "text"} save={async (values) => { await saveSnippet.mutateAsync(values); toast.success(t(editing ? "sections.knowledge.toast.updated" : "sections.knowledge.toast.added")); }} snippet={editing ? { title: editing.title, content: editing.content ?? "", tags: editing.tags ?? [], priority: editing.priority ?? 0, active: editing.active } : null} />
      <ImportWebsiteKnowledgeSheet onOpenChange={(open) => { if (!open) onClose(); }} open={form === "website"} save={async (sourceUrl) => { await addWebsite.mutateAsync(sourceUrl); }} />
      <UploadKnowledgeDocumentSheet onOpenChange={(open) => { if (!open) onClose(); }} open={form === "upload"} upload={async (values) => { await upload.mutateAsync(values); toast.success(t("sections.knowledge.toast.uploaded")); }} />
    </>
  );
}

/** A file's extracted text, under its row. */
export function FileContent({ businessId, source }: { businessId: string; source: KnowledgeSource }) {
  const { t } = useTranslation("agent");
  const content = useQuery({ queryKey: ["knowledge-content", businessId, source.id, source.updatedAt], queryFn: () => requestJson<{ content: string }>(`/api/knowledge/${encodeURIComponent(source.id)}?businessId=${encodeURIComponent(businessId)}`) });
  if (content.isLoading) return <div aria-busy="true" className="space-y-3 rounded-md border border-border/70 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-4 w-full" key={index} />)}</div>;
  return <Textarea className="max-h-80 resize-none overflow-y-auto leading-relaxed" readOnly rows={8} value={content.isError ? t("sections.knowledge.previewError") : source.status === "error" ? source.error ?? t("sections.knowledge.previewError") : content.data?.content.trim() || t("sections.knowledge.previewPending")} />;
}

type Confirming = { action: "delete" | "cancel"; sources: KnowledgeSource[] };

/**
 * Runs actions on sources, asking first before a delete or cancelling an
 * import, and says what happened. Both the row menus and the selection bar
 * use it.
 */
export function useSourceActions({ act, cancelImport }: { act: (input: { action: KnowledgeAction; items: KnowledgeItem[] }) => Promise<unknown>; cancelImport: (documentId: string) => Promise<unknown> }) {
  const { t } = useTranslation("agent");
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [pending, setPending] = useState(false);
  const run = async (action: KnowledgeAction, sources: KnowledgeSource[]) => {
    const items = sources.filter((source) => action !== "reimport" || source.kind === "website").map(sourceItem);
    if (!items.length) return;
    setPending(true);
    try {
      await act({ action, items });
      toast.success(t(`sections.knowledge.batch.done.${action === "agent_disable" ? "disable" : action === "agent_enable" ? "enable" : action}`, { count: items.length }));
    } finally {
      setPending(false);
    }
  };
  const dialog = (
    <ConfirmActionDialog pendingLabel={t(confirming?.action === "cancel" ? "common:pending.cancelling" : "common:pending.deleting")}
      cancelLabel={t("actions.deleteCancel")}
      confirmLabel={t(confirming?.action === "cancel" ? "actions.cancelImport" : "actions.delete")}
      confirmVariant="destructive"
      description={t(confirming?.action === "cancel" ? "actions.cancelImportDescription" : "sections.knowledge.batch.deleteDescription")}
      onConfirm={async () => {
        if (!confirming) return;
        if (confirming.action === "cancel") {
          setPending(true);
          try { await cancelImport(confirming.sources[0]!.id); toast.success(t("actions.importCancelled")); } finally { setPending(false); }
          return;
        }
        await run("delete", confirming.sources);
      }}
      onOpenChange={(open) => { if (!open) setConfirming(null); }}
      open={confirming !== null}
      pending={pending}
      title={t(confirming?.action === "cancel" ? "actions.cancelImportTitle" : "sections.knowledge.batch.deleteTitle", { count: confirming?.sources.length ?? 0 })}
    />
  );
  return { run, pending, dialog, confirmDelete: (sources: KnowledgeSource[]) => setConfirming({ action: "delete", sources }), confirmCancel: (source: KnowledgeSource) => setConfirming({ action: "cancel", sources: [source] }) };
}

/**
 * One row's menu. For the sources a page manages: edit an entry, re-import a
 * website, turn it off or on, delete it, or cancel an import still running.
 */
export function SourceMenu({ source, actions, onEdit, isOff }: { source: KnowledgeSource; actions: ReturnType<typeof useSourceActions>; onEdit: (source: KnowledgeSource) => void; isOff: boolean }) {
  const { t } = useTranslation("agent");
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger aria-expanded={open} render={<Button aria-label={t("actions.moreOptions")} size="icon-sm" title={t("actions.moreOptions")} type="button" variant="ghost"><MoreHorizontal /></Button>} />
      <DropdownMenuContent align="end" className="min-w-0 w-fit" side="bottom" sideOffset={8}>
        {isImporting(source) ? <DropdownMenuItem onClick={() => actions.confirmCancel(source)} variant="destructive"><Trash2 />{t("actions.cancelImport")}</DropdownMenuItem> : <>
          {source.kind === "text" ? <><DropdownMenuItem onClick={() => onEdit(source)}><Pencil />{t("actions.edit")}</DropdownMenuItem><DropdownMenuSeparator /></> : null}
          {source.kind === "website" ? <DropdownMenuItem onClick={() => void actions.run("reimport", [source])}><RefreshCw />{t("sections.knowledge.batch.reimport")}</DropdownMenuItem> : null}
          <DropdownMenuItem onClick={() => void actions.run(isOff ? "enable" : "disable", [source])}>{isOff ? <Play /> : <Pause />}{t(isOff ? "sections.knowledge.batch.enable" : "sections.knowledge.batch.disable")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => actions.confirmDelete([source])} variant="destructive"><Trash2 />{t("actions.delete")}</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
