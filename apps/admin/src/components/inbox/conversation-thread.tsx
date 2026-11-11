"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Send, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { isTextChatChannel } from "@lobbystack/shared";

import { canEditContacts, EditableContactName } from "@/components/editable-contact-name";
import { useTelemetry } from "@/components/product-analytics";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { getContactDisplayName } from "@/lib/contact-display";
import { formatDateTime } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";

export type ThreadMessage = { id: string; conversationId: string; contactId?: string | null; contactName: string | null; contactPhone: string | null; visitorName: string | null; visitorEmail: string | null; channel: string | null; automationState: string | null; teamRequestedAt?: string | null; body: string; direction: string; status: string; createdAt: string };

type Thread = { messages: ThreadMessage[]; textRepliesOn?: boolean };

/** A website visitor asked for a person and nobody from the team has joined yet. */
export function waitingForTeam(message: Pick<ThreadMessage, "channel" | "automationState" | "teamRequestedAt">): boolean {
  return message.channel === "web_chat" && message.automationState === "human_handoff" && Boolean(message.teamRequestedAt);
}

function initials(name: string | null, fallback: string): string {
  if (!name) return fallback.slice(0, 2).toUpperCase();
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function subtitle(message: ThreadMessage, t: (key: string) => string): string {
  if (message.channel === "web_chat") return message.visitorEmail ?? message.contactName ?? message.visitorName ?? t("page.noChannel");
  if (message.channel === "instagram") return t("page.instagramSubtitle");
  return message.contactPhone ?? message.contactName ?? t("page.noChannel");
}

export function threadQueryKey(businessId: string | undefined, conversationId: string) {
  // Under ["messages", businessId], so realtime and reply invalidations refresh it.
  return ["messages", businessId, "thread", conversationId] as const;
}

/**
 * One conversation: who it's with, its messages and the reply box. `back`
 * sits before the name, for phones, where the thread fills the screen.
 */
export function ConversationThread({ back, conversationId }: { back?: ReactNode; conversationId: string }) {
  const { i18n, t } = useTranslation("messages");
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const [draft, setDraft] = useState("");
  const thread = useQuery({
    queryKey: threadQueryKey(business?.businessId, conversationId),
    queryFn: () => requestJson<Thread>(`/api/messages?conversationId=${encodeURIComponent(conversationId)}`),
    enabled: Boolean(business),
  });
  const latest = thread.data?.messages.at(-1);
  const channel = latest && isTextChatChannel(latest.channel) ? latest.channel : "sms";
  const refresh = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["messages", business?.businessId] }), queryClient.invalidateQueries({ queryKey: ["inbox", business?.businessId] })]);
  };
  const send = useMutation({
    mutationFn: async () => {
      if (!business) return;
      const response = await fetch(`/api/messages?businessId=${encodeURIComponent(business.businessId)}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId, body: draft.trim(), channel }) }).catch(() => null);
      // 409: the contact can't receive an SMS reply.
      if (!response?.ok) throw new Error(t(response?.status === 409 ? "page.smsReplyBlocked" : "page.sendFailed"));
    },
    onSuccess: async () => {
      if (business) telemetry.track("web.messages.reply_sent", { businessId: business.businessId, conversationId, channel });
      setDraft("");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const toggleAutomation = useMutation({
    mutationFn: async (state: "ai_active" | "human_handoff") => {
      if (!business) return;
      const response = await fetch(`/api/messages?businessId=${encodeURIComponent(business.businessId)}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId, automationState: state }) });
      if (!response.ok) throw new Error(t("page.automationUpdateFailed"));
    },
    onSuccess: refresh,
    onError: () => toast.error(t("page.automationUpdateFailed")),
  });

  if (!latest) {
    return (
      <div aria-busy={thread.isPending || undefined} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b p-4">{back}<Skeleton className="size-8 rounded-full" /><div className="flex flex-col gap-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div></div>
        <div className="flex flex-1 flex-col gap-3 p-4">{thread.isPending ? [["justify-start", "w-2/5"], ["justify-end", "w-1/2"], ["justify-start", "w-1/3"]].map(([side, width]) => <div className={cn("flex", side)} key={width}><Skeleton className={cn("h-14", width)} /></div>) : null}</div>
      </div>
    );
  }

  const displayName = getContactDisplayName({ name: latest.contactName ?? latest.visitorName, phone: latest.contactPhone, email: latest.visitorEmail, channels: [latest.channel] }, i18n.language, t);
  const automation = latest.automationState === "human_handoff" ? "human_handoff" : "ai_active";
  const waiting = waitingForTeam(latest);
  // A text conversation has Take over and Resume AI only once the agent answers texts.
  const canHandOff = isTextChatChannel(latest.channel) || (channel === "sms" && thread.data?.textRepliesOn === true);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim()) send.mutate();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        {back}
        <Avatar><AvatarFallback className="ph-mask">{initials(latest.visitorName ?? latest.contactName, displayName)}</AvatarFallback></Avatar>
        <div className="min-w-0"><h2 className="ph-mask truncate type-item-title"><EditableContactName businessId={business?.businessId} canEdit={canEditContacts(business?.role)} contactId={latest.contactId} displayName={displayName} /></h2><p className="ph-mask truncate type-body-muted">{subtitle(latest, t)}</p></div>
        {canHandOff ? (
          <div className="ml-auto flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 type-label", automation === "ai_active" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700")}>
              {automation === "ai_active" ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
              {automation === "ai_active" ? t("page.automationAiActive") : waiting ? t("page.waitingTitle") : t("page.automationHumanHandoff")}
            </span>
            {waiting ? <Button disabled={toggleAutomation.isPending} onClick={() => toggleAutomation.mutate("human_handoff")} size="sm">{t("page.joinChat")}</Button> : null}
            <Button disabled={toggleAutomation.isPending} onClick={() => toggleAutomation.mutate(automation === "ai_active" ? "human_handoff" : "ai_active")} size="sm" variant="outline">{automation === "ai_active" ? t("page.takeOver") : t("page.automationResumeAi")}</Button>
          </div>
        ) : null}
      </div>
      {waiting ? <p className="border-b bg-amber-50 px-4 py-2 type-caption text-amber-800">{t("page.waitingDescription")}</p> : null}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {thread.data!.messages.map((message) => (
          <div className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")} key={message.id}>
            <div className={cn("max-w-[80%] rounded-2xl px-4 py-3 type-body", message.direction === "outbound" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground")}>
              <p className="ph-mask whitespace-pre-wrap">{message.body}</p>
              <p className="mt-1 type-caption opacity-70">{formatDateTime(message.createdAt, i18n.language, { hour: "numeric", minute: "2-digit" })}</p>
            </div>
          </div>
        ))}
      </div>
      <form className="flex gap-2 border-t p-4" onSubmit={submit}>
        <Input onChange={(event) => setDraft(event.target.value)} placeholder={channel === "web_chat" ? t("page.composerPlaceholderWeb") : channel === "instagram" ? t("page.composerPlaceholderInstagram") : t("page.composerPlaceholderSms")} value={draft} />
        <Button aria-label={t("page.send")} disabled={!draft.trim()} loading={send.isPending} size="icon-lg" type="submit"><Send /></Button>
      </form>
    </div>
  );
}
