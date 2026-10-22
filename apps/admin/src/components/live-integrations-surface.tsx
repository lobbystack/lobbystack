"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCcw, Trash2, Webhook } from "lucide-react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useSetupAction } from "@/lib/use-setup-action";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { IntegrationsViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { InstagramIntegrationCard } from "@/components/instagram-integration-card";
import { PageHeader } from "@/components/page-header";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { surfaceClassName } from "@/components/ui/surface";
import { useTelemetry } from "@/components/product-analytics";
import googleCalendar from "@iconify-icons/logos/google-calendar-2020";
import zapierIcon from "@iconify-icons/logos/zapier-icon";
import { Icon } from "@iconify/react/offline";

// shortcut: the private invite link, since the Zapier app isn't public yet; switch to https://zapier.com/apps/lobbystack/integrations once Zapier lists it.
const ZAPIER_URL = "https://zapier.com/developer/public-invite/246868/514017/c9d0e185f460afe60a82c7678d8558a1/";

function GoogleCalendarLogo() {
  return <Icon aria-hidden="true" className="size-7" icon={googleCalendar} id="google-calendar-logo" ssr />;
}

export function LiveIntegrationsSurface() {
  const { t } = useTranslation("settings");
  const telemetry = useTelemetry();
  const searchParams = useSearchParams();
  const handledCallback = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const { business } = useActiveBusiness();
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const integrations = useQuery({ queryKey: ["integrations", business?.businessId], queryFn: () => requestJson<IntegrationsViewModel>(`/api/integrations?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId && canManage), refetchInterval: (query) => query.state.data?.calendarConnections.some((connection) => connection.status === "syncing") ? 2000 : false });
  const google = integrations.data?.calendarConnections.find((connection) => connection.provider === "google") ?? null;
  const connected = google?.status === "connected";
  const syncing = google?.status === "syncing";
  const discoveryFailed = Boolean(integrations.isError || integrations.data?.discoveryError);
  const calendarOptions = integrations.data?.calendarOptions ?? [];
  const needsAttention = Boolean(google && (!(connected || syncing) || google.lastSyncError || discoveryFailed));

  useEffect(() => { setSelectedCalendarId(google?.selectedCalendarId ?? ""); }, [google?.id, google?.selectedCalendarId]);
  useSetupAction(canManage, useCallback((action: string) => { if (action !== "calendar") return false; setDialogOpen(true); return true; }, []));
  useEffect(() => {
    const calendar = searchParams.get("calendar"); const status = searchParams.get("status"); const key = `${calendar}:${status}`;
    if (calendar !== "google" || !status || handledCallback.current === key) return;
    handledCallback.current = key;
    if (status === "success") { if (business) telemetry.track("web.integration.calendar_connect_completed", { businessId: business.businessId, provider: "google" }); toast.success(t("integrations.google.connectedSuccess")); void queryClient.invalidateQueries({ queryKey: ["integrations", business?.businessId] }); setDialogOpen(true); }
    else { if (business) telemetry.track("web.integration.calendar_connect_failed", { businessId: business.businessId, provider: "google" }); toast.error(t("integrations.google.connectFailed")); }
  }, [business, queryClient, searchParams, t, telemetry]);

  const update = useMutation({
    mutationFn: (input: { method: "PATCH" | "POST" | "DELETE"; calendarId?: string }) => requestJson(`/api/integrations?businessId=${encodeURIComponent(business!.businessId)}${input.method === "DELETE" ? `&connectionId=${encodeURIComponent(google!.id)}` : ""}`, { method: input.method, ...(input.method !== "DELETE" ? { body: JSON.stringify({ connectionId: google!.id, ...(input.calendarId ? { calendarId: input.calendarId } : {}) }) } : {}) }),
    onSuccess: async (_, input) => { await queryClient.invalidateQueries({ queryKey: ["integrations", business?.businessId] }); if (input.method === "DELETE") { if (business) telemetry.track("web.integration.calendar_disconnect_completed", { businessId: business.businessId, provider: "google", scope: google?.staffId ? "staff" : "business" }); setDialogOpen(false); toast.success(t("integrations.google.disconnectedSuccess")); } else if (input.method === "PATCH") toast.success(t("integrations.google.calendarSaved")); },
    onError: (error) => toast.error(error.message),
  });

  // Picking a calendar saves it; there's no separate save step.
  function selectCalendar(calendarId: string) {
    setSelectedCalendarId(calendarId);
    if (calendarId && calendarId !== google?.selectedCalendarId) update.mutate({ method: "PATCH", calendarId });
  }

  async function connect() { if (!business) return; telemetry.track("web.integration.calendar_connect_started", { businessId: business.businessId, provider: "google" }); try { const result = await requestJson<{ url: string }>(`/api/calendar/google/start?businessId=${encodeURIComponent(business.businessId)}`); window.location.assign(result.url); } catch (error) { telemetry.track("web.integration.calendar_connect_failed", { businessId: business.businessId, provider: "google" }); toast.error(error instanceof Error ? error.message : t("integrations.google.connectFailed")); } }

  return <>
    <div className="flex flex-col gap-6">
      <PageHeader title={t("sections.integrations")} />
      {discoveryFailed || google?.lastSyncError ? <Alert variant="destructive"><AlertTitle>{t("integrations.google.syncNeedsAttention")}</AlertTitle><AlertDescription>{t("integrations.google.discoveryFailed")}</AlertDescription></Alert> : null}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><li className={`${surfaceClassName} p-4`}>
        <div className="mb-8 flex items-center justify-between gap-3"><div className="flex size-10 shrink-0 items-center justify-center"><GoogleCalendarLogo /></div><div className="flex items-center gap-2">
          {integrations.isLoading ? <Skeleton className="h-9 w-24 rounded-md" /> : <Button disabled={!canManage} onClick={() => google ? setDialogOpen(true) : void connect()} size="sm" type="button" variant="outline" className={connected ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300" : undefined}>{connected ? t("integrations.actions.connected") : syncing ? t("integrations.status.syncing") : google ? t("integrations.google.reconnect") : t("integrations.actions.connect")}</Button>}
        </div></div>
        <div className="flex flex-col gap-1"><h2 className="type-section-title text-lg">{t("integrations.cards.google.title")}</h2><p className="type-body-muted line-clamp-2">{t("integrations.cards.google.description")}</p></div>
      </li><InstagramIntegrationCard businessId={business?.businessId} canManage={canManage} /><li className={`${surfaceClassName} p-4`}>
        <div className="mb-8 flex items-center justify-between gap-3"><div className="flex size-10 shrink-0 items-center justify-center"><Webhook aria-hidden="true" className="size-7" /></div><Button disabled={!canManage} nativeButton={false} render={<Link href="/integrations/webhooks" />} size="sm" variant="outline">{t("integrations.actions.manage")}</Button></div>
        <div className="flex flex-col gap-1"><h2 className="type-section-title text-lg">{t("integrations.cards.webhooks.title")}</h2><p className="type-body-muted line-clamp-2">{t("integrations.cards.webhooks.description")}</p></div>
      </li><li className={`${surfaceClassName} p-4`}>
        <div className="mb-8 flex items-center justify-between gap-3"><div className="flex size-10 shrink-0 items-center justify-center"><Icon aria-hidden="true" className="size-7" icon={zapierIcon} id="zapier-logo" ssr /></div><Button nativeButton={false} render={<Link href={ZAPIER_URL} rel="noreferrer" target="_blank" />} size="sm" variant="outline">{t("integrations.actions.setUp")}</Button></div>
        <div className="flex flex-col gap-1"><h2 className="type-section-title text-lg">{t("integrations.cards.zapier.title")}</h2><p className="type-body-muted line-clamp-2">{t("integrations.cards.zapier.description")}</p></div>
      </li></ul>
    </div>
    <Dialog onOpenChange={setDialogOpen} open={dialogOpen}><DialogContent className="w-full gap-0 p-0 sm:max-w-md">
      <DialogHeader className="flex-row items-center gap-3 p-6 pb-4"><GoogleCalendarLogo /><div className="flex flex-col gap-1"><DialogTitle>{t("integrations.google.sheetTitle")}</DialogTitle><DialogDescription>{t("integrations.google.sheetDescription")}</DialogDescription></div></DialogHeader>
      <div className="flex flex-col gap-4 px-6 pb-6">
        {google && needsAttention ? <Alert variant="destructive"><AlertTitle>{connected || syncing ? t("integrations.google.syncNeedsAttention") : t("integrations.status.reconnectRequired")}</AlertTitle><AlertDescription className="flex flex-col gap-3"><span>{t("integrations.google.discoveryFailed")}</span>{connected ? <Button className="w-fit" disabled={!canManage || update.isPending || syncing} onClick={() => update.mutate({ method: "POST" })} size="sm" variant="outline"><RefreshCcw data-icon="inline-start" />{t("integrations.google.refreshCalendars")}</Button> : null}</AlertDescription></Alert> : null}
        {google ? <Field><FieldLabel htmlFor="calendar-selection">{t("integrations.google.calendarLabel")}</FieldLabel>
          <Select disabled={!canManage || discoveryFailed || !calendarOptions.length || update.isPending} items={calendarOptions.map((calendar) => ({ value: calendar.id, label: calendar.primary ? t("integrations.google.primaryCalendarLabel", { summary: calendar.summary }) : calendar.summary }))} onValueChange={(value) => selectCalendar(value ?? "")} value={selectedCalendarId}>
            <SelectTrigger id="calendar-selection" className="w-full"><SelectValue placeholder={t("integrations.google.selectCalendar")} /></SelectTrigger>
            <SelectContent><SelectGroup>{calendarOptions.map((calendar) => <SelectItem key={calendar.id} value={calendar.id} disabled={!["owner", "writer"].includes(calendar.accessRole ?? "")}>{calendar.primary ? t("integrations.google.primaryCalendarLabel", { summary: calendar.summary }) : calendar.summary}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field> : <Button disabled={!canManage} onClick={() => void connect()}>{t("integrations.google.connect")}</Button>}
      </div>
      {google ? <DialogFooter className="m-0 flex-row justify-between rounded-b-xl border-t px-6 py-4 sm:justify-between">
        <Button disabled={!canManage || update.isPending} onClick={() => update.mutate({ method: "DELETE" })} size="sm" variant="ghost"><Trash2 data-icon="inline-start" />{t("integrations.google.disconnect")}</Button>
        <Button disabled={!canManage} onClick={() => void connect()} size="sm" variant={needsAttention && !connected && !syncing ? "default" : "outline"}>{t("integrations.google.reconnect")}</Button>
      </DialogFooter> : null}
    </DialogContent></Dialog>
  </>;
}
