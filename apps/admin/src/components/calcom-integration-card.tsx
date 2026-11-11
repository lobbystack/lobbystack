"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCcw, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CALENDAR_RECONNECT_ERROR, intlLocale } from "@lobbystack/shared";

import type { CalcomEventTypeWarningViewModel, IntegrationsViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { surfaceClassName } from "@/components/ui/surface";
import { useTelemetry } from "@/components/product-analytics";

// The "Cal" of Cal.com's wordmark on its app icon's dark tile.
function CalcomLogo() {
  return <svg aria-hidden="true" className="size-7" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
    <rect fill="#292929" height="28" rx="7" width="28" />
    <path d="M10.0582 20.817C4.32115 20.817 0 16.2763 0 10.6704C0 5.04589 4.1005 0.467773 10.0582 0.467773C13.2209 0.467773 15.409 1.43945 17.1191 3.66311L14.3609 5.96151C13.2025 4.72822 11.805 4.11158 10.0582 4.11158C6.17833 4.11158 4.04533 7.08268 4.04533 10.6704C4.04533 14.2582 6.38059 17.1732 10.0582 17.1732C11.7866 17.1732 13.2577 16.5566 14.4161 15.3233L17.1375 17.7151C15.501 19.8453 13.2577 20.817 10.0582 20.817ZM29.0161 5.88601H32.7304V20.4612H29.0161V18.331C28.2438 19.8446 26.9566 20.8536 24.4927 20.8536C20.5577 20.8536 17.4133 17.4341 17.4133 13.2297C17.4133 9.02528 20.5577 5.60571 24.4927 5.60571C26.9383 5.60571 28.2438 6.61477 29.0161 8.12835V5.88601ZM29.1264 13.2297C29.1264 10.95 27.5634 9.06266 25.0995 9.06266C22.7274 9.06266 21.1828 10.9686 21.1828 13.2297C21.1828 15.4346 22.7274 17.3967 25.0995 17.3967C27.5451 17.3967 29.1264 15.4907 29.1264 13.2297ZM35.3599 0H39.0742V20.4427H35.3599V0Z" fill="#fff" transform="translate(3.25 8.2) scale(.55)" />
  </svg>;
}

/** The Cal.com card on the integrations page, with its dialog for the event type the receptionist books. */
export function CalcomIntegrationCard({ businessId, canManage, data }: { businessId: string | undefined; canManage: boolean; data: IntegrationsViewModel | undefined }) {
  const { t, i18n } = useTranslation("settings");
  const telemetry = useTelemetry();
  const searchParams = useSearchParams();
  const handledCallback = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const connection = data?.calendarConnections.find((row) => row.provider === "calcom") ?? null;
  const options = data?.calcom?.options ?? [];
  const warnings = data?.calcom?.warnings ?? [];
  const connected = connection?.status === "connected";
  const syncing = connection?.status === "syncing";
  const discoveryFailed = Boolean(data?.calcom?.discoveryError);
  // A failed sync clears on its own; only a rejected grant takes a reconnect.
  const syncFailed = connection?.status === "error" && Boolean(connection.lastSyncError) && connection.lastSyncError !== CALENDAR_RECONNECT_ERROR;
  const canRefresh = connected || syncFailed;
  const needsAttention = Boolean(connection && (!(connected || syncing) || connection.lastSyncError || discoveryFailed));
  const queryKey = ["integrations", businessId];

  useEffect(() => { setSelectedId(connection?.selectedCalendarId ?? ""); }, [connection?.id, connection?.selectedCalendarId]);
  useEffect(() => {
    const status = searchParams.get("status");
    const key = `calcom:${status}`;
    if (searchParams.get("calendar") !== "calcom" || !status || handledCallback.current === key) return;
    handledCallback.current = key;
    if (status === "success") { if (businessId) telemetry.track("web.integration.calendar_connect_completed", { businessId, provider: "calcom" }); toast.success(t("integrations.calcom.connectedSuccess")); void queryClient.invalidateQueries({ queryKey: ["integrations", businessId] }); setDialogOpen(true); }
    else { if (businessId) telemetry.track("web.integration.calendar_connect_failed", { businessId, provider: "calcom" }); toast.error(t("integrations.calcom.connectFailed")); }
  }, [businessId, queryClient, searchParams, t, telemetry]);

  const update = useMutation({
    mutationFn: (input: { method: "PATCH" | "POST" | "DELETE"; calendarId?: string }) => requestJson(`/api/integrations?businessId=${encodeURIComponent(businessId!)}${input.method === "DELETE" ? `&connectionId=${encodeURIComponent(connection!.id)}` : ""}`, { method: input.method, ...(input.method !== "DELETE" ? { body: JSON.stringify({ connectionId: connection!.id, ...(input.calendarId ? { calendarId: input.calendarId } : {}) }) } : {}) }),
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey });
      if (input.method === "DELETE") { if (businessId) telemetry.track("web.integration.calendar_disconnect_completed", { businessId, provider: "calcom", scope: connection?.staffId ? "staff" : "business" }); setDialogOpen(false); toast.success(t("integrations.calcom.disconnectedSuccess")); }
      else if (input.method === "PATCH") toast.success(t("integrations.calcom.eventTypeSaved"));
    },
    onError: (error) => toast.error(error.message),
  });

  // Picking an event type saves it; there's no separate save step.
  function selectEventType(id: string) {
    setSelectedId(id);
    if (id && id !== connection?.selectedCalendarId) update.mutate({ method: "PATCH", calendarId: id });
  }

  async function connect() {
    if (!businessId) return;
    telemetry.track("web.integration.calendar_connect_started", { businessId, provider: "calcom" });
    try { const result = await requestJson<{ url: string }>(`/api/calendar/calcom/start?businessId=${encodeURIComponent(businessId)}`); window.location.assign(result.url); }
    catch (error) { telemetry.track("web.integration.calendar_connect_failed", { businessId, provider: "calcom" }); toast.error(error instanceof Error ? error.message : t("integrations.calcom.connectFailed")); }
  }

  const locale = intlLocale(i18n.language);
  const list = (items: string[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
  const weekday = (day: number) => new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2030, 0, 6 + day)));
  const warningText = (warning: CalcomEventTypeWarningViewModel) => {
    if (warning.code === "missing_lengths") return t("integrations.calcom.warnings.missingLengths", { lengths: list(warning.lengths.map((length) => new Intl.NumberFormat(locale).format(length))) });
    if (warning.code === "sms_reminders") return t("integrations.calcom.warnings.smsReminders");
    if (warning.code === "video_location") return t("integrations.calcom.warnings.videoLocation");
    return t("integrations.calcom.warnings.narrowerAvailability", { days: list(warning.days.map(weekday)) });
  };

  return <>
    <li className={`${surfaceClassName} p-4`}>
      <div className="mb-8 flex items-center justify-between gap-3"><div className="flex size-10 shrink-0 items-center justify-center"><CalcomLogo /></div><div className="flex items-center gap-2">
        <Button disabled={!canManage} onClick={() => connection ? setDialogOpen(true) : void connect()} size="sm" type="button" variant="outline" className={connected ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300" : undefined}>{connected ? t("integrations.actions.connected") : syncing ? t("integrations.status.syncing") : syncFailed ? t("integrations.calcom.syncNeedsAttention") : connection ? t("integrations.calcom.reconnect") : t("integrations.actions.connect")}</Button>
      </div></div>
      <div className="flex flex-col gap-1"><h2 className="type-section-title">{t("integrations.cards.calcom.title")}</h2><p className="type-body-muted line-clamp-2">{t("integrations.cards.calcom.description")}</p></div>
    </li>
    <Dialog onOpenChange={setDialogOpen} open={dialogOpen}><DialogContent className="w-full gap-0 p-0">
      <DialogHeader className="flex-row items-center gap-3 p-6 pb-4"><CalcomLogo /><div className="flex flex-col gap-1"><DialogTitle>{t("integrations.calcom.sheetTitle")}</DialogTitle><DialogDescription>{t("integrations.calcom.sheetDescription")}</DialogDescription></div></DialogHeader>
      <div className="flex flex-col gap-4 px-6 pb-6">
        {connection && needsAttention ? <Alert variant="destructive"><AlertTitle>{connected || syncing || syncFailed ? t("integrations.calcom.syncNeedsAttention") : t("integrations.status.reconnectRequired")}</AlertTitle><AlertDescription className="flex flex-col gap-3"><span>{syncFailed && !discoveryFailed ? t("integrations.calcom.syncFailed") : t("integrations.calcom.discoveryFailed")}</span>{canRefresh ? <Button className="w-fit" disabled={!canManage || update.isPending || syncing} onClick={() => update.mutate({ method: "POST" })} size="sm" variant="outline"><RefreshCcw data-icon="inline-start" />{t("integrations.calcom.refresh")}</Button> : null}</AlertDescription></Alert> : null}
        {connection ? <Field><FieldLabel htmlFor="calcom-event-type">{t("integrations.calcom.eventTypeLabel")}</FieldLabel>
          <Select disabled={!canManage || discoveryFailed || !options.length || update.isPending} items={options.map((option) => ({ value: option.id, label: option.summary }))} onValueChange={(value) => selectEventType(value ?? "")} value={selectedId}>
            <SelectTrigger id="calcom-event-type" className="w-full"><SelectValue placeholder={t("integrations.calcom.selectEventType")} /></SelectTrigger>
            <SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.summary}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field> : <Button disabled={!canManage} onClick={() => void connect()}>{t("integrations.calcom.connect")}</Button>}
        {connection && warnings.length ? <Alert><AlertTitle>{t("integrations.calcom.warningsTitle")}</AlertTitle><AlertDescription><ul className="flex list-disc flex-col gap-1 pl-4">{warnings.map((warning) => <li key={warning.code}>{warningText(warning)}</li>)}</ul></AlertDescription></Alert> : null}
      </div>
      {connection ? <DialogFooter className="m-0 rounded-b-xl border-t px-6 py-4">
        <Button className="w-full sm:w-auto" disabled={!canManage || update.isPending} onClick={() => update.mutate({ method: "DELETE" })} size="sm" variant="destructive"><Trash2 data-icon="inline-start" />{t("integrations.calcom.disconnect")}</Button>
        <Button className="w-full sm:w-auto" disabled={!canManage} onClick={() => void connect()} size="sm" variant={needsAttention && !connected && !syncing && !syncFailed ? "default" : "outline"}>{t("integrations.calcom.reconnect")}</Button>
      </DialogFooter> : null}
    </DialogContent></Dialog>
  </>;
}
