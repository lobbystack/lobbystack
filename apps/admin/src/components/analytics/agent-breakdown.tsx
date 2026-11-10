"use client";

import { useTranslation } from "react-i18next";

import { AgentAvatar } from "@/components/agents/agent-badges";
import { HiddenTextSkeleton } from "@/components/loading-skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { intlLocale } from "@/lib/locale";
import type { AnalyticsAgentViewModel } from "@/lib/page-view-models";

function Columns({ calls, chats }: { calls: React.ReactNode; chats: React.ReactNode }) {
  return <>
    <span className="w-16 shrink-0 text-end">{calls}</span>
    <span className="w-16 shrink-0 text-end">{chats}</span>
  </>;
}

/** The card while the period's counts load, with the real headings and a row per agent. */
export function AgentBreakdownSkeleton({ rows }: { rows: number }) {
  const { t } = useTranslation("dashboard");
  return (
    <Card aria-busy="true" data-testid="agent-breakdown-loading">
      <CardHeader><HiddenTextSkeleton className="type-card-title">{t("home.analytics.agents.title")}</HiddenTextSkeleton></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div aria-hidden="true" className="type-meta flex items-center gap-3"><span className="flex-1" /><Columns calls={<HiddenTextSkeleton className="ms-auto w-fit">{t("home.analytics.agents.calls")}</HiddenTextSkeleton>} chats={<HiddenTextSkeleton className="ms-auto w-fit">{t("home.analytics.agents.chats")}</HiddenTextSkeleton>} /></div>
        {Array.from({ length: rows }, (_, index) => (
          <div className="flex items-center gap-3" key={index}>
            <Skeleton className="size-6 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1"><Skeleton className="h-4 w-28" /><Skeleton className="h-2.5 w-full rounded-full" /></div>
            <Columns calls={<Skeleton className="ms-auto h-4 w-8" />} chats={<Skeleton className="ms-auto h-4 w-8" />} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Calls and chats per agent over the chosen period: every active agent, and
 * a removed one while it still had any. The bar compares agents by both
 * together.
 */
export function AgentBreakdown({ agents }: { agents: readonly AnalyticsAgentViewModel[] }) {
  const { i18n, t } = useTranslation("dashboard");
  const number = new Intl.NumberFormat(intlLocale(i18n.language));
  const most = Math.max(1, ...agents.map((agent) => agent.calls + agent.chats));
  return (
    <Card>
      <CardHeader><CardTitle>{t("home.analytics.agents.title")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="type-meta flex items-center gap-3"><span className="flex-1" /><Columns calls={t("home.analytics.agents.calls")} chats={t("home.analytics.agents.chats")} /></div>
        <ul className="flex flex-col gap-3">
          {agents.map((agent) => (
            <li className="flex items-center gap-3" key={agent.id}>
              <AgentAvatar name={agent.name} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium"><span className="truncate">{agent.name}</span>{agent.archived ? <Badge variant="outline">{t("home.analytics.agents.removed")}</Badge> : null}</span>
                <div className="h-2.5 w-full rounded-full bg-muted"><div className="h-2.5 rounded-full bg-primary" style={{ width: `${Math.round(((agent.calls + agent.chats) / most) * 100)}%` }} /></div>
              </div>
              <Columns calls={<span className="text-sm tabular-nums">{number.format(agent.calls)}</span>} chats={<span className="text-sm tabular-nums">{number.format(agent.chats)}</span>} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
