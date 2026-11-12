"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCcw, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CALENDAR_RECONNECT_ERROR, CALENDLY_PLAN_ERROR, intlLocale } from "@lobbystack/shared";

import type { CalendlyEventTypeWarningViewModel, IntegrationsViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { surfaceClassName } from "@/components/ui/surface";
import { useTelemetry } from "@/components/product-analytics";

// A plain C on Calendly's blue tile.
function CalendlyLogo() {
  return <svg aria-hidden="true" className="size-7" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
    <rect fill="#006BFF" height="28" rx="7" width="28" />
    <path d="M18.5 10.2a6 6 0 1 0 0 7.6" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="3" />
  </svg>;
}

/** The Calendly card on the integrations page, with its dialog for the event type the agent books. */
export function CalendlyIntegrationCard({ businessId, canManage, data }: { businessId: string | undefined; canManage: boolean; data: IntegrationsViewModel | undefined }) {
  const { t, i18n } = useTranslation("settings");
  const telemetry = useTelemetry();
  const searchParams = useSearchParams();
  const handledCallback = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const connection = data?.calendarConnections.find((row) => row.provider === "calendly") ?? null;
  const options = data?.calendly?.options ?? [];
  const warnings = data?.calendly?.warnings ?? [];
  const connected = connection?.status === "connected";
  const syncing = connection?.status === "syncing";
  const discoveryFailed = Boolean(data?.calendly?.discoveryError);
  // A failed sync clears on its own; only a rejected grant takes a reconnect.
  // A Free account connects but can't book, which no refresh or reconnect fixes.
  const planBlocked = data?.calendly?.paidPlan === false || connection?.lastSyncError === CALENDLY_PLAN_ERROR;
  const syncFailed = !planBlocked && connection?.status === "error" && Boolean(connection.lastSyncError) && connection.lastSyncError !== CALENDAR_RECONNECT_ERROR;
  const canRefresh = connected || syncFailed;
  const needsAttention = !planBlocked && Boolean(connection && (!(connected || syncing) || connection.lastSyncError || discoveryFailed));
  const queryKey = ["integrations", businessId];

  useEffect(() => { setSelectedId(connection?.selectedCalendarId ?? ""); }, [connection?.id, connection?.selectedCalendarId]);
  useEffect(() => {
    const status = searchParams.get("status");
    const key = `calendly:${status}`;
    if (searchParams.get("calendar") !== "calendly" || !status || handledCallback.current === key) return;
    handledCallback.current = key;
    if (status === "success") { if (businessId) telemetry.track("web.integration.calendar_connect_completed", { businessId, provider: "calendly" }); toast.success(t("integrations.calendly.connectedSuccess")); void queryClient.invalidateQueries({ queryKey: ["integrations", businessId] }); setDialogOpen(true); }
    else { if (businessId) telemetry.track("web.integration.calendar_connect_failed", { businessId, provider: "calendly" }); toast.error(t(status === "not_admin" ? "integrations.calendly.connectNotAdmin" : "integrations.calendly.connectFailed")); }
  }, [businessId, queryClient, searchParams, t, telemetry]);

  const update = useMutation({
    mutationFn: (input: { method: "PATCH" | "POST" | "DELETE"; calendarId?: string }) => requestJson(`/api/integrations?businessId=${encodeURIComponent(businessId!)}${input.method === "DELETE" ? `&connectionId=${encodeURIComponent(connection!.id)}` : ""}`, { method: input.method, ...(input.method !== "DELETE" ? { body: JSON.stringify({ connectionId: connection!.id, ...(input.calendarId ? { calendarId: input.calendarId } : {}) }) } : {}) }),
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey });
      if (input.method === "DELETE") { if (businessId) telemetry.track("web.integration.calendar_disconnect_completed", { businessId, provider: "calendly", scope: connection?.staffId ? "staff" : "business" }); setDialogOpen(false); toast.success(t("integrations.calendly.disconnectedSuccess")); }
      else if (input.method === "PATCH") toast.success(t("integrations.calendly.eventTypeSaved"));
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
    telemetry.track("web.integration.calendar_connect_started", { businessId, provider: "calendly" });
    try { const result = await requestJson<{ url: string }>(`/api/calendar/calendly/start?businessId=${encodeURIComponent(businessId)}`); window.location.assign(result.url); }
    catch (error) { telemetry.track("web.integration.calendar_connect_failed", { businessId, provider: "calendly" }); toast.error(error instanceof Error ? error.message : t("integrations.calendly.connectFailed")); }
  }

  const locale = intlLocale(i18n.language);
  const list = (items: string[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
  const warningText = (warning: CalendlyEventTypeWarningViewModel) => {
    if (warning.code === "required_questions") return t("integrations.calendly.warnings.requiredQuestions", { questions: list(warning.questions) });
    if (warning.code === "missing_lengths") return t("integrations.calendly.warnings.missingLengths", { lengths: list(warning.lengths.map((length) => new Intl.NumberFormat(locale).format(length))) });
    if (warning.code === "no_details_question") return t("integrations.calendly.warnings.noDetailsQuestion");
    return t("integrations.calendly.warnings.videoLocation");
  };
  // An event type with a question LobbyStack can't answer stays visible, so the operator sees why it can't be picked.
  const optionLabel = (option: { summary: string; accessRole?: string }) => option.accessRole === "reader" ? t("integrations.calendly.blockedOption", { name: option.summary }) : option.summary;

  return <>
    <li className={`${surfaceClassName} p-4`}>
      <div className="mb-8 flex items-center justify-between gap-3"><div className="flex size-10 shrink-0 items-center justify-center"><CalendlyLogo /></div><div className="flex items-center gap-2">
        <Button disabled={!canManage} onClick={() => connection ? setDialogOpen(true) : void connect()} size="sm" type="button" variant="outline" className={connected && !planBlocked ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300" : undefined}>{planBlocked && connection ? t("integrations.calendly.planRequiredTitle") : connected ? t("integrations.actions.connected") : syncing ? t("integrations.status.syncing") : syncFailed ? t("integrations.calendly.syncNeedsAttention") : connection ? t("integrations.calendly.reconnect") : t("integrations.actions.connect")}</Button>
      </div></div>
      <div className="flex flex-col gap-1"><h2 className="type-section-title">{t("integrations.cards.calendly.title")}</h2><p className="type-body-muted line-clamp-2">{t("integrations.cards.calendly.description")}</p></div>
    </li>
    <Dialog onOpenChange={setDialogOpen} open={dialogOpen}><DialogContent className="w-full gap-0 p-0">
      <DialogHeader className="flex-row items-center gap-3 p-6 pb-4"><CalendlyLogo /><div className="flex flex-col gap-1"><DialogTitle>{t("integrations.calendly.sheetTitle")}</DialogTitle><DialogDescription>{t("integrations.calendly.sheetDescription")}</DialogDescription></div></DialogHeader>
      <div className="flex flex-col gap-4 px-6 pb-6">
        {connection && planBlocked ? <Alert variant="destructive"><AlertTitle>{t("integrations.calendly.planRequiredTitle")}</AlertTitle><AlertDescription>{t("integrations.calendly.planRequired")}</AlertDescription></Alert> : null}
        {connection && needsAttention ? <Alert variant="destructive"><AlertTitle>{connected || syncing || syncFailed ? t("integrations.calendly.syncNeedsAttention") : t("integrations.status.reconnectRequired")}</AlertTitle><AlertDescription className="flex flex-col gap-3"><span>{syncFailed && !discoveryFailed ? t("integrations.calendly.syncFailed") : t("integrations.calendly.discoveryFailed")}</span>{canRefresh ? <Button className="w-fit" disabled={!canManage || update.isPending || syncing} onClick={() => update.mutate({ method: "POST" })} size="sm" variant="outline"><RefreshCcw data-icon="inline-start" />{t("integrations.calendly.refresh")}</Button> : null}</AlertDescription></Alert> : null}
        {connection ? <Field><FieldLabel htmlFor="calendly-event-type">{t("integrations.calendly.eventTypeLabel")}</FieldLabel>
          <Select disabled={!canManage || planBlocked || discoveryFailed || !options.length || update.isPending} items={options.map((option) => ({ value: option.id, label: optionLabel(option) }))} onValueChange={(value) => selectEventType(value ?? "")} value={selectedId}>
            <SelectTrigger id="calendly-event-type" className="w-full"><SelectValue placeholder={t("integrations.calendly.selectEventType")} /></SelectTrigger>
            <SelectContent><SelectGroup>{options.map((option) => <SelectItem disabled={option.accessRole === "reader"} key={option.id} value={option.id}>{optionLabel(option)}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field> : <Button disabled={!canManage} onClick={() => void connect()}>{t("integrations.calendly.connect")}</Button>}
        {connection && warnings.length ? <Alert><AlertTitle>{t("integrations.calendly.warningsTitle")}</AlertTitle><AlertDescription><ul className="flex list-disc flex-col gap-1 pl-4">{warnings.map((warning) => <li key={warning.code}>{warningText(warning)}</li>)}</ul></AlertDescription></Alert> : null}
      </div>
      {connection ? <DialogFooter className="m-0 rounded-b-xl border-t px-6 py-4">
        <Button className="w-full sm:w-auto" disabled={!canManage || update.isPending} onClick={() => update.mutate({ method: "DELETE" })} size="sm" variant="destructive"><Trash2 data-icon="inline-start" />{t("integrations.calendly.disconnect")}</Button>
        <Button className="w-full sm:w-auto" disabled={!canManage} onClick={() => void connect()} size="sm" variant={needsAttention && !connected && !syncing && !syncFailed ? "default" : "outline"}>{t("integrations.calendly.reconnect")}</Button>
      </DialogFooter> : null}
    </DialogContent></Dialog>
  </>;
}
