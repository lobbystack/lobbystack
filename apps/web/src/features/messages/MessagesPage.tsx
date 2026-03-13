import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { MessagesSquare, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/locale";
import { cn } from "@/lib/utils";

type MessagesPageProps = {
  businessId?: Id<"businesses">;
};

type ConversationSummary = {
  id: Id<"conversations">;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  lastMessageBody: string | null;
  lastMessageAt: number;
};

type ConversationThread = {
  conversation: {
    channel: string;
  };
  contact: {
    name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  messages: Array<{
    id: string;
    direction: string;
    body: string;
    createdAt: number;
  }>;
};

function initials(value: string | null, fallback: string): string {
  if (!value) {
    return fallback.slice(0, 2).toUpperCase();
  }

  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function MessagesPage({ businessId }: MessagesPageProps) {
  const { i18n, t } = useTranslation("messages");
  const conversations = useQuery(
    api.dashboard.messages.listConversationSummaries,
    businessId ? { businessId } : "skip",
  ) as Array<ConversationSummary> | undefined;
  const [selectedConversationId, setSelectedConversationId] = useState<Id<"conversations"> | undefined>();
  const [searchValue, setSearchValue] = useState("");

  const thread = useQuery(
    api.dashboard.messages.getConversationThread,
    businessId && selectedConversationId
      ? { businessId, conversationId: selectedConversationId }
      : "skip",
  ) as ConversationThread | undefined;

  const filteredConversations = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return (conversations ?? []).filter((conversation: ConversationSummary) => {
      const haystack = [
        conversation.contactName,
        conversation.contactPhone,
        conversation.contactEmail,
        conversation.lastMessageBody,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return query.length === 0 || haystack.includes(query);
    });
  }, [conversations, searchValue]);

  useEffect(() => {
    if (!selectedConversationId && filteredConversations[0]?.id) {
      setSelectedConversationId(filteredConversations[0].id as Id<"conversations">);
    }
  }, [filteredConversations, selectedConversationId]);

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <section className="flex h-[calc(100svh-9rem)] gap-6">
      <div className="flex w-full flex-col gap-2 sm:w-72 xl:w-80">
        <div className="sticky top-0 z-10 bg-background pb-3">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{t("page.title")}</h1>
              <MessagesSquare className="size-5" />
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t("page.searchPlaceholder")}
              value={searchValue}
            />
          </div>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto pr-1">
          {filteredConversations.map((conversation: ConversationSummary) => {
            const isActive = conversation.id === selectedConversationId;
            return (
              <button
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent",
                  isActive && "bg-muted",
                )}
                key={String(conversation.id)}
                onClick={() => setSelectedConversationId(conversation.id as Id<"conversations">)}
                type="button"
              >
                <Avatar>
                  <AvatarFallback>
                    {initials(
                      conversation.contactName,
                      conversation.contactPhone ?? t("page.unknownShort"),
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      {conversation.contactName ?? conversation.contactPhone ?? t("page.unknownCaller")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(conversation.lastMessageAt, i18n.language, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {conversation.lastMessageBody ?? t("page.emptyPreview")}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 flex-col rounded-xl border bg-card shadow-sm sm:flex">
        {thread ? (
          <>
            <div className="flex items-center justify-between border-b bg-card px-4 py-4">
              <div className="flex items-center gap-3">
                <Avatar className="size-10">
                  <AvatarFallback>
                    {initials(thread.contact?.name ?? null, thread.contact?.phone ?? t("page.unknownShort"))}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">
                    {thread.contact?.name ?? thread.contact?.phone ?? t("page.unknownCaller")}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {thread.contact?.phone ?? thread.contact?.email ?? t("page.noChannel")}
                  </div>
                </div>
              </div>
              <Badge variant="outline">{thread.conversation.channel}</Badge>
            </div>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
              {thread.messages.map((message: ConversationThread["messages"][number]) => (
                <div
                  className={cn(
                    "max-w-xl rounded-2xl px-4 py-3 text-sm shadow-sm",
                    message.direction === "outbound"
                      ? "self-end rounded-br-sm bg-primary text-primary-foreground"
                      : "self-start rounded-bl-sm bg-muted",
                  )}
                  key={String(message.id)}
                >
                  <p>{message.body}</p>
                  <p
                    className={cn(
                      "mt-2 text-xs",
                      message.direction === "outbound"
                        ? "text-primary-foreground/75"
                        : "text-muted-foreground",
                    )}
                  >
                    {formatDateTime(message.createdAt, i18n.language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {t("page.selectConversation")}
          </div>
        )}
      </div>
    </section>
  );
}
