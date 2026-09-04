"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { WorkspaceViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { selectActiveBusiness } from "@/lib/active-business";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const events = ["voiceMessage", "pausedSms", "widgetChat", "smsFailed", "calendarSync", "transferFailed", "aiReplyFailed"] as const;
type EventKey = (typeof events)[number];
type Preferences = { emailEnabled: boolean; smsEnabled: boolean; smsConsent: boolean; eventPreferences: Record<EventKey, { email: boolean; sms: boolean }>; dailySummaryEnabled: boolean; dailySummarySendTime: string | null };
const communicationEvents: EventKey[] = ["voiceMessage", "pausedSms", "widgetChat"];
const issueEvents: EventKey[] = ["smsFailed", "calendarSync", "transferFailed", "aiReplyFailed"];

export function LiveNotificationSettingsSurface() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: WorkspaceViewModel[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const preferences = useQuery({ queryKey: ["notification-preferences", business?.businessId], queryFn: () => requestJson<Preferences>(`/api/notification-preferences?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const [draft, setDraft] = useState<Preferences | null>(null);
  useEffect(() => { if (preferences.data) setDraft(preferences.data); }, [preferences.data]);
  const save = useMutation({ mutationFn: (next: Preferences) => requestJson(`/api/notification-preferences?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PUT", body: JSON.stringify(next) }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["notification-preferences", business?.businessId] }); }, onError: () => toast.error(t("notifications.toast.saveFailed")) });
  function persist(next: Preferences) { setDraft(next); save.mutate(next); }

  if (!draft || preferences.isLoading || businesses.isLoading) return <div className="flex flex-col gap-12"><Skeleton className="h-40 w-full rounded-xl" /><Skeleton className="h-64 w-full rounded-xl" /><Skeleton className="h-40 w-full rounded-xl" /></div>;
  return <div className="w-full overflow-y-auto pb-12"><div className="flex w-full flex-col gap-12"><section className="flex flex-col gap-4"><h3 className="text-sm font-medium">{t("notifications.sources.title")}</h3><Surface className="flex flex-col"><Item className="rounded-none border-x-0 border-t-0 border-b"><ItemContent><ItemTitle>{t("notifications.sources.email.title")}</ItemTitle><ItemDescription>{t("notifications.sources.email.description")}</ItemDescription></ItemContent><ItemActions><Switch aria-label={t("notifications.sources.email.title")} checked={draft.emailEnabled} onCheckedChange={(checked) => persist({ ...draft, emailEnabled: checked })} /></ItemActions></Item><Item className="rounded-none border-0"><ItemContent><ItemTitle>{t("notifications.sources.sms.title")}</ItemTitle><ItemDescription>{t("notifications.sources.sms.description")}</ItemDescription></ItemContent><ItemActions><Switch aria-label={t("notifications.sources.sms.title")} checked={draft.smsEnabled} onCheckedChange={(checked) => { if (checked && !draft.smsConsent && !window.confirm(t("notifications.smsConsent.description"))) return; persist({ ...draft, smsEnabled: checked, smsConsent: checked ? true : draft.smsConsent }); }} /></ItemActions></Item></Surface></section><NotificationTable draft={draft} events={communicationEvents} onChange={persist} title={t("notifications.communication.title")} t={t} /><NotificationTable draft={draft} events={issueEvents} onChange={persist} title={t("notifications.systemIssues.title")} t={t} /></div></div>;
}

function NotificationTable({ draft, events: rows, onChange, title, t }: { draft: Preferences; events: EventKey[]; onChange: (next: Preferences) => void; title: string; t: (key: string) => string }) {
  return <section className="flex flex-col gap-4"><h3 className="text-sm font-medium">{title}</h3><Surface><Table><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="h-12 px-6 text-sm font-medium text-foreground">{t("notifications.communication.eventColumn")}</TableHead>{draft.emailEnabled ? <TableHead className="h-12 w-[120px] px-6 text-center text-sm font-medium text-foreground">{t("notifications.sources.email.title")}</TableHead> : null}{draft.smsEnabled ? <TableHead className="h-12 w-[120px] px-6 text-center text-sm font-medium text-foreground">{t("notifications.sources.sms.title")}</TableHead> : null}</TableRow></TableHeader><TableBody>{rows.map((event) => <TableRow className="hover:bg-transparent" key={event}><TableCell className="whitespace-normal px-6 py-5"><div className="flex flex-col gap-1 pr-4"><span className="text-sm font-medium">{t(`notifications.events.${event}.title`)}</span><span className="text-sm text-muted-foreground">{t(`notifications.events.${event}.description`)}</span></div></TableCell>{draft.emailEnabled ? <TableCell className="px-6 py-5 text-center"><input aria-label={`${t("notifications.sources.email.title")} - ${t(`notifications.events.${event}.title`)}`} checked={draft.eventPreferences[event]?.email ?? false} className="size-4 accent-foreground" onChange={(change) => onChange({ ...draft, eventPreferences: { ...draft.eventPreferences, [event]: { ...(draft.eventPreferences[event] ?? { email: false, sms: false }), email: change.target.checked } } })} type="checkbox" /></TableCell> : null}{draft.smsEnabled ? <TableCell className="px-6 py-5 text-center"><input aria-label={`${t("notifications.sources.sms.title")} - ${t(`notifications.events.${event}.title`)}`} checked={draft.eventPreferences[event]?.sms ?? false} className="size-4 accent-foreground" onChange={(change) => onChange({ ...draft, eventPreferences: { ...draft.eventPreferences, [event]: { ...(draft.eventPreferences[event] ?? { email: false, sms: false }), sms: change.target.checked } } })} type="checkbox" /></TableCell> : null}</TableRow>)}</TableBody></Table></Surface></section>;
}
