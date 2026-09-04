"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { IntegrationsViewModel, WorkspaceViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { selectActiveBusiness } from "@/lib/active-business";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PageHeader } from "@/components/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { surfaceClassName } from "@/components/ui/surface";

function GoogleCalendarLogo() {
  return <svg aria-hidden="true" className="size-7" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5 4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z" fill="currentColor" /></svg>;
}

function formatTimestamp(value: string | null | undefined, locale: string): string | null { return value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : null; }

export function LiveIntegrationsSurface() {
  const { i18n, t } = useTranslation("settings");
  const searchParams = useSearchParams();
  const handledCallback = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: WorkspaceViewModel[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const integrations = useQuery({ queryKey: ["integrations", business?.businessId], queryFn: () => requestJson<IntegrationsViewModel>(`/api/integrations?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId && canManage) });
  const connections = integrations.data?.calendarConnections ?? [];
  const google = useMemo(() => connections.find((connection) => connection.provider === "google") ?? null, [connections]);
  const connected = google?.status === "connected";

  useEffect(() => { if (google?.selectedCalendarId) setSelectedCalendarId(google.selectedCalendarId); }, [google?.selectedCalendarId]);
  useEffect(() => { if (searchParams.get("setup") === "calendar" && canManage) setDialogOpen(true); }, [canManage, searchParams]);
  useEffect(() => {
    const calendar = searchParams.get("calendar"); const status = searchParams.get("status"); const message = searchParams.get("message"); const key = `${calendar}:${status}:${message}`;
    if (calendar !== "google" || !status || handledCallback.current === key) return;
    handledCallback.current = key;
    if (status === "success") { toast.success(message ?? t("integrations.google.connectedSuccess")); void queryClient.invalidateQueries({ queryKey: ["integrations", business?.businessId] }); setDialogOpen(true); }
    else toast.error(message ?? t("integrations.google.connectFailed"));
  }, [business?.businessId, queryClient, searchParams, t]);

  const update = useMutation({
    mutationFn: (input: { method: "PATCH" | "POST" | "DELETE"; calendarId?: string }) => requestJson(`/api/integrations?businessId=${encodeURIComponent(business!.businessId)}${input.method === "DELETE" ? `&connectionId=${encodeURIComponent(google!.id)}` : ""}`, { method: input.method, ...(input.method !== "DELETE" ? { body: JSON.stringify({ connectionId: google!.id, ...(input.calendarId ? { calendarId: input.calendarId } : {}) }) } : {}) }),
    onSuccess: async (_, input) => { await queryClient.invalidateQueries({ queryKey: ["integrations", business?.businessId] }); if (input.method === "DELETE") { setDialogOpen(false); toast.success(t("integrations.google.disconnectedSuccess")); } else if (input.method === "PATCH") toast.success(t("integrations.google.calendarSaved")); },
    onError: (error) => toast.error(error.message),
  });

  async function connect() { if (!business) return; try { const result = await requestJson<{ url: string }>(`/api/calendar/google/start?businessId=${encodeURIComponent(business.businessId)}`); window.location.assign(result.url); } catch (error) { toast.error(error instanceof Error ? error.message : t("integrations.google.connectFailed")); } }

  return <><div className="flex flex-col gap-6"><PageHeader title={t("sections.integrations")} />{!canManage && business ? <div className={`${surfaceClassName} p-4 type-body-muted`}>{t("integrations.permissions.manageRequired")}</div> : null}<ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><li className={`${surfaceClassName} p-4`}><div className="mb-8 flex items-center justify-between gap-3"><div className="flex size-10 shrink-0 items-center justify-center"><GoogleCalendarLogo /></div><div className="flex items-center gap-2">{integrations.isLoading ? <Skeleton className="h-9 w-24 rounded-md" /> : <><Button disabled={!canManage} onClick={() => connected ? setDialogOpen(true) : void connect()} size="sm" type="button" variant="outline" className={connected ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300" : undefined}>{connected ? t("integrations.actions.connected") : google ? t("integrations.google.reconnect") : t("integrations.actions.connect")}</Button></>}</div></div><div className="flex flex-col gap-1"><h2 className="type-section-title text-lg">{t("integrations.cards.google.title")}</h2><p className="type-body-muted line-clamp-2">{t("integrations.cards.google.description")}</p></div></li></ul></div>
    <Dialog onOpenChange={setDialogOpen} open={dialogOpen}><DialogContent className="max-h-[90vh] w-full overflow-hidden p-0 sm:max-w-xl"><DialogHeader className="gap-0 border-b p-6 pb-5"><div className="flex items-start gap-4"><div className="flex size-11 shrink-0 items-center justify-center"><GoogleCalendarLogo /></div><div className="flex flex-col gap-1"><DialogTitle>{t("integrations.google.sheetTitle")}</DialogTitle><DialogDescription>{t("integrations.google.sheetDescription")}</DialogDescription></div></div></DialogHeader><div className="flex max-h-[calc(90vh-7rem)] flex-col gap-6 overflow-y-auto p-6"><section className="flex flex-col gap-4 rounded-xl border p-4"><div className="flex flex-col gap-1"><h3 className="type-item-title">{t("integrations.google.connectionSectionTitle")}</h3><p className="type-body-muted">{t("integrations.google.connectionSectionDescription")}</p></div><Button className="w-full sm:w-auto" disabled={!canManage} onClick={() => void connect()}>{google ? t("integrations.google.reconnect") : t("integrations.google.connect")}</Button>{google ? <div className="grid gap-3 rounded-xl bg-muted/35 p-4 sm:grid-cols-2"><div className="flex flex-col gap-1"><p className="type-meta">{t("integrations.google.connectedAccount")}</p><p className="type-body">{google.externalAccountId ?? t("integrations.google.connectedAccountUnavailable")}</p></div><div className="flex flex-col gap-1"><p className="type-meta">{t("integrations.google.lastSync")}</p><p className="type-body">{formatTimestamp(google.lastSyncedAt, i18n.language) ?? t("integrations.google.neverSynced")}</p></div></div> : <div className="type-body-muted rounded-xl border border-dashed px-4 py-4">{t("integrations.google.notConnectedDescription")}</div>}</section>
      {google ? <section className="flex flex-col gap-4 rounded-xl border p-4"><div className="flex flex-col gap-1"><h3 className="type-item-title">{t("integrations.google.calendarSectionTitle")}</h3><p className="type-body-muted">{t("integrations.google.calendarSectionDescription")}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant={connected ? "secondary" : "destructive"}>{connected ? t("integrations.status.connected") : t("integrations.status.reconnectRequired")}</Badge>{google.lastSyncError ? <Badge variant="destructive">{t("integrations.google.syncNeedsAttention")}</Badge> : <Badge variant="outline">{t("integrations.google.syncHealthy")}</Badge>}</div><FieldGroup><Field><FieldContent><FieldLabel>{t("integrations.google.calendarLabel")}</FieldLabel><FieldDescription>{connected ? t("integrations.google.selectCalendar") : t("integrations.google.reconnect")}</FieldDescription></FieldContent><Select disabled={!connected || integrations.data?.calendarOptions.length === 0} onValueChange={(value) => setSelectedCalendarId(value ?? "")} value={selectedCalendarId}><SelectTrigger className="w-full"><SelectValue placeholder={t("integrations.google.selectCalendar")} /></SelectTrigger><SelectContent>{integrations.data?.calendarOptions.map((calendar) => <SelectItem key={calendar.id} value={calendar.id}>{calendar.primary ? t("integrations.google.primaryCalendarLabel", { summary: calendar.summary }) : calendar.summary}</SelectItem>)}</SelectContent></Select></Field></FieldGroup><div className="flex flex-wrap gap-2"><Button disabled={!selectedCalendarId || update.isPending || !connected} onClick={() => update.mutate({ method: "PATCH", calendarId: selectedCalendarId })} variant="secondary">{update.isPending ? t("integrations.google.savingCalendar") : t("integrations.google.saveCalendar")}</Button><Button disabled={update.isPending || !connected} onClick={() => update.mutate({ method: "POST" })} variant="ghost"><RefreshCcw className="size-4" />{t("integrations.google.refreshCalendars")}</Button><Button disabled={update.isPending} onClick={() => update.mutate({ method: "DELETE" })} size="sm" variant="outline"><Trash2 className="size-4" />{t("integrations.google.disconnect")}</Button></div></section> : null}</div></DialogContent></Dialog>
  </>;
}
