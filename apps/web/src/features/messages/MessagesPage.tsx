import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type FormEvent,
  type ChangeEvent,
} from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  Globe,
  ImagePlus,
  MessageCircle,
  MessagesSquare,
  MoreVertical,
  Paperclip,
  Plus,
  Search as SearchIcon,
  Send,
  X,
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

type ThreadAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  byteLength: number | null;
  deliveryMode: string | null;
  kind: "image" | "file";
  previewUrl: string | null;
  downloadUrl: string | null;
  source: "storage" | "external";
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
    attachments: Array<ThreadAttachment>;
  }>;
  outcome: {
    kind: "booked" | "booking_in_progress" | "message_taking" | "summary" | "disposition" | "none";
    serviceName?: string | null;
    startsAt?: string | null;
    summary?: string | null;
    disposition?: string | null;
  };
};

type StagedAttachment = {
  id: Id<"message_attachment_uploads">;
  fileName: string;
  contentType: string;
  byteLength: number;
  deliveryMode: "mms" | "link";
  kind: "image" | "file";
  previewUrl: string | null;
};

const MAX_ATTACHMENTS = 3;
const IMAGE_ACCEPT = "image/jpeg,image/jpg,image/png,image/gif,image/heic,image/heif";
const DOCUMENT_ACCEPT = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
].join(",");
const ALL_ATTACHMENT_ACCEPT = [IMAGE_ACCEPT, DOCUMENT_ACCEPT].join(",");

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
    return <MessageCircle className="size-2.5" aria-hidden="true" />;
  }

  return <Globe className="size-2.5" aria-hidden="true" />;
}

function formatBytes(byteLength: number | null): string | null {
  if (byteLength === null) {
    return null;
  }

  if (byteLength < 1024) {
    return `${byteLength} B`;
  }

  if (byteLength < 1024 * 1024) {
    return `${(byteLength / 1024).toFixed(1)} KB`;
  }

  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

function revokePreviewUrls(attachments: Array<{ previewUrl: string | null }>) {
  for (const attachment of attachments) {
    if (attachment.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  }
}

function MessageAttachmentPreview({
  attachment,
}: {
  attachment: ThreadAttachment;
}) {
  if (attachment.kind === "image" && attachment.previewUrl) {
    return (
      <a href={attachment.downloadUrl ?? attachment.previewUrl} rel="noreferrer" target="_blank">
        <img
          alt={attachment.fileName}
          className="max-h-40 max-w-56 rounded-md object-cover"
          src={attachment.previewUrl}
        />
      </a>
    );
  }

  return (
    <a
      className="flex items-center gap-2 rounded-md border border-border/70 bg-background/90 px-3 py-2 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
      href={attachment.downloadUrl ?? undefined}
      rel="noreferrer"
      target="_blank"
    >
      <FileText className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
      {attachment.byteLength !== null ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatBytes(attachment.byteLength)}
        </span>
      ) : null}
      <Download className="size-4 shrink-0" />
    </a>
  );
}

export function MessagesPage({ businessId }: MessagesPageProps) {
  const { i18n, t } = useTranslation("messages");
  const conversations = useQuery(
    api.dashboard.messages.listConversationSummaries,
    businessId ? { businessId } : "skip",
  ) as Array<ConversationSummary> | undefined;
  const sendSmsReply = useAction(api.dashboard.messages.sendSmsReply);
  const repairConversationAttachmentPreviews = useAction(
    api.dashboard.messages.repairConversationAttachmentPreviews,
  );
  const generateAttachmentUploadUrl = useMutation(api.dashboard.messages.generateAttachmentUploadUrl);
  const finalizeStagedAttachment = useAction(api.dashboard.messages.finalizeStagedAttachment);
  const removeStagedAttachment = useMutation(api.dashboard.messages.removeStagedAttachment);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const allAttachmentInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedConversationId, setSelectedConversationId] = useState<Id<"conversations"> | undefined>();
  const [mobileSelectedConversationId, setMobileSelectedConversationId] = useState<
    Id<"conversations"> | undefined
  >();
  const [isOutcomeOpen, setIsOutcomeOpen] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [stagedAttachments, setStagedAttachments] = useState<Array<StagedAttachment>>([]);
  const [repairAttemptedConversationIds, setRepairAttemptedConversationIds] = useState<Array<string>>([]);

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

  useEffect(() => {
    if (!businessId || !selectedConversationId || thread?.conversation.channel !== "sms") {
      return;
    }

    const needsRepair = thread.messages.some((message) =>
      message.attachments.some((attachment) => attachment.source === "external"),
    );
    if (!needsRepair || repairAttemptedConversationIds.includes(String(selectedConversationId))) {
      return;
    }

    setRepairAttemptedConversationIds((current) => [...current, String(selectedConversationId)]);
    void repairConversationAttachmentPreviews({
      businessId,
      conversationId: selectedConversationId,
    }).catch(() => {
      // Leave legacy media visible even if the repair attempt fails.
    });
  }, [
    businessId,
    repairConversationAttachmentPreviews,
    repairAttemptedConversationIds,
    selectedConversationId,
    thread,
  ]);

  useEffect(() => {
    return () => {
      revokePreviewUrls(stagedAttachments);
    };
  }, [stagedAttachments]);

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  const isSmsConversation = thread?.conversation.channel === "sms";
  const canSendMessage =
    Boolean(isSmsConversation) &&
    !isSending &&
    !isUploading &&
    (draftMessage.trim().length > 0 || stagedAttachments.length > 0);

  async function discardStagedAttachments(conversationId: Id<"conversations"> | undefined) {
    if (!businessId || !conversationId || stagedAttachments.length === 0) {
      revokePreviewUrls(stagedAttachments);
      setStagedAttachments([]);
      return;
    }

    const currentAttachments = stagedAttachments;
    setStagedAttachments([]);
    revokePreviewUrls(currentAttachments);

    await Promise.allSettled(
      currentAttachments.map((attachment) =>
        removeStagedAttachment({
          businessId,
          conversationId,
          attachmentId: attachment.id,
        }),
      ),
    );
  }

  async function selectConversation(conversationId: Id<"conversations">) {
    if (conversationId !== selectedConversationId) {
      await discardStagedAttachments(selectedConversationId);
      setDraftMessage("");
      setErrorMessage(null);
    }

    setSelectedConversationId(conversationId);
    setMobileSelectedConversationId(conversationId);
  }

  async function handleAttachmentFiles(
    files: FileList | null,
    inputRef: RefObject<HTMLInputElement | null>,
  ) {
    if (!businessId || !selectedConversationId || !isSmsConversation || !files || files.length === 0) {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }

    const availableSlots = MAX_ATTACHMENTS - stagedAttachments.length;
    if (availableSlots <= 0) {
      setErrorMessage(`You can send up to ${MAX_ATTACHMENTS} attachments at a time.`);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }

    const selectedFiles = Array.from(files).slice(0, availableSlots);
    if (selectedFiles.length < files.length) {
      setErrorMessage(`Only the first ${availableSlots} attachment(s) were added.`);
    } else {
      setErrorMessage(null);
    }

    setIsUploading(true);
    try {
      const nextAttachments: Array<StagedAttachment> = [];

      for (const file of selectedFiles) {
        const uploadUrl = await generateAttachmentUploadUrl({
          businessId,
          conversationId: selectedConversationId,
        });
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed with status ${uploadResponse.status}.`);
        }

        const result = (await uploadResponse.json()) as { storageId: Id<"_storage"> };
        const finalized = await finalizeStagedAttachment({
          businessId,
          conversationId: selectedConversationId,
          storageId: result.storageId,
          fileName: file.name,
        });

        nextAttachments.push({
          id: finalized.id as Id<"message_attachment_uploads">,
          fileName: finalized.fileName,
          contentType: finalized.contentType,
          byteLength: finalized.byteLength,
          deliveryMode: finalized.deliveryMode,
          kind: finalized.kind,
          previewUrl: finalized.kind === "image" ? URL.createObjectURL(file) : null,
        });
      }

      setStagedAttachments((current) => [...current, ...nextAttachments]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("page.uploadFailed"));
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function handleRemoveStagedAttachment(attachmentId: Id<"message_attachment_uploads">) {
    if (!businessId || !selectedConversationId) {
      return;
    }

    const attachment = stagedAttachments.find((candidate) => candidate.id === attachmentId);
    if (!attachment) {
      return;
    }

    try {
      await removeStagedAttachment({
        businessId,
        conversationId: selectedConversationId,
        attachmentId,
      });
      revokePreviewUrls([attachment]);
      setStagedAttachments((current) => current.filter((candidate) => candidate.id !== attachmentId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("page.uploadFailed"));
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!businessId || !selectedConversationId || !isSmsConversation || !canSendMessage) {
      return;
    }

    setErrorMessage(null);
    setIsSending(true);

    try {
      await sendSmsReply({
        businessId,
        conversationId: selectedConversationId,
        body: draftMessage.trim(),
        ...(stagedAttachments.length > 0
          ? { attachmentIds: stagedAttachments.map((attachment) => attachment.id) }
          : {}),
      });
      revokePreviewUrls(stagedAttachments);
      setDraftMessage("");
      setStagedAttachments([]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("page.sendFailed"));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="flex h-full min-w-0 gap-6">
      <input
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          void handleAttachmentFiles(event.target.files, imageInputRef)
        }
        ref={imageInputRef}
        type="file"
      />
      <input
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          void handleAttachmentFiles(event.target.files, documentInputRef)
        }
        ref={documentInputRef}
        type="file"
      />
      <input
        accept={ALL_ATTACHMENT_ACCEPT}
        className="hidden"
        multiple
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          void handleAttachmentFiles(event.target.files, allAttachmentInputRef)
        }
        ref={allAttachmentInputRef}
        type="file"
      />

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
              "focus-within:outline-hidden focus-within:ring-1 focus-within:ring-ring",
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
            const lastPreview = conversation.lastMessageBody ?? t("page.emptyPreview");

            return (
              <Fragment key={String(conversation.id)}>
                <button
                  className={cn(
                    "group hover:bg-accent hover:text-accent-foreground flex w-full rounded-md px-2 py-2 text-start text-sm",
                    isActive && "sm:bg-muted",
                  )}
                  onClick={() => {
                    void selectConversation(conversation.id as Id<"conversations">);
                  }}
                  type="button"
                >
                  <div className="flex w-full gap-2">
                    <Avatar>
                      <AvatarFallback>
                        {initials(
                          conversation.contactName,
                          conversation.contactPhone ?? t("page.unknownShort"),
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2">
                        <span className="block min-w-0 truncate font-semibold">
                          {conversation.contactName ??
                            conversation.contactPhone ??
                            t("page.unknownCaller")}
                        </span>
                        <div className="justify-self-end flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground group-hover:text-accent-foreground/90">
                          <span className="inline-flex w-3 justify-center">
                            <ConversationChannelIcon channel={conversation.channel} />
                          </span>
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
                        <div className="space-y-2">
                          {message.attachments.length > 0 ? (
                            <div className="space-y-2">
                              {message.attachments.map((attachment) => (
                                <MessageAttachmentPreview
                                  attachment={attachment}
                                  key={attachment.id}
                                />
                              ))}
                            </div>
                          ) : null}
                          {message.body.trim().length > 0 ? <p>{message.body}</p> : null}
                        </div>
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
              <form className="flex w-full flex-none flex-col gap-2" onSubmit={handleSendMessage}>
                {stagedAttachments.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {stagedAttachments.map((attachment) => (
                      <div
                        className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-2 shadow-xs"
                        key={String(attachment.id)}
                      >
                        {attachment.kind === "image" && attachment.previewUrl ? (
                          <img
                            alt={attachment.fileName}
                            className="size-12 rounded-md object-cover"
                            src={attachment.previewUrl}
                          />
                        ) : (
                          <div className="flex size-12 items-center justify-center rounded-md bg-muted">
                            <FileText className="size-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{attachment.fileName}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatBytes(attachment.byteLength)}
                          </div>
                        </div>
                        <Button
                          onClick={() => void handleRemoveStagedAttachment(attachment.id)}
                          size="icon-xs"
                          type="button"
                          variant="ghost"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-card px-2 py-1 focus-within:outline-hidden focus-within:ring-1 focus-within:ring-ring lg:gap-4">
                  <div className="space-x-1">
                    <Button
                      className="h-8 rounded-md"
                      disabled={!isSmsConversation || isSending || isUploading}
                      onClick={() => allAttachmentInputRef.current?.click()}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Plus className="stroke-muted-foreground" size={20} />
                    </Button>
                    <Button
                      className="hidden h-8 rounded-md lg:inline-flex"
                      disabled={!isSmsConversation || isSending || isUploading}
                      onClick={() => imageInputRef.current?.click()}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ImagePlus className="stroke-muted-foreground" size={20} />
                    </Button>
                    <Button
                      className="hidden h-8 rounded-md lg:inline-flex"
                      disabled={!isSmsConversation || isSending || isUploading}
                      onClick={() => documentInputRef.current?.click()}
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
                      disabled={!isSmsConversation || isSending || isUploading}
                      onChange={(event) => setDraftMessage(event.target.value)}
                      placeholder={
                        thread.conversation.channel === "sms"
                          ? t("page.composerPlaceholderSms")
                          : t("page.composerPlaceholderWeb")
                      }
                      type="text"
                      value={draftMessage}
                    />
                  </label>
                  <Button
                    className="hidden sm:inline-flex"
                    disabled={!canSendMessage}
                    size="icon"
                    type="submit"
                    variant="ghost"
                  >
                    <Send size={20} />
                  </Button>
                </div>
                {errorMessage ? <span className="px-1 text-sm text-destructive">{errorMessage}</span> : null}
                <Button
                  className="h-full sm:hidden"
                  disabled={!canSendMessage}
                  type="submit"
                >
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
