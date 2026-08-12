"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

type Business = { businessId: string; name: string };
type Rule = { id: string; title: string; content: string; active: boolean; sortOrder: number };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function RulesSurface() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: async () => (await requestJson<{ businesses: Business[] }>("/api/businesses")).businesses });
  const business = businesses.data?.[0];
  const rules = useQuery({ queryKey: ["rules", business?.businessId], enabled: Boolean(business), queryFn: async () => await requestJson<Rule[]>(`/api/rules?businessId=${encodeURIComponent(business?.businessId ?? "")}`) });
  const create = useMutation({ mutationFn: async () => await requestJson<string>(`/api/rules?businessId=${encodeURIComponent(business?.businessId ?? "")}`, { method: "POST", body: JSON.stringify({ title, content }) }), onSuccess: async () => { setTitle(""); setContent(""); await queryClient.invalidateQueries({ queryKey: ["rules", business?.businessId] }); } });
  const update = useMutation({ mutationFn: async (input: { ruleId: string; active: boolean }) => await requestJson<{ ok: boolean }>(`/api/rules?businessId=${encodeURIComponent(business?.businessId ?? "")}`, { method: "PATCH", body: JSON.stringify(input) }), onSuccess: async () => await queryClient.invalidateQueries({ queryKey: ["rules", business?.businessId] }) });
  const remove = useMutation({ mutationFn: async (ruleId: string) => await requestJson<{ ok: boolean }>(`/api/rules?businessId=${encodeURIComponent(business?.businessId ?? "")}`, { method: "DELETE", body: JSON.stringify({ ruleId }) }), onSuccess: async () => await queryClient.invalidateQueries({ queryKey: ["rules", business?.businessId] }) });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try { await create.mutateAsync(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create rule."); }
  }

  if (businesses.isLoading) return <p className="text-sm text-slate-500">Loading workspace...</p>;
  if (!business) return <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"><h1 className="text-xl font-semibold text-slate-950">Rules</h1><p className="mt-2 text-sm text-slate-500">Create a workspace before adding receptionist rules.</p></section>;

  return <div className="space-y-8"><header><p className="text-sm font-medium text-teal-700">{business.name}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Receptionist rules</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Give the receptionist explicit, ordered behavior rules. Rules stay separate from retrieved knowledge.</p></header><section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">Add a rule</h2><form className="mt-4 space-y-4" onSubmit={submit}><input className="min-h-11 w-full rounded-xl border border-slate-200 px-3" placeholder="Rule title" value={title} onChange={(event) => setTitle(event.target.value)} required /><textarea className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-3" placeholder="Example: Escalate urgent safety issues to a human immediately." value={content} onChange={(event) => setContent(event.target.value)} required />{error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<button className="rounded-xl bg-teal-700 px-4 py-3 text-sm font-medium text-white disabled:opacity-60" disabled={create.isPending} type="submit">{create.isPending ? "Adding..." : "Add rule"}</button></form></section><section className="space-y-3">{rules.isLoading ? <p className="text-sm text-slate-500">Loading rules...</p> : rules.data?.length ? rules.data.map((rule) => <article className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between" key={rule.id}><div><div className="flex items-center gap-3"><h2 className="font-semibold text-slate-950">{rule.title}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{rule.active ? "Active" : "Paused"}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{rule.content}</p></div><div className="flex shrink-0 gap-2"><button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" onClick={() => update.mutate({ ruleId: rule.id, active: !rule.active })}>{rule.active ? "Pause" : "Activate"}</button><button className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700" onClick={() => remove.mutate(rule.id)}>Delete</button></div></article>) : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No rules yet.</div>}</section></div>;
}
