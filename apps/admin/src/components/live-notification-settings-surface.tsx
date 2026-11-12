"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { requestJson } from "@/lib/request-json";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { SmsPhoneVerificationDialog } from "@/components/sms-phone-verification-dialog";
import { useBranding } from "@/components/branding-provider";
import { MarketingEmailsSkeleton } from "@/components/loading-skeletons";
import { MarketingEmailsSetting, useMarketingEmailPreference } from "@/components/marketing-emails-setting";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type EventKey = "callCompleted" | "voiceMessage" | "pausedSms" | "widgetChat" | "liveChatRequest" | "smsFailed" | "calendarSync" | "transferFailed" | "aiReplyFailed" | "webhookDisabled";
type Preferences = { emailEnabled: boolean; smsEnabled: boolean; smsConsent: boolean; eventPreferences: Record<EventKey, { email: boolean; sms: boolean }>; dailySummaryEnabled: boolean; dailySummarySendTime: string | null; canUseSms: boolean; smsUnavailableReason: "phone_unverified" | "sender_missing" | null };
const communicationEvents: EventKey[] = ["callCompleted", "voiceMessage", "pausedSms"];
const issueEvents: EventKey[] = ["smsFailed", "calendarSync", "transferFailed", "webhookDisabled"];
const widgetEvents: EventKey[] = ["widgetChat", "liveChatRequest"];

export function LiveNotificationSettingsSurface({ widgetOnly = false }: { widgetOnly?: boolean }) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const { businesses, business } = useActiveBusiness();
  const { partner } = useBranding();
  const marketing = useMarketingEmailPreference(!widgetOnly && !partner);
  const preferences = useQuery({ queryKey: ["notification-preferences", business?.businessId], queryFn: () => requestJson<Preferences>(`/api/notification-preferences?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const [pendingPhoneVerification, setPendingPhoneVerification] = useState<Preferences | null>(null);
  useEffect(() => { setPendingPhoneVerification(null); }, [business?.businessId]);
  const [draft, setDraft] = useState<Preferences | null>(null);
  useEffect(() => { if (preferences.data) setDraft(preferences.data); }, [preferences.data]);
  const save = useMutation({ mutationFn: (next: Preferences) => requestJson(`/api/notification-preferences?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PUT", body: JSON.stringify(next) }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["notification-preferences", business?.businessId] }); }, onError: () => toast.error(t("notifications.toast.saveFailed")) });
  function persist(next: Preferences) { setDraft(next); save.mutate(next); }
  // Consent is the opt-in disclosure in the dialog: sending the code, or turning
  // alerts on with a verified phone, is the operator's agreement. Anyone without
  // consent on record goes through it.
  function enableSms(next: Preferences) { persist({ ...next, smsConsent: true }); }
  // The server records consent and turns SMS on when it approves the code.
  function phoneVerified() {
    if (!pendingPhoneVerification) return;
    setDraft({ ...pendingPhoneVerification, smsConsent: true, canUseSms: true, smsUnavailableReason: null });
    setPendingPhoneVerification(null);
    void queryClient.invalidateQueries({ queryKey: ["notification-preferences", business?.businessId] });
  }
  // A verified phone only needs the consent, which this save records.
  function consented() {
    if (!pendingPhoneVerification) return;
    const next = pendingPhoneVerification;
    setPendingPhoneVerification(null);
    enableSms(next);
  }

  // The host's marketing emails reach no one through a partner, so a partner's pages don't offer them.
  const showMarketing = !widgetOnly && !partner;
  if (!draft || preferences.isLoading || businesses.isLoading || (showMarketing && !marketing.data)) return <NotificationsSkeleton showMarketing={showMarketing} t={t} widgetOnly={widgetOnly} />;
  return <><div className="w-full overflow-y-auto pb-12"><div className="flex w-full flex-col gap-12"><section className="flex flex-col gap-4"><h3 className="type-title">{t("notifications.sources.title")}</h3><Surface className="flex flex-col"><Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"><ItemContent><ItemTitle>{t("notifications.sources.email.title")}</ItemTitle><ItemDescription>{t("notifications.sources.email.description")}</ItemDescription></ItemContent><ItemActions><Switch aria-label={t("notifications.sources.email.title")} checked={draft.emailEnabled} onCheckedChange={(checked) => persist({ ...draft, emailEnabled: checked })} /></ItemActions></Item><Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"><ItemContent><ItemTitle>{t("notifications.sources.sms.title")}</ItemTitle><ItemDescription>{t(draft.smsUnavailableReason === "sender_missing" ? "notifications.sources.sms.senderMissingDescription" : "notifications.sources.sms.description")}</ItemDescription></ItemContent><ItemActions><Switch aria-label={t("notifications.sources.sms.title")} checked={draft.smsEnabled} disabled={draft.smsUnavailableReason === "sender_missing"} onCheckedChange={(checked) => { const next = { ...draft, smsEnabled: checked }; if (!checked) { persist(next); return; } if (draft.smsUnavailableReason === "phone_unverified" || !draft.smsConsent) { setPendingPhoneVerification(next); return; } enableSms(next); }} /></ItemActions></Item></Surface></section><NotificationTable draft={draft} events={widgetOnly ? widgetEvents : communicationEvents} onChange={persist} title={t("notifications.communication.title")} t={t} />{!widgetOnly ? <NotificationTable draft={draft} events={issueEvents} onChange={persist} title={t("notifications.systemIssues.title")} t={t} /> : null}{showMarketing ? <MarketingEmailsSetting /> : null}</div></div>
    {business?.businessId ? <SmsPhoneVerificationDialog businessId={business.businessId} onOpenChange={open => { if (!open) setPendingPhoneVerification(null); }} onConsent={consented} onVerified={phoneVerified} open={pendingPhoneVerification !== null} phoneVerified={draft.smsUnavailableReason !== "phone_unverified"} /> : null}
  </>;
}

function NotificationTable({ draft, events: rows, onChange, title, t }: { draft: Preferences; events: EventKey[]; onChange: (next: Preferences) => void; title: string; t: (key: string) => string }) {
  return <section className="flex flex-col gap-4"><div><h3 className="type-title text-foreground">{title}</h3></div><Surface><Table><TableHeader><TableRow><TableHead className="align-middle">{t("notifications.communication.eventColumn")}</TableHead>{draft.emailEnabled ? <TableHead className="w-[120px] text-center align-middle">{t("notifications.sources.email.title")}</TableHead> : null}{draft.smsEnabled ? <TableHead className="w-[120px] text-center align-middle">{t("notifications.sources.sms.title")}</TableHead> : null}</TableRow></TableHeader><TableBody>{rows.map((event) => <TableRow key={event}><TableCell className="whitespace-normal"><div className="flex flex-col gap-1 pr-4"><span className="type-title text-foreground">{t(`notifications.events.${event}.title`)}</span><span className="type-body-muted">{t(`notifications.events.${event}.description`)}</span></div></TableCell>{draft.emailEnabled ? <TableCell className="text-center align-middle"><div className="flex w-full justify-center"><Checkbox aria-label={`${t("notifications.sources.email.title")} - ${t(`notifications.events.${event}.title`)}`} checked={draft.eventPreferences[event]?.email ?? false} onCheckedChange={(checked) => onChange({ ...draft, eventPreferences: { ...draft.eventPreferences, [event]: { ...(draft.eventPreferences[event] ?? { email: false, sms: false }), email: checked === true } } })} /></div></TableCell> : null}{draft.smsEnabled ? <TableCell className="text-center align-middle"><div className="flex w-full justify-center"><Checkbox aria-label={`${t("notifications.sources.sms.title")} - ${t(`notifications.events.${event}.title`)}`} checked={draft.eventPreferences[event]?.sms ?? false} onCheckedChange={(checked) => onChange({ ...draft, eventPreferences: { ...draft.eventPreferences, [event]: { ...(draft.eventPreferences[event] ?? { email: false, sms: false }), sms: checked === true } } })} /></div></TableCell> : null}</TableRow>)}</TableBody></Table></Surface></section>;
}

/** Hidden text keeps a placeholder as wide and tall as the text it stands in for. */
function HiddenText({ children, className }: { children: string; className?: string }) {
  return <div aria-hidden="true" className={className}><Skeleton className="w-fit max-w-full"><span className="invisible">{children}</span></Skeleton></div>;
}

function NotificationTableSkeleton({ events: rows, title, t }: { events: EventKey[]; title: string; t: (key: string) => string }) {
  return (
    <section className="flex flex-col gap-4">
      <HiddenText className="type-title">{title}</HiddenText>
      <Surface>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="align-middle">{t("notifications.communication.eventColumn")}</TableHead>
              {/* Which of the Email and SMS columns exist depends on the saved choice, so both show as placeholders. */}
              <TableHead className="w-[120px] align-middle"><Skeleton className="mx-auto h-4 w-10" /></TableHead>
              <TableHead className="w-[120px] align-middle"><Skeleton className="mx-auto h-4 w-10" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody aria-busy="true">
            {rows.map((event) => (
              <TableRow key={event}>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-col gap-1 pr-4">
                    <HiddenText className="type-title">{t(`notifications.events.${event}.title`)}</HiddenText>
                    <HiddenText className="type-body">{t(`notifications.events.${event}.description`)}</HiddenText>
                  </div>
                </TableCell>
                <TableCell><Skeleton className="mx-auto size-4" /></TableCell>
                <TableCell><Skeleton className="mx-auto size-4" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Surface>
    </section>
  );
}

function NotificationsSkeleton({ showMarketing, t, widgetOnly }: { showMarketing: boolean; t: (key: string) => string; widgetOnly: boolean }) {
  const sources = [["email", "notifications.sources.email.description"], ["sms", "notifications.sources.sms.description"]] as const;
  return (
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex w-full flex-col gap-12">
        <section className="flex flex-col gap-4">
          <HiddenText className="type-title">{t("notifications.sources.title")}</HiddenText>
          <Surface className="flex flex-col">
            {sources.map(([source, description]) => (
              <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0" key={source}>
                <ItemContent>
                  <ItemTitle aria-hidden="true"><Skeleton className="w-fit"><span className="invisible">{t(`notifications.sources.${source}.title`)}</span></Skeleton></ItemTitle>
                  <HiddenText className="type-body">{t(description)}</HiddenText>
                </ItemContent>
                <ItemActions><Skeleton className="h-[18.4px] w-8 rounded-full" /></ItemActions>
              </Item>
            ))}
          </Surface>
        </section>
        <NotificationTableSkeleton events={widgetOnly ? widgetEvents : communicationEvents} t={t} title={t("notifications.communication.title")} />
        {widgetOnly ? null : <NotificationTableSkeleton events={issueEvents} t={t} title={t("notifications.systemIssues.title")} />}
        {showMarketing ? <MarketingEmailsSkeleton labels={{ title: t("notifications.marketing.title"), label: t("notifications.marketing.label"), description: t("notifications.marketing.description") }} /> : null}
      </div>
    </div>
  );
}
