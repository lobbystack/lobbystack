"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { selectActiveBusiness } from "@/lib/active-business";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "@/components/ui/input";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; active: boolean; role: string };
type Service = { id: string; name: string; slug: string; durationMinutes: number; description: string | null; active: boolean; assignedStaffIds: string[] };
type Catalog = { services: Service[]; staff: Array<{ id: string; name: string }>; servicesPagination?: { hasNext: boolean; offset: number; limit: number } };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function LiveServicesSurface() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Service | null>(null);
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canMutate = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const catalog = useQuery({ queryKey: ["catalog", business?.businessId, search, offset], queryFn: () => requestJson<Catalog>(`/api/catalog?businessId=${encodeURIComponent(business!.businessId)}&limit=25&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ""}`), enabled: Boolean(business?.businessId) });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["catalog", business?.businessId] });
  const create = useMutation({ mutationFn: () => requestJson<{ serviceId: string }>("/api/catalog", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, name, slug: slug || undefined, durationMinutes: Number(durationMinutes), description: description || undefined }) }), onSuccess: async () => { setName(""); setSlug(""); setDurationMinutes("30"); setDescription(""); await queryClient.invalidateQueries({ queryKey: ["catalog", business?.businessId] }); } });
  const update = useMutation({ mutationFn: (input: { serviceId: string; name: string; slug: string; durationMinutes: number; description: string | null }) => requestJson(`/api/catalog/${encodeURIComponent(input.serviceId)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify(input) }), onSuccess: () => { setEditing(null); invalidate(); } });
  const action = useMutation({ mutationFn: (input: { serviceId: string; active?: boolean; staffId?: string; assigned?: boolean }) => requestJson(`/api/catalog/${encodeURIComponent(input.serviceId)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify(input) }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (serviceId: string) => requestJson(`/api/catalog/${encodeURIComponent(serviceId)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE" }), onSuccess: invalidate });

  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); try { await create.mutateAsync(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create service."); } }
  function beginEdit(service: Service) { setEditing(service); setName(service.name); setSlug(service.slug); setDurationMinutes(String(service.durationMinutes)); setDescription(service.description ?? ""); }
  async function saveEdit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!editing) return; try { await update.mutateAsync({ serviceId: editing.id, name, slug, durationMinutes: Number(durationMinutes), description: description || null }); setName(""); setSlug(""); setDurationMinutes("30"); setDescription(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update service."); } }

  if (businesses.isLoading || catalog.isLoading) return <p className="text-sm text-slate-500">Loading service catalog...</p>;
  if (businesses.isError || catalog.isError) return <p className="text-sm text-red-600">Service catalog is unavailable.</p>;
  if (!business) return <p className="text-sm text-slate-500">Create a workspace before configuring services.</p>;

  return <PageSurface eyebrow={business.name} title="Services" description="Define services, durations, localized details, and staff availability for booking.">
    <div className="space-y-6"><Card><CardHeader><CardTitle>{editing ? "Edit service" : "Add a service"}</CardTitle><CardDescription>Service changes are included in the next context snapshot.</CardDescription></CardHeader><CardContent><form className="grid gap-4 md:grid-cols-2" onSubmit={editing ? saveEdit : submit}><label className="space-y-2 text-sm font-medium">Name<input className="min-h-11 w-full rounded-xl border px-3 font-normal" disabled={!canMutate} value={name} onChange={(event) => setName(event.target.value)} placeholder="General consultation" required /></label><label className="space-y-2 text-sm font-medium">Slug<input className="min-h-11 w-full rounded-xl border px-3 font-normal" disabled={!canMutate} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="general-consultation" /></label><label className="space-y-2 text-sm font-medium">Duration in minutes<input className="min-h-11 w-full rounded-xl border px-3 font-normal" disabled={!canMutate} type="number" min="1" max="1440" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} required /></label><label className="space-y-2 text-sm font-medium md:col-span-2">Description<textarea className="min-h-24 w-full rounded-xl border p-3 font-normal" disabled={!canMutate} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional service details" /></label><div className="flex gap-2 md:col-span-2"><Button disabled={!canMutate || create.isPending || update.isPending} type="submit">{editing ? "Save service" : "Add service"}</Button>{editing ? <Button type="button" variant="ghost" onClick={() => { setEditing(null); setName(""); setSlug(""); setDurationMinutes("30"); setDescription(""); }}>Cancel</Button> : null}</div></form>{error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}</CardContent></Card><Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Service catalog</CardTitle><CardDescription>{catalog.data?.services.length ?? 0} services in this page.</CardDescription></div><Input aria-label="Search services" className="max-w-xs" value={search} onChange={(event) => { setOffset(0); setSearch(event.target.value); }} placeholder="Search services" /></div></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-[0.12em] text-muted-foreground"><th className="px-3 py-3 font-semibold">Service</th><th className="px-3 py-3 font-semibold">Duration</th><th className="px-3 py-3 font-semibold">Assigned staff</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Actions</th></tr></thead><tbody>{catalog.data?.services.map((service) => <tr className="border-b align-top last:border-0" key={service.id}><td className="px-3 py-4"><p className="font-medium">{service.name}</p><p className="text-xs text-muted-foreground">{service.description ?? service.slug}</p></td><td className="px-3 py-4 text-muted-foreground">{service.durationMinutes} minutes</td><td className="px-3 py-4"><div className="space-y-2">{catalog.data?.staff.map((staff) => <label className="flex items-center gap-2 text-xs" key={staff.id}><input checked={service.assignedStaffIds.includes(staff.id)} disabled={!canMutate || action.isPending} onChange={(event) => action.mutate({ serviceId: service.id, staffId: staff.id, assigned: event.target.checked })} type="checkbox" />{staff.name}</label>)}</div></td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${service.active ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}>{service.active ? "Active" : "Paused"}</span></td><td className="px-3 py-4"><div className="flex flex-wrap gap-2"><Button disabled={!canMutate} onClick={() => beginEdit(service)} size="sm" variant="outline">Edit</Button><Button disabled={!canMutate || action.isPending} onClick={() => action.mutate({ serviceId: service.id, active: !service.active })} size="sm" variant="ghost">{service.active ? "Disable" : "Enable"}</Button><Button disabled={!canMutate || remove.isPending} onClick={() => { if (window.confirm("Disable this service?")) remove.mutate(service.id); }} size="sm" variant="ghost">Delete</Button></div></td></tr>)}</tbody></table></div><div className="mt-4 flex justify-end gap-2"><Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))} size="sm" variant="outline">Previous</Button><Button disabled={!catalog.data?.servicesPagination?.hasNext} onClick={() => setOffset(offset + 25)} size="sm" variant="outline">Next</Button></div></CardContent></Card></div>
  </PageSurface>;
}
