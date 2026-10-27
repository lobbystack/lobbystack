"use client";

import { ExternalLink, KeyRound, LogIn, Plus, RefreshCw, Rocket, ShieldX, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { useTranslation } from "react-i18next";

import type { PartnerAccessLevel } from "@lobbystack/shared";
import { intlLocale } from "@/lib/locale";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { AccessLevelOptions } from "./partner-access-level-options";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { PageHeader } from "./page-header";
import { Surface } from "@/components/ui/surface";
import { PageSurface } from "./page-surface";
import { Textarea } from "./ui/textarea";

type Demo = {
  demoId: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  websiteUrl: string;
  status: string;
  suggestedPrompts: string[];
  expiresAt: string;
  websiteIngestionStatus: string | null;
  websiteIngestionError?: string | null;
  greetingReady: boolean;
  snapshotReady: boolean;
  promptsReady: boolean;
  /** A partner's demos only: the access level its operators get once claimed, and its usage this month. */
  accessLevel?: PartnerAccessLevel;
  usage?: { voiceSeconds: number; chats: number };
};

/** A change the partner console made to one of its demos, once the server accepted it. */
export type PartnerDemoChange =
  | { action: "created"; demoId: string; businessId: string; accessLevel: PartnerAccessLevel }
  | { action: "published" | "revoked" | "opened" | "deleted"; demoId: string; businessId: string };

/** The partner whose demos the page manages from its console, in place of the host's demo operator's. */
export type PartnerDemosOptions = {
  partnerId: string;
  /** Whether the person is an owner or admin, who picks the access level a demo gives once claimed and deletes closed demos. */
  canManage: boolean;
  onChange?: ((change: PartnerDemoChange) => void) | undefined;
};

/** A demo's link for this session. Only the server sees the raw token once, so the page keeps it until it reloads. */
type DemoLink = { token: string; url: string };

/** Where a host demo's token opens: the public demo page on this domain. */
function hostDemoUrl(token: string): string {
  return `/demo#${new URLSearchParams({ prospect_demo_token: token })}`;
}

/**
 * Prepares, publishes and closes prospect demos. The host's demo operator
 * uses it on /demos. With `partner`, it's the partner console's Demos page:
 * everyone on the team sees and manages the partner's demos, sees each one's
 * usage this month, and opens it to work inside it. Owners and admins also
 * pick the access level a demo gives once claimed, and delete a closed demo
 * nobody claimed. A partner's demo link opens on the partner's domain.
 */
export function LiveDemosSurface({ partner }: { partner?: PartnerDemosOptions } = {}) {
  // A partner's demos also name access levels in the console's own words.
  const { t, i18n } = useTranslation(partner ? ["demos", "partner"] : "demos");
  const [demos, setDemos] = useState<Demo[]>([]);
  const [links, setLinks] = useState<Record<string, DemoLink>>({});
  const [accessLevel, setAccessLevel] = useState<PartnerAccessLevel>("full");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // The form's own error, shown inside it, apart from a list that didn't load.
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The closed demo the delete confirmation asks about.
  const [deleting, setDeleting] = useState<Demo | null>(null);
  // The partner console prepares a demo in a dialog, as its other pages create things.
  const [createOpen, setCreateOpen] = useState(false);
  const partnerId = partner?.partnerId;
  const canManage = partner?.canManage === true;
  const onChange = partner?.onChange;
  const listUrl = partnerId ? `/api/partner/demos?partnerId=${encodeURIComponent(partnerId)}` : "/api/demos";
  const createUrl = partnerId ? "/api/partner/demos" : "/api/demos";
  const actionUrl = (demoId: string) => partnerId ? `/api/partner/demos/${encodeURIComponent(demoId)}` : `/api/demos/${encodeURIComponent(demoId)}`;
  const scope = partnerId ? { partnerId } : {};
  const locale = intlLocale(i18n.language);
  const formatMinutes = (seconds: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.round((seconds / 60) * 10) / 10);
  const formatCount = (count: number) => new Intl.NumberFormat(locale).format(count);

  const load = useCallback(async () => {
    setLoading(true);
    // A refresh starts over, so an earlier action's error goes.
    setActionError(null);
    setLoadError(null);
    try {
      const response = await fetch(listUrl);
      const body = await response.json() as { demos?: Demo[] };
      if (!response.ok) throw new Error("Demo list unavailable");
      setDemos(body.demos ?? []);
    } catch {
      setLoadError(t("operator.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [listUrl, t]);

  useEffect(() => { void load(); }, [load]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const prompts = String(form.get("prompts") ?? "").split("\n");
    if (prompts.filter((prompt) => prompt.trim()).length < 2) {
      setError(t("operator.errors.promptsRequired"));
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const response = await fetch(createUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...scope, name: form.get("name"), websiteUrl: form.get("websiteUrl"), greeting: form.get("greeting"), locale: i18n.language.startsWith("fr") ? "fr" : "en", suggestedPrompts: prompts, ...(partnerId && canManage ? { accessLevel } : {}) }) });
      const body = await response.json() as { demoId?: string; businessId?: string; token?: string; url?: string; accessLevel?: PartnerAccessLevel; code?: string };
      if (!response.ok || !body.demoId || !body.token) throw Object.assign(new Error("Demo creation failed"), { code: body.code });
      setLinks(current => ({ ...current, [body.demoId!]: { token: body.token!, url: body.url ?? hostDemoUrl(body.token!) } }));
      if (partnerId && body.businessId) onChange?.({ action: "created", demoId: body.demoId, businessId: body.businessId, accessLevel: body.accessLevel ?? accessLevel });
      element.reset();
      setAccessLevel("full");
      setCreateOpen(false);
      await load();
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      const partnerErrors: Record<string, string> = { partner_domain_required: "operator.partner.errors.domainRequired", rate_limited: "operator.partner.errors.rateLimited" };
      setError(t(partnerId && code && partnerErrors[code] ? partnerErrors[code] : "operator.errors.create"));
    } finally {
      setBusy(null);
    }
  };

  const act = async (demo: Demo, action: "rotate" | "publish" | "revoke") => {
    setBusy(`${demo.demoId}:${action}`);
    setActionError(null);
    try {
      const response = await fetch(actionUrl(demo.demoId), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...scope, action, token: links[demo.demoId]?.token, suggestedPrompts: demo.suggestedPrompts }) });
      const body = await response.json() as { token?: string; url?: string; code?: string };
      if (!response.ok) throw Object.assign(new Error("Demo action failed"), { code: body.code });
      if (body.token) setLinks(current => ({ ...current, [demo.demoId]: { token: body.token!, url: body.url ?? hostDemoUrl(body.token!) } }));
      if (partnerId && action !== "rotate") onChange?.({ action: action === "publish" ? "published" : "revoked", demoId: demo.demoId, businessId: demo.businessId });
      await load();
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      const actionErrors: Record<string, string> = { prompts_required: "operator.errors.promptsRequired", demo_not_ready: "operator.errors.notReady" };
      setActionError(t(code && actionErrors[code] ? actionErrors[code] : `operator.errors.${action}`));
    } finally {
      setBusy(null);
    }
  };

  // Deleting a partner's closed demo deletes its business, so nothing of it stays in the console.
  const remove = async (demo: Demo) => {
    if (!partnerId) return;
    setBusy(`${demo.demoId}:delete`);
    setActionError(null);
    try {
      const response = await fetch(actionUrl(demo.demoId), { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(scope) });
      if (!response.ok) throw new Error("Demo delete failed");
      onChange?.({ action: "deleted", demoId: demo.demoId, businessId: demo.businessId });
      await load();
    } catch {
      setActionError(t("operator.partner.errors.delete"));
    } finally {
      setBusy(null);
    }
  };

  // A partner's demo is one of its businesses, so its people open it from the console like any other, on the partner's domain.
  const open = async (demo: Demo) => {
    if (!partnerId) return;
    setBusy(`${demo.demoId}:open`);
    setActionError(null);
    try {
      const response = await fetch("/api/partner/businesses/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ partnerId, businessId: demo.businessId }) });
      const body = await response.json() as { url?: string };
      if (!response.ok || !body.url) throw new Error("Demo open failed");
      onChange?.({ action: "opened", demoId: demo.demoId, businessId: demo.businessId });
      window.location.assign(body.url);
    } catch {
      setActionError(t("operator.partner.errors.open"));
      setBusy(null);
    }
  };

  const list = (
    <>
        {actionError ? <p role="alert" className="text-sm text-destructive">{actionError}</p> : null}
        {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null}
        {loading ? <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">{t("operator.loading")}</CardContent></Card> : null}
        {!loading && !loadError && demos.length === 0 ? partnerId ? (
          <Surface className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <h2 className="text-base font-medium">{t("operator.partner.emptyTitle")}</h2>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">{t("operator.partner.empty")}</p>
          </Surface>
        ) : <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">{t("operator.empty")}</CardContent></Card> : null}
        {demos.map((demo) => {
          const ingestionReady = demo.websiteIngestionStatus === "completed" || demo.websiteIngestionStatus === "unavailable";
          const ready = ingestionReady && demo.snapshotReady && demo.greetingReady && demo.promptsReady;
          const link = links[demo.demoId];
          const closed = demo.status === "claimed" || demo.status === "revoked";
          // A claimed demo is one of the partner's businesses, which the Businesses page deletes.
          const deletable = Boolean(partnerId) && canManage && (demo.status === "revoked" || (demo.status !== "claimed" && Date.parse(demo.expiresAt) <= Date.now()));
          return <Card key={demo.demoId}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{demo.businessName}</CardTitle><CardDescription>{demo.websiteUrl}</CardDescription></div><div className="flex flex-wrap items-center gap-2">{demo.accessLevel ? <Badge variant="secondary">{t(`partner:businesses.access.${demo.accessLevel}`)}</Badge> : null}<span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`operator.statuses.${demo.status}`, { defaultValue: demo.status })}</span></div></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 text-sm sm:grid-cols-3"><span>{t("operator.ingestion")} <strong>{t(`operator.statuses.${demo.websiteIngestionStatus ?? "pending"}`, { defaultValue: demo.websiteIngestionStatus ?? "pending" })}</strong></span><span>{t("operator.snapshot")} <strong>{t(demo.snapshotReady ? "operator.statuses.ready" : "operator.statuses.pending")}</strong></span><span>{t("operator.prompts")} <strong>{t(demo.promptsReady ? "operator.statuses.ready" : "operator.statuses.missing")}</strong></span></div>{demo.websiteIngestionStatus === "unavailable" ? <p className="text-sm text-muted-foreground">{t("operator.ingestionUnavailable")}</p> : demo.websiteIngestionStatus === "failed" ? <p className="text-sm text-muted-foreground" title={demo.websiteIngestionError ?? undefined}>{t("operator.ingestionFailed")}</p> : null}{demo.usage ? <p className="text-sm text-muted-foreground">{t("operator.partner.usage", { minutes: formatMinutes(demo.usage.voiceSeconds), chats: formatCount(demo.usage.chats) })}</p> : null}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void act(demo, "rotate")} disabled={busy !== null || closed}><KeyRound className="size-4" />{t("operator.rotate")}</Button><Button onClick={() => void act(demo, "publish")} disabled={busy !== null || !ready || !link || demo.status === "active"}><Rocket className="size-4" />{t("operator.publish")}</Button><Button variant="destructive" onClick={() => void act(demo, "revoke")} disabled={busy !== null || closed}><ShieldX className="size-4" />{t("operator.revoke")}</Button>{link ? <Button variant="ghost" onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}><ExternalLink className="size-4" />{t("operator.openLink")}</Button> : null}{partnerId && !closed ? <Button variant="ghost" onClick={() => void open(demo)} disabled={busy !== null}><LogIn className="size-4" />{t("operator.partner.open")}</Button> : null}{deletable ? <Button variant="ghost" onClick={() => setDeleting(demo)} disabled={busy !== null}><Trash2 className="size-4" />{t("operator.partner.delete")}</Button> : null}</div>{!link && !closed ? <p className="text-xs text-muted-foreground">{t("operator.tokenHint")}</p> : null}</CardContent></Card>;
        })}
    </>
  );
  const form = (
    <form className="flex flex-col gap-6" onSubmit={(event) => void create(event)}>
      <FieldGroup>
        <Field><FieldLabel htmlFor="demo-name">{t("operator.businessName")}</FieldLabel><Input id="demo-name" name="name" required /></Field>
        <Field><FieldLabel htmlFor="demo-website">{t("operator.websiteUrl")}</FieldLabel><Input id="demo-website" name="websiteUrl" type="url" required placeholder="https://example.com" /></Field>
        <Field><FieldLabel htmlFor="demo-greeting">{t("operator.greeting")}</FieldLabel><Input id="demo-greeting" name="greeting" /></Field>
        <Field><FieldLabel htmlFor="demo-prompts">{t("operator.suggestedPrompts")}</FieldLabel><Textarea aria-describedby="demo-prompts-hint" id="demo-prompts" name="prompts" required rows={4} placeholder={t("operator.promptsPlaceholder")} className="resize-y" /><FieldDescription id="demo-prompts-hint">{t("operator.promptsHint")}</FieldDescription></Field>
        {partnerId && canManage ? <Field><FieldLabel>{t("operator.partner.accessLabel")}</FieldLabel><AccessLevelOptions onChange={setAccessLevel} value={accessLevel} /></Field> : null}
      </FieldGroup>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy !== null}><Plus className="size-4" />{t("operator.create")}</Button>
    </form>
  );
  const content = (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{t("operator.count", { count: demos.length })}</p><Button variant="ghost" onClick={() => void load()} disabled={loading}><RefreshCw className="size-4" />{t("operator.refresh")}</Button></div>
        {list}
      </div>
      <Card className="h-fit xl:sticky xl:top-6"><CardHeader><CardTitle>{t("operator.prepare")}</CardTitle><CardDescription>{t("operator.prepareDescription")}</CardDescription></CardHeader><CardContent>{form}</CardContent></Card>
    </div>
  );
  if (partnerId) return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <Button aria-label={t("operator.refresh")} disabled={loading} onClick={() => void load()} size="sm" variant="ghost"><RefreshCw className="size-4" /></Button>
            <Dialog onOpenChange={(next) => { setCreateOpen(next); if (!next) { setError(null); setAccessLevel("full"); } }} open={createOpen}>
              <DialogTrigger render={<Button size="sm" />}>{t("operator.create")}</DialogTrigger>
              {/* The form runs taller than a laptop screen with the access levels, so it scrolls inside the window. */}
              <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t("operator.prepare")}</DialogTitle>
                  <DialogDescription>{t("operator.partner.prepareDescription")}</DialogDescription>
                </DialogHeader>
                {form}
              </DialogContent>
            </Dialog>
          </div>
        }
        title={t("partner:nav.demos")}
      />
      <div className="space-y-4">{list}</div>
      {deleting ? (
        <ConfirmActionDialog
          cancelLabel={t("operator.partner.cancel")}
          confirmLabel={t("operator.partner.deleteConfirm")}
          confirmVariant="destructive"
          description={t("operator.partner.deleteDescription")}
          onConfirm={async () => { await remove(deleting); }}
          onOpenChange={(next) => { if (!next) setDeleting(null); }}
          open
          pending={busy === `${deleting.demoId}:delete`}
          title={t("operator.partner.deleteTitle", { name: deleting.businessName })}
        />
      ) : null}
    </div>
  );
  return <PageSurface title={t("operator.title")}>{content}</PageSurface>;
}
