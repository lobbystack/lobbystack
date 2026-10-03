"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCcw, Trash2, Webhook } from "lucide-react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useSetupAction } from "@/lib/use-setup-action";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { IntegrationsViewModel, WorkspaceViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { selectActiveBusiness } from "@/lib/active-business";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { PageHeader } from "@/components/page-header";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { surfaceClassName } from "@/components/ui/surface";
import { useTelemetry } from "@/components/product-analytics";

function GoogleCalendarLogo() {
  return <svg aria-hidden="true" className="size-7" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5 4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z" fill="currentColor" /></svg>;
}

export function LiveIntegrationsSurface() {
  const { t } = useTranslation("settings");
  const telemetry = useTelemetry();
  const searchParams = useSearchParams();
  const handledCallback = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: WorkspaceViewModel[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
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
      </li><li className={`${surfaceClassName} p-4`}>
        <div className="mb-8 flex items-center justify-between gap-3"><div className="flex size-10 shrink-0 items-center justify-center"><Webhook aria-hidden="true" className="size-7" /></div><Button disabled={!canManage} nativeButton={false} render={<Link href="/integrations/webhooks" />} size="sm" variant="outline">{t("integrations.actions.manage")}</Button></div>
        <div className="flex flex-col gap-1"><h2 className="type-section-title text-lg">{t("integrations.cards.webhooks.title")}</h2><p className="type-body-muted line-clamp-2">{t("integrations.cards.webhooks.description")}</p></div>
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
