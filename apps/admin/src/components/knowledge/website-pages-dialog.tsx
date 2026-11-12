"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { WebsitePagesSkeleton } from "@/components/loading-skeletons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useWebsitePages, type KnowledgeAction, type KnowledgeItem, type KnowledgePage } from "@/hooks/use-knowledge-sources";

export type WebsitePagesDialogProps = {
  businessId: string;
  /** Any document of the website, usually its import document. Null closes the dialog. */
  documentId: string | null;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  /** Set on an agent's page for a shared website: the switches act for this agent alone, and pages can't be removed. */
  agentId?: string | undefined;
  /** Set on an agent's page for that agent's own website, which it manages like the business manages a shared one. */
  ownerAgentId?: string | undefined;
  act: (input: { action: KnowledgeAction; items: KnowledgeItem[] }) => Promise<unknown>;
};

/**
 * A website's pages, one row each, with a switch per page and, where the page
 * can manage the website, Remove and Re-import. On an agent's page a shared
 * website's switches turn pages off for that agent only.
 */
export function WebsitePagesDialog({ businessId, documentId, onOpenChange, canManage, agentId, ownerAgentId, act }: WebsitePagesDialogProps) {
  const { t } = useTranslation("agent");
  const forAgent = Boolean(agentId);
  const pages = useWebsitePages(businessId, documentId, agentId ?? ownerAgentId);
  const [removing, setRemoving] = useState<KnowledgePage | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const source = pages.data?.source;
  const run = async (key: string, input: { action: KnowledgeAction; items: KnowledgeItem[] }, done: string) => {
    setPending(key);
    try {
      await act(input);
      await pages.refetch();
      toast.success(done);
    } finally {
      setPending(null);
    }
  };
  const pageOn = (page: KnowledgePage) => forAgent ? page.active && page.agentActive !== false : page.active;
  const toggle = (page: KnowledgePage, on: boolean) => run(page.id, { action: forAgent ? (on ? "agent_enable" : "agent_disable") : on ? "enable" : "disable", items: [{ type: "page", id: page.id }] }, t(on ? "sections.knowledge.toast.enabled" : "sections.knowledge.toast.disabled"));
  return (
    <Dialog onOpenChange={onOpenChange} open={documentId !== null}>
      <DialogContent className="max-h-[min(720px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>{source?.title ?? t("sections.knowledge.pagesDialog.title")}</DialogTitle>
          <DialogDescription>{source ? t("sections.knowledge.website.pages", { count: source.pageCount ?? 0 }) : " "}</DialogDescription>
          {canManage && !forAgent && source ? (
            <div className="pt-2">
              <Button disabled={pending !== null} onClick={() => void run("reimport", { action: "reimport", items: [{ type: "website", id: source.id }] }, t("sections.knowledge.batch.done.reimport", { count: 1 }))} size="sm" type="button" variant="outline"><RefreshCw data-icon="inline-start" />{t("sections.knowledge.batch.reimport")}</Button>
            </div>
          ) : null}
        </DialogHeader>
        <div className="-mx-6 overflow-x-hidden overflow-y-auto px-6">
          {pages.isLoading ? <WebsitePagesSkeleton /> : pages.data?.pages.length ? (
            <ul aria-label={t("sections.knowledge.pagesDialog.listLabel")} className="flex flex-col divide-y divide-border/70">
              {pages.data.pages.map((page) => {
                const offForBusiness = forAgent && !page.active;
                return (
                  <li className="flex items-center gap-3 py-3" key={page.id}>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate type-item-title" title={page.title}>{page.title}</span>
                      <span className="truncate type-caption text-muted-foreground" title={page.sourceUrl ?? undefined}>{offForBusiness ? t("sections.knowledge.pagesDialog.offForBusiness") : page.sourceUrl}</span>
                    </div>
                    <Switch aria-label={t("sections.knowledge.pagesDialog.usePage", { title: page.title })} checked={pageOn(page)} disabled={!canManage || offForBusiness || pending !== null} onCheckedChange={(on) => void toggle(page, on)} />
                    {canManage && !forAgent ? (
                      <Button aria-label={t("sections.knowledge.pagesDialog.remove", { title: page.title })} disabled={!page.removable || pending !== null} onClick={() => setRemoving(page)} size="icon-sm" title={page.removable ? t("sections.knowledge.pagesDialog.remove", { title: page.title }) : t("sections.knowledge.pagesDialog.removeAddress")} type="button" variant="ghost"><Trash2 /></Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className="py-6 text-center type-body-muted">{pages.isError ? t("sections.knowledge.previewError") : t("sections.knowledge.websiteImport.previewPending")}</p>}
        </div>
        <ConfirmActionDialog
          cancelLabel={t("actions.deleteCancel")}
          confirmLabel={t("sections.knowledge.pagesDialog.removeConfirm")}
          confirmVariant="destructive"
          description={t("sections.knowledge.pagesDialog.removeDescription")}
          onConfirm={async () => { if (removing) await run(removing.id, { action: "delete", items: [{ type: "page", id: removing.id }] }, t("sections.knowledge.toast.deleted")); }}
          onOpenChange={(open) => { if (!open) setRemoving(null); }}
          open={removing !== null}
          pending={pending !== null}
          title={t("sections.knowledge.pagesDialog.removeTitle", { title: removing?.title ?? "" })}
        />
      </DialogContent>
    </Dialog>
  );
}
