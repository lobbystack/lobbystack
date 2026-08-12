"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string };
type Service = { id: string; name: string; slug: string; durationMinutes: number; description: string | null; active: boolean };
type Catalog = { services: Service[]; staff: Array<{ id: string; name: string }> };

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
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses[0];
  const catalog = useQuery({ queryKey: ["catalog", business?.businessId], queryFn: () => requestJson<Catalog>(`/api/catalog?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const create = useMutation({
    mutationFn: () => requestJson<{ serviceId: string }>("/api/catalog", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, name, slug: slug || undefined, durationMinutes: Number(durationMinutes), description: description || undefined }) }),
    onSuccess: async () => {
      setName("");
      setSlug("");
      setDurationMinutes("30");
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: ["catalog", business?.businessId] });
    },
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create service.");
    }
  }

  if (businesses.isLoading || catalog.isLoading) return <p className="text-sm text-slate-500">Loading service catalog...</p>;
  if (businesses.isError || catalog.isError) return <p className="text-sm text-red-600">Service catalog is unavailable.</p>;
  if (!business) return <p className="text-sm text-slate-500">Create a workspace before configuring services.</p>;

  return <PageSurface eyebrow={business.name} title="Services" description="Define the services and durations available to the receptionist.">
    <div className="space-y-6">
      <Card><CardHeader><CardTitle>Add a service</CardTitle><CardDescription>New services are included in the next context snapshot.</CardDescription></CardHeader><CardContent><form className="grid gap-4 md:grid-cols-2" onSubmit={submit}><label className="space-y-2 text-sm font-medium text-slate-700">Name<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" value={name} onChange={(event) => setName(event.target.value)} placeholder="General consultation" required /></label><label className="space-y-2 text-sm font-medium text-slate-700">Slug<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="general-consultation" /></label><label className="space-y-2 text-sm font-medium text-slate-700">Duration in minutes<input className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" type="number" min="1" max="1440" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} required /></label><label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">Description<textarea className="min-h-24 w-full rounded-xl border border-slate-200 p-3 font-normal" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional service details" /></label><div className="md:col-span-2"><Button type="submit" disabled={create.isPending}>{create.isPending ? "Adding..." : "Add service"}</Button></div></form>{error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}</CardContent></Card>
      <Card><CardHeader><CardTitle>Service catalog</CardTitle><CardDescription>{catalog.data?.services.length ?? 0} configured service{catalog.data?.services.length === 1 ? "" : "s"}.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Service</th><th className="px-3 py-3 font-semibold">Duration</th><th className="px-3 py-3 font-semibold">Assigned staff</th><th className="px-3 py-3 font-semibold">Status</th></tr></thead><tbody>{catalog.data?.services.map((service) => <tr className="border-b border-slate-50 last:border-0" key={service.id}><td className="px-3 py-4"><p className="font-medium text-slate-800">{service.name}</p><p className="text-xs text-slate-500">{service.description ?? service.slug}</p></td><td className="px-3 py-4 text-slate-600">{service.durationMinutes} minutes</td><td className="px-3 py-4 text-slate-600">{catalog.data?.staff.length ? `${catalog.data.staff.length} staff available` : "No staff assigned"}</td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${service.active ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}>{service.active ? "Active" : "Paused"}</span></td></tr>)}{!catalog.data?.services.length ? <tr><td className="px-3 py-12 text-center text-slate-500" colSpan={4}>No services yet.</td></tr> : null}</tbody></table></div></CardContent></Card>
    </div>
  </PageSurface>;
}
