"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { CalendarDays, MessageSquareText, PhoneCall, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { PageSurface } from "./page-surface";
import { selectActiveBusiness } from "@/lib/active-business";

type Business = { businessId: string; name: string; active: boolean; role: string };
type Detail = {
  contact: { id: string; name: string | null; phone: string; email: string | null; smsConsentStatus: string | null; operatorBlockedAt: string | null; createdAt: string } | null;
  calls: Array<{ id: string; status: string; disposition: string | null; transport: string; startedAt: string; endedAt: string | null }>;
  messages: Array<{ id: string; direction: string; channel: string; body: string; status: string; createdAt: string }>;
  appointments: Array<{ id: string; startsAt: string; endsAt: string; timezone: string; status: string; serviceName: string; staffName: string }>;
  activityCounts: { calls: number; messages: number; appointments: number };
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error("Unable to load contact details.");
  return await response.json() as T;
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function LiveContactDetailSurface({ contactId }: { contactId: string }) {
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const queryClient = useQueryClient();
  const canMutate = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const detail = useQuery({ queryKey: ["contact", business?.businessId, contactId], queryFn: () => getJson<Detail>(`/api/contacts/${encodeURIComponent(contactId)}?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const updateBlock = useMutation({ mutationFn: (blocked: boolean) => getJson(`/api/contacts/${encodeURIComponent(contactId)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ smsBlocked: blocked }) }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["contact", business?.businessId, contactId] }) });
  const remove = useMutation({ mutationFn: () => getJson(`/api/contacts/${encodeURIComponent(contactId)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE" }) });
  if (businesses.isLoading || detail.isLoading) return <PageSurface title="Contact" description="Loading contact history..."><Card><CardContent className="py-16 text-center text-sm text-slate-500">Loading contact details...</CardContent></Card></PageSurface>;
  if (businesses.isError || detail.isError) return <PageSurface title="Contact" description="Contact details could not be loaded."><Card><CardContent className="py-16 text-center text-sm text-red-600">Contact details are unavailable.</CardContent></Card></PageSurface>;
  const data = detail.data;
  if (!data?.contact) return <PageSurface title="Contact not found" description="This contact does not exist in the active workspace."><Card><CardContent className="py-16 text-center text-sm text-slate-500">No contact was found.</CardContent></Card></PageSurface>;
  const contact = data.contact;
  return <PageSurface title={contact.name ?? "Unknown contact"} description={`Customer history for ${business?.name ?? "the active workspace"}.`}>
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card className="h-fit"><CardHeader><CardTitle>Contact details</CardTitle><CardDescription>Created {dateTime(contact.createdAt)}</CardDescription></CardHeader><CardContent className="space-y-4 text-sm"><div><p className="text-slate-500">Phone</p><p className="mt-1 font-medium text-slate-900">{contact.phone}</p></div><div><p className="text-slate-500">Email</p><p className="mt-1 font-medium text-slate-900">{contact.email ?? "Not provided"}</p></div><div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3"><ShieldCheck className="size-4 text-teal-700" /><span>SMS consent: <strong className="capitalize">{contact.smsConsentStatus ?? "unknown"}</strong></span></div>{contact.operatorBlockedAt ? <p className="rounded-xl bg-red-50 p-3 text-red-700">Operator blocked since {dateTime(contact.operatorBlockedAt)}.</p> : null}<div className="flex flex-wrap gap-2"><Button disabled={!canMutate || updateBlock.isPending} onClick={() => updateBlock.mutate(!contact.operatorBlockedAt)} size="sm" variant="outline">{contact.operatorBlockedAt ? "Unblock contact" : "Block contact"}</Button><Button disabled={!canMutate || remove.isPending} onClick={() => { if (window.confirm("Anonymize and delete this contact?")) void remove.mutateAsync().then(() => window.location.assign("/contacts")); }} size="sm" variant="ghost">Delete</Button></div>{updateBlock.isError || remove.isError ? <p className="text-sm text-red-600">{(updateBlock.error ?? remove.error)?.message}</p> : null}</CardContent></Card>
       <div className="space-y-6">
         <div className="grid gap-3 sm:grid-cols-3"><Metric label="Calls" value={data.activityCounts.calls} /><Metric label="Messages" value={data.activityCounts.messages} /><Metric label="Appointments" value={data.activityCounts.appointments} /></div>
         <HistoryCard icon={PhoneCall} title="Calls" empty="No calls for this contact.">{data.calls.map((call) => <Link className="block hover:bg-muted/50" href={`/calls/${encodeURIComponent(call.id)}`} key={call.id}><HistoryRow title={`${call.transport.replaceAll("_", " ")} call`} detail={call.disposition ?? call.status} meta={dateTime(call.startedAt)} status={call.status} /></Link>)}</HistoryCard>
        <HistoryCard icon={MessageSquareText} title="Messages" empty="No messages for this contact.">{data.messages.map((message) => <HistoryRow key={message.id} title={`${message.direction} ${message.channel}`} detail={message.body} meta={dateTime(message.createdAt)} status={message.status} />)}</HistoryCard>
        <HistoryCard icon={CalendarDays} title="Appointments" empty="No appointments for this contact.">{data.appointments.map((appointment) => <HistoryRow key={appointment.id} title={appointment.serviceName} detail={`With ${appointment.staffName}`} meta={dateTime(appointment.startsAt)} status={appointment.status} />)}</HistoryCard>
      </div>
    </div>
  </PageSurface>;
}

function HistoryCard({ icon: Icon, title, empty, children }: { icon: typeof PhoneCall; title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Icon className="size-5 text-teal-700" />{title}</CardTitle></CardHeader><CardContent className="divide-y divide-slate-100">{hasChildren ? children : <p className="py-8 text-center text-sm text-slate-500">{empty}</p>}</CardContent></Card>;
}

function HistoryRow({ title, detail, meta, status }: { title: string; detail: string; meta: string; status: string }) {
  return <article className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-medium capitalize text-slate-900">{title}</p><p className="mt-1 line-clamp-2 text-sm text-slate-600">{detail}</p></div><div className="shrink-0 text-left sm:text-right"><p className="text-xs text-slate-500">{meta}</p><span className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">{status}</span></div></article>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>;
}
