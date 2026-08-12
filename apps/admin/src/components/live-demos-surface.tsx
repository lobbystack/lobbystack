"use client";

import { ExternalLink, KeyRound, Plus, RefreshCw, Rocket, ShieldX } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Demo = { demoId: string; businessName: string; businessSlug: string; websiteUrl: string; status: string; suggestedPrompts: string[]; expiresAt: string; websiteIngestionStatus: string | null; greetingReady: boolean; snapshotReady: boolean; promptsReady: boolean };

export function LiveDemosSurface() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const response = await fetch("/api/demos");
    const body = await response.json() as { demos?: Demo[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "Unable to load prospect demos.");
    setDemos(body.demos ?? []);
    setLoading(false);
  };

  useEffect(() => { void load().catch((cause) => { setError(cause instanceof Error ? cause.message : "Unable to load prospect demos."); setLoading(false); }); }, []);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("create");
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/demos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), websiteUrl: form.get("websiteUrl"), greeting: form.get("greeting"), suggestedPrompts: String(form.get("prompts") ?? "").split("\n") }) });
    const body = await response.json() as { demoId?: string; token?: string; error?: string };
    if (!response.ok || !body.demoId || !body.token) setError(body.error ?? "Unable to create the demo.");
    else { setTokens((current) => ({ ...current, [body.demoId!]: body.token! })); event.currentTarget.reset(); await load(); }
    setBusy(null);
  };

  const act = async (demo: Demo, action: "rotate" | "publish" | "revoke") => {
    setBusy(`${demo.demoId}:${action}`);
    setError(null);
    const response = await fetch(`/api/demos/${encodeURIComponent(demo.demoId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, token: tokens[demo.demoId], suggestedPrompts: demo.suggestedPrompts }) });
    const body = await response.json() as { token?: string; error?: string };
    if (!response.ok) setError(body.error ?? `Unable to ${action} the demo.`);
    else { if (body.token) setTokens((current) => ({ ...current, [demo.demoId]: body.token! })); await load(); }
    setBusy(null);
  };

  return <PageSurface title="Prospect demos" description="Prepare isolated, expiring receptionist workspaces before sharing them with a prospect.">
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <div className="flex items-center justify-between"><p className="text-sm text-slate-500">{demos.length} demo{demos.length === 1 ? "" : "s"}</p><Button variant="ghost" onClick={() => void load()} disabled={loading}><RefreshCw className="size-4" />Refresh</Button></div>
        {loading ? <Card><CardContent className="py-16 text-center text-sm text-slate-500">Loading demos...</CardContent></Card> : null}
        {!loading && demos.length === 0 ? <Card><CardContent className="py-16 text-center text-sm text-slate-500">No prospect demos have been prepared yet.</CardContent></Card> : null}
        {demos.map((demo) => {
          const ready = demo.websiteIngestionStatus === "completed" && demo.snapshotReady && demo.greetingReady && demo.promptsReady;
          const token = tokens[demo.demoId];
          const hasDemoUrl = Boolean(token);
          return <Card key={demo.demoId}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{demo.businessName}</CardTitle><CardDescription>{demo.websiteUrl}</CardDescription></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{demo.status}</span></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 text-sm sm:grid-cols-3"><span>Ingestion: <strong>{demo.websiteIngestionStatus ?? "pending"}</strong></span><span>Snapshot: <strong>{demo.snapshotReady ? "ready" : "pending"}</strong></span><span>Prompts: <strong>{demo.promptsReady ? "ready" : "missing"}</strong></span></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void act(demo, "rotate")} disabled={busy !== null || demo.status === "claimed" || demo.status === "revoked"}><KeyRound className="size-4" />Rotate link</Button><Button onClick={() => void act(demo, "publish")} disabled={busy !== null || !ready || !token || demo.status === "active"}><Rocket className="size-4" />Publish</Button><Button variant="destructive" onClick={() => void act(demo, "revoke")} disabled={busy !== null || demo.status === "claimed" || demo.status === "revoked"}><ShieldX className="size-4" />Revoke</Button>{hasDemoUrl ? <Button variant="ghost" onClick={() => window.open(`/demo#${new URLSearchParams({ prospect_demo_token: token! })}`, "_blank", "noopener,noreferrer")}><ExternalLink className="size-4" />Open secure link</Button> : null}</div>{!token && demo.status !== "claimed" && demo.status !== "revoked" ? <p className="text-xs text-amber-700">Rotate the link in this session before publishing or sharing it. Raw tokens are never stored.</p> : null}</CardContent></Card>;
        })}
      </div>
      <Card className="h-fit xl:sticky xl:top-6"><CardHeader><CardTitle>Prepare a demo</CardTitle><CardDescription>The workspace starts private while its public website is indexed.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={(event) => void create(event)}><label className="block space-y-2 text-sm font-medium">Business name<input name="name" required className="w-full rounded-xl border px-4 py-3 font-normal" /></label><label className="block space-y-2 text-sm font-medium">Website URL<input name="websiteUrl" type="url" required placeholder="https://example.com" className="w-full rounded-xl border px-4 py-3 font-normal" /></label><label className="block space-y-2 text-sm font-medium">Greeting<input name="greeting" className="w-full rounded-xl border px-4 py-3 font-normal" /></label><label className="block space-y-2 text-sm font-medium">Suggested prompts<textarea name="prompts" required rows={5} placeholder={"What services do you offer?\nCan I request a quote?"} className="w-full resize-y rounded-xl border px-4 py-3 font-normal" /></label><Button type="submit" className="w-full" disabled={busy !== null}><Plus className="size-4" />Create isolated demo</Button>{error ? <p className="text-sm text-red-600">{error}</p> : null}</form></CardContent></Card>
    </div>
  </PageSurface>;
}
