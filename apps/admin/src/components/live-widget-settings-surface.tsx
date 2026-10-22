"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { Check, CircleCheck, Copy, Globe, MessageCircle, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { isInterfaceLocale, widgetEmbedSnippet, type InterfaceLocale } from "@lobbystack/shared";

import { requestJson } from "@/lib/request-json";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { cn } from "@/lib/utils";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { LiveNotificationSettingsSurface } from "./live-notification-settings-surface";
import { PageSurface } from "./page-surface";
import { SectionBlock } from "./section-block";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "./ui/field";
import { Input } from "./ui/input";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import { Skeleton } from "./ui/skeleton";
import { surfaceClassName } from "./ui/surface";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { readableOn } from "./widget/widget-parts";
import { WidgetPreview } from "./widget/widget-preview";
import { intlLocale } from "@/lib/locale";


/** Languages the widget interface can be forced to, with their settings label keys. */
const WIDGET_LOCALE_OPTIONS: Array<{ value: InterfaceLocale; labelKey: string }> = [
  { value: "en", labelKey: "widget.locales.english" },
  { value: "fr", labelKey: "widget.locales.french" },
  { value: "es", labelKey: "widget.locales.spanish" },
  { value: "sr", labelKey: "widget.locales.serbian" },
];
type WidgetPosition = "bottom-right" | "bottom-left";
type WidgetKeyConfig = { color?: string; position?: WidgetPosition; title?: string; subtitle?: string; greeting?: string; localeOverride?: InterfaceLocale; leadForm?: { enabled?: boolean; requirePhone?: boolean; requireEmail?: boolean; showBeforeChat?: boolean }; liveChat?: { enabled: boolean } };
// `key` is null for revoked keys and for keys created before keys were kept.
type WidgetKeyRecord = { id: string; key: string | null; label: string | null; status: "active" | "disabled" | "revoked"; allowedOrigins: string[]; config: WidgetKeyConfig; lastUsedAt: string | null; createdAt: string };
type KeysResponse = { keys: WidgetKeyRecord[] };
type CreatedKey = { id: string; key: string } | null;
/** What the form edits. Text fields stay untrimmed while the operator types. */
type WidgetDraft = { label: string; origins: string; color: string; position: WidgetPosition; title: string; subtitle: string; greeting: string; localeOverride: "" | InterfaceLocale; leadEnabled: boolean; leadRequireEmail: boolean; leadRequirePhone: boolean; leadShowBeforeChat: boolean; liveChatEnabled: boolean };
type Editing = { mode: "create" } | { mode: "edit"; row: WidgetKeyRecord };
const DEFAULT_COLOR = "#18181b";
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

function originsFromText(value: string): string[] {
  return value.split(/\s*[\n,]\s*/).map((item) => item.trim()).filter(Boolean);
}

// The origins field is a single-line input, which strips newlines, so join with commas.
function originsToText(origins: string[]): string {
  return origins.join(", ");
}

function draftFrom(row?: WidgetKeyRecord): WidgetDraft {
  const config = row?.config ?? {};
  return {
    label: row?.label ?? "",
    origins: originsToText(row?.allowedOrigins ?? []),
    color: config.color ?? DEFAULT_COLOR,
    position: config.position ?? "bottom-right",
    title: config.title ?? "",
    subtitle: config.subtitle ?? "",
    greeting: config.greeting ?? "",
    localeOverride: config.localeOverride ?? "",
    leadEnabled: Boolean(config.leadForm?.enabled),
    leadRequireEmail: Boolean(config.leadForm?.requireEmail),
    leadRequirePhone: Boolean(config.leadForm?.requirePhone),
    leadShowBeforeChat: Boolean(config.leadForm?.showBeforeChat),
    liveChatEnabled: Boolean(config.liveChat?.enabled),
  };
}

/** The saved config replaces the old one whole, so an emptied field is left out and goes back to its default. */
function configFrom(draft: WidgetDraft): WidgetKeyConfig {
  return {
    color: draft.color,
    position: draft.position,
    ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
    ...(draft.subtitle.trim() ? { subtitle: draft.subtitle.trim() } : {}),
    ...(draft.greeting.trim() ? { greeting: draft.greeting.trim() } : {}),
    ...(draft.localeOverride ? { localeOverride: draft.localeOverride } : {}),
    leadForm: { enabled: draft.leadEnabled, requireEmail: draft.leadRequireEmail, requirePhone: draft.leadRequirePhone, showBeforeChat: draft.leadShowBeforeChat },
    liveChat: { enabled: draft.liveChatEnabled },
  };
}

/** Copies text and says so for a moment. */
function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return [copied, (text) => { void navigator.clipboard?.writeText(text); setCopied(true); }];
}

export function LiveWidgetSettingsSurface() {
  const { i18n, t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [createdKey, setCreatedKey] = useState<CreatedKey>(null);
  const [revoking, setRevoking] = useState<WidgetKeyRecord | null>(null);
  const { businesses, business } = useActiveBusiness();
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: () => requestJson<{ widgetIssuanceEnabled?: boolean }>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const keys = useQuery({ queryKey: ["widget-keys", business?.businessId], queryFn: () => requestJson<KeysResponse>(`/api/widget-keys?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const refreshKeys = () => queryClient.invalidateQueries({ queryKey: ["widget-keys", business?.businessId] });

  const create = useMutation({
    mutationFn: async (draft: WidgetDraft) => await requestJson<{ key: { id: string; key: string } }>(`/api/widget-keys?businessId=${encodeURIComponent(business!.businessId)}`, {
      method: "POST",
      body: JSON.stringify({ ...(draft.label.trim() ? { label: draft.label.trim() } : {}), allowedOrigins: originsFromText(draft.origins), config: configFrom(draft) }),
    }),
    onSuccess: async (result) => {
      setCreatedKey(result.key);
      await refreshKeys();
    },
    meta: { inlineError: true },
  });

  const patch = useMutation({
    mutationFn: async ({ row, draft }: { row: WidgetKeyRecord; draft: WidgetDraft }) => await requestJson(`/api/widget-keys?businessId=${encodeURIComponent(business!.businessId)}&id=${encodeURIComponent(row.id)}`, { method: "PATCH", body: JSON.stringify({ label: draft.label.trim() || (row.label ?? ""), allowedOrigins: originsFromText(draft.origins), config: configFrom(draft) }) }),
    onSuccess: async () => {
      setEditing(null);
      toast.success(t("widget.keys.saved"));
      await refreshKeys();
    },
    meta: { inlineError: true },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "disabled" | "revoked" }) => await requestJson(`/api/widget-keys?businessId=${encodeURIComponent(business!.businessId)}&id=${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: async () => await refreshKeys(),
  });

  // Revoked keys go last: they only stay listed as a record.
  const rows = (keys.data?.keys ?? []).toSorted((a, b) => Number(a.status === "revoked") - Number(b.status === "revoked"));
  const embedOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const issuanceEnabled = billing.data?.widgetIssuanceEnabled === true;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const keyName = (row: WidgetKeyRecord) => row.label || t("widget.keys.untitled");
  const openCreate = () => { create.reset(); setCreatedKey(null); setEditing({ mode: "create" }); };
  const closeDialog = () => { setEditing(null); setCreatedKey(null); };
  const newKeyButton = issuanceEnabled ? <Button onClick={openCreate}><Plus data-icon="inline-start" />{t("widget:manage.newKey")}</Button> : null;

  return (
    <PageSurface title={t("widget.title")}>
      {!issuanceEnabled && billing.isSuccess ? (
        <Alert>
          <AlertTitle>{t("widget.restricted.title")}</AlertTitle>
          <AlertDescription>{t("widget.restricted.description")}</AlertDescription>
        </Alert>
      ) : null}

      <SectionBlock title={t("widget.keys.title")} description={t("widget.create.description")} action={rows.length ? newKeyButton : null}>
        {businesses.isLoading || keys.isLoading ? (
          <div className="flex flex-col gap-3" role="status" aria-label={t("widget.keys.loading")}>
            <Skeleton className="h-[88px] w-full rounded-xl" />
            <Skeleton className="h-[88px] w-full rounded-xl" />
          </div>
        ) : businesses.isError || keys.isError ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-destructive">{t("widget.keys.unavailable")}</p>
        ) : rows.length ? (
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <WidgetKeyCard
                key={row.id}
                row={row}
                name={keyName(row)}
                busy={setStatus.isPending}
                embedOrigin={embedOrigin}
                locale={locale}
                onEdit={() => { patch.reset(); setEditing({ mode: "edit", row }); }}
                onStatus={(status) => setStatus.mutate({ id: row.id, status })}
                onRevoke={() => setRevoking(row)}
                t={t}
              />
            ))}
            {setStatus.isError ? <p className="text-sm text-destructive">{setStatus.error.message}</p> : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><MessageCircle className="size-6" /></span>
            <div className="flex max-w-sm flex-col gap-1">
              <p className="type-item-title">{t("widget.keys.empty")}</p>
              {issuanceEnabled ? <p className="type-body-muted">{t("widget:manage.emptyDescription")}</p> : null}
            </div>
            {newKeyButton}
          </div>
        )}
      </SectionBlock>

      <LiveNotificationSettingsSurface widgetOnly />

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className={cn("flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0", createdKey ? "sm:max-w-lg" : "sm:max-w-5xl")}>
          {createdKey ? (
            <CreatedKeyView createdKey={createdKey} embedOrigin={embedOrigin} onDone={closeDialog} t={t} />
          ) : editing ? (
            <WidgetKeyForm
              key={editing.mode === "edit" ? editing.row.id : "new"}
              editing={editing}
              businessName={business?.name}
              embedOrigin={embedOrigin}
              pending={editing.mode === "edit" ? patch.isPending : create.isPending}
              error={editing.mode === "edit" ? (patch.isError ? patch.error.message : null) : (create.isError ? create.error.message : null)}
              onCancel={closeDialog}
              onSubmit={(draft) => editing.mode === "edit" ? patch.mutate({ row: editing.row, draft }) : create.mutate(draft)}
              name={editing.mode === "edit" ? keyName(editing.row) : ""}
              t={t}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        cancelLabel={t("widget:manage.cancel")}
        confirmLabel={t("widget.keys.revoke")}
        confirmVariant="destructive"
        description={t("widget:manage.revokeDescription")}
        onConfirm={async () => { if (revoking) await setStatus.mutateAsync({ id: revoking.id, status: "revoked" }); }}
        onOpenChange={(open) => { if (!open) setRevoking(null); }}
        open={revoking !== null}
        pending={setStatus.isPending}
        title={t("widget:manage.revokeTitle", { name: revoking ? keyName(revoking) : "" })}
      />
    </PageSurface>
  );
}

const STATUS_DOT: Record<WidgetKeyRecord["status"], string> = { active: "bg-emerald-500", disabled: "bg-amber-500", revoked: "bg-muted-foreground/50" };

function WidgetKeyCard({ row, name, busy, embedOrigin, locale, onEdit, onStatus, onRevoke, t }: { row: WidgetKeyRecord; name: string; busy: boolean; embedOrigin: string; locale: string; onEdit: () => void; onStatus: (status: "active" | "disabled") => void; onRevoke: () => void; t: TFunction<"settings"> }) {
  const [copied, copy] = useCopy();
  const revoked = row.status === "revoked";
  const color = row.config.color ?? DEFAULT_COLOR;
  return (
    <article className={cn(surfaceClassName, "flex flex-col gap-4 p-4 sm:flex-row sm:items-center", revoked && "bg-muted/30")}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {/* The key's own bubble, so each widget is recognizable at a glance. */}
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", revoked && "grayscale opacity-50")} style={{ backgroundColor: color, color: readableOn(color) }} aria-hidden="true"><MessageCircle className="size-5" /></span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="type-item-title truncate">{name}</h3>
            <Badge variant="outline"><span className={cn("size-1.5 rounded-full", STATUS_DOT[row.status])} aria-hidden="true" />{t(`widget.status.${row.status}`)}</Badge>
          </div>
          <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"><Globe className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{row.allowedOrigins.join(", ")}</span></p>
          <p className="text-xs text-muted-foreground">{row.lastUsedAt ? t("widget.keys.lastUsed", { date: new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(new Date(row.lastUsedAt)) }) : t("widget:manage.neverUsed")}</p>
        </div>
      </div>
      {!revoked ? (
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          {row.key ? <Button size="sm" variant="outline" onClick={() => copy(widgetEmbedSnippet(embedOrigin, row.key!))}>{copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied ? t("widget.keys.snippetCopied") : t("widget:manage.copySnippet")}</Button> : null}
          <Button size="sm" variant="outline" onClick={onEdit}><Pencil data-icon="inline-start" />{t("widget:manage.edit")}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button aria-label={t("widget:manage.moreActions", { name })} size="icon-sm" variant="ghost" disabled={busy} />}><MoreHorizontal /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuGroup>
                {row.status === "active"
                  ? <DropdownMenuItem onClick={() => onStatus("disabled")}><Pause />{t("widget.keys.pause")}</DropdownMenuItem>
                  : <DropdownMenuItem onClick={() => onStatus("active")}><Play />{t("widget.keys.resume")}</DropdownMenuItem>}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onClick={onRevoke}><Trash2 />{t("widget.keys.revoke")}</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </article>
  );
}

function CreatedKeyView({ createdKey, embedOrigin, onDone, t }: { createdKey: NonNullable<CreatedKey>; embedOrigin: string; onDone: () => void; t: TFunction<"settings"> }) {
  const [keyCopied, copyKey] = useCopy();
  const [snippetCopied, copySnippet] = useCopy();
  const snippet = widgetEmbedSnippet(embedOrigin, createdKey.key);
  return (
    <div className="flex flex-col gap-5 p-6">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><CircleCheck className="size-5 text-emerald-600" />{t("widget.created.title")}</DialogTitle>
        <DialogDescription>{t("widget:manage.createdDescription")}</DialogDescription>
      </DialogHeader>
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl bg-muted px-3 py-2 font-mono text-sm">{createdKey.key}</code>
        <Button size="sm" variant="outline" onClick={() => copyKey(createdKey.key)}>{keyCopied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{keyCopied ? t("widget.created.copied") : t("widget.created.copy")}</Button>
      </div>
      <SnippetBlock snippet={snippet} copied={snippetCopied} onCopy={() => copySnippet(snippet)} t={t} />
      <p className="text-sm text-muted-foreground">{t("widget.created.hint")}</p>
      <DialogFooter><Button onClick={onDone}>{t("widget.created.done")}</Button></DialogFooter>
    </div>
  );
}

function SnippetBlock({ snippet, copied, onCopy, t }: { snippet: string; copied: boolean; onCopy: () => void; t: TFunction<"settings"> }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("widget.keys.snippet")}</p>
        <Button size="sm" variant="outline" onClick={onCopy}>{copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied ? t("widget.keys.snippetCopied") : t("widget.created.copySnippet")}</Button>
      </div>
      <pre className="overflow-x-auto rounded-xl bg-muted p-3 font-mono text-xs leading-5" dir="ltr">{snippet}</pre>
    </div>
  );
}

function WidgetKeyForm({ editing, name, businessName, embedOrigin, pending, error, onCancel, onSubmit, t }: { editing: Editing; name: string; businessName: string | undefined; embedOrigin: string; pending: boolean; error: string | null; onCancel: () => void; onSubmit: (draft: WidgetDraft) => void; t: TFunction<"settings"> }) {
  const row = editing.mode === "edit" ? editing.row : undefined;
  const [draft, setDraft] = useState<WidgetDraft>(() => draftFrom(row));
  // The hex box can hold a half-typed color; the draft only takes a whole one.
  const [colorText, setColorText] = useState(draft.color);
  const [snippetCopied, copySnippet] = useCopy();
  const id = useId();
  const set = (patch: Partial<WidgetDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.origins.trim()) return;
    onSubmit(draft);
  };

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
      <DialogHeader className="border-b px-6 pt-6 pb-4">
        <DialogTitle>{row ? t("widget:manage.editTitle", { name }) : t("widget:manage.newKey")}</DialogTitle>
        <DialogDescription>{t("widget.create.description")}</DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_368px]">
        <FieldGroup className="min-h-0 gap-8 overflow-y-auto px-6 py-6">
          <FieldSet>
            <FieldLegend>{t("widget:manage.sections.website")}</FieldLegend>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor={`${id}-label`}>{t("widget.fields.label")}</FieldLabel>
                <Input id={`${id}-label`} value={draft.label} onChange={(event) => set({ label: event.target.value })} placeholder={t("widget.fields.labelPlaceholder")} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-origins`}>{t("widget.fields.origins")}</FieldLabel>
                <Input id={`${id}-origins`} value={draft.origins} onChange={(event) => set({ origins: event.target.value })} placeholder="https://example.com, https://www.example.com" required dir="ltr" />
                <FieldDescription>{t("widget:manage.originsHint")}</FieldDescription>
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>{t("widget:manage.sections.appearance")}</FieldLegend>
            <FieldGroup className="gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${id}-color`}>{t("widget.fields.color")}</FieldLabel>
                  <div className="flex items-center gap-2">
                    <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-foreground/25 ring-inset focus-within:ring-[3px] focus-within:ring-ring/50" style={{ backgroundColor: draft.color }}>
                      <span className="sr-only">{t("widget:manage.pickColor")}</span>
                      <input className="absolute inset-0 cursor-pointer opacity-0" type="color" value={draft.color.length === 4 ? `#${[...draft.color.slice(1)].map((digit) => digit + digit).join("")}` : draft.color} onChange={(event) => { set({ color: event.target.value }); setColorText(event.target.value); }} />
                    </label>
                    <Input id={`${id}-color`} className="font-mono" value={colorText} maxLength={7} spellCheck={false} dir="ltr" onChange={(event) => { setColorText(event.target.value); if (HEX_COLOR.test(event.target.value)) set({ color: event.target.value }); }} onBlur={() => setColorText(draft.color)} />
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-position`}>{t("widget.fields.position")}</FieldLabel>
                  <NativeSelect id={`${id}-position`} className="w-full" value={draft.position} onChange={(event) => set({ position: event.target.value as WidgetPosition })}>
                    <NativeSelectOption value="bottom-right">{t("widget.positions.bottomRight")}</NativeSelectOption>
                    <NativeSelectOption value="bottom-left">{t("widget.positions.bottomLeft")}</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-title`}>{t("widget.fields.title")}</FieldLabel>
                  <Input id={`${id}-title`} value={draft.title} maxLength={160} onChange={(event) => set({ title: event.target.value })} placeholder={t("widget.fields.titlePlaceholder")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-subtitle`}>{t("widget.fields.subtitle")}</FieldLabel>
                  <Input id={`${id}-subtitle`} value={draft.subtitle} maxLength={320} onChange={(event) => set({ subtitle: event.target.value })} placeholder={t("widget.fields.subtitlePlaceholder")} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor={`${id}-greeting`}>{t("widget.fields.greeting")}</FieldLabel>
                <Textarea id={`${id}-greeting`} className="min-h-20" value={draft.greeting} maxLength={400} onChange={(event) => set({ greeting: event.target.value })} placeholder={t("widget.fields.greetingPlaceholder")} />
              </Field>
              <Field className="sm:max-w-[calc(50%-10px)]">
                <FieldLabel htmlFor={`${id}-locale`}>{t("widget.fields.localeOverride")}</FieldLabel>
                <NativeSelect id={`${id}-locale`} className="w-full" value={draft.localeOverride} onChange={(event) => set({ localeOverride: isInterfaceLocale(event.target.value) ? event.target.value : "" })}>
                  <NativeSelectOption value="">{t("widget.locales.visitor")}</NativeSelectOption>
                  {WIDGET_LOCALE_OPTIONS.map((option) => <NativeSelectOption key={option.value} value={option.value}>{t(option.labelKey)}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <FieldDescription>{t("widget.keys.appearanceHint")}</FieldDescription>
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>{t("widget:manage.sections.conversation")}</FieldLegend>
            <FieldGroup className="gap-5">
              <div className="flex flex-col gap-4">
                <Field orientation="horizontal">
                  <FieldContent><FieldLabel htmlFor={`${id}-lead`}>{t("widget.fields.leadEnabled")}</FieldLabel></FieldContent>
                  <Switch id={`${id}-lead`} checked={draft.leadEnabled} onCheckedChange={(checked) => set({ leadEnabled: checked })} />
                </Field>
                {draft.leadEnabled ? (
                  <div className="flex flex-col gap-3 border-l-2 pl-4">
                    {([["leadRequireEmail", "widget.fields.requireEmail"], ["leadRequirePhone", "widget.fields.requirePhone"], ["leadShowBeforeChat", "widget.fields.showBeforeChat"]] as const).map(([field, labelKey]) => (
                      <Field key={field} orientation="horizontal">
                        <Checkbox id={`${id}-${field}`} checked={draft[field]} onCheckedChange={(checked) => set({ [field]: checked === true })} />
                        <FieldLabel htmlFor={`${id}-${field}`} className="font-normal">{t(labelKey)}</FieldLabel>
                      </Field>
                    ))}
                  </div>
                ) : null}
              </div>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={`${id}-live-chat`}>{t("widget.fields.liveChat")}</FieldLabel>
                  <FieldDescription>{t("widget.fields.liveChatHint")}</FieldDescription>
                </FieldContent>
                <Switch id={`${id}-live-chat`} checked={draft.liveChatEnabled} onCheckedChange={(checked) => set({ liveChatEnabled: checked })} />
              </Field>
            </FieldGroup>
          </FieldSet>

          {row && row.status !== "revoked" ? (
            row.key
              ? <SnippetBlock snippet={widgetEmbedSnippet(embedOrigin, row.key)} copied={snippetCopied} onCopy={() => copySnippet(widgetEmbedSnippet(embedOrigin, row.key!))} t={t} />
              : <p className="text-sm text-muted-foreground">{t("widget.keys.noSnippet")}</p>
          ) : null}
        </FieldGroup>
        <div className="hidden min-h-0 overflow-y-auto border-l bg-muted/40 p-6 lg:block">
          <WidgetPreview color={draft.color} position={draft.position} title={draft.title.trim() || businessName || t("widget.fields.titlePlaceholder")} subtitle={draft.subtitle.trim()} greeting={draft.greeting.trim()} />
        </div>
      </div>
      <DialogFooter className="items-center border-t px-6 py-4">
        {error ? <p className="mr-auto text-sm text-destructive" role="alert">{error}</p> : null}
        <Button type="button" variant="outline" onClick={onCancel}>{t("widget:manage.cancel")}</Button>
        <Button type="submit" loading={pending} disabled={!draft.origins.trim()}>{row ? t("widget.keys.save") : t("widget.create.action")}</Button>
      </DialogFooter>
    </form>
  );
}
