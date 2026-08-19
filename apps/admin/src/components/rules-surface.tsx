"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MoreHorizontal, Pause, Play, Search, Trash2 } from "lucide-react";

import { selectActiveBusiness } from "@/lib/active-business";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";
import { Input } from "./ui/input";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

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
  const [search, setSearch] = useState("");
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
  const orderedRules = [...(rules.data ?? [])].sort((left, right) => left.sortOrder - right.sortOrder);
  const filteredRules = orderedRules.filter((rule) => `${rule.title} ${rule.content}`.toLowerCase().includes(search.toLowerCase()));
  return <PageSurface eyebrow={business.name} title="Receptionist rules" description="Give the receptionist explicit, ordered behavior rules. Rules stay separate from retrieved knowledge.">
    <div className="flex w-full flex-col gap-6">
      {!canMutate ? <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Viewer access is read-only.</p> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" placeholder="Search rules" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <Button nativeButton={false} render={<a href="#rule-form" />} disabled={!canMutate}>Add rule</Button>
      </div>
      <TableCard>
        <Table className="min-w-[60rem] table-fixed">
          <colgroup><col className="w-[18%]" /><col className="w-[42%]" /><col className="w-[18%]" /><col className="w-[18%]" /><col className="w-12" /></colgroup>
          <TableHeader><TableRow><TableHead>Rule</TableHead><TableHead>Instruction</TableHead><TableHead>Status</TableHead><TableHead>Added</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rules.isLoading ? <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">Loading rules...</TableCell></TableRow> : filteredRules.length ? filteredRules.map((rule, index) => <TableRow key={rule.id}>
              <TableCell className="font-medium">{rule.title}</TableCell><TableCell className="max-w-0 truncate text-muted-foreground" title={rule.content}>{rule.content}</TableCell><TableCell><Badge variant={rule.active ? "secondary" : "outline"}>{rule.active ? "Active" : "Disabled"}</Badge></TableCell><TableCell className="text-muted-foreground">{rule.sortOrder + 1}</TableCell><TableCell><div className="flex items-center justify-end gap-1"><Button aria-label="Move up" disabled={!canMutate || index === 0 || reorder.isPending} onClick={() => move(rule, -1)} size="icon-sm" variant="ghost"><Play className="size-3 -rotate-90" /></Button><Button aria-label="Move down" disabled={!canMutate || index === filteredRules.length - 1 || reorder.isPending} onClick={() => move(rule, 1)} size="icon-sm" variant="ghost"><Play className="size-3 rotate-90" /></Button><Button aria-label="Edit rule" disabled={!canMutate} onClick={() => { setEditing(rule); setTitle(rule.title); setContent(rule.content); window.location.hash = "rule-form"; }} size="icon-sm" variant="ghost"><MoreHorizontal /></Button><Button aria-label="Toggle rule" disabled={!canMutate || update.isPending} onClick={() => update.mutate({ ruleId: rule.id, active: !rule.active })} size="icon-sm" variant="ghost">{rule.active ? <Pause /> : <Play />}</Button><Button aria-label="Delete rule" disabled={!canMutate || remove.isPending} onClick={() => { if (window.confirm("Delete this rule?")) remove.mutate(rule.id); }} size="icon-sm" variant="ghost"><Trash2 /></Button></div></TableCell>
            </TableRow>) : <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">{search ? "No matching rules." : "No rules yet."}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableCard>
      <Card id="rule-form" className="hidden target:block scroll-mt-6"><CardHeader><CardTitle>{editing ? "Edit rule" : "Add a rule"}</CardTitle><CardDescription>Rules are applied in the order shown above.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={submit}><input aria-label="Rule title" className="min-h-11 w-full rounded-xl border bg-transparent px-3" disabled={!canMutate} placeholder="Rule title" value={title} onChange={(event) => setTitle(event.target.value)} required /><textarea aria-label="Rule content" className="min-h-28 w-full rounded-xl border bg-transparent px-3 py-3" disabled={!canMutate} placeholder="Escalate urgent safety issues to a human immediately." value={content} onChange={(event) => setContent(event.target.value)} required />{error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}<div className="flex gap-2"><Button disabled={!canMutate || create.isPending || update.isPending} type="submit">{editing ? "Save rule" : "Add rule"}</Button>{editing ? <Button type="button" variant="ghost" onClick={() => { setEditing(null); setTitle(""); setContent(""); }}>Cancel</Button> : null}</div></form></CardContent></Card>
    </div>
  </PageSurface>;
}
