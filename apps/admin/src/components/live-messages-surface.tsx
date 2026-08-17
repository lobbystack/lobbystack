"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Bot, SearchIcon, Send, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/locale";

type Business = { businessId: string; active: boolean };
type Message = { id: string; conversationId: string; contactName: string | null; contactPhone: string | null; visitorName: string | null; visitorEmail: string | null; channel: string | null; automationState: string | null; body: string; direction: string; status: string; createdAt: string };
type Conversation = { id: string; messages: Message[]; latest: Message; displayName: string; channel: string };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load messages.");
  return await response.json() as T;
}

function initials(name: string | null, fallback: string): string {
  if (!name) return fallback.slice(0, 2).toUpperCase();
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function conversationName(message: Message, t: (key: string) => string): string {
  return message.contactName ?? message.visitorName ?? message.contactPhone ?? message.visitorEmail ?? t("page.unknownCaller");
}

function conversationSubtitle(message: Message, t: (key: string) => string): string {
  if (message.channel === "web_chat") {
    return message.visitorEmail ?? message.contactName ?? message.visitorName ?? t("page.noChannel");
  }
  return message.contactPhone ?? message.contactName ?? t("page.noChannel");
}

export function LiveMessagesSurface() {
  const { i18n, t } = useTranslation("messages");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | "web_chat" | "sms">("all");
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const messages = useQuery({ queryKey: ["messages", business?.businessId], queryFn: () => getJson<{ messages: Message[] }>("/api/messages"), enabled: Boolean(business) });
  const send = useMutation({
    mutationFn: async () => {
      if (!business || !selected) return;
      const response = await fetch(`/api/messages?businessId=${encodeURIComponent(business.businessId)}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: selectedId, body: draft.trim(), channel: selected.channel }) });
      if (!response.ok) throw new Error(t("page.sendFailed"));
    },
    onSuccess: async () => { setDraft(""); await queryClient.invalidateQueries({ queryKey: ["messages", business?.businessId] }); },
  });
  const toggleAutomation = useMutation({
    mutationFn: async (state: "ai_active" | "human_handoff") => {
      if (!business || !selectedId) return;
      const response = await fetch(`/api/messages?businessId=${encodeURIComponent(business.businessId)}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: selectedId, automationState: state }) });
      if (!response.ok) throw new Error(t("page.automationUpdateFailed"));
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["messages", business?.businessId] }); },
  });

  useEffect(() => {
    if (!business) return;
    const source = new EventSource("/api/realtime");
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["messages", business.businessId] });
    for (const event of ["message.upserted", "message.deliveryUpdated", "conversation.updated"]) source.addEventListener(event, refresh);
    return () => source.close();
  }, [business, queryClient]);

  const conversations = useMemo(() => {
    const grouped = new Map<string, Message[]>();
    for (const message of messages.data?.messages ?? []) grouped.set(message.conversationId, [...(grouped.get(message.conversationId) ?? []), message]);
    return [...grouped.entries()].map(([id, items]) => {
      const sorted = items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const latest = sorted.at(-1) ?? sorted[0]!;
      return { id, messages: sorted, latest, displayName: conversationName(latest, t), channel: latest.channel === "web_chat" ? "web_chat" : "sms" };
    })
      .filter((conversation) => (channelFilter === "all" || conversation.channel === channelFilter) && [conversation.latest.contactName, conversation.latest.visitorName, conversation.latest.contactPhone, conversation.latest.visitorEmail, conversation.latest.body].filter(Boolean).join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  }, [messages.data, search, channelFilter, t]);
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const selectedAutomation = selected?.latest.automationState === "human_handoff" ? "human_handoff" : "ai_active";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim()) send.mutate();
  }

  return (
    <section className="flex h-full min-w-0 gap-6">
      <div className={cn("flex min-w-0 w-full flex-col gap-3 sm:w-56 lg:w-72 2xl:w-80", selected && "hidden sm:flex")}>
        <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 bg-background px-4 py-2 sm:static sm:z-auto sm:mx-0 sm:p-0">
          <PageHeader className="py-0" title={t("page.title")} />
          <div className="flex items-center gap-1">
            {(["all", "web_chat", "sms"] as const).map((key) => <Button key={key} size="sm" variant={channelFilter === key ? "secondary" : "ghost"} className="px-2.5 text-xs" onClick={() => setChannelFilter(key)}>{key === "all" ? t("page.filterAll") : key === "web_chat" ? t("page.filterWeb") : t("page.filterSms")}</Button>)}
          </div>
          <div className="relative"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={t("page.searchPlaceholder")} className="pl-10" onChange={(event) => setSearch(event.target.value)} placeholder={t("page.searchPlaceholder")} value={search} /></div>
        </div>
        <div className="-mx-3 no-scrollbar h-full overflow-y-auto p-3">
          {conversations.map((conversation) => <div key={conversation.id}><button className={cn("group flex w-full rounded-md px-2 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground", selectedId === conversation.id && "bg-muted")} onClick={() => setSelectedId(conversation.id)} type="button"><div className="flex w-full gap-2"><Avatar><AvatarFallback>{initials(conversation.latest.visitorName ?? conversation.latest.contactName, conversation.displayName)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2"><span className="truncate font-semibold">{conversation.displayName}</span><span className="text-[11px] text-muted-foreground">{formatDateTime(conversation.latest.createdAt, i18n.language, { hour: "numeric", minute: "2-digit" })}</span></div><span className="line-clamp-2 text-muted-foreground">{conversation.latest.body || t("page.emptyPreview")}</span></div>{conversation.channel === "web_chat" ? <span className="mt-0.5 flex size-4 items-center justify-center rounded-full bg-primary/10 text-primary" title="Web chat"><Bot className="size-3" /></span> : null}</div></button><Separator className="my-1" /></div>)}
        </div>
      </div>
      <div className={cn("hidden min-w-0 w-full flex-1 flex-col border bg-background sm:flex sm:rounded-md", selected && "flex")}>
        {selected ? <><div className="flex items-center gap-3 border-b p-4"><Button className="sm:hidden" onClick={() => setSelectedId(null)} size="icon-sm" variant="ghost"><ArrowLeft /></Button><Avatar><AvatarFallback>{initials(selected.latest.visitorName ?? selected.latest.contactName, selected.displayName)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate font-semibold">{selected.displayName}</p><p className="truncate text-sm text-muted-foreground">{conversationSubtitle(selected.latest, t)}</p></div>{selected.channel === "web_chat" ? <div className="ml-auto flex items-center gap-2"><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", selectedAutomation === "ai_active" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700")}>{selectedAutomation === "ai_active" ? <Bot className="size-3.5" /> : <User className="size-3.5" />}{selectedAutomation === "ai_active" ? t("page.automationAiActive") : t("page.automationHumanHandoff")}</span><Button size="sm" variant="outline" onClick={() => toggleAutomation.mutate(selectedAutomation === "ai_active" ? "human_handoff" : "ai_active")} disabled={toggleAutomation.isPending}>{selectedAutomation === "ai_active" ? t("page.takeOver") : t("page.automationResumeAi")}</Button></div> : null}</div><div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">{selected.messages.map((message) => <div className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")} key={message.id}><div className={cn("max-w-[80%] rounded-2xl px-4 py-3 text-sm", message.direction === "outbound" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground")}><p className="whitespace-pre-wrap">{message.body}</p><p className="mt-1 text-[11px] opacity-70">{formatDateTime(message.createdAt, i18n.language, { hour: "numeric", minute: "2-digit" })}</p></div></div>)}</div><form className="flex gap-2 border-t p-4" onSubmit={submit}><Input className="h-11" onChange={(event) => setDraft(event.target.value)} placeholder={selected.channel === "web_chat" ? t("page.composerPlaceholderWeb") : t("page.composerPlaceholderSms")} value={draft} /><Button aria-label={t("page.send")} disabled={!draft.trim()} loading={send.isPending} size="icon-lg" type="submit"><Send /></Button></form></> : <div className="m-auto p-8 text-center text-sm text-muted-foreground">{t("page.selectConversation")}</div>}
      </div>
    </section>
  );
}
