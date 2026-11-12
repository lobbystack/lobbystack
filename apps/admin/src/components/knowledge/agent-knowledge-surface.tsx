"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useDataTablePaginationLabels } from "@/components/data-table/pagination";
import { HeaderActions } from "@/components/header-actions";
import { AgentKnowledgeSkeleton, HeaderButtonSkeleton } from "@/components/loading-skeletons";
import { buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useManagedBusiness } from "@/hooks/use-agent-settings";
import { useKnowledgeSources, type KnowledgeSource } from "@/hooks/use-knowledge-sources";
import { AddKnowledgeMenu, FileContent, KnowledgeForms, SourceMenu, useSourceActions, type KnowledgeForm } from "./knowledge-parts";
import { KnowledgeSourcesTable } from "./knowledge-sources-table";
import { SelectionBar, useSelection } from "./selection";
import { WebsitePagesDialog } from "./website-pages-dialog";

function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3 px-1">
        <h2 className="type-section-title">{title}</h2>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * An agent's Specific knowledge page: the sources only this agent answers
 * from, then the business's shared sources with a switch per source that
 * turns it off for this agent alone. A shared website opens its pages, where
 * the agent can turn single pages off.
 */
export function AgentKnowledgeSurface({ agentId }: { agentId: string }) {
  const { t } = useTranslation("agent");
  const paginationLabels = useDataTablePaginationLabels("agent");
  const { businesses, businessId, canManage } = useManagedBusiness();
  const { sources, act, cancelImport, invalidate } = useKnowledgeSources(businessId || undefined, agentId);
  const own = useMemo(() => sources.data?.own ?? [], [sources.data]);
  const shared = useMemo(() => sources.data?.shared ?? [], [sources.data]);
  const ownSelection = useSelection(useMemo(() => own.map((row) => row.id), [own]));
  const sharedSelection = useSelection(useMemo(() => shared.map((row) => row.id), [shared]));
  const actions = useSourceActions({ act: act.mutateAsync, cancelImport: cancelImport.mutateAsync });
  const [form, setForm] = useState<KnowledgeForm | null>(null);
  const [editing, setEditing] = useState<KnowledgeSource | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [website, setWebsite] = useState<{ id: string; shared: boolean } | null>(null);
  const headings: [string, string, string, string] = [t("table.title"), t("table.preview"), t("table.status"), t("table.added")];
  const loading = businesses.isLoading || sources.isLoading;

  if (loading) return <div className="flex w-full flex-col gap-6">
    <HeaderActions>{canManage || businesses.isLoading ? <HeaderButtonSkeleton label={t("sections.knowledge.addKnowledge")} trailingIcon /> : null}</HeaderActions>
    <AgentKnowledgeSkeleton labels={{ own: t("sections.knowledge.agent.ownTitle"), shared: t("sections.knowledge.agent.sharedTitle"), select: t("sections.knowledge.selection.select"), manageShared: t("sections.knowledge.agent.manageShared"), headings, toggle: t("sections.knowledge.agent.toggleHeading"), rowsPerPage: paginationLabels.rowsPerPage }} />
  </div>;
  if (!businessId) return <p className="type-body-muted">{t("empty.description")}</p>;

  const pick = (rows: KnowledgeSource[], ids: ReadonlySet<string>) => rows.filter((row) => ids.has(row.id));
  const open = (source: KnowledgeSource, isShared: boolean) => {
    if (source.kind === "website") setWebsite({ id: source.id, shared: isShared });
    else if (source.kind === "file") setViewing(viewing === source.id ? null : source.id);
    else if (!isShared && canManage) { setEditing(source); setForm("text"); }
  };
  const viewed = [...own, ...shared].find((row) => row.id === viewing);
  const onForAgent = (source: KnowledgeSource) => source.active && source.agentActive !== false;

  return <div className="flex w-full flex-col gap-10">
    <HeaderActions>{canManage ? <AddKnowledgeMenu onPick={(picked) => { setEditing(null); setForm(picked); }} /> : null}</HeaderActions>
    <Section actions={canManage ? <SelectionBar actions={[
      { id: "delete", label: t("sections.knowledge.batch.delete"), destructive: true, onClick: () => actions.confirmDelete(pick(own, ownSelection.selected)) },
      { id: "disable", label: t("sections.knowledge.batch.disable"), onClick: () => void actions.run("disable", pick(own, ownSelection.selected)).then(ownSelection.stop) },
      { id: "enable", label: t("sections.knowledge.batch.enable"), onClick: () => void actions.run("enable", pick(own, ownSelection.selected)).then(ownSelection.stop) },
      { id: "reimport", label: t("sections.knowledge.batch.reimport"), disabled: !pick(own, ownSelection.selected).some((row) => row.kind === "website"), onClick: () => void actions.run("reimport", pick(own, ownSelection.selected)).then(ownSelection.stop) },
    ]} disabled={!own.length || actions.pending} label={t("sections.knowledge.agent.ownTitle")} selection={ownSelection} /> : null} title={t("sections.knowledge.agent.ownTitle")}>
      <KnowledgeSourcesTable
        emptyText={t("sections.knowledge.agent.ownEmpty")}
        expanded={viewed ? <FileContent businessId={businessId} source={viewed} /> : null}
        expandedId={viewing}
        isOff={(source) => !source.active}
        label={t("sections.knowledge.agent.ownTitle")}
        loading={false}
        menu={canManage ? (source) => <SourceMenu actions={actions} isOff={!source.active} onEdit={(entry) => { setEditing(entry); setForm("text"); }} source={source} /> : undefined}
        onOpen={(source) => open(source, false)}
        onRetry={canManage && !actions.pending ? (source) => void actions.run("reimport", [source]) : undefined}
        rows={own}
        selection={canManage ? ownSelection : undefined}
      />
    </Section>
    <Section actions={<>
      <Link className={buttonVariants({ size: "sm", variant: "ghost" })} href="/business/knowledge">{t("sections.knowledge.agent.manageShared")}</Link>
      {canManage ? <SelectionBar actions={[
        { id: "agent_disable", label: t("sections.knowledge.batch.agentDisable"), onClick: () => void actions.run("agent_disable", pick(shared, sharedSelection.selected)).then(sharedSelection.stop) },
        { id: "agent_enable", label: t("sections.knowledge.batch.agentEnable"), onClick: () => void actions.run("agent_enable", pick(shared, sharedSelection.selected)).then(sharedSelection.stop) },
      ]} disabled={!shared.length || actions.pending} label={t("sections.knowledge.agent.sharedTitle")} selection={sharedSelection} /> : null}
    </>} title={t("sections.knowledge.agent.sharedTitle")}>
      <KnowledgeSourcesTable
        emptyText={t("sections.knowledge.agent.sharedEmpty")}
        expanded={viewed ? <FileContent businessId={businessId} source={viewed} /> : null}
        expandedId={viewing}
        isOff={(source) => !onForAgent(source)}
        label={t("sections.knowledge.agent.sharedTitle")}
        loading={false}
        onOpen={(source) => open(source, true)}
        rows={shared}
        selection={canManage ? sharedSelection : undefined}
        toggle={{
          heading: t("sections.knowledge.agent.toggleHeading"),
          render: (source) => <Switch aria-label={t("sections.knowledge.agent.useSource", { title: source.title })} checked={onForAgent(source)} disabled={!canManage || !source.active || actions.pending || sharedSelection.selecting} onCheckedChange={(on) => void actions.run(on ? "agent_enable" : "agent_disable", [source])} />,
        }}
      />
    </Section>
    <KnowledgeForms agentId={agentId} businessId={businessId} editing={editing} form={form} onClose={() => { setForm(null); setEditing(null); }} onSaved={invalidate} />
    <WebsitePagesDialog act={act.mutateAsync} businessId={businessId} canManage={canManage} documentId={website?.id ?? null} onOpenChange={(next) => { if (!next) setWebsite(null); }} {...(website?.shared ? { agentId } : { ownerAgentId: agentId })} />
    {actions.dialog}
  </div>;
}
