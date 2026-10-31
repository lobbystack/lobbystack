"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, RefreshCcw, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { intlLocale } from "@lobbystack/shared";

import type { CalcomEventTypeWarningViewModel, IntegrationsViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { surfaceClassName } from "@/components/ui/surface";
import { useTelemetry } from "@/components/product-analytics";

function CalcomLogo() {
  return <CalendarClock aria-hidden="true" className="size-7" />;
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
    return t("integrations.calcom.warnings.narrowerAvailability", { days: list(warning.days.map(weekday)) });
  };

  return <>
    <li className={`${surfaceClassName} p-4`}>
      <div className="mb-8 flex items-center justify-between gap-3"><div className="flex size-10 shrink-0 items-center justify-center"><CalcomLogo /></div><div className="flex items-center gap-2">
        <Button disabled={!canManage} onClick={() => connection ? setDialogOpen(true) : void connect()} size="sm" type="button" variant="outline" className={connected ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300" : undefined}>{connected ? t("integrations.actions.connected") : syncing ? t("integrations.status.syncing") : connection ? t("integrations.calcom.reconnect") : t("integrations.actions.connect")}</Button>
      </div></div>
      <div className="flex flex-col gap-1"><h2 className="type-section-title text-lg">{t("integrations.cards.calcom.title")}</h2><p className="type-body-muted line-clamp-2">{t("integrations.cards.calcom.description")}</p></div>
    </li>
    <Dialog onOpenChange={setDialogOpen} open={dialogOpen}><DialogContent className="w-full gap-0 p-0">
      <DialogHeader className="flex-row items-center gap-3 p-6 pb-4"><CalcomLogo /><div className="flex flex-col gap-1"><DialogTitle>{t("integrations.calcom.sheetTitle")}</DialogTitle><DialogDescription>{t("integrations.calcom.sheetDescription")}</DialogDescription></div></DialogHeader>
      <div className="flex flex-col gap-4 px-6 pb-6">
        {connection && needsAttention ? <Alert variant="destructive"><AlertTitle>{connected || syncing ? t("integrations.calcom.syncNeedsAttention") : t("integrations.status.reconnectRequired")}</AlertTitle><AlertDescription className="flex flex-col gap-3"><span>{t("integrations.calcom.discoveryFailed")}</span>{connected ? <Button className="w-fit" disabled={!canManage || update.isPending || syncing} onClick={() => update.mutate({ method: "POST" })} size="sm" variant="outline"><RefreshCcw data-icon="inline-start" />{t("integrations.calcom.refresh")}</Button> : null}</AlertDescription></Alert> : null}
        {connection ? <Field><FieldLabel htmlFor="calcom-event-type">{t("integrations.calcom.eventTypeLabel")}</FieldLabel>
          <Select disabled={!canManage || discoveryFailed || !options.length || update.isPending} items={options.map((option) => ({ value: option.id, label: option.summary }))} onValueChange={(value) => selectEventType(value ?? "")} value={selectedId}>
            <SelectTrigger id="calcom-event-type" className="w-full"><SelectValue placeholder={t("integrations.calcom.selectEventType")} /></SelectTrigger>
            <SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.summary}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          <FieldDescription>{t("integrations.calcom.howItWorks")}</FieldDescription>
        </Field> : <Button disabled={!canManage} onClick={() => void connect()}>{t("integrations.calcom.connect")}</Button>}
        {connection && warnings.length ? <Alert><AlertTitle>{t("integrations.calcom.warningsTitle")}</AlertTitle><AlertDescription><ul className="flex list-disc flex-col gap-1 pl-4">{warnings.map((warning) => <li key={warning.code}>{warningText(warning)}</li>)}</ul></AlertDescription></Alert> : null}
      </div>
      {connection ? <DialogFooter className="m-0 rounded-b-xl border-t px-6 py-4">
        <Button className="w-full sm:w-auto" disabled={!canManage || update.isPending} onClick={() => update.mutate({ method: "DELETE" })} size="sm" variant="destructive"><Trash2 data-icon="inline-start" />{t("integrations.calcom.disconnect")}</Button>
        <Button className="w-full sm:w-auto" disabled={!canManage} onClick={() => void connect()} size="sm" variant={needsAttention && !connected && !syncing ? "default" : "outline"}>{t("integrations.calcom.reconnect")}</Button>
      </DialogFooter> : null}
    </DialogContent></Dialog>
  </>;
}
