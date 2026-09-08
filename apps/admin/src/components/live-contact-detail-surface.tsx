"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Copy,
  Ellipsis,
  Info,
  MessageSquare,
  Phone,
  ShieldBan,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { selectActiveBusiness } from "@/lib/active-business";
import { formatRelativeTime } from "@/lib/locale";
import { formatPhoneNumberDisplay } from "@/lib/phone";

type Business = { businessId: string; name: string; active: boolean; role: string };
type Detail = {
  contact: {
    id: string;
    legacyConvexId: string | null;
    name: string | null;
    phone: string;
    email: string | null;
    timezone: string | null;
    preferredLocale: string | null;
    smsConsentStatus: string | null;
    smsConsentUpdatedAt: string | null;
    smsConsentSource: string | null;
    operatorBlockedAt: string | null;
    createdAt: string;
  } | null;
  calls: Array<{ id: string; status: string; disposition: string | null; transport: string; startedAt: string; endedAt: string | null; providerDurationSeconds: number | null }>;
  messages: Array<{ id: string; conversationId: string; direction: string; channel: string; body: string; status: string; createdAt: string }>;
  appointments: Array<{ id: string; startsAt: string; endsAt: string; timezone: string; status: string; sourceChannel: string; calendarSyncState: string; serviceName: string; staffName: string }>;
  activityCounts: { calls: number; messages: number; appointments: number; conversations: number };
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error("Unable to load contact details.");
  return await response.json() as T;
}

function dateTime(value: string, locale: string, dateOnly = false): string {
  return new Intl.DateTimeFormat(locale, dateOnly ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function truncateId(value: string, maxLength = 16): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return minutes > 0 ? `${minutes}m ${String(remainder).padStart(2, "0")}s` : `${remainder}s`;
}

function resolveCallStatus(status: string, disposition: string | null): "blocked" | "completed" | "failed" | "in_progress" {
  if (status === "in_progress" || status === "open") return "in_progress";
  const value = disposition?.trim().toLowerCase() ?? "";
  if (value.includes("blocked")) return "blocked";
  if (["failed", "busy", "canceled", "cancelled", "no_answer", "missed"].some((part) => value.includes(part))) return "failed";
  return "completed";
}

function appointmentStatusVariant(status: string): "default" | "secondary" | "destructive" {
  if (["cancelled", "canceled"].includes(status.toLowerCase())) return "destructive";
  if (["confirmed", "completed"].includes(status.toLowerCase())) return "default";
  return "secondary";
}

function humanize(value: string): string {
  return value.trim().replace(/[_:]+/g, " ").replace(/\s+/g, " ").toLowerCase().replace(/^\w/, (character) => character.toUpperCase());
}

function appointmentStatusLabel(status: string, t: ReturnType<typeof useTranslation<"contacts">>["t"]): string {
  const key = status.toLowerCase();
  if (key === "booked") return t("detail.appointments.booked");
  if (key === "confirmed") return t("detail.appointments.confirmed");
  if (key === "completed") return t("detail.appointments.completed");
  if (key === "cancelled" || key === "canceled") return t("detail.appointments.cancelled");
  if (key === "pending") return t("detail.appointments.pending");
  return humanize(status);
}

export function LiveContactDetailSurface({ contactId }: { contactId: string }) {
  const { i18n, t } = useTranslation("contacts");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canMutate = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const detail = useQuery({
    queryKey: ["contact", business?.businessId, contactId],
    queryFn: () => getJson<Detail>(`/api/contacts/${encodeURIComponent(contactId)}?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });
  const updateBlock = useMutation({
    mutationFn: (blocked: boolean) => getJson(`/api/contacts/${encodeURIComponent(contactId)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ smsBlocked: blocked }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["contact", business?.businessId, contactId] }),
  });
  const remove = useMutation({
    mutationFn: () => getJson(`/api/contacts/${encodeURIComponent(contactId)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE" }),
    onSuccess: () => router.push("/contacts"),
  });

  function copy(text: string, field: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1_500);
    });
  }

  if (businesses.isLoading || detail.isLoading) return <DetailSkeleton />;
  const data = detail.data;
  if (businesses.isError || detail.isError || !data?.contact) {
    return <div className="flex flex-1 flex-col gap-6"><BackLink label={t("detail.backToList")} /><div className="flex flex-col items-center gap-2 py-16 text-center"><User className="size-8 text-muted-foreground/40" /><p className="type-empty-title">{t("detail.notFound")}</p><p className="type-empty-description">{t("detail.notFoundDescription")}</p></div></div>;
  }
  const contact = data.contact;
  const displayName = contact.name ?? contact.phone ?? t("detail.unknownContact");
  const displayPhone = formatPhoneNumberDisplay(contact.phone, i18n.language);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BackLink label={t("detail.backToList")} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="type-page-title">{displayName}</h1>
          {contact.operatorBlockedAt ? <div className="flex flex-wrap items-center gap-2"><Badge variant="destructive">{t("detail.blocking.badge")}</Badge><span className="type-body-muted">{t("detail.blocking.blockedAtInline", { time: dateTime(contact.operatorBlockedAt, i18n.language) })}</span></div> : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-label={t("table.actions.moreOptions")} size="icon-sm" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canMutate} onClick={() => setBlockDialogOpen(true)}>{contact.operatorBlockedAt ? <ShieldCheck /> : <ShieldBan />}{contact.operatorBlockedAt ? t("detail.blocking.unblockAction") : t("detail.blocking.blockAction")}</DropdownMenuItem>
            <DropdownMenuItem disabled={!canMutate} onClick={() => setDeleteDialogOpen(true)} variant="destructive"><Trash2 />{t("table.actions.deleteContact")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MetadataField copied={copiedField === "phone"} label={t("detail.metadata.phone")} onCopy={() => copy(contact.phone, "phone")} value={displayPhone} />
        <MetadataField label={t("detail.metadata.email")} value={contact.email ?? "—"} />
        <MetadataField label={t("detail.metadata.firstSeen")} value={dateTime(contact.createdAt, i18n.language, true)} />
      </div>
      <Separator />
      <Surface className="grid grid-cols-2 sm:grid-cols-4">
        <StatCard label={t("detail.stats.calls")} value={data.activityCounts.calls} />
        <StatCard className="border-l border-border" label={t("detail.stats.messages")} value={data.activityCounts.messages} />
        <StatCard className="border-t border-border sm:border-l sm:border-t-0" label={t("detail.stats.appointments")} value={data.activityCounts.appointments} />
        <StatCard className="border-l border-t border-border sm:border-t-0" label={t("detail.stats.conversations")} value={data.activityCounts.conversations} />
      </Surface>

      <Tabs defaultValue="activity">
        <TabsList variant="pills">
          <TabsTrigger value="activity"><Activity className="size-4" />{t("detail.tabs.activity")}</TabsTrigger>
          <TabsTrigger value="appointments"><Calendar className="size-4" />{t("detail.tabs.appointments")}</TabsTrigger>
          <TabsTrigger value="details"><Info className="size-4" />{t("detail.tabs.details")}</TabsTrigger>
        </TabsList>
        <TabsContent value="activity"><ActivityTab data={data} locale={i18n.language} /></TabsContent>
        <TabsContent value="appointments"><AppointmentsTab appointments={data.appointments} locale={i18n.language} /></TabsContent>
        <TabsContent value="details"><DetailsTab contact={contact} copiedField={copiedField} locale={i18n.language} onCopy={copy} /></TabsContent>
      </Tabs>

      <ConfirmActionDialog cancelLabel={t("detail.blocking.cancel")} confirmLabel={contact.operatorBlockedAt ? t("detail.blocking.unblockConfirm") : t("detail.blocking.blockConfirm")} confirmVariant={contact.operatorBlockedAt ? "default" : "destructive"} description={contact.operatorBlockedAt ? t("detail.blocking.unblockDescription") : t("detail.blocking.blockDescription")} onConfirm={async () => { await updateBlock.mutateAsync(!contact.operatorBlockedAt); }} onOpenChange={(open) => { if (!updateBlock.isPending) setBlockDialogOpen(open); }} open={blockDialogOpen} pending={updateBlock.isPending} title={contact.operatorBlockedAt ? t("detail.blocking.unblockTitle") : t("detail.blocking.blockTitle")} />
      <ConfirmDeleteDialog cancelLabel={t("table.actions.deleteCancel")} confirmLabel={t("table.actions.deleteConfirm")} description={t("table.actions.deleteDescription")} onConfirm={async () => { await remove.mutateAsync(); }} onOpenChange={(open) => { if (!remove.isPending) setDeleteDialogOpen(open); }} open={deleteDialogOpen} pending={remove.isPending} title={t("table.actions.deleteTitle")} />
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return <Link className="type-body-muted inline-flex w-fit items-center gap-1.5 transition-colors hover:text-foreground" href="/contacts"><ArrowLeft className="size-4" />{label}</Link>;
}

function MetadataField({ copied, label, onCopy, value }: { copied?: boolean; label: string; onCopy?: () => void; value: string }) {
  const { t } = useTranslation("contacts");
  return <div className="flex flex-col gap-1"><span className="type-meta">{label}</span><div className="flex items-center gap-1.5"><span className="type-body truncate">{value}</span>{onCopy ? <button aria-label={t("detail.details.copy")} className={cn("flex size-5 items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground", copied && "text-emerald-500")} onClick={onCopy} type="button">{copied ? <CheckCircle2 className="size-3" /> : <Copy className="size-3" />}</button> : null}</div></div>;
}

function StatCard({ className, label, value }: { className?: string; label: string; value: number }) {
  return <div className={cn("flex items-center px-4 py-3", className)}><div className="flex flex-col"><span className="font-heading text-lg leading-none font-semibold tracking-tight text-foreground">{value}</span><span className="type-meta">{label}</span></div></div>;
}

function ActivityTab({ data, locale }: { data: Detail; locale: string }) {
  const { t } = useTranslation("contacts");
  const rows = useMemo(() => [
    ...data.calls.map((call) => ({ id: call.id, kind: "call" as const, timestamp: call.startedAt, call })),
    ...data.messages.map((message) => ({ id: message.id, kind: "message" as const, timestamp: message.createdAt, message })),
    ...data.appointments.map((appointment) => ({ id: appointment.id, kind: "appointment" as const, timestamp: appointment.startsAt, appointment })),
  ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)), [data.appointments, data.calls, data.messages]);
  if (!rows.length) return <Empty icon={Activity} label={t("detail.activity.empty")} />;
  return <div className="relative flex flex-col py-4">
    {rows.length > 1 ? <div aria-hidden="true" className="absolute bottom-[42px] left-[19.5px] top-[42px] w-px bg-border" /> : null}
    {rows.map((row) => {
      const icon = row.kind === "call" ? Phone : row.kind === "message" ? MessageSquare : Calendar;
      const Icon = icon;
      let summary: React.ReactNode;
      if (row.kind === "call") {
        const duration = formatDuration(row.call.providerDurationSeconds);
        const callStatus = resolveCallStatus(row.call.status, row.call.disposition);
        summary = <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="type-body border-b border-dashed border-muted-foreground/40 pb-0.5 transition-colors hover:border-current">{t("detail.activity.callInbound")}</span><span className="type-body-muted">{duration}</span><span className={cn("type-meta", callStatus === "completed" && "text-emerald-600 dark:text-emerald-400", callStatus === "failed" && "text-destructive")}>{t(callStatus === "completed" ? "detail.activity.callCompleted" : callStatus === "failed" ? "detail.activity.callFailed" : callStatus === "blocked" ? "detail.activity.callBlocked" : "detail.activity.callInProgress")}</span></div>;
      } else if (row.kind === "message") {
        summary = <span className="type-body">{t(row.message.direction === "outbound" ? "detail.activity.smsOutbound" : "detail.activity.smsInbound")}</span>;
      } else {
        summary = <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="type-body">{t("detail.activity.appointmentScheduled")}</span>{row.appointment.serviceName ? <span className="type-body-muted">{row.appointment.serviceName}</span> : null}{row.appointment.staffName ? <span className="type-body-muted">{t("detail.activity.withStaff", { staff: row.appointment.staffName })}</span> : null}<Badge variant={appointmentStatusVariant(row.appointment.status)}>{appointmentStatusLabel(row.appointment.status, t)}</Badge></div>;
      }
      const content = <div className={cn("relative flex items-start gap-3 rounded-xl py-2.5 pl-2 pr-2 transition-colors", row.kind === "call" && "cursor-pointer")}><div className="relative z-10 flex w-[23px] shrink-0 justify-center"><div className="mt-1 flex size-[23px] shrink-0 items-center justify-center rounded-full bg-background"><Icon className="size-3.5 text-muted-foreground" /></div></div><div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-0.5"><div className="min-w-0 flex-1">{summary}</div><span className="type-meta shrink-0">{formatRelativeTime(row.timestamp, locale)}</span></div></div>;
      return row.kind === "call" ? <Link className="block no-underline" href={`/calls/${row.call.id}`} key={`${row.kind}-${row.id}`}>{content}</Link> : <div key={`${row.kind}-${row.id}`}>{content}</div>;
    })}
  </div>;
}

function AppointmentsTab({ appointments, locale }: { appointments: Detail["appointments"]; locale: string }) {
  const { t } = useTranslation("contacts");
  if (!appointments.length) return <Empty icon={Calendar} label={t("detail.appointments.empty")} />;
  return <div className="flex flex-col gap-3 py-4">{appointments.map((appointment) => <Surface className="flex flex-col gap-3 px-4 py-3" key={appointment.id}><div className="flex items-start justify-between gap-3"><div className="flex flex-col gap-0.5"><span className="type-item-title">{appointment.serviceName ?? "—"}</span>{appointment.staffName ? <span className="type-body-muted">{t("detail.activity.withStaff", { staff: appointment.staffName })}</span> : null}</div><Badge variant={appointmentStatusVariant(appointment.status)}>{appointmentStatusLabel(appointment.status, t)}</Badge></div><Separator /><div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><div className="flex flex-col gap-0.5"><span className="type-meta">{t("detail.appointments.dateTime")}</span><span className="type-body">{dateTime(appointment.startsAt, locale)}</span></div><div className="flex flex-col gap-0.5"><span className="type-meta">{t("detail.appointments.syncState")}</span><span className="type-body">{humanize(appointment.calendarSyncState)}</span></div><div className="flex flex-col gap-0.5"><span className="type-meta">{t("detail.appointments.channel")}</span><span className="type-body">{humanize(appointment.sourceChannel)}</span></div></div></Surface>)}</div>;
}

function DetailsTab({ contact, copiedField, locale, onCopy }: { contact: NonNullable<Detail["contact"]>; copiedField: string | null; locale: string; onCopy: (text: string, field: string) => void }) {
  const { t } = useTranslation("contacts");
  const displayId = contact.legacyConvexId ?? contact.id;
  return <div className="py-4"><Surface className="flex flex-col">
    <DetailSection title={t("detail.details.contactInfoTitle")}><DescriptionList rows={[[t("detail.details.name"), contact.name ?? t("detail.details.notSet")], [t("detail.details.phone"), formatPhoneNumberDisplay(contact.phone, locale)], [t("detail.details.email"), contact.email ?? t("detail.details.notSet")], [t("detail.details.timezone"), contact.timezone ?? t("detail.details.notSet")], [t("detail.details.preferredLocale"), contact.preferredLocale ? new Intl.DisplayNames([locale], { type: "language" }).of(contact.preferredLocale) ?? contact.preferredLocale : t("detail.details.notSet")]]} /></DetailSection>
    <DetailSection className="border-t" title={t("detail.details.blockingTitle")}><DescriptionList rows={[[t("detail.details.blockingStatus"), contact.operatorBlockedAt ? t("detail.blocking.badge") : t("detail.blocking.active")], [t("detail.details.blockedAt"), contact.operatorBlockedAt ? dateTime(contact.operatorBlockedAt, locale) : t("detail.details.notSet")], [t("detail.details.blockedBy"), t("detail.details.notSet")]]} /></DetailSection>
    <DetailSection className="border-t" title={t("detail.details.smsConsentTitle")}><DescriptionList rows={[[t("detail.details.smsConsentStatus"), contact.smsConsentStatus ?? t("detail.details.notSet")], [t("detail.details.smsConsentUpdatedAt"), contact.smsConsentUpdatedAt ? dateTime(contact.smsConsentUpdatedAt, locale) : t("detail.details.notSet")], [t("detail.details.smsConsentSource"), contact.smsConsentSource ?? t("detail.details.notSet")]]} /></DetailSection>
    <DetailSection className="border-t" title={t("detail.details.systemTitle")}><dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3"><dt className="type-meta">{t("detail.details.contactId")}</dt><dd className="flex items-center gap-1.5"><span className="type-technical-value">{truncateId(displayId)}</span><button aria-label={t("detail.details.copy")} className={cn("text-muted-foreground", copiedField === "contactId" && "text-emerald-500")} onClick={() => onCopy(displayId, "contactId")} type="button">{copiedField === "contactId" ? <CheckCircle2 className="size-3" /> : <Copy className="size-3" />}</button></dd><dt className="type-meta">{t("detail.details.createdAt")}</dt><dd className="type-body">{dateTime(contact.createdAt, locale)}</dd></dl></DetailSection>
  </Surface></div>;
}

function DescriptionList({ rows }: { rows: Array<[string, string]> }) {
  return <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3">{rows.map(([label, value]) => <div className="contents" key={label}><dt className="type-meta">{label}</dt><dd className="type-body">{value}</dd></div>)}</dl>;
}

function DetailSection({ children, className, title }: { children: React.ReactNode; className?: string; title: string }) {
  return <section className={cn("flex flex-col gap-4 px-4 py-4", className)}><h3 className="font-heading text-base font-medium">{title}</h3>{children}</section>;
}

function Empty({ icon: Icon, label }: { icon: typeof Activity; label: string }) {
  return <div className="flex flex-col items-center gap-2 py-16 text-center"><Icon className="size-8 text-muted-foreground/40" /><p className="type-empty-description">{label}</p></div>;
}

function DetailSkeleton() {
  return <div className="flex flex-1 flex-col gap-6"><Skeleton className="h-5 w-24" /><Skeleton className="h-9 w-64" /><div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-12" key={index} />)}</div><Skeleton className="h-28" /><Skeleton className="h-80" /></div>;
}
