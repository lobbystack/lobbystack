"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AtSign, Globe, MessageSquare, Monitor, Phone, type LucideIcon } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import { useBusinessCan } from "@/components/business-capabilities-provider";
import { LiveCallDetailSurface } from "@/components/live-call-detail-surface";
import { HiddenTextSkeleton } from "@/components/loading-skeletons";
import { PageHeader } from "@/components/page-header";
import { useTelemetry } from "@/components/product-analytics";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { agentHref } from "@/lib/agent-pages";
import { formatCallOutcomeSummary } from "@/lib/call-outcome";
import { getChannelLabel, getContactDisplayName } from "@/lib/contact-display";
import { formatDateTime } from "@/lib/locale";
import { subscribeRealtimeQuery } from "@/lib/realtime-query";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";
import { ConversationThread } from "./conversation-thread";
import { INBOX_CHANNELS, inboxFilters, inboxHref, inboxRequestUrl, openItemChange, openKey, type InboxAgent, type InboxChannel, type InboxItem, type InboxPage as InboxResponse } from "./inbox-data";

const CHANNEL_ICONS: Record<InboxChannel, LucideIcon> = { phone_call: Phone, web_call: Monitor, web_chat: Globe, instagram: AtSign, sms: MessageSquare };

function useInbox(filters: ReturnType<typeof inboxFilters>) {
  const { business } = useActiveBusiness();
  const queryClient = useQueryClient();
  const businessId = business?.businessId;
  const inbox = useInfiniteQuery({
    queryKey: ["inbox", businessId, filters],
    queryFn: ({ pageParam }) => requestJson<InboxResponse>(inboxRequestUrl(filters, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(business),
    // Keeps the list and the open item on screen while a new filter or search loads.
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (!businessId) return;
    return subscribeRealtimeQuery(queryClient, businessId, ["inbox", businessId], ["call.started", "call.updated", "call.completed", "message.upserted", "message.deliveryUpdated", "conversation.updated"]);
  }, [businessId, queryClient]);
  const items = useMemo(() => {
    // A new message can move a thread up between two pages; keep its newer, earlier row.
    const seen = new Set<string>();
    return (inbox.data?.pages ?? []).flatMap((page) => page.items).filter((item) => !seen.has(item.key) && Boolean(seen.add(item.key)));
  }, [inbox.data]);
  const first = inbox.data?.pages[0];
  return { inbox, items, agents: first?.agents ?? [], instagramOffered: first?.instagramOffered === true, loading: !business || inbox.isPending };
}

function InboxRow({ href, item, onOpen, selected, showAgent }: { href: string; item: InboxItem; onOpen: () => void; selected: boolean; showAgent: boolean }) {
  const { i18n, t } = useTranslation("calls");
  const Icon = CHANNEL_ICONS[item.channel];
  const title = getContactDisplayName({ name: item.contactName, phone: item.contactPhone, email: item.contactEmail, channels: [item.channel] }, i18n.language, t);
  // A call says what came of it, in the operator's language, as its own page does.
  const preview = item.outcome && item.outcome.kind !== "none" ? formatCallOutcomeSummary(item.outcome, i18n.language, t) : item.preview;
  return (
    <Link aria-current={selected ? "true" : undefined} className={cn("flex w-full flex-col gap-1 rounded-xl px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground", selected && "bg-muted")} href={href} onClick={onOpen} scroll={false}>
      <span className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
        <span className="ph-mask truncate font-semibold">{title}</span>
        <span className="text-[11px] text-muted-foreground">{formatDateTime(item.occurredAt, i18n.language, { month: "short", day: "numeric" })}</span>
      </span>
      {preview ? <span className="ph-mask line-clamp-2 text-muted-foreground">{preview}</span> : null}
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" /><span>{getChannelLabel(item.channel, t)}</span>
        {showAgent && item.agent ? <><span aria-hidden="true">·</span><span className="truncate">{item.agent.name}</span></> : null}
      </span>
    </Link>
  );
}

/** Which agent answered. Someone who can set agents up opens that agent's page from it. */
function HandledBy({ agent, linked }: { agent: InboxAgent; linked: boolean }) {
  const { t } = useTranslation("inbox");
  const name = linked ? <Link className="font-medium text-foreground underline underline-offset-4" href={agentHref(agent.id)} /> : <span className="font-medium text-foreground" />;
  return <p className="type-body-muted border-b px-4 py-2"><Trans components={{ agent: name }} i18nKey="handledBy" ns="inbox" t={t} values={{ name: agent.name }} /></p>;
}

function RowsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="flex flex-col gap-1.5 px-2 py-2" key={index}>
          <div className="flex justify-between gap-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-10" /></div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/**
 * Every call, text, website chat and Instagram thread in one list. The URL
 * holds the filters and the open item, so any page can link into it. On a
 * phone the open item fills the screen, with a way back to the list.
 */
export function InboxPage() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation(["inbox", "common"]);
  const telemetry = useTelemetry();
  const { business } = useActiveBusiness();
  const canSetUp = useBusinessCan()("setup");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const filters = inboxFilters(params, query);
  const { inbox, items, agents, instagramOffered, loading } = useInbox(filters);
  const hasChoice = agents.length > 1;

  const open = openKey(params);
  const callId = params.get("call");
  const conversationId = params.get("conversation");
  const openItem = items.find((item) => item.key === open);
  const channels = INBOX_CHANNELS.filter((channel) => channel !== "instagram" || instagramOffered || filters.channel === "instagram");
  const href = (change: Record<string, string | null>) => inboxHref(pathname, params, change);
  const filterBy = (change: Record<string, string | null>) => router.replace(href(change), { scroll: false });
  const closeHref = href({ call: null, conversation: null });
  const back = <Button aria-label={t("inbox:back")} className="sm:hidden" nativeButton={false} role="link" render={<Link href={closeHref} scroll={false} />} size="icon-sm" variant="ghost"><ArrowLeft /></Button>;
  const trackOpen = (item: InboxItem) => {
    if (business && item.kind === "conversation") telemetry.track("web.messages.thread_opened", { businessId: business.businessId, conversationId: item.id, channel: item.channel });
  };

  return (
    <section className="flex h-full min-w-0 gap-6">
      <div className={cn("flex w-full min-w-0 flex-col gap-3 sm:w-72 2xl:w-80", open && "hidden sm:flex")}>
        <PageHeader className="py-0" title={t("inbox:title")} />
        <div aria-label={t("inbox:filters.label")} className="flex flex-wrap items-center gap-1" role="group">
          <Button aria-pressed={!filters.channel && !filters.open} className="px-2.5 text-xs" onClick={() => filterBy({ channel: null, status: null })} size="sm" variant={!filters.channel && !filters.open ? "secondary" : "ghost"}>{t("inbox:filters.all")}</Button>
          <Button aria-pressed={filters.open} className="px-2.5 text-xs" onClick={() => filterBy({ status: filters.open ? null : "open" })} size="sm" variant={filters.open ? "secondary" : "ghost"}>{t("inbox:filters.open")}</Button>
          {channels.map((channel) => <Button aria-pressed={filters.channel === channel} className="px-2.5 text-xs" key={channel} onClick={() => filterBy({ channel: filters.channel === channel ? null : channel })} size="sm" variant={filters.channel === channel ? "secondary" : "ghost"}>{getChannelLabel(channel, t)}</Button>)}
        </div>
        {hasChoice ? (
          <Select items={[{ value: "all", label: t("inbox:filters.allAgents") }, ...agents.map((agent) => ({ value: agent.id, label: agent.name }))]} onValueChange={(value) => filterBy({ agent: !value || value === "all" ? null : String(value) })} value={filters.agentId ?? "all"}>
            <SelectTrigger aria-label={t("inbox:filters.agent")} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="all">{t("inbox:filters.allAgents")}</SelectItem>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        ) : null}
        <SearchInput aria-label={t("inbox:search")} onValueChange={setSearch} placeholder={t("inbox:search")} value={search} />
        <div aria-busy={loading || undefined} className="-mx-1 no-scrollbar min-h-0 flex-1 overflow-y-auto px-1">
          {loading ? <RowsSkeleton /> : null}
          {!loading && !items.length ? <p className="type-body-muted p-2">{filters.channel || filters.agentId || filters.open || filters.search ? t("inbox:noMatch") : t("inbox:empty")}</p> : null}
          {items.map((item) => <InboxRow href={href(openItemChange(item))} item={item} key={item.key} onOpen={() => trackOpen(item)} selected={item.key === open} showAgent={hasChoice} />)}
          {inbox.hasNextPage ? <Button className="w-full" loading={inbox.isFetchingNextPage} onClick={() => void inbox.fetchNextPage()} size="sm" variant="ghost">{t("inbox:loadMore")}</Button> : null}
        </div>
      </div>
      <div className={cn("min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background", open ? "flex" : "hidden sm:flex")}>
        {open && openItem?.agent && hasChoice ? <HandledBy agent={openItem.agent} linked={canSetUp} /> : null}
        {callId ? <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="mb-4 sm:hidden">{back}</div><LiveCallDetailSurface callId={callId} embedded key={callId} /></div>
          : conversationId ? <ConversationThread back={back} conversationId={conversationId} key={conversationId} />
          : loading ? <div className="m-auto p-8"><HiddenTextSkeleton className="text-sm">{t("inbox:pick")}</HiddenTextSkeleton></div>
          : <div className="m-auto p-8 text-center text-sm text-muted-foreground">{t("inbox:pick")}</div>}
      </div>
    </section>
  );
}
