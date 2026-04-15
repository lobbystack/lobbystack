import { useState } from "react";
import { Link, useParams } from "react-router-dom";
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

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { DetailPageSkeleton } from "@/components/loading-skeletons";
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
import { formatDateTime, resolveLocale } from "@/lib/locale";
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
): "completed" | "failed" | "in_progress" {
  if (status === "in_progress" || status === "open") {
    return "in_progress";
  }

  const d = (disposition ?? "").trim().toLowerCase();
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col">
        <span className="type-metric text-lg">{value}</span>
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
        <p className="text-sm text-muted-foreground">
          {t("detail.activity.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col py-4">
      {activityFeed.map((item, index) => (
        <ActivityFeedItem
          isFirst={index === 0}
          isLast={index === activityFeed.length - 1}
          item={item}
          key={`${item.kind}-${item.timestamp}-${index}`}
          locale={locale}
        />
      ))}
    </div>
  );
}

function ActivityFeedItem({
  isFirst,
  isLast,
  item,
  locale,
}: {
  isFirst: boolean;
  isLast: boolean;
  item: ContactDetailData["activityFeed"][number];
  locale: string;
}) {
  const { t } = useTranslation("contacts");

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
            <span className="text-sm font-medium text-foreground">
              {t("detail.activity.callInbound")}
            </span>
            <span className="text-sm text-muted-foreground">
              {formatDuration(item.callDurationSeconds)}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
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
        const directionLabel =
          item.messageDirection === "outbound"
            ? t("detail.activity.messageSent")
            : t("detail.activity.messageReceived");
        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {t("detail.activity.smsConversation")}
              </span>
              <Badge className="text-[10px]" variant="outline">
                {directionLabel}
              </Badge>
            </div>
            {item.messageBody && (
              <p className="line-clamp-1 text-sm text-muted-foreground">
                {item.messageBody}
              </p>
            )}
          </div>
        );
      }
      case "appointment": {
        return (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-foreground">
              {t("detail.activity.appointmentScheduled")}
            </span>
            {item.appointmentServiceName && (
              <span className="text-sm text-muted-foreground">
                {item.appointmentServiceName}
              </span>
            )}
            {item.appointmentStaffName && (
              <span className="text-sm text-muted-foreground">
                {t("detail.activity.withStaff", {
                  staff: item.appointmentStaffName,
                })}
              </span>
            )}
            {item.appointmentStatus && (
              <Badge
                className="text-[10px]"
                variant={appointmentStatusVariant(item.appointmentStatus)}
              >
                {item.appointmentStatus}
              </Badge>
            )}
          </div>
        );
      }
    }
  }

  const isCall = item.kind === "call" && item.callId;

  const content = (
    <div
      className={cn(
        "relative flex items-start gap-3 rounded-xl py-2.5 pl-2 pr-2 transition-colors",
        isCall && "cursor-pointer hover:bg-muted/60",
      )}
    >
      {/* Timeline rail: line segments + icon */}
      <div className="relative flex w-[23px] shrink-0 flex-col items-center self-stretch">
        {/* Line above the icon */}
        <div className={cn("w-px flex-1", isFirst ? "bg-transparent" : "bg-border")} />
        {/* Icon */}
        <div className="flex size-[23px] shrink-0 items-center justify-center">
          <Icon className="size-3.5 text-muted-foreground" />
        </div>
        {/* Line below the icon */}
        <div className={cn("w-px flex-1", isLast ? "bg-transparent" : "bg-border")} />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-0.5">
        <div className="min-w-0 flex-1">{renderSummary()}</div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDateTime(item.timestamp, locale, {
            month: "short",
            day: "numeric",
          })}
          {", "}
          {formatDateTime(item.timestamp, locale, {
            hour: "numeric",
            minute: "2-digit",
          })}
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
        <p className="text-sm text-muted-foreground">
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
                <span className="text-sm text-muted-foreground">
                  {t("detail.activity.withStaff", {
                    staff: appointment.staffName,
                  })}
                </span>
              )}
            </div>
            <Badge variant={appointmentStatusVariant(appointment.status)}>
              {appointment.status}
            </Badge>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div className="flex flex-col gap-0.5">
              <span className="type-meta">
                {t("detail.appointments.dateTime")}
              </span>
              <span>
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
              <span className="capitalize">
                {appointment.calendarSyncState.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="type-meta">Channel</span>
              <span className="capitalize">{appointment.sourceChannel}</span>
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
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">
              {t("detail.details.name")}
            </dt>
            <dd>{contact.name ?? t("detail.details.notSet")}</dd>

            <dt className="text-muted-foreground">
              {t("detail.details.phone")}
            </dt>
            <dd className="font-mono text-xs">
              {formatPhoneNumberDisplay(contact.phone, locale)}
            </dd>

            <dt className="text-muted-foreground">
              {t("detail.details.email")}
            </dt>
            <dd>{contact.email ?? t("detail.details.notSet")}</dd>

            <dt className="text-muted-foreground">
              {t("detail.details.timezone")}
            </dt>
            <dd>{contact.timezone ?? t("detail.details.notSet")}</dd>

            <dt className="text-muted-foreground">
              {t("detail.details.preferredLocale")}
            </dt>
            <dd>{contact.preferredLocale ?? t("detail.details.notSet")}</dd>
          </dl>
        </CardContent>
      </Card>

      {/* SMS consent */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("detail.details.smsConsentTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">
              {t("detail.details.smsConsentStatus")}
            </dt>
            <dd>
              {contact.smsConsentStatus ?? t("detail.details.notSet")}
            </dd>

            <dt className="text-muted-foreground">
              {t("detail.details.smsConsentUpdatedAt")}
            </dt>
            <dd>
              {contact.smsConsentUpdatedAt
                ? formatDateTime(contact.smsConsentUpdatedAt, locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : t("detail.details.notSet")}
            </dd>

            <dt className="text-muted-foreground">
              {t("detail.details.smsConsentSource")}
            </dt>
            <dd>
              {contact.smsConsentSource ?? t("detail.details.notSet")}
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
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">
              {t("detail.details.contactId")}
            </dt>
            <dd className="flex items-center gap-1.5">
              <span className="truncate font-mono text-xs">
                {truncateId(contact.id)}
              </span>
              <button
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:text-foreground",
                  isCopied("contactId") &&
                    "text-emerald-500 hover:text-emerald-500",
                )}
                onClick={() => copyToClipboard(contact.id, "contactId")}
                title="Copy"
                type="button"
              >
                {isCopied("contactId") ? (
                  <CheckCircle2 className="size-3" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>
            </dd>

            <dt className="text-muted-foreground">
              {t("detail.details.createdAt")}
            </dt>
            <dd>
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
              "flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:text-foreground",
              isCopied && "text-emerald-500 hover:text-emerald-500",
            )}
            onClick={() => onCopy?.(rawValue ?? value, fieldKey)}
            title="Copy"
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

  const rememberedDetail = useRememberedConvexQuery(
    api.dashboard.contacts.getContactDetail,
    businessId && contactId
      ? { businessId, contactId: contactId as Id<"contacts"> }
      : "skip",
  );
  const data = rememberedDetail.data as ContactDetailData | null | undefined;
  const isLoading = rememberedDetail.isInitialLoading;

  const [copiedField, setCopiedField] = useState<string | null>(null);

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
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
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

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Back navigation */}
      <Link
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        to="/contacts"
      >
        <ArrowLeft className="size-4" />
        {t("detail.backToList")}
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="type-page-title text-2xl">{displayName}</h1>
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
        <StatCard
          icon={Phone}
          label={t("detail.stats.calls")}
          value={counts.calls}
        />
        <StatCard
          icon={MessageSquare}
          label={t("detail.stats.messages")}
          value={counts.messages}
        />
        <StatCard
          icon={Calendar}
          label={t("detail.stats.appointments")}
          value={counts.appointments}
        />
        <StatCard
          icon={Mail}
          label={t("detail.stats.conversations")}
          value={counts.conversations}
        />
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="activity">
        <TabsList variant="line">
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
    </div>
  );
}
