"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Globe, Palette, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import { PageSurface } from "./page-surface";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

type Business = { businessId: string; name: string; active: boolean };
type WidgetKeyRecord = { id: string; label: string | null; status: "active" | "disabled" | "revoked"; allowedOrigins: string[]; config: { color?: string; position?: "bottom-right" | "bottom-left" | "bottom-center"; title?: string; subtitle?: string; greeting?: string; leadForm?: { enabled?: boolean; requirePhone?: boolean; requireEmail?: boolean; showBeforeChat?: boolean } }; lastUsedAt: string | null; createdAt: string };
type KeysResponse = { keys: WidgetKeyRecord[] };
type CreatedKey = { id: string; key: string } | null;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

function originsFromText(value: string): string[] {
  return value.split(/\s*[\n,]\s*/).map((item) => item.trim()).filter(Boolean);
}

function originsToText(origins: string[]): string {
  return origins.join("\n");
}

function embedSnippet(origin: string, key: string, config: WidgetKeyRecord["config"]): string {
  const position = config.position ?? "bottom-right";
  const color = config.color ?? "#0f766e";
  return `<script src="${origin}/embed.js" data-widget-key="${key}" data-position="${position}" data-color="${color}" defer></script>`;
}

export function LiveWidgetSettingsSurface() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [origins, setOrigins] = useState("");
  const [color, setColor] = useState("#0f766e");
  const [position, setPosition] = useState<"bottom-right" | "bottom-left" | "bottom-center">("bottom-right");
  const [leadEnabled, setLeadEnabled] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedKey>(null);
  const [copied, setCopied] = useState(false);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: () => requestJson<{ account?: { plan?: string } }>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const keys = useQuery({ queryKey: ["widget-keys", business?.businessId], queryFn: () => requestJson<KeysResponse>(`/api/widget-keys?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });

  const create = useMutation({
    mutationFn: async () => await requestJson<{ key: { id: string; key: string } }>(`/api/widget-keys?businessId=${encodeURIComponent(business!.businessId)}`, {
      method: "POST",
      body: JSON.stringify({ ...(label.trim() ? { label: label.trim() } : {}), allowedOrigins: originsFromText(origins), config: { color, position, leadForm: { enabled: leadEnabled } } }),
    }),
    onSuccess: async (result) => {
      setCreatedKey(result.key);
      setLabel(""); setOrigins(""); setCopied(false);
      await queryClient.invalidateQueries({ queryKey: ["widget-keys", business?.businessId] });
    },
  });

  const patch = useMutation({
    mutationFn: async (input: { id: string; label: string; allowedOrigins: string[] }) => await requestJson(`/api/widget-keys?businessId=${encodeURIComponent(business!.businessId)}&id=${encodeURIComponent(input.id)}`, { method: "PATCH", body: JSON.stringify({ label: input.label, allowedOrigins: input.allowedOrigins }) }),
    onSuccess: async () => await queryClient.invalidateQueries({ queryKey: ["widget-keys", business?.businessId] }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "disabled" | "revoked" }) => await requestJson(`/api/widget-keys?businessId=${encodeURIComponent(business!.businessId)}&id=${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: async () => await queryClient.invalidateQueries({ queryKey: ["widget-keys", business?.businessId] }),
  });

  const rows = keys.data?.keys ?? [];
  const embedOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const plan = billing.data?.account?.plan ?? null;

  return (
    <PageSurface title="Website widget" description="Embed an AI chat widget on your website.">
      {createdKey ? (
        <Card className="border-teal-200 bg-teal-50/60">
          <CardHeader><CardTitle className="flex items-center gap-2 text-teal-900"><Check className="size-5" />Widget key created</CardTitle><CardDescription>Save this key now. You will not be able to see it again.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded-lg bg-slate-900 px-3 py-2 text-sm text-teal-200">{createdKey.key}</code>
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(createdKey.key); setCopied(true); }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy"}</Button>
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(embedSnippet(embedOrigin, createdKey.key, { color, position })); setCopied(true); }}>Copy embed snippet</Button>
            </div>
            <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-200" dir="ltr">{embedSnippet(embedOrigin, createdKey.key, { color, position })}</pre>
            <p className="text-sm text-teal-900">Add the snippet to any page on an allowed origin. The widget loads automatically.</p>
            <Button variant="ghost" size="sm" onClick={() => setCreatedKey(null)}>Done</Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="size-5 text-teal-700" />Create a widget key</CardTitle><CardDescription>Each key is tied to a workspace and its own origin allowlist.</CardDescription>{plan ? <CardDescription className="text-amber-700">This plan includes up to {plan === "free_cloud" ? "5" : plan === "starter" ? "50" : "200"} AI chat sessions per month{plan === "free_cloud" ? " (upgrade to Starter for more)" : ""}.</CardDescription> : null}</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium sm:col-span-2">Label<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Main website" /></label>
          <label className="space-y-2 text-sm font-medium sm:col-span-2">Allowed origins<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" value={origins} onChange={(event) => setOrigins(event.target.value)} placeholder="https://example.com, https://www.example.com" /></label>
          <label className="space-y-2 text-sm font-medium">Accent color<div className="flex items-center gap-2"><input className="h-11 w-16 rounded-xl border p-1" type="color" value={color} onChange={(event) => setColor(event.target.value)} /><span className="text-sm text-slate-500">{color}</span></div></label>
          <label className="space-y-2 text-sm font-medium">Position<select className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal" value={position} onChange={(event) => setPosition(event.target.value as typeof position)}><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option></select></label>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input className="size-4" type="checkbox" checked={leadEnabled} onChange={(event) => setLeadEnabled(event.target.checked)} />Enable a lead form so visitors can share their contact details</label>
          <div className="sm:col-span-2"><Button loading={create.isPending} disabled={!business || !origins.trim()} onClick={() => create.mutate()}>Create widget key</Button>{create.isError ? <p className="mt-2 text-sm text-red-600">{create.error.message}</p> : null}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><Globe className="size-5 text-teal-700" />Widget keys</CardTitle>
            <CardDescription>{business?.name ?? "Active workspace"}</CardDescription>
          </div>
          <Button variant="ghost" onClick={() => void keys.refetch()}><RefreshCw className="size-4" />Refresh</Button>
        </CardHeader>
        <CardContent>
          {businesses.isLoading || keys.isLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading widget keys...</p> : null}
          {businesses.isError || keys.isError ? <p className="py-12 text-center text-sm text-red-600">Widget keys are unavailable.</p> : null}
          {!keys.isLoading && !keys.isError ? <div className="space-y-3">
            {rows.length ? rows.map((row) => <WidgetKeyEditor key={row.id} row={row} onSave={(input) => patch.mutate(input)} onStatus={(status) => setStatus.mutate({ id: row.id, status })} busy={patch.isPending || setStatus.isPending} />) : <p className="py-12 text-center text-sm text-slate-500">No widget keys yet. Create one to embed the widget on your website.</p>}
            {patch.isError ? <p className="text-sm text-red-600">{patch.error.message}</p> : null}
          </div> : null}
        </CardContent>
      </Card>
    </PageSurface>
  );
}

function WidgetKeyEditor({ row, onSave, onStatus, busy }: { row: WidgetKeyRecord; onSave: (input: { id: string; label: string; allowedOrigins: string[] }) => void; onStatus: (status: "active" | "disabled" | "revoked") => void; busy: boolean }) {
  const [label, setLabel] = useState(row.label ?? "");
  const [origins, setOrigins] = useState(originsToText(row.allowedOrigins));
  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-slate-400" />
          <p className="font-semibold">{row.label ?? "Untitled widget"}</p>
          <Badge variant={row.status === "active" ? "default" : row.status === "disabled" ? "secondary" : "destructive"}>{row.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {row.status === "active" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus("disabled")}>Pause</Button> : row.status === "disabled" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus("active")}>Resume</Button> : null}
          {row.status !== "revoked" ? <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm("Revoke this widget key? Existing embeds will stop working.")) onStatus("revoked"); }}><Trash2 className="size-4" />Revoke</Button> : null}
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">Label<input className="min-h-10 w-full rounded-xl border border-slate-200 px-3 font-normal" value={label} onChange={(event) => setLabel(event.target.value)} /></label>
        <label className="space-y-1.5 text-sm font-medium">Allowed origins<input className="min-h-10 w-full rounded-xl border border-slate-200 px-3 font-normal" value={origins} onChange={(event) => setOrigins(event.target.value)} /></label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" disabled={busy} onClick={() => onSave({ id: row.id, label: label.trim() || (row.label ?? ""), allowedOrigins: originsFromText(origins) })}>Save</Button>
        {row.lastUsedAt ? <p className="text-xs text-slate-500">Last used {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(row.lastUsedAt))}</p> : null}
      </div>
    </article>
  );
}
