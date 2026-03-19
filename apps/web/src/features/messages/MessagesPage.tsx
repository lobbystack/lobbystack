import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  ChevronRight,
  Globe,
  ImagePlus,
  MessageCircle,
  MessagesSquare,
  MoreVertical,
  Paperclip,
  Plus,
  Search as SearchIcon,
  Send,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDateTime, formatInboxTimestamp } from "@/lib/locale";
import { cn } from "@/lib/utils";

type MessagesPageProps = {
  businessId?: Id<"businesses">;
};

type ConversationSummary = {
  id: Id<"conversations">;
  channel: string;
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
  outcome: {
    kind: "booked" | "booking_in_progress" | "message_taking" | "summary" | "disposition" | "none";
    serviceName?: string | null;
    startsAt?: string | null;
    summary?: string | null;
    disposition?: string | null;
  };
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

function formatMessageOutcomeSummary(
  outcome: ConversationThread["outcome"] | undefined,
  locale: string,
  t: TFunction<"messages">,
): string {
  if (!outcome) {
    return t("outcome.none");
  }

  switch (outcome.kind) {
    case "booked":
      return t("outcome.booked", {
        serviceName: outcome.serviceName ?? t("outcome.genericService"),
        startsAt: outcome.startsAt
          ? formatDateTime(outcome.startsAt, locale, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : t("outcome.unspecifiedTime"),
      });
    case "booking_in_progress":
      if (outcome.serviceName && outcome.startsAt) {
        return t("outcome.schedulingWithServiceAndTime", {
          serviceName: outcome.serviceName,
          startsAt: formatDateTime(outcome.startsAt, locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        });
      }
      if (outcome.serviceName) {
        return t("outcome.schedulingWithService", {
          serviceName: outcome.serviceName,
        });
      }
      return t("outcome.scheduling");
    case "summary":
      return outcome.summary ?? t("outcome.none");
    default:
      return t("outcome.none");
  }
}

function ConversationChannelIcon({ channel }: { channel: string }) {
  if (channel === "sms") {
    return <MessageCircle className="size-3" aria-hidden="true" />;
  }

  return <Globe className="size-3" aria-hidden="true" />;
}

export function MessagesPage({ businessId }: MessagesPageProps) {
  const { i18n, t } = useTranslation("messages");
  const conversations = useQuery(
    api.dashboard.messages.listConversationSummaries,
    businessId ? { businessId } : "skip",
  ) as Array<ConversationSummary> | undefined;
  const [selectedConversationId, setSelectedConversationId] = useState<Id<"conversations"> | undefined>();
  const [mobileSelectedConversationId, setMobileSelectedConversationId] = useState<
    Id<"conversations"> | undefined
  >();
  const [isOutcomeOpen, setIsOutcomeOpen] = useState(true);
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
      setMobileSelectedConversationId(filteredConversations[0].id as Id<"conversations">);
    }
  }, [filteredConversations, selectedConversationId]);

  useEffect(() => {
    if (selectedConversationId) {
      setIsOutcomeOpen(true);
    }
  }, [selectedConversationId]);

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <section className="flex min-w-0 h-full gap-6">
      <div className="flex min-w-0 w-full flex-col gap-2 sm:w-56 lg:w-72 2xl:w-80">
        <div className="sticky top-0 z-10 -mx-4 bg-background px-4 pb-3 shadow-md sm:static sm:z-auto sm:mx-0 sm:p-0 sm:shadow-none">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{t("page.title")}</h1>
              <MessagesSquare className="size-5" />
            </div>
          </div>
          <label
            className={cn(
              "focus-within:ring-1 focus-within:ring-ring focus-within:outline-hidden",
              "flex h-10 w-full items-center space-x-0 rounded-md border border-border ps-3",
            )}
          >
            <SearchIcon className="me-2 stroke-slate-500" size={15} />
            <span className="sr-only">{t("page.searchPlaceholder")}</span>
            <input
              className="w-full flex-1 bg-inherit text-sm focus-visible:outline-hidden"
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t("page.searchPlaceholder")}
              type="text"
              value={searchValue}
            />
          </label>
        </div>

        <div className="-mx-3 no-scrollbar h-full overflow-y-auto p-3">
          {filteredConversations.map((conversation: ConversationSummary) => {
            const isActive = conversation.id === selectedConversationId;
            const lastPreview =
              conversation.lastMessageBody ?? t("page.emptyPreview");

            return (
              <Fragment key={String(conversation.id)}>
                <button
                  className={cn(
                    "group hover:bg-accent hover:text-accent-foreground flex w-full rounded-md px-2 py-2 text-start text-sm",
                    isActive && "sm:bg-muted",
                  )}
                  onClick={() => {
                    setSelectedConversationId(conversation.id as Id<"conversations">);
                    setMobileSelectedConversationId(conversation.id as Id<"conversations">);
                  }}
                  type="button"
                >
                  <div className="flex gap-2">
                    <Avatar>
                      <AvatarFallback>
                        {initials(
                          conversation.contactName,
                          conversation.contactPhone ?? t("page.unknownShort"),
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">
                            {conversation.contactName ??
                              conversation.contactPhone ??
                              t("page.unknownCaller")}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground group-hover:text-accent-foreground/90">
                          <ConversationChannelIcon channel={conversation.channel} />
                          <span aria-hidden="true">&bull;</span>
                          <span>
                            {formatInboxTimestamp(conversation.lastMessageAt, i18n.language, {
                              yesterday: t("page.yesterday"),
                            })}
                          </span>
                        </div>
                      </div>
                      <span className="col-start-2 row-span-2 row-start-2 line-clamp-2 text-ellipsis text-muted-foreground group-hover:text-accent-foreground/90">
                        {lastPreview}
                      </span>
                    </div>
                  </div>
                </button>
                <Separator className="my-1" />
              </Fragment>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "absolute inset-0 start-full z-50 hidden min-w-0 w-full flex-1 flex-col border bg-background shadow-xs sm:static sm:z-auto sm:flex sm:rounded-md",
          mobileSelectedConversationId && "start-0 flex",
        )}
      >
        {thread ? (
          <>
            <div className="mb-1 flex min-w-0 flex-none justify-between bg-card p-4 shadow-lg sm:rounded-t-md">
              <div className="flex min-w-0 gap-3">
                <Button
                  className="-ms-2 h-full sm:hidden"
                  onClick={() => setMobileSelectedConversationId(undefined)}
                  size="icon"
                  variant="ghost"
                >
                  <ArrowLeft className="rtl:rotate-180" />
                </Button>
                <div className="flex min-w-0 items-center gap-2 lg:gap-4">
                  <Avatar className="size-9 lg:size-11">
                    <AvatarFallback>
                      {initials(
                        thread.contact?.name ?? null,
                        thread.contact?.phone ?? t("page.unknownShort"),
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <span className="col-start-2 row-span-2 text-sm font-semibold lg:text-base">
                      {thread.contact?.name ??
                        thread.contact?.phone ??
                        t("page.unknownCaller")}
                    </span>
                    <span className="col-start-2 row-span-2 row-start-2 line-clamp-1 block max-w-32 text-xs text-nowrap text-ellipsis text-muted-foreground lg:max-w-none lg:text-sm">
                      {thread.contact?.phone ??
                        thread.contact?.email ??
                        t("page.noChannel")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="-me-1 flex items-center gap-1 lg:gap-2">
                <Button
                  className="h-10 rounded-md sm:h-8 sm:w-4 lg:h-10 lg:w-6"
                  size="icon"
                  variant="ghost"
                >
                  <MoreVertical className="stroke-muted-foreground sm:size-5" />
                </Button>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2 rounded-md px-4 pt-0 pb-4">
              <div className="flex min-w-0 size-full flex-1">
                <div className="relative -me-4 flex min-w-0 flex-1 flex-col overflow-y-hidden">
                  <div className="flex h-40 min-w-0 w-full grow flex-col-reverse justify-start gap-4 overflow-y-auto py-2 pe-4 pb-4">
                    <div className="self-stretch pt-2">
                      <button
                        className="mx-auto flex w-full max-w-3xl items-center justify-center gap-3 text-muted-foreground"
                        onClick={() => setIsOutcomeOpen((current) => !current)}
                        type="button"
                      >
                        <span className="h-px w-64 bg-border/60 md:w-96" />
                        <span className="inline-flex items-center justify-center gap-1.5 text-sm font-medium">
                          {t("outcome.label")}
                          <ChevronRight
                            className={cn(
                              "size-3.5 transition-transform duration-200",
                              isOutcomeOpen && "rotate-90",
                            )}
                          />
                        </span>
                        <span className="h-px w-64 bg-border/60 md:w-96" />
                      </button>
                      {isOutcomeOpen ? (
                        <p className="mt-3 text-center text-sm leading-6 text-muted-foreground">
                          {formatMessageOutcomeSummary(thread.outcome, i18n.language, t)}
                        </p>
                      ) : null}
                    </div>
                    {[...thread.messages].reverse().map((message) => (
                      <div
                        className={cn(
                          "max-w-72 px-3 py-2 wrap-break-word shadow-lg",
                          message.direction === "outbound"
                            ? "self-end rounded-[16px_16px_0_16px] bg-primary/90 text-primary-foreground"
                            : "self-start rounded-[16px_16px_16px_0] bg-muted",
                        )}
                        key={String(message.id)}
                      >
                        {message.body}{" "}
                        <span
                          className={cn(
                            "mt-1 block text-xs font-light text-foreground/75 italic",
                            message.direction === "outbound" &&
                              "text-end text-primary-foreground/80",
                          )}
                        >
                          {formatDateTime(message.createdAt, i18n.language, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <form className="flex w-full flex-none gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-card px-2 py-1 focus-within:ring-1 focus-within:ring-ring focus-within:outline-hidden lg:gap-4">
                  <div className="space-x-1">
                    <Button
                      className="h-8 rounded-md"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Plus className="stroke-muted-foreground" size={20} />
                    </Button>
                    <Button
                      className="hidden h-8 rounded-md lg:inline-flex"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ImagePlus className="stroke-muted-foreground" size={20} />
                    </Button>
                    <Button
                      className="hidden h-8 rounded-md lg:inline-flex"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Paperclip className="stroke-muted-foreground" size={20} />
                    </Button>
                  </div>
                  <label className="flex-1">
                    <span className="sr-only">Chat Text Box</span>
                    <input
                      className="h-8 w-full bg-inherit focus-visible:outline-hidden"
                      placeholder={t("page.composerPlaceholder")}
                      type="text"
                    />
                  </label>
                  <Button
                    className="hidden sm:inline-flex"
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Send size={20} />
                  </Button>
                </div>
                <Button className="h-full sm:hidden" type="button">
                  <Send size={18} /> {t("page.send")}
                </Button>
              </form>
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
