"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { selectActiveBusiness } from "@/lib/active-business";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; role: string; active: boolean };
type Rule = { id: string; title: string; content: string; active: boolean; sortOrder: number };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function RulesSurface() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState<Rule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: async () => (await requestJson<{ businesses: Business[] }>("/api/businesses")).businesses });
  const business = selectActiveBusiness(businesses.data);
  const canMutate = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const rules = useQuery({ queryKey: ["rules", business?.businessId], enabled: Boolean(business), queryFn: async () => await requestJson<Rule[]>(`/api/rules?businessId=${encodeURIComponent(business!.businessId)}`) });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["rules", business?.businessId] });
  const create = useMutation({ mutationFn: () => requestJson<string>(`/api/rules?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ title, content }) }), onSuccess: () => { setTitle(""); setContent(""); invalidate(); } });
  const update = useMutation({ mutationFn: (input: { ruleId: string; title?: string; content?: string; active?: boolean }) => requestJson<{ ok: boolean }>(`/api/rules?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify(input) }), onSuccess: () => { setEditing(null); setTitle(""); setContent(""); invalidate(); } });
  const remove = useMutation({ mutationFn: (ruleId: string) => requestJson<{ ok: boolean }>(`/api/rules?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE", body: JSON.stringify({ ruleId }) }), onSuccess: invalidate });
  const reorder = useMutation({ mutationFn: (ruleIds: string[]) => requestJson<{ ok: boolean }>(`/api/rules?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ ruleIds }) }), onSuccess: invalidate });

  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); try { if (editing) await update.mutateAsync({ ruleId: editing.id, title, content }); else await create.mutateAsync(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save rule."); } }
  function move(rule: Rule, direction: -1 | 1) { const ordered = [...(rules.data ?? [])].sort((left, right) => left.sortOrder - right.sortOrder); const index = ordered.findIndex((item) => item.id === rule.id); const next = index + direction; if (next < 0 || next >= ordered.length) return; [ordered[index], ordered[next]] = [ordered[next]!, ordered[index]!]; reorder.mutate(ordered.map((item) => item.id)); }

  if (businesses.isLoading) return <p className="text-sm text-slate-500">Loading workspace...</p>;
  if (!business) return <PageSurface title="Rules" description="Create a workspace before adding receptionist rules." />;
  return <PageSurface eyebrow={business.name} title="Receptionist rules" description="Give the receptionist explicit, ordered behavior rules. Rules stay separate from retrieved knowledge."><div className="space-y-6">{!canMutate ? <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Viewer access is read-only.</p> : null}<Card><CardHeader><CardTitle>{editing ? "Edit rule" : "Add a rule"}</CardTitle><CardDescription>Rules are applied in the order shown below.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={submit}><input aria-label="Rule title" className="min-h-11 w-full rounded-xl border px-3" disabled={!canMutate} placeholder="Rule title" value={title} onChange={(event) => setTitle(event.target.value)} required /><textarea aria-label="Rule content" className="min-h-28 w-full rounded-xl border px-3 py-3" disabled={!canMutate} placeholder="Escalate urgent safety issues to a human immediately." value={content} onChange={(event) => setContent(event.target.value)} required />{error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}<div className="flex gap-2"><Button disabled={!canMutate || create.isPending || update.isPending} type="submit">{editing ? "Save rule" : "Add rule"}</Button>{editing ? <Button type="button" variant="ghost" onClick={() => { setEditing(null); setTitle(""); setContent(""); }}>Cancel</Button> : null}</div></form></CardContent></Card><Card><CardHeader><CardTitle>Rule order</CardTitle><CardDescription>{rules.data?.length ?? 0} configured rules.</CardDescription></CardHeader><CardContent className="space-y-3">{rules.isLoading ? <p className="text-sm text-muted-foreground">Loading rules...</p> : rules.data?.length ? [...rules.data].sort((left, right) => left.sortOrder - right.sortOrder).map((rule, index, ordered) => <article className="rounded-xl border p-4" key={rule.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-3"><h2 className="font-semibold">{rule.title}</h2><span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{rule.active ? "Active" : "Paused"}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{rule.content}</p></div><div className="flex flex-wrap gap-2"><Button disabled={!canMutate || index === 0 || reorder.isPending} onClick={() => move(rule, -1)} size="sm" variant="outline">Up</Button><Button disabled={!canMutate || index === ordered.length - 1 || reorder.isPending} onClick={() => move(rule, 1)} size="sm" variant="outline">Down</Button><Button disabled={!canMutate} onClick={() => { setEditing(rule); setTitle(rule.title); setContent(rule.content); }} size="sm" variant="outline">Edit</Button><Button disabled={!canMutate || update.isPending} onClick={() => update.mutate({ ruleId: rule.id, active: !rule.active })} size="sm" variant="ghost">{rule.active ? "Disable" : "Enable"}</Button><Button disabled={!canMutate || remove.isPending} onClick={() => { if (window.confirm("Delete this rule?")) remove.mutate(rule.id); }} size="sm" variant="ghost">Delete</Button></div></div></article>) : <p className="py-8 text-center text-sm text-muted-foreground">No rules yet.</p>}</CardContent></Card></div></PageSurface>;
}
