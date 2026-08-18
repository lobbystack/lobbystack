"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { useState } from "react";

import { selectActiveBusiness } from "@/lib/active-business";
import { formatDateTime } from "@/lib/locale";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableCardSkeleton } from "@/components/loading-skeletons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "@/components/ui/input";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; active: boolean; role: string };
type Service = { id: string; name: string; slug: string; durationMinutes: number; description: string | null; active: boolean; assignedStaffIds: string[]; createdAt?: string; updatedAt?: string };
type Catalog = { services: Service[]; staff: Array<{ id: string; name: string }>; servicesPagination?: { hasNext: boolean; offset: number; limit: number } };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

function LegacyServicesSurfaceOld() {
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
    <div className="space-y-6"><span id="service-form" className="relative -top-4" aria-hidden="true" /><Card><CardHeader><CardTitle>{editing ? "Edit service" : "Add a service"}</CardTitle><CardDescription>Service changes are included in the next context snapshot.</CardDescription></CardHeader><CardContent><form className="grid gap-4 md:grid-cols-2" onSubmit={editing ? saveEdit : submit}><label className="space-y-2 text-sm font-medium">Name<input className="min-h-11 w-full rounded-xl border px-3 font-normal" disabled={!canMutate} value={name} onChange={(event) => setName(event.target.value)} placeholder="General consultation" required /></label><label className="space-y-2 text-sm font-medium">Slug<input className="min-h-11 w-full rounded-xl border px-3 font-normal" disabled={!canMutate} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="general-consultation" /></label><label className="space-y-2 text-sm font-medium">Duration in minutes<input className="min-h-11 w-full rounded-xl border px-3 font-normal" disabled={!canMutate} type="number" min="1" max="1440" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} required /></label><label className="space-y-2 text-sm font-medium md:col-span-2">Description<textarea className="min-h-24 w-full rounded-xl border p-3 font-normal" disabled={!canMutate} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional service details" /></label><div className="flex gap-2 md:col-span-2"><Button disabled={!canMutate || create.isPending || update.isPending} type="submit">{editing ? "Save service" : "Add service"}</Button>{editing ? <Button type="button" variant="ghost" onClick={() => { setEditing(null); setName(""); setSlug(""); setDurationMinutes("30"); setDescription(""); }}>Cancel</Button> : null}</div></form>{error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}</CardContent></Card><Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Service catalog</CardTitle><CardDescription>{catalog.data?.services.length ?? 0} services in this page.</CardDescription></div><Input aria-label="Search services" className="max-w-xs" value={search} onChange={(event) => { setOffset(0); setSearch(event.target.value); }} placeholder="Search services" /></div></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-[0.12em] text-muted-foreground"><th className="px-3 py-3 font-semibold">Service</th><th className="px-3 py-3 font-semibold">Duration</th><th className="px-3 py-3 font-semibold">Assigned staff</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Actions</th></tr></thead><tbody>{catalog.data?.services.map((service) => <tr className="border-b align-top last:border-0" key={service.id}><td className="px-3 py-4"><p className="font-medium">{service.name}</p><p className="text-xs text-muted-foreground">{service.description ?? service.slug}</p></td><td className="px-3 py-4 text-muted-foreground">{service.durationMinutes} minutes</td><td className="px-3 py-4"><div className="space-y-2">{catalog.data?.staff.map((staff) => <label className="flex items-center gap-2 text-xs" key={staff.id}><input checked={service.assignedStaffIds.includes(staff.id)} disabled={!canMutate || action.isPending} onChange={(event) => action.mutate({ serviceId: service.id, staffId: staff.id, assigned: event.target.checked })} type="checkbox" />{staff.name}</label>)}</div></td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${service.active ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}>{service.active ? "Active" : "Paused"}</span></td><td className="px-3 py-4"><div className="flex flex-wrap gap-2"><Button disabled={!canMutate} onClick={() => beginEdit(service)} size="sm" variant="outline">Edit</Button><Button disabled={!canMutate || action.isPending} onClick={() => action.mutate({ serviceId: service.id, active: !service.active })} size="sm" variant="ghost">{service.active ? "Disable" : "Enable"}</Button><Button disabled={!canMutate || remove.isPending} onClick={() => { if (window.confirm("Disable this service?")) remove.mutate(service.id); }} size="sm" variant="ghost">Delete</Button></div></td></tr>)}</tbody></table></div><div className="mt-4 flex justify-end gap-2"><Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))} size="sm" variant="outline">Previous</Button><Button disabled={!catalog.data?.servicesPagination?.hasNext} onClick={() => setOffset(offset + 25)} size="sm" variant="outline">Next</Button></div></CardContent></Card></div>
  </PageSurface>;
}

type ServiceForm = {
  name: string;
  description: string;
  durationMinutes: string;
  active: boolean;
};

const emptyServiceForm: ServiceForm = { name: "", description: "", durationMinutes: "30", active: true };

function serviceSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service";
}

function summarizeService(text: string, maxLength = 72): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function ServiceEditor({
  form,
  editing,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: ServiceForm;
  editing: Service | null;
  saving: boolean;
  onChange: (next: Partial<ServiceForm>) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-labelledby="service-dialog-title" aria-modal="true" className="w-full max-w-md rounded-xl border bg-popover p-6 text-popover-foreground shadow-lg" role="dialog">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-heading text-base font-medium" id="service-dialog-title">{editing ? "Edit service" : "Add service"}</h2>
          <p className="text-sm text-muted-foreground">{editing ? "Update the service details used by your receptionist." : "Add a service your receptionist can explain and book."}</p>
        </div>
        <form className="mt-6 flex flex-col gap-5" onSubmit={onSubmit}>
          <label className="space-y-2 text-sm font-medium">Title<input autoFocus className="min-h-10 w-full rounded-xl border bg-background px-3 font-normal" onChange={(event) => onChange({ name: event.target.value })} placeholder="Exploration Call" required value={form.name} /></label>
          <label className="space-y-2 text-sm font-medium">Duration<input className="min-h-10 w-full rounded-xl border bg-background px-3 font-normal" min="1" onChange={(event) => onChange({ durationMinutes: event.target.value })} required type="number" value={form.durationMinutes} /></label>
          <label className="space-y-2 text-sm font-medium">Description<textarea className="min-h-32 w-full rounded-xl border bg-background p-3 font-normal" onChange={(event) => onChange({ description: event.target.value })} placeholder="A 30 minute call to explain how LobbyStack could be a good fit for your business." value={form.description} /></label>
          <label className="flex items-center gap-3 text-sm"><input checked={form.active} className="size-4" onChange={(event) => onChange({ active: event.target.checked })} type="checkbox" />Active</label>
          <div className="flex justify-end gap-2"><Button onClick={onClose} type="button" variant="ghost">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving..." : editing ? "Save changes" : "Save"}</Button></div>
        </form>
      </div>
    </div>
  );
}

function ServicesParitySurface() {
  const queryClient = useQueryClient();
  const [searchValue, setSearchValue] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyServiceForm);
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canMutate = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const catalog = useQuery({ queryKey: ["catalog", business?.businessId], queryFn: () => requestJson<Catalog>(`/api/catalog?businessId=${encodeURIComponent(business!.businessId)}&limit=100`), enabled: Boolean(business?.businessId) });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["catalog", business?.businessId] });
  const save = useMutation({
    mutationFn: async () => {
      if (!business) throw new Error("No active workspace.");
      const payload = { name: form.name.trim(), slug: editing?.slug ?? serviceSlug(form.name), durationMinutes: Number(form.durationMinutes), description: form.description.trim() || null, active: form.active };
      if (editing) return await requestJson(`/api/catalog/${encodeURIComponent(editing.id)}?businessId=${encodeURIComponent(business.businessId)}`, { method: "PATCH", body: JSON.stringify(payload) });
      return await requestJson("/api/catalog", { method: "POST", body: JSON.stringify({ businessId: business.businessId, ...payload }) });
    },
    onSuccess: async () => { setEditorOpen(false); setEditing(null); setForm(emptyServiceForm); await invalidate(); },
  });
  const toggle = useMutation({ mutationFn: async (service: Service) => await requestJson(`/api/catalog/${encodeURIComponent(service.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ active: !service.active }) }), onSuccess: invalidate });

  function openCreate() { setError(null); setEditing(null); setForm(emptyServiceForm); setEditorOpen(true); }
  function openEdit(service: Service) { setError(null); setEditing(service); setForm({ name: service.name, description: service.description ?? "", durationMinutes: String(service.durationMinutes), active: service.active }); setEditorOpen(true); }
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); if (!form.name.trim() || Number(form.durationMinutes) < 1) return; save.mutate(); }

  if (businesses.isLoading || catalog.isLoading) return <TableCardSkeleton columns={5} />;
  if (businesses.isError || catalog.isError) return <p className="text-sm text-destructive">Service catalog is unavailable.</p>;
  if (!business) return <p className="text-sm text-muted-foreground">Create a workspace before configuring services.</p>;

  const query = searchValue.trim().toLowerCase();
  const services = (catalog.data?.services ?? []).filter((service) => [service.name, service.description ?? "", `${service.durationMinutes} min`].join(" ").toLowerCase().includes(query));
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(services.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const rows = services.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" onChange={(event) => { setPageIndex(0); setSearchValue(event.target.value); }} placeholder="Search services" value={searchValue} /></div>
        {canMutate ? <Button onClick={openCreate} type="button"><Plus data-icon="inline-start" />Add Service</Button> : null}
      </div>
      {error || save.isError ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error ?? save.error?.message ?? "Unable to save service."}</p> : null}
      <TableCard>
        <Table className="min-w-[60rem] w-full table-fixed">
          <colgroup><col className="w-[18%]" /><col className="w-[42%]" /><col className="w-[14%]" /><col className="w-[18%]" /><col className="w-16" /></colgroup>
          <TableHeader><TableRow><TableHead>Service</TableHead><TableHead>Preview</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Added</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{rows.length ? rows.map((service) => <TableRow className="h-12 cursor-pointer" key={service.id} onClick={() => canMutate && openEdit(service)}><TableCell className="max-w-0 overflow-hidden"><span className="block truncate font-medium" title={service.name}>{summarizeService(service.name, 32)}</span></TableCell><TableCell className="max-w-0 overflow-hidden"><span className="block truncate text-sm text-muted-foreground" title={service.description ?? `${service.durationMinutes} minutes`}>{summarizeService(service.description ?? `${service.durationMinutes} minutes`)}</span></TableCell><TableCell><Badge variant={service.active ? "secondary" : "outline"}>{service.active ? "Active" : "Disabled"}</Badge></TableCell><TableCell className="text-right text-sm text-muted-foreground">{service.createdAt ? formatDateTime(service.createdAt, "en", { dateStyle: "medium", timeStyle: "short" }) : "-"}</TableCell><TableCell onClick={(event) => event.stopPropagation()}>{canMutate ? <DropdownMenu><DropdownMenuTrigger render={<Button aria-label="More options" size="icon-sm" variant="ghost" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEdit(service)}>Edit</DropdownMenuItem><DropdownMenuItem onClick={() => toggle.mutate(service)}>{service.active ? "Disable" : "Enable"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</TableCell></TableRow>) : <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>{query ? "No services match your search." : "No services yet."}</TableCell></TableRow>}</TableBody>
        </Table>
      </TableCard>
      <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground"><span>Page {currentPage + 1} of {pageCount}</span><div className="flex gap-2"><Button disabled={currentPage === 0} onClick={() => setPageIndex(0)} size="sm" variant="outline">First</Button><Button disabled={currentPage === 0} onClick={() => setPageIndex((page) => Math.max(0, page - 1))} size="sm" variant="outline">Previous</Button><Button disabled={currentPage >= pageCount - 1} onClick={() => setPageIndex((page) => Math.min(pageCount - 1, page + 1))} size="sm" variant="outline">Next</Button><Button disabled={currentPage >= pageCount - 1} onClick={() => setPageIndex(pageCount - 1)} size="sm" variant="outline">Last</Button></div></div>
      {editorOpen ? <ServiceEditor editing={editing} form={form} onChange={(next) => setForm((current) => ({ ...current, ...next }))} onClose={() => setEditorOpen(false)} onSubmit={submit} saving={save.isPending} /> : null}
    </div>
  );
}

export function LiveServicesSurface() {
  return <PageSurface description="" title=""><ServicesParitySurface /></PageSurface>;
}
