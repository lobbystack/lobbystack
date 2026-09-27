"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Globe, MessageSquareText, Phone, SearchIcon, Send, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { formatDateTime } from "@/lib/locale";
import { subscribeRealtimeQuery } from "@/lib/realtime-query";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";
import { BusinessPage } from "./business-page";

type Channel = "call" | "chat" | "text";
export type InboxItem = { key: string; kind: "call" | "conversation"; id: string; channel: Channel; agentId: string; contactName: string | null; contactPhone: string | null; contactEmail: string | null; preview: string | null; status: string; automationState: string | null; occurredAt: string };
type ThreadMessage = { id: string; body: string; direction: string; createdAt: string };

/** URL values for the channel filter. `calls` and `chats` match the old redirects. */
const CHANNEL_PARAMS: Record<string, Channel> = { calls: "call", chats: "chat", texts: "text" };
const PARAM_FOR: Record<Channel, string> = { call: "calls", chat: "chats", text: "texts" };
const CHANNEL_ICONS: Record<Channel, typeof Phone> = { call: Phone, chat: Globe, text: MessageSquareText };

function displayName(item: InboxItem, unknown: string): string {
  return item.contactName ?? item.contactPhone ?? item.contactEmail ?? unknown;
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * One inbox for the business: calls, website chats and texts from every
 * receptionist. Filters narrow it by channel and, with two or more
 * receptionists, by receptionist.
 */
export function InboxSurface() {
  const { i18n, t } = useTranslation("receptionists");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const navigation = useNavigationSnapshot();
  const businessId = navigation?.businessId;
  // Filters live in state so quick changes apply at once, and mirror into the
  // URL so a filtered inbox can be shared or bookmarked.
  const [filters, setFilters] = useState(() => ({ channel: params.get("channel"), receptionist: params.get("receptionist"), item: params.get("item") }));
  const channel = CHANNEL_PARAMS[filters.channel ?? ""] ?? null;
  const receptionist = filters.receptionist ?? "";
  const selectedKey = filters.item;
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [debounced, setDebounced] = useState(search);
  const multiple = (navigation?.receptionists.length ?? 0) > 1;

  useEffect(() => { const timer = window.setTimeout(() => setDebounced(search), 250); return () => window.clearTimeout(timer); }, [search]);

  useEffect(() => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) next.set(key, value);
    const query = next.toString();
    if (query !== window.location.search.replace(/^\?/, "")) router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [filters, pathname, router]);

  const setParam = (updates: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...updates }));

  const queryKey = ["inbox", businessId, channel, multiple ? receptionist : "", debounced];
  const inbox = useQuery({
    queryKey,
    enabled: Boolean(businessId),
    queryFn: () => {
      const query = new URLSearchParams({ businessId: businessId! });
      if (channel) query.set("channel", channel);
      if (multiple && receptionist) query.set("agentId", receptionist);
      if (debounced.trim()) query.set("search", debounced.trim());
      return requestJson<{ items: InboxItem[] }>(`/api/inbox?${query.toString()}`);
    },
  });

  useEffect(() => {
    if (!businessId) return;
    return subscribeRealtimeQuery(queryClient, businessId, ["inbox", businessId], ["message.upserted", "conversation.updated", "call.started", "call.updated", "call.completed"]);
  }, [businessId, queryClient]);

  const items = inbox.data?.items ?? [];
  const selected = items.find((item) => item.key === selectedKey) ?? null;
  const nameOf = (agentId: string) => navigation?.receptionists.find((item) => item.id === agentId)?.name ?? "";
  const unknown = t("inbox.unknownContact");

  return (
    <BusinessPage title={t("nav.inbox")}>
      <div className="flex min-h-[32rem] min-w-0 gap-6">
        <div className={cn("flex w-full min-w-0 flex-col gap-3 md:w-80 lg:w-96", selected && "hidden md:flex")}>
          <nav aria-label={t("inbox.channelFilter")} className="flex flex-wrap items-center gap-1">
            {([null, "call", "chat", "text"] as const).map((value) => (
              <button
                aria-pressed={channel === value}
                className={cn("inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors", channel === value ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground")}
                key={value ?? "all"}
                onClick={() => setParam({ channel: value ? PARAM_FOR[value] : null, item: null })}
                type="button"
              >
                {t(`inbox.channels.${value ?? "all"}`)}
              </button>
            ))}
          </nav>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label={t("inbox.search")} className="pl-10" onChange={(event) => setSearch(event.target.value)} placeholder={t("inbox.search")} value={search} />
            </div>
            {multiple ? (
              <NativeSelect aria-label={t("inbox.receptionistFilter")} className="sm:w-40" onChange={(event) => setParam({ receptionist: event.target.value || null, item: null })} value={receptionist}>
                <NativeSelectOption value="">{t("inbox.allReceptionists")}</NativeSelectOption>
                {navigation?.receptionists.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}
              </NativeSelect>
            ) : null}
          </div>
          <div className="flex flex-col gap-1" data-testid="inbox-list">
            {inbox.isLoading ? Array.from({ length: 4 }, (_, index) => <Skeleton className="h-16 w-full rounded-xl" key={index} />) : items.length === 0 ? (
              <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">{t("inbox.empty")}</p>
            ) : items.map((item) => {
              const Icon = CHANNEL_ICONS[item.channel];
              const name = displayName(item, unknown);
              return (
                <button
                  className={cn("flex w-full gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent", selectedKey === item.key && "bg-muted")}
                  data-channel={item.channel}
                  key={item.key}
                  onClick={() => setParam({ item: item.key })}
                  type="button"
                >
                  <Avatar><AvatarFallback className="ph-mask">{initials(name)}</AvatarFallback></Avatar>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="ph-mask flex-1 truncate font-medium">{name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(item.occurredAt, i18n.language, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </span>
                    <span className="ph-mask line-clamp-1 text-muted-foreground">{item.preview || t(`inbox.noPreview.${item.channel}`)}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="size-3.5" />{t(`inbox.channelLabels.${item.channel}`)}
                      {multiple ? <Badge className="ph-mask" variant="outline">{nameOf(item.agentId)}</Badge> : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={cn("hidden min-w-0 flex-1 flex-col rounded-xl border md:flex", selected && "flex")}>
          {selected ? <InboxDetail item={selected} onBack={() => setParam({ item: null })} receptionistName={multiple ? nameOf(selected.agentId) : null} /> : <p className="m-auto p-8 text-center text-sm text-muted-foreground">{t("inbox.select")}</p>}
        </div>
      </div>
    </BusinessPage>
  );
}

function InboxDetail({ item, onBack, receptionistName }: { item: InboxItem; onBack: () => void; receptionistName: string | null }) {
  const { i18n, t } = useTranslation("receptionists");
  const navigation = useNavigationSnapshot();
  const queryClient = useQueryClient();
  const businessId = navigation?.businessId;
  const [draft, setDraft] = useState("");
  const name = displayName(item, t("inbox.unknownContact"));
  const thread = useQuery({
    queryKey: ["inbox-thread", businessId, item.id],
    enabled: Boolean(businessId && item.kind === "conversation"),
    queryFn: () => requestJson<{ messages: ThreadMessage[] }>(`/api/messages?businessId=${encodeURIComponent(businessId!)}&conversationId=${encodeURIComponent(item.id)}`),
  });
  const send = useMutation({
    mutationFn: () => requestJson(`/api/messages?businessId=${encodeURIComponent(businessId!)}`, { method: "POST", body: JSON.stringify({ conversationId: item.id, body: draft.trim(), channel: item.channel === "chat" ? "web_chat" : "sms" }) }),
    onSuccess: async () => { setDraft(""); toast.success(t("inbox.sent")); await queryClient.invalidateQueries({ queryKey: ["inbox-thread", businessId, item.id] }); },
    onError: () => toast.error(t("inbox.sendFailed")),
  });
  const automation = useMutation({
    mutationFn: (state: "ai_active" | "human_handoff") => requestJson(`/api/messages?businessId=${encodeURIComponent(businessId!)}`, { method: "PATCH", body: JSON.stringify({ conversationId: item.id, automationState: state }) }),
    onSuccess: async (_data, state) => { toast.success(t(state === "human_handoff" ? "inbox.tookOver" : "inbox.resumed")); await queryClient.invalidateQueries({ queryKey: ["inbox", businessId] }); },
    onError: () => toast.error(t("save.failed")),
  });
  const messages = [...(thread.data?.messages ?? [])].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const handedOff = item.automationState === "human_handoff";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim() && !send.isPending) send.mutate();
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b p-4">
        <Button aria-label={t("inbox.back")} className="md:hidden" onClick={onBack} size="icon-sm" variant="ghost"><ArrowLeft /></Button>
        <Avatar><AvatarFallback className="ph-mask">{initials(name)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <p className="ph-mask truncate font-medium">{name}</p>
          <p className="ph-mask truncate text-sm text-muted-foreground">
            {receptionistName ? t("inbox.answeredBy", { channel: t(`inbox.channelLabels.${item.channel}`), name: receptionistName }) : t(`inbox.channelLabels.${item.channel}`)}
          </p>
        </div>
        {item.channel === "chat" ? (
          <Button disabled={automation.isPending} onClick={() => automation.mutate(handedOff ? "ai_active" : "human_handoff")} size="sm" variant="outline">
            {handedOff ? <Bot data-icon="inline-start" /> : <User data-icon="inline-start" />}{handedOff ? t("inbox.resume") : t("inbox.takeOver")}
          </Button>
        ) : null}
      </div>
      {item.kind === "call" ? (
        <div className="flex flex-1 flex-col gap-4 p-6">
          <p className="text-sm text-muted-foreground">{formatDateTime(item.occurredAt, i18n.language, { dateStyle: "full", timeStyle: "short" })}</p>
          <p className="ph-mask whitespace-pre-wrap text-sm">{item.preview || t("inbox.noPreview.call")}</p>
          <div><Button nativeButton={false} render={<Link href={`/calls/${item.id}`} />} variant="outline">{t("inbox.openCall")}</Button></div>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" data-testid="inbox-thread">
            {thread.isLoading ? <Skeleton className="h-24 w-full rounded-xl" /> : messages.map((message) => (
              <div className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")} key={message.id}>
                <div className={cn("max-w-[80%] rounded-2xl px-4 py-3 text-sm", message.direction === "outbound" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground")}>
                  <p className="ph-mask whitespace-pre-wrap">{message.body}</p>
                  <p className="mt-1 text-[11px] opacity-70">{formatDateTime(message.createdAt, i18n.language, { hour: "numeric", minute: "2-digit" })}</p>
                </div>
              </div>
            ))}
          </div>
          <form className="flex gap-2 border-t p-4" onSubmit={submit}>
            <Input aria-label={t("inbox.reply")} className="h-11" onChange={(event) => setDraft(event.target.value)} placeholder={t(item.channel === "chat" ? "inbox.replyChat" : "inbox.replyText")} value={draft} />
            <Button aria-label={t("inbox.send")} disabled={!draft.trim()} loading={send.isPending} size="icon-lg" type="submit"><Send /></Button>
          </form>
        </>
      )}
    </>
  );
}
