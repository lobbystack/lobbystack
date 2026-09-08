"use client";

import { ExternalLink, KeyRound, Plus, RefreshCw, Rocket, ShieldX } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { useTranslation } from "react-i18next";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { PageSurface } from "./page-surface";
import { Textarea } from "./ui/textarea";

type Demo = { demoId: string; businessName: string; businessSlug: string; websiteUrl: string; status: string; suggestedPrompts: string[]; expiresAt: string; websiteIngestionStatus: string | null; greetingReady: boolean; snapshotReady: boolean; promptsReady: boolean };

export function LiveDemosSurface() {
  const { t, i18n } = useTranslation("demos");
  const [demos, setDemos] = useState<Demo[]>([]);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/demos");
      const body = await response.json() as { demos?: Demo[] };
      if (!response.ok) throw new Error("Demo list unavailable");
      setDemos(body.demos ?? []);
    } catch {
      setError(t("operator.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy("create");
    setError(null);
    try {
      const response = await fetch("/api/demos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), websiteUrl: form.get("websiteUrl"), greeting: form.get("greeting"), locale: i18n.language.startsWith("fr") ? "fr" : "en", suggestedPrompts: String(form.get("prompts") ?? "").split("\n") }) });
      const body = await response.json() as { demoId?: string; token?: string };
      if (!response.ok || !body.demoId || !body.token) throw new Error("Demo creation failed");
      setTokens(current => ({ ...current, [body.demoId!]: body.token! }));
      element.reset();
      await load();
    } catch {
      setError(t("operator.errors.create"));
    } finally {
      setBusy(null);
    }
  };

  const act = async (demo: Demo, action: "rotate" | "publish" | "revoke") => {
    setBusy(`${demo.demoId}:${action}`);
    setError(null);
    try {
      const response = await fetch(`/api/demos/${encodeURIComponent(demo.demoId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, token: tokens[demo.demoId], suggestedPrompts: demo.suggestedPrompts }) });
      const body = await response.json() as { token?: string };
      if (!response.ok) throw new Error("Demo action failed");
      if (body.token) setTokens(current => ({ ...current, [demo.demoId]: body.token! }));
      await load();
    } catch {
      setError(t(`operator.errors.${action}`));
    } finally {
      setBusy(null);
    }
  };

  return <PageSurface title={t("operator.title")} description={t("operator.description")}>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{t("operator.count", { count: demos.length })}</p><Button variant="ghost" onClick={() => void load()} disabled={loading}><RefreshCw className="size-4" />{t("operator.refresh")}</Button></div>
        {loading ? <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">{t("operator.loading")}</CardContent></Card> : null}
        {!loading && demos.length === 0 ? <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">{t("operator.empty")}</CardContent></Card> : null}
        {demos.map((demo) => {
          const ready = demo.websiteIngestionStatus === "completed" && demo.snapshotReady && demo.greetingReady && demo.promptsReady;
          const token = tokens[demo.demoId];
          const hasDemoUrl = Boolean(token);
          return <Card key={demo.demoId}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{demo.businessName}</CardTitle><CardDescription>{demo.websiteUrl}</CardDescription></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`operator.statuses.${demo.status}`, { defaultValue: demo.status })}</span></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 text-sm sm:grid-cols-3"><span>{t("operator.ingestion")} <strong>{t(`operator.statuses.${demo.websiteIngestionStatus ?? "pending"}`, { defaultValue: demo.websiteIngestionStatus ?? "pending" })}</strong></span><span>{t("operator.snapshot")} <strong>{t(demo.snapshotReady ? "operator.statuses.ready" : "operator.statuses.pending")}</strong></span><span>{t("operator.prompts")} <strong>{t(demo.promptsReady ? "operator.statuses.ready" : "operator.statuses.missing")}</strong></span></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void act(demo, "rotate")} disabled={busy !== null || demo.status === "claimed" || demo.status === "revoked"}><KeyRound className="size-4" />{t("operator.rotate")}</Button><Button onClick={() => void act(demo, "publish")} disabled={busy !== null || !ready || !token || demo.status === "active"}><Rocket className="size-4" />{t("operator.publish")}</Button><Button variant="destructive" onClick={() => void act(demo, "revoke")} disabled={busy !== null || demo.status === "claimed" || demo.status === "revoked"}><ShieldX className="size-4" />{t("operator.revoke")}</Button>{hasDemoUrl ? <Button variant="ghost" onClick={() => window.open(`/demo#${new URLSearchParams({ prospect_demo_token: token! })}`, "_blank", "noopener,noreferrer")}><ExternalLink className="size-4" />{t("operator.openLink")}</Button> : null}</div>{!token && demo.status !== "claimed" && demo.status !== "revoked" ? <p className="text-xs text-muted-foreground">{t("operator.tokenHint")}</p> : null}</CardContent></Card>;
        })}
      </div>
      <Card className="h-fit xl:sticky xl:top-6"><CardHeader><CardTitle>{t("operator.prepare")}</CardTitle><CardDescription>{t("operator.prepareDescription")}</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={(event) => void create(event)}><label className="block space-y-2 text-sm font-medium">{t("operator.businessName")}<Input name="name" required className="font-normal" /></label><label className="block space-y-2 text-sm font-medium">{t("operator.websiteUrl")}<Input name="websiteUrl" type="url" required placeholder="https://example.com" className="font-normal" /></label><label className="block space-y-2 text-sm font-medium">{t("operator.greeting")}<Input name="greeting" className="font-normal" /></label><label className="block space-y-2 text-sm font-medium">{t("operator.suggestedPrompts")}<Textarea name="prompts" required rows={5} placeholder={t("operator.promptsPlaceholder")} className="resize-y font-normal" /></label><Button type="submit" className="w-full" disabled={busy !== null}><Plus className="size-4" />{t("operator.create")}</Button>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</form></CardContent></Card>
    </div>
  </PageSurface>;
}
