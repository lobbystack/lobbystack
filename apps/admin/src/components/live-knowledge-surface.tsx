"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string };
type Document = { id: string; title: string; sourceType: string; sourceUrl: string | null; status: string; processingProgress: number; updatedAt: string };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function LiveKnowledgeSurface() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses[0];
  const documents = useQuery({ queryKey: ["knowledge", business?.businessId], queryFn: () => requestJson<{ documents: Document[] }>(`/api/knowledge?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const addWebsite = useMutation({
    mutationFn: () => requestJson<{ documentId: string }>("/api/knowledge", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, title, sourceType: "website", sourceUrl }) }),
    onSuccess: async () => {
      setTitle("");
      setSourceUrl("");
      await queryClient.invalidateQueries({ queryKey: ["knowledge", business?.businessId] });
    },
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await addWebsite.mutateAsync();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add website.");
    }
  }

  if (businesses.isLoading) return <p className="text-sm text-slate-500">Loading workspace...</p>;
  if (businesses.isError || documents.isError) return <p className="text-sm text-red-600">Knowledge sources are unavailable.</p>;
  if (!business) return <p className="text-sm text-slate-500">Create a workspace before adding knowledge.</p>;

  return <PageSurface eyebrow={business.name} title="Knowledge" description="Manage tenant-scoped documents and website sources used by receptionist retrieval.">
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Add a website source</CardTitle><CardDescription>The worker crawls the site, chunks the content, and indexes it for this workspace.</CardDescription></CardHeader>
        <CardContent><form className="grid gap-4 md:grid-cols-[1fr_1.4fr_auto] md:items-end" onSubmit={submit}><label className="space-y-2 text-sm font-medium text-slate-700">Title<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Help center" required /></label><label className="space-y-2 text-sm font-medium text-slate-700">Website URL<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com" required /></label><Button type="submit" disabled={addWebsite.isPending}>{addWebsite.isPending ? "Adding..." : "Add source"}</Button></form>{error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Sources</CardTitle><CardDescription>{documents.isLoading ? "Loading sources..." : `${documents.data?.documents.length ?? 0} source${documents.data?.documents.length === 1 ? "" : "s"} in this workspace.`}</CardDescription></CardHeader>
        <CardContent><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Source</th><th className="px-3 py-3 font-semibold">Type</th><th className="px-3 py-3 font-semibold">Progress</th><th className="px-3 py-3 font-semibold">Updated</th></tr></thead><tbody>{documents.data?.documents.map((document) => <tr className="border-b border-slate-50 last:border-0" key={document.id}><td className="px-3 py-4"><p className="font-medium text-slate-800">{document.title}</p><p className="max-w-[360px] truncate text-xs text-slate-500">{document.sourceUrl ?? "Uploaded document"}</p></td><td className="px-3 py-4 capitalize text-slate-600">{document.sourceType}</td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${document.status === "indexed" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>{document.status === "processing" ? `${document.processingProgress}%` : document.status}</span></td><td className="px-3 py-4 text-slate-600">{formatDate(document.updatedAt)}</td></tr>)}{!documents.isLoading && !documents.data?.documents.length ? <tr><td className="px-3 py-12 text-center text-slate-500" colSpan={4}>No knowledge sources yet.</td></tr> : null}</tbody></table></div></CardContent>
      </Card>
    </div>
  </PageSurface>;
}
