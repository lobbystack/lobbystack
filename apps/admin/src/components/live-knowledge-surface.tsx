"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { HeaderActions } from "@/components/header-actions";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useKnowledgeSources, type KnowledgeSource } from "@/hooks/use-knowledge-sources";
import { useSetupAction } from "@/lib/use-setup-action";
import { AddKnowledgeMenu, FileContent, KnowledgeForms, SourceMenu, useSourceActions, type KnowledgeForm } from "./knowledge/knowledge-parts";
import { isImporting, KnowledgeSourcesTable, useKnowledgeSearch } from "./knowledge/knowledge-sources-table";
import { SelectionBar, useSelection } from "./knowledge/selection";
import { WebsitePagesDialog } from "./knowledge/website-pages-dialog";
import { useDataTablePaginationLabels } from "./data-table/pagination";
import { HeaderButtonSkeleton, KnowledgePageSkeleton } from "./loading-skeletons";
import { PageSurface } from "./page-surface";
import { UnansweredQuestionsSection } from "./unanswered-questions-section";

export { websiteImportProgress, type WebsiteImport } from "./knowledge/knowledge-sources-table";

/**
 * The business's Knowledge page: its shared sources, one row each. A website
 * opens its pages; a file shows its text; an entry opens its editor. Select
 * turns on checkboxes and a bar of actions for several rows at once.
 * Unanswered questions stay below, and their answers are shared.
 */
export function LiveKnowledgeSurface() {
  const { t } = useTranslation("agent");
  const paginationLabels = useDataTablePaginationLabels("agent");
  const { businesses, business } = useActiveBusiness();
  const businessId = business?.businessId;
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const [form, setForm] = useState<KnowledgeForm | null>(null);
  const [editing, setEditing] = useState<KnowledgeSource | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [website, setWebsite] = useState<string | null>(null);
  useSetupAction(canManage, useCallback((action: string) => { if (!["upload", "website", "text"].includes(action)) return false; setEditing(null); setForm(action as KnowledgeForm); return true; }, []));
  const { sources, act, cancelImport, invalidate } = useKnowledgeSources(businessId);
  const all = useMemo(() => sources.data?.shared ?? [], [sources.data]);
  const { rows, search } = useKnowledgeSearch(all);
  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const selection = useSelection(ids);
  const actions = useSourceActions({ act: act.mutateAsync, cancelImport: cancelImport.mutateAsync });
  const loading = sources.isLoading;
  const headings: [string, string, string, string] = [t("table.title"), t("table.preview"), t("table.status"), t("table.added")];

  if (businesses.isLoading) return <PageSurface title={t("sections.knowledge.title")}><div className="flex w-full flex-col gap-6">
    <HeaderActions><HeaderButtonSkeleton label={t("sections.knowledge.addKnowledge")} trailingIcon /></HeaderActions>
    <KnowledgePageSkeleton headings={headings} rowsPerPage={paginationLabels.rowsPerPage} />
  </div></PageSurface>;
  if (!business || !businessId) return <PageSurface title={t("sections.knowledge.title")}><p className="type-body-muted">{t("empty.description")}</p></PageSurface>;

  const selected = () => rows.filter((row) => selection.selected.has(row.id));
  const isOff = (source: KnowledgeSource) => !source.active;
  const open = (source: KnowledgeSource) => {
    if (source.kind === "website") setWebsite(source.id);
    else if (source.kind === "file") setViewing(viewing === source.id ? null : source.id);
    else if (canManage) { setEditing(source); setForm("text"); }
  };
  const viewed = rows.find((row) => row.id === viewing);

  return <PageSurface title={t("sections.knowledge.title")}><div className="flex w-full flex-col gap-6">
    <HeaderActions>{canManage ? loading ? <HeaderButtonSkeleton label={t("sections.knowledge.addKnowledge")} trailingIcon /> : <AddKnowledgeMenu onPick={(picked) => { setEditing(null); setForm(picked); }} /> : null}</HeaderActions>
    {canManage ? <div className="flex min-h-8 flex-wrap items-center justify-end gap-2">
      <SelectionBar actions={[
        { id: "delete", label: t("sections.knowledge.batch.delete"), destructive: true, onClick: () => actions.confirmDelete(selected()) },
        { id: "disable", label: t("sections.knowledge.batch.disable"), onClick: () => void actions.run("disable", selected()).then(selection.stop) },
        { id: "enable", label: t("sections.knowledge.batch.enable"), onClick: () => void actions.run("enable", selected()).then(selection.stop) },
        { id: "reimport", label: t("sections.knowledge.batch.reimport"), disabled: !selected().some((row) => row.kind === "website"), onClick: () => void actions.run("reimport", selected()).then(selection.stop) },
      ]} disabled={loading || !all.length || actions.pending} selection={selection} />
    </div> : null}
    <KnowledgeSourcesTable
      emptyText={t("sections.knowledge.emptyState")}
      expanded={viewed ? <FileContent businessId={businessId} source={viewed} /> : null}
      expandedId={viewing}
      isOff={isOff}
      label={t("sections.knowledge.title")}
      loading={loading}
      menu={canManage ? (source) => <SourceMenu actions={actions} isOff={isOff(source)} onEdit={(entry) => { setEditing(entry); setForm("text"); }} source={source} /> : undefined}
      onOpen={(source) => { if (!isImporting(source) || source.kind === "website") open(source); }}
      onRetry={canManage && !actions.pending ? (source) => void actions.run("reimport", [source]) : undefined}
      rows={rows}
      search={search}
      selection={canManage ? selection : undefined}
    />
    <UnansweredQuestionsSection businessId={businessId} canManage={canManage} layoutSettled={!loading} />
    <KnowledgeForms businessId={businessId} editing={editing} form={form} onClose={() => { setForm(null); setEditing(null); }} onSaved={invalidate} />
    <WebsitePagesDialog act={act.mutateAsync} businessId={businessId} canManage={canManage} documentId={website} onOpenChange={(next) => { if (!next) setWebsite(null); }} />
    {actions.dialog}
  </div></PageSurface>;
}
