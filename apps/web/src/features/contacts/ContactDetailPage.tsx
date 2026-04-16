import { useState } from "react";
import { useMutation } from "convex/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Copy,
  Info,
  Mail,
  MessageSquare,
  Phone,
  Activity,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { DetailPageSkeleton } from "@/components/loading-skeletons";
import { ContactActionsMenu } from "@/features/contacts/ContactActionsMenu";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import {
  formatDateTime,
  formatRelativeTime,
  normalizeLocale,
  resolveLocale,
} from "@/lib/locale";
import { useRememberedConvexQuery } from "@/lib/remembered-convex-query";
import { cn } from "@/lib/utils";
import { formatPhoneNumberDisplay } from "@/lib/phone";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContactDetailPageProps = {
  businessId?: Id<"businesses">;
};

type ContactDetailData = {
  contact: {
    id: Id<"contacts">;
    name: string | null;
    phone: string;
    email: string | null;
    timezone: string | null;
    preferredLocale: string | null;
    isBlocked: boolean;
    blockedAt: string | null;
    blockedByName: string | null;
    smsConsentStatus: string | null;
    smsConsentUpdatedAt: string | null;
    smsConsentSource: string | null;
    createdAt: number;
  };
  counts: {
    calls: number;
    messages: number;
    appointments: number;
    conversations: number;
  };
  activityFeed: Array<{
    kind: "call" | "message" | "appointment";
    timestamp: number;
    callId?: Id<"calls">;
    callDurationSeconds?: number;
    callStatus?: string;
    callDisposition?: string;
    messageDirection?: string;
    messageBody?: string;
    messageChannel?: string;
    appointmentId?: Id<"appointments">;
    appointmentServiceName?: string;
    appointmentStaffName?: string;
    appointmentStartsAt?: string;
    appointmentStatus?: string;
  }>;
  appointments: Array<{
    id: Id<"appointments">;
    serviceName: string | null;
    staffName: string | null;
    startsAt: string;
    endsAt: string;
    timezone: string;
    status: string;
    sourceChannel: string;
    calendarSyncState: string;
  }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
  }
  return `${remainingSeconds}s`;
}

function truncateId(id: string, maxLength = 16): string {
  if (id.length <= maxLength) return id;
  return `${id.slice(0, maxLength)}…`;
}

function resolveCallStatusLabel(
  status: string | undefined,
  disposition: string | undefined,
): "blocked" | "completed" | "failed" | "in_progress" {
  if (status === "in_progress" || status === "open") {
    return "in_progress";
  }

  const d = (disposition ?? "").trim().toLowerCase();
  if (d === "contact_blocked") {
    return "blocked";
  }

  if (
    d.includes("failed") ||
    d.includes("busy") ||
    d.includes("canceled") ||
    d.includes("cancelled") ||
    d.includes("no_answer") ||
    d.includes("missed")
  ) {
    return "failed";
  }

  return "completed";
}

function appointmentStatusVariant(
  status: string,
): "default" | "secondary" | "destructive" {
  switch (status.toLowerCase()) {
    case "cancelled":
    case "canceled":
      return "destructive";
    case "confirmed":
    case "completed":
      return "default";
    default:
      return "secondary";
  }
}

function humanizeOperatorValue(value: string): string {
  return value
    .trim()
    .replace(/[_:]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function getAppointmentStatusLabel(
  status: string,
  t: ReturnType<typeof useTranslation<"contacts">>["t"],
): string {
  switch (status.toLowerCase()) {
    case "booked":
      return t("detail.appointments.booked");
    case "confirmed":
      return t("detail.appointments.confirmed");
    case "completed":
      return t("detail.appointments.completed");
    case "cancelled":
    case "canceled":
      return t("detail.appointments.cancelled");
    case "pending":
      return t("detail.appointments.pending");
    default:
      return humanizeOperatorValue(status);
  }
}

function getAppointmentSourceLabel(
  sourceChannel: string,
  t: ReturnType<typeof useTranslation<"contacts">>["t"],
): string {
  switch (sourceChannel.toLowerCase()) {
    case "voice":
      return t("detail.appointments.sourceValues.voice");
    case "sms":
      return t("detail.appointments.sourceValues.sms");
    case "dashboard":
      return t("detail.appointments.sourceValues.dashboard");
    default:
      return humanizeOperatorValue(sourceChannel);
  }
}

function getCalendarSyncStateLabel(
  state: string,
  t: ReturnType<typeof useTranslation<"contacts">>["t"],
): string {
  switch (state.toLowerCase()) {
    case "not_required":
      return t("detail.appointments.syncStateValues.notRequired");
    case "pending":
      return t("detail.appointments.syncStateValues.pending");
    case "syncing":
      return t("detail.appointments.syncStateValues.syncing");
    case "synced":
    case "synced_mock":
      return t("detail.appointments.syncStateValues.synced");
    case "failed":
      return t("detail.appointments.syncStateValues.failed");
    case "drifted":
      return t("detail.appointments.syncStateValues.drifted");
    default:
      return humanizeOperatorValue(state);
  }
}

function getSmsConsentStatusLabel(
  status: string,
  t: ReturnType<typeof useTranslation<"contacts">>["t"],
): string {
  switch (status.toLowerCase()) {
    case "subscribed":
      return t("detail.details.smsConsentStatusValues.subscribed");
    case "opted_out":
      return t("detail.details.smsConsentStatusValues.optedOut");
    default:
      return humanizeOperatorValue(status);
  }
}

function getSmsConsentSourceLabel(
  source: string,
  t: ReturnType<typeof useTranslation<"contacts">>["t"],
): string {
  const normalized = source.trim().toUpperCase();
  if (normalized === "TWILIO_OPT_OUT:STOP") {
    return t("detail.details.smsConsentSourceValues.twilioStop");
  }
  if (normalized === "TWILIO_OPT_OUT:START") {
    return t("detail.details.smsConsentSourceValues.twilioStart");
  }
  if (normalized === "KEYWORD:STOP") {
    return t("detail.details.smsConsentSourceValues.keywordStop");
  }
  if (normalized === "KEYWORD:START") {
    return t("detail.details.smsConsentSourceValues.keywordStart");
  }

  return humanizeOperatorValue(source);
}

function getLocaleDisplayName(
  value: string,
  displayLocale: string,
): string {
  const normalized = normalizeLocale(value);
  if (!normalized) {
    return value;
  }

  try {
    const displayNames = new Intl.DisplayNames([displayLocale], {
      type: "language",
    });
    return displayNames.of(normalized) ?? normalized.toUpperCase();
  } catch {
    return normalized.toUpperCase();
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center rounded-xl border bg-card px-4 py-3">
      <div className="flex flex-col">
        <span className="font-heading text-lg leading-none font-semibold tracking-tight text-foreground">
          {value}
        </span>
        <span className="type-meta">{label}</span>
      </div>
    </div>
  );
}

function ActivityTab({
  activityFeed,
  locale,
}: {
  activityFeed: ContactDetailData["activityFeed"];
  locale: string;
}) {
  const { t } = useTranslation("contacts");

  if (activityFeed.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Activity className="size-8 text-muted-foreground/40" />
        <p className="type-empty-description">{t("detail.activity.empty")}</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col py-4">
      {activityFeed.length > 1 && (
        <div
          aria-hidden="true"
          className="absolute bottom-[42px] left-[19.5px] top-[42px] w-px bg-border"
        />
      )}
      {activityFeed.map((item, index) => (
        <ActivityFeedItem
          item={item}
          key={`${item.kind}-${item.timestamp}-${index}`}
          locale={locale}
        />
      ))}
    </div>
  );
}

function ActivityFeedItem({
  item,
  locale,
}: {
  item: ContactDetailData["activityFeed"][number];
  locale: string;
}) {
  const { t } = useTranslation("contacts");
  const isCall = item.kind === "call" && item.callId;

  const iconMap = {
    call: Phone,
    message: MessageSquare,
    appointment: Calendar,
  };
  const Icon = iconMap[item.kind];

  function renderSummary() {
    switch (item.kind) {
      case "call": {
        const statusLabel = resolveCallStatusLabel(
          item.callStatus,
          item.callDisposition,
        );
        return (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span
              className={cn(
                "type-body",
                isCall &&
                  "border-b border-dashed border-muted-foreground/40 pb-0.5 transition-colors hover:border-current",
              )}
            >
              {t("detail.activity.callInbound")}
            </span>
            <span className="type-body-muted">
              {formatDuration(item.callDurationSeconds)}
            </span>
            <span
              className={cn(
                "type-meta",
                statusLabel === "completed" &&
                  "text-emerald-600 dark:text-emerald-400",
                statusLabel === "failed" && "text-destructive",
                statusLabel === "in_progress" && "text-muted-foreground",
              )}
            >
              {t(`detail.activity.call${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1).replace("_", "")}`)}
            </span>
          </div>
        );
      }
      case "message": {
        const smsLabel =
          item.messageDirection === "outbound"
            ? t("detail.activity.smsOutbound")
            : t("detail.activity.smsInbound");
        return <span className="type-body">{smsLabel}</span>;
      }
      case "appointment": {
        return (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="type-body">
              {t("detail.activity.appointmentScheduled")}
            </span>
            {item.appointmentServiceName && (
              <span className="type-body-muted">
                {item.appointmentServiceName}
              </span>
            )}
            {item.appointmentStaffName && (
              <span className="type-body-muted">
                {t("detail.activity.withStaff", {
                  staff: item.appointmentStaffName,
                })}
              </span>
            )}
            {item.appointmentStatus && (
              <Badge variant={appointmentStatusVariant(item.appointmentStatus)}>
                {getAppointmentStatusLabel(item.appointmentStatus, t)}
              </Badge>
            )}
          </div>
        );
      }
    }
  }

  const content = (
    <div
      className={cn(
        "relative flex items-start gap-3 rounded-xl py-2.5 pl-2 pr-2 transition-colors",
        isCall && "cursor-pointer",
      )}
    >
      {/* Icon lane */}
      <div className="relative z-10 flex w-[23px] shrink-0 justify-center">
        <div className="mt-1 flex size-[23px] shrink-0 items-center justify-center rounded-full bg-background">
          <Icon className="size-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-0.5">
        <div className="min-w-0 flex-1">{renderSummary()}</div>
        <span className="type-meta shrink-0">
          {formatRelativeTime(item.timestamp, locale)}
        </span>
      </div>
    </div>
  );

  if (isCall) {
    return (
      <Link
        className="block no-underline"
        to={`/calls/${item.callId as string}`}
      >
        {content}
      </Link>
    );
  }

  return content;
}

function AppointmentsTab({
  appointments,
  locale,
}: {
  appointments: ContactDetailData["appointments"];
  locale: string;
}) {
  const { t } = useTranslation("contacts");

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Calendar className="size-8 text-muted-foreground/40" />
        <p className="type-empty-description">
          {t("detail.appointments.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-4">
      {appointments.map((appointment) => (
        <div
          className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3"
          key={appointment.id}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="type-item-title">
                {appointment.serviceName ?? "—"}
              </span>
              {appointment.staffName && (
                <span className="type-body-muted">
                  {t("detail.activity.withStaff", {
                    staff: appointment.staffName,
                  })}
                </span>
              )}
            </div>
            <Badge variant={appointmentStatusVariant(appointment.status)}>
              {getAppointmentStatusLabel(appointment.status, t)}
            </Badge>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-0.5">
              <span className="type-meta">
                {t("detail.appointments.dateTime")}
              </span>
              <span className="type-body">
                {formatDateTime(appointment.startsAt, locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="type-meta">
                {t("detail.appointments.syncState")}
              </span>
              <span className="type-body">
                {getCalendarSyncStateLabel(appointment.calendarSyncState, t)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="type-meta">
                {t("detail.appointments.channel")}
              </span>
              <span className="type-body">
                {getAppointmentSourceLabel(appointment.sourceChannel, t)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailsTab({
  data,
  locale,
}: {
  data: ContactDetailData;
  locale: string;
}) {
  const { t } = useTranslation("contacts");
  const contact = data.contact;

  const [copiedField, setCopiedField] = useState<string | null>(null);

  function copyToClipboard(text: string, field: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  }

  const isCopied = (field: string) => copiedField === field;

  return (
    <div className="flex flex-col gap-6 py-4">
      {/* Contact information */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("detail.details.contactInfoTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid items-baseline grid-cols-[auto_1fr] gap-x-6 gap-y-3">
            <dt className="type-meta">
              {t("detail.details.name")}
            </dt>
            <dd className="type-body">{contact.name ?? t("detail.details.notSet")}</dd>

            <dt className="type-meta">
              {t("detail.details.phone")}
            </dt>
            <dd className="type-technical-value">
              {formatPhoneNumberDisplay(contact.phone, locale)}
            </dd>

            <dt className="type-meta">
              {t("detail.details.email")}
            </dt>
            <dd className="type-body">{contact.email ?? t("detail.details.notSet")}</dd>

            <dt className="type-meta">
              {t("detail.details.timezone")}
            </dt>
            <dd className="type-body">{contact.timezone ?? t("detail.details.notSet")}</dd>

            <dt className="type-meta">
              {t("detail.details.preferredLocale")}
            </dt>
            <dd className="type-body">
              {contact.preferredLocale
                ? getLocaleDisplayName(contact.preferredLocale, locale)
                : t("detail.details.notSet")}
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("detail.details.blockingTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid items-baseline grid-cols-[auto_1fr] gap-x-6 gap-y-3">
            <dt className="type-meta">
              {t("detail.details.blockingStatus")}
            </dt>
            <dd className="type-body">
              {contact.isBlocked ? (
                <Badge variant="destructive">{t("detail.blocking.badge")}</Badge>
              ) : (
                t("detail.blocking.active")
              )}
            </dd>

            <dt className="type-meta">
              {t("detail.details.blockedAt")}
            </dt>
            <dd className="type-body">
              {contact.blockedAt
                ? formatDateTime(contact.blockedAt, locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : t("detail.details.notSet")}
            </dd>

            <dt className="type-meta">
              {t("detail.details.blockedBy")}
            </dt>
            <dd className="type-body">{contact.blockedByName ?? t("detail.details.notSet")}</dd>
          </dl>
        </CardContent>
      </Card>

      {/* SMS consent */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("detail.details.smsConsentTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid items-baseline grid-cols-[auto_1fr] gap-x-6 gap-y-3">
            <dt className="type-meta">
              {t("detail.details.smsConsentStatus")}
            </dt>
            <dd className="type-body">
              {contact.smsConsentStatus
                ? getSmsConsentStatusLabel(contact.smsConsentStatus, t)
                : t("detail.details.notSet")}
            </dd>

            <dt className="type-meta">
              {t("detail.details.smsConsentUpdatedAt")}
            </dt>
            <dd className="type-body">
              {contact.smsConsentUpdatedAt
                ? formatDateTime(contact.smsConsentUpdatedAt, locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : t("detail.details.notSet")}
            </dd>

            <dt className="type-meta">
              {t("detail.details.smsConsentSource")}
            </dt>
            <dd className="type-body">
              {contact.smsConsentSource
                ? getSmsConsentSourceLabel(contact.smsConsentSource, t)
                : t("detail.details.notSet")}
            </dd>
          </dl>
        </CardContent>
      </Card>

      {/* System info */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("detail.details.systemTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid items-baseline grid-cols-[auto_1fr] gap-x-6 gap-y-3">
            <dt className="type-meta">
              {t("detail.details.contactId")}
            </dt>
            <dd className="flex items-center gap-1.5">
              <span className="type-technical-value truncate">
                {truncateId(contact.id)}
              </span>
              <button
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground",
                  isCopied("contactId") &&
                    "text-emerald-500 hover:text-emerald-500",
                )}
                aria-label={t("detail.details.copy")}
                onClick={() => copyToClipboard(contact.id, "contactId")}
                title={t("detail.details.copy")}
                type="button"
              >
                {isCopied("contactId") ? (
                  <CheckCircle2 className="size-3" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>
            </dd>

            <dt className="type-meta">
              {t("detail.details.createdAt")}
            </dt>
            <dd className="type-body">
              {formatDateTime(contact.createdAt, locale, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata field helper (same pattern as CallDetailPage)
// ---------------------------------------------------------------------------

function MetadataField({
  copiedField,
  fieldKey,
  label,
  onCopy,
  rawValue,
  value,
}: {
  copiedField?: string | null;
  fieldKey: string;
  label: string;
  onCopy?: (text: string, field: string) => void;
  rawValue?: string;
  value: string;
}) {
  const { t } = useTranslation("contacts");
  const copyable = Boolean(onCopy);
  const isCopied = copiedField === fieldKey;

  return (
    <div className="flex flex-col gap-1">
      <span className="type-meta">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="type-body truncate">{value}</span>
        {copyable && (
          <button
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground",
              isCopied && "text-emerald-500 hover:text-emerald-500",
            )}
            aria-label={t("detail.details.copy")}
            onClick={() => onCopy?.(rawValue ?? value, fieldKey)}
            title={t("detail.details.copy")}
            type="button"
          >
            {isCopied ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ContactDetailPage({ businessId }: ContactDetailPageProps) {
  const { contactId } = useParams<{ contactId: string }>();
  const { i18n, t } = useTranslation("contacts");
  const locale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const blockContact = useMutation(api.dashboard.contacts.blockContact);
  const deleteContact = useMutation(api.dashboard.contacts.deleteContact);
  const unblockContact = useMutation(api.dashboard.contacts.unblockContact);
  const navigate = useNavigate();

  const rememberedDetail = useRememberedConvexQuery(
    api.dashboard.contacts.getContactDetail,
    businessId && contactId
      ? { businessId, contactId: contactId as Id<"contacts"> }
      : "skip",
  );
  const data = rememberedDetail.data as ContactDetailData | null | undefined;
  const isLoading = rememberedDetail.isInitialLoading;

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [isUpdatingBlockState, setIsUpdatingBlockState] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeletingContact, setIsDeletingContact] = useState(false);

  function copyToClipboard(text: string, field: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  }

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  if (isLoading) {
    return <DetailPageSkeleton />;
  }

  if (data === undefined) {
    return null;
  }

  if (data === null) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <Link
          className="type-body-muted inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          to="/contacts"
        >
          <ArrowLeft className="size-4" />
          {t("detail.backToList")}
        </Link>
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <User className="size-8 text-muted-foreground/40" />
          <p className="type-empty-title">{t("detail.notFound")}</p>
          <p className="type-empty-description">
            {t("detail.notFoundDescription")}
          </p>
        </div>
      </div>
    );
  }

  const { contact, counts, activityFeed, appointments } = data;

  const displayName = contact.name ? (
    contact.name
  ) : contact.phone ? (
    <span className="flex items-baseline gap-2">
      {formatPhoneNumberDisplay(contact.phone, locale)}
      <span className="type-item-title text-muted-foreground">
        ({t("detail.unknownContact")})
      </span>
    </span>
  ) : (
    t("detail.unknownContact")
  );

  const displayPhone = contact.phone
    ? formatPhoneNumberDisplay(contact.phone, locale)
    : "—";

  async function handleToggleBlock() {
    if (!businessId) {
      return;
    }

    setIsUpdatingBlockState(true);
    try {
      if (contact.isBlocked) {
        await unblockContact({
          businessId,
          contactId: contact.id,
        });
        toast.success(t("detail.blocking.unblockSuccess"));
      } else {
        await blockContact({
          businessId,
          contactId: contact.id,
        });
        toast.success(t("detail.blocking.blockSuccess"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("detail.blocking.updateFailed"));
      throw error;
    } finally {
      setIsUpdatingBlockState(false);
    }
  }

  async function handleDeleteContact() {
    if (!businessId) {
      return;
    }

    setIsDeletingContact(true);
    try {
      await deleteContact({
        businessId,
        contactId: contact.id,
      });
      navigate("/contacts");
    } finally {
      setIsDeletingContact(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Back navigation */}
      <Link
        className="type-body-muted inline-flex w-fit items-center gap-1.5 transition-colors hover:text-foreground"
        to="/contacts"
      >
        <ArrowLeft className="size-4" />
        {t("detail.backToList")}
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="type-page-title">{displayName}</h1>
          {contact.isBlocked ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="destructive">{t("detail.blocking.badge")}</Badge>
              {contact.blockedAt ? (
                <span className="type-body-muted">
                  {t("detail.blocking.blockedAtInline", {
                    time: formatDateTime(contact.blockedAt, locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <ContactActionsMenu
          blocking={isUpdatingBlockState}
          deleting={isDeletingContact}
          isBlocked={contact.isBlocked}
          onDelete={() => setDeleteDialogOpen(true)}
          onToggleBlock={() => setBlockDialogOpen(true)}
        />
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MetadataField
          copiedField={copiedField}
          fieldKey="phone"
          label={t("detail.metadata.phone")}
          onCopy={copyToClipboard}
          rawValue={contact.phone}
          value={displayPhone}
        />
        <MetadataField
          fieldKey="email"
          label={t("detail.metadata.email")}
          value={contact.email ?? "—"}
        />
        <MetadataField
          fieldKey="firstSeen"
          label={t("detail.metadata.firstSeen")}
          value={formatDateTime(contact.createdAt, locale, {
            dateStyle: "medium",
          })}
        />
      </div>

      <Separator />

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("detail.stats.calls")} value={counts.calls} />
        <StatCard label={t("detail.stats.messages")} value={counts.messages} />
        <StatCard
          label={t("detail.stats.appointments")}
          value={counts.appointments}
        />
        <StatCard
          label={t("detail.stats.conversations")}
          value={counts.conversations}
        />
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="activity">
        <TabsList variant="pills">
          <TabsTrigger value="activity">
            <Activity className="size-4" />
            {t("detail.tabs.activity")}
          </TabsTrigger>
          <TabsTrigger value="appointments">
            <Calendar className="size-4" />
            {t("detail.tabs.appointments")}
          </TabsTrigger>
          <TabsTrigger value="details">
            <Info className="size-4" />
            {t("detail.tabs.details")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <ActivityTab activityFeed={activityFeed} locale={locale} />
        </TabsContent>

        <TabsContent value="appointments">
          <AppointmentsTab appointments={appointments} locale={locale} />
        </TabsContent>

        <TabsContent value="details">
          <DetailsTab data={data} locale={locale} />
        </TabsContent>
      </Tabs>
      <ConfirmActionDialog
        cancelLabel={t("detail.blocking.cancel")}
        confirmLabel={
          contact.isBlocked
            ? t("detail.blocking.unblockConfirm")
            : t("detail.blocking.blockConfirm")
        }
        confirmVariant={contact.isBlocked ? "default" : "destructive"}
        description={
          contact.isBlocked
            ? t("detail.blocking.unblockDescription")
            : t("detail.blocking.blockDescription")
        }
        onConfirm={handleToggleBlock}
        onOpenChange={(open) => {
          if (!isUpdatingBlockState) {
            setBlockDialogOpen(open);
          }
        }}
        open={blockDialogOpen}
        pending={isUpdatingBlockState}
        title={
          contact.isBlocked
            ? t("detail.blocking.unblockTitle")
            : t("detail.blocking.blockTitle")
        }
      />
      <ConfirmDeleteDialog
        cancelLabel={t("table.actions.deleteCancel")}
        confirmLabel={t("table.actions.deleteConfirm")}
        description={t("table.actions.deleteDescription")}
        onConfirm={handleDeleteContact}
        onOpenChange={(open) => {
          if (!isDeletingContact) {
            setDeleteDialogOpen(open);
          }
        }}
        open={deleteDialogOpen}
        pending={isDeletingContact}
        title={t("table.actions.deleteTitle")}
      />
    </div>
  );
}
