"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { webhookEventTypes, type WebhookEventType } from "@lobbystack/shared";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { PageHeader } from "@/components/page-header";
import { SecretReveal } from "@/components/secret-reveal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { selectActiveBusiness } from "@/lib/active-business";
import type { WorkspaceViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";

type Endpoint = {
  id: string;
  url: string;
  description: string | null;
  events: WebhookEventType[];
  status: "enabled" | "disabled";
  disabled_reason: "manual" | "failing" | null;
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  created_at: string;
};

type Delivery = {
  id: string;
  eventId: string;
  eventType: string;
  status: "pending" | "retrying" | "succeeded" | "failed" | "skipped";
  attemptCount: number;
  lastResponseStatus: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
};

const eventKey = (event: string) => event.replace(".", "_");

function EndpointForm({ initial, onSubmit, pending, submitLabel, onCancel }: { initial?: Endpoint; onSubmit: (value: { url: string; description: string; events: WebhookEventType[] }) => void; pending: boolean; submitLabel: string; onCancel: () => void }) {
  const { t } = useTranslation("settings");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [events, setEvents] = useState<WebhookEventType[]>(initial?.events ?? [...webhookEventTypes]);
  return (
    <>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="webhook-url">{t("webhooks.form.urlLabel")}</FieldLabel>
          <Input id="webhook-url" inputMode="url" onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/webhooks/lobbystack" value={url} />
          <FieldDescription>{t("webhooks.form.urlHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="webhook-description">{t("webhooks.form.descriptionLabel")}</FieldLabel>
          <Input id="webhook-description" maxLength={200} onChange={(event) => setDescription(event.target.value)} placeholder={t("webhooks.form.descriptionPlaceholder")} value={description} />
        </Field>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">{t("webhooks.form.eventsLabel")}</legend>
          {webhookEventTypes.map((event) => (
            <label className="flex items-start gap-3 text-sm" key={event}>
              <Checkbox checked={events.includes(event)} onCheckedChange={(checked) => setEvents((current) => checked ? [...new Set([...current, event])] : current.filter((value) => value !== event))} />
              <span className="flex flex-col gap-0.5">
                <code className="font-mono text-xs">{event}</code>
                <span className="text-muted-foreground">{t(`webhooks.events.${eventKey(event)}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </FieldGroup>
      <DialogFooter>
        <Button onClick={onCancel} variant="outline">{t("webhooks.form.cancel")}</Button>
        <Button disabled={!url.trim() || events.length === 0 || pending} onClick={() => onSubmit({ url: url.trim(), description: description.trim(), events })}>{submitLabel}</Button>
      </DialogFooter>
    </>
  );
}

function DeliveryLog({ businessId, endpointId }: { businessId: string; endpointId: string }) {
  const { i18n, t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const deliveries = useQuery({ queryKey: ["webhook-deliveries", endpointId], queryFn: () => requestJson<{ deliveries: Delivery[] }>(`/api/webhook-endpoints/${encodeURIComponent(endpointId)}/deliveries?businessId=${encodeURIComponent(businessId)}`), refetchInterval: 10_000 });
  const resend = useMutation({
    mutationFn: (deliveryId: string) => requestJson(`/api/webhook-deliveries/${encodeURIComponent(deliveryId)}/resend?businessId=${encodeURIComponent(businessId)}`, { method: "POST" }),
    onSuccess: async () => { toast.success(t("webhooks.deliveries.resent")); await queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", endpointId] }); },
    onError: (error) => toast.error(error.message),
  });
  const format = (value: string) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  if (deliveries.isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;
  const rows = deliveries.data?.deliveries ?? [];
  if (!rows.length) return <p className="type-body-muted py-4 text-center">{t("webhooks.deliveries.empty")}</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("webhooks.deliveries.columns.event")}</TableHead>
            <TableHead>{t("webhooks.deliveries.columns.status")}</TableHead>
            <TableHead>{t("webhooks.deliveries.columns.response")}</TableHead>
            <TableHead>{t("webhooks.deliveries.columns.attempts")}</TableHead>
            <TableHead>{t("webhooks.deliveries.columns.time")}</TableHead>
            <TableHead className="text-right"><span className="sr-only">{t("webhooks.deliveries.columns.actions")}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell><code className="font-mono text-xs">{row.eventType}</code></TableCell>
              <TableCell>
                <Badge variant={row.status === "succeeded" ? "secondary" : row.status === "failed" ? "destructive" : "outline"}>{t(`webhooks.deliveries.status.${row.status}`)}</Badge>
                {row.status === "retrying" && row.nextAttemptAt ? <p className="mt-1 text-xs text-muted-foreground">{t("webhooks.deliveries.nextAttempt", { time: format(row.nextAttemptAt) })}</p> : null}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.lastResponseStatus ?? "–"}
                {row.lastError && row.status !== "succeeded" ? <p className="max-w-64 truncate text-xs" title={row.lastError}>{row.lastError}</p> : null}
              </TableCell>
              <TableCell>{row.attemptCount}</TableCell>
              <TableCell className="text-muted-foreground">{format(row.lastAttemptAt ?? row.createdAt)}</TableCell>
              <TableCell className="text-right">
                <Button disabled={resend.isPending} onClick={() => resend.mutate(row.id)} size="sm" variant="ghost"><RefreshCw data-icon="inline-start" />{t("webhooks.deliveries.resend")}</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function LiveWebhooksSurface() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; endpoint: Endpoint } | { mode: "secret"; secret: string; title: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "rotate"; endpoint: Endpoint } | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: WorkspaceViewModel[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const query = `businessId=${encodeURIComponent(business?.businessId ?? "")}`;
  const endpoints = useQuery({ queryKey: ["webhook-endpoints", business?.businessId], queryFn: () => requestJson<{ endpoints: Endpoint[] }>(`/api/webhook-endpoints?${query}`), enabled: Boolean(business?.businessId && canManage) });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["webhook-endpoints", business?.businessId] }); };

  const create = useMutation({
    mutationFn: (value: { url: string; description: string; events: WebhookEventType[] }) => requestJson<{ secret: string }>(`/api/webhook-endpoints?${query}`, { method: "POST", body: JSON.stringify(value) }),
    onSuccess: async (result) => { setDialog({ mode: "secret", secret: result.secret, title: t("webhooks.secret.createdTitle") }); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const update = useMutation({
    mutationFn: (input: { id: string; body: Record<string, unknown> }) => requestJson(`/api/webhook-endpoints/${encodeURIComponent(input.id)}?${query}`, { method: "PATCH", body: JSON.stringify(input.body) }),
    onSuccess: async () => { setDialog(null); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => requestJson(`/api/webhook-endpoints/${encodeURIComponent(id)}?${query}`, { method: "DELETE" }),
    onSuccess: async () => { toast.success(t("webhooks.delete.done")); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const rotate = useMutation({
    mutationFn: (id: string) => requestJson<{ secret: string }>(`/api/webhook-endpoints/${encodeURIComponent(id)}/rotate-secret?${query}`, { method: "POST" }),
    onSuccess: (result) => setDialog({ mode: "secret", secret: result.secret, title: t("webhooks.secret.rotatedTitle") }),
    onError: (error) => toast.error(error.message),
  });
  const test = useMutation({
    mutationFn: (id: string) => requestJson(`/api/webhook-endpoints/${encodeURIComponent(id)}/test?${query}`, { method: "POST" }),
    onSuccess: async (_, id) => { toast.success(t("webhooks.test.queued")); setOpenLog(id); await queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", id] }); },
    onError: (error) => toast.error(error.message),
  });

  const rows = endpoints.data?.endpoints ?? [];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link className="type-body-muted inline-flex items-center gap-1 hover:text-foreground" href="/integrations"><ArrowLeft className="size-4" />{t("sections.integrations")}</Link>
        <PageHeader actions={canManage ? <Button onClick={() => setDialog({ mode: "create" })} size="sm"><Plus data-icon="inline-start" />{t("webhooks.create.action")}</Button> : undefined} title={t("webhooks.title")} />
        <p className="type-body-muted max-w-2xl">{t("webhooks.description")}</p>
      </div>

      {businesses.isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : !canManage ? (
        <Alert><AlertTitle>{t("webhooks.restricted.title")}</AlertTitle><AlertDescription>{t("webhooks.restricted.description")}</AlertDescription></Alert>
      ) : endpoints.isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : rows.length === 0 ? (
        <Surface className="p-8 text-center"><p className="type-body-muted">{t("webhooks.empty")}</p></Surface>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((endpoint) => (
            <li key={endpoint.id}>
              <Surface className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="break-all font-mono text-sm">{endpoint.url}</p>
                    {endpoint.description ? <p className="type-body-muted">{endpoint.description}</p> : null}
                    <div className="flex flex-wrap gap-1 pt-1">{endpoint.events.map((event) => <Badge key={event} variant="secondary">{event}</Badge>)}</div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Switch
                      aria-label={t("webhooks.enabledLabel")}
                      checked={endpoint.status === "enabled"}
                      disabled={update.isPending}
                      onCheckedChange={(checked) => update.mutate({ id: endpoint.id, body: { status: checked ? "enabled" : "disabled" } })}
                    />
                    <span aria-hidden="true">{endpoint.status === "enabled" ? t("webhooks.status.enabled") : t("webhooks.status.disabled")}</span>
                  </div>
                </div>
                {endpoint.disabled_reason === "failing" ? <Alert variant="destructive"><AlertTitle>{t("webhooks.failing.title")}</AlertTitle><AlertDescription>{t("webhooks.failing.description")}</AlertDescription></Alert> : null}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setOpenLog(openLog === endpoint.id ? null : endpoint.id)} size="sm" variant="outline">{openLog === endpoint.id ? t("webhooks.deliveries.hide") : t("webhooks.deliveries.show")}</Button>
                  <Button disabled={test.isPending} onClick={() => test.mutate(endpoint.id)} size="sm" variant="outline"><Send data-icon="inline-start" />{t("webhooks.test.action")}</Button>
                  <Button onClick={() => setDialog({ mode: "edit", endpoint })} size="sm" variant="ghost">{t("webhooks.edit.action")}</Button>
                  <Button onClick={() => setConfirm({ kind: "rotate", endpoint })} size="sm" variant="ghost">{t("webhooks.rotate.action")}</Button>
                  <Button onClick={() => setConfirm({ kind: "delete", endpoint })} size="sm" variant="ghost"><Trash2 data-icon="inline-start" />{t("webhooks.delete.action")}</Button>
                </div>
                {openLog === endpoint.id && business ? <DeliveryLog businessId={business.businessId} endpointId={endpoint.id} /> : null}
              </Surface>
            </li>
          ))}
        </ul>
      )}

      <Dialog onOpenChange={(open) => { if (!open) setDialog(null); }} open={dialog !== null}>
        <DialogContent className="sm:max-w-lg">
          {dialog?.mode === "secret" ? (
            <>
              <DialogHeader><DialogTitle>{dialog.title}</DialogTitle><DialogDescription>{t("webhooks.secret.description")}</DialogDescription></DialogHeader>
              <SecretReveal value={dialog.secret} warning={t("webhooks.secret.warning")} />
              <DialogFooter><Button onClick={() => setDialog(null)}>{t("webhooks.secret.done")}</Button></DialogFooter>
            </>
          ) : dialog?.mode === "edit" ? (
            <>
              <DialogHeader><DialogTitle>{t("webhooks.edit.title")}</DialogTitle><DialogDescription>{t("webhooks.edit.description")}</DialogDescription></DialogHeader>
              <EndpointForm initial={dialog.endpoint} onCancel={() => setDialog(null)} onSubmit={(value) => update.mutate({ id: dialog.endpoint.id, body: value })} pending={update.isPending} submitLabel={t("webhooks.edit.submit")} />
            </>
          ) : dialog?.mode === "create" ? (
            <>
              <DialogHeader><DialogTitle>{t("webhooks.create.title")}</DialogTitle><DialogDescription>{t("webhooks.create.description")}</DialogDescription></DialogHeader>
              <EndpointForm onCancel={() => setDialog(null)} onSubmit={(value) => create.mutate(value)} pending={create.isPending} submitLabel={t("webhooks.create.submit")} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        cancelLabel={t("webhooks.form.cancel")}
        confirmLabel={confirm?.kind === "delete" ? t("webhooks.delete.confirm") : t("webhooks.rotate.confirm")}
        confirmVariant={confirm?.kind === "delete" ? "destructive" : "default"}
        description={confirm?.kind === "delete" ? t("webhooks.delete.description", { url: confirm.endpoint.url }) : t("webhooks.rotate.description")}
        onConfirm={async () => {
          if (!confirm) return;
          if (confirm.kind === "delete") await remove.mutateAsync(confirm.endpoint.id);
          else await rotate.mutateAsync(confirm.endpoint.id);
        }}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        open={confirm !== null}
        pending={remove.isPending || rotate.isPending}
        title={confirm?.kind === "delete" ? t("webhooks.delete.title") : t("webhooks.rotate.title")}
      />
    </div>
  );
}
