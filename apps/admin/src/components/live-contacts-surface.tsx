"use client";

import { useEffect } from "react";
import { RefreshCw, Users } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Contact = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  smsConsentStatus: string | null;
  operatorBlockedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load contacts.");
  return await response.json() as T;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function LiveContactsSurface() {
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const contacts = useQuery({
    queryKey: ["contacts", business?.businessId],
    queryFn: () => getJson<{ contacts: Contact[] }>(`/api/contacts?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["contacts", business.businessId] });
    source.addEventListener("open", refresh);
    for (const event of ["call.completed", "message.upserted", "conversation.updated"]) source.addEventListener(event, refresh);
    return () => {
      source.removeEventListener("open", refresh);
      for (const event of ["call.completed", "message.upserted", "conversation.updated"]) source.removeEventListener(event, refresh);
      source.close();
    };
  }, [business?.businessId, queryClient]);

  const rows = contacts.data?.contacts ?? [];
  return <PageSurface title="Contacts" description="Keep customer details, conversation history, and consent in one place.">
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><Users className="size-5 text-teal-600" />Workspace contacts</CardTitle>
          <CardDescription>{business ? `${business.name} · ${rows.length} contacts loaded` : "Choose a workspace to view contacts."}</CardDescription>
        </div>
        <Button variant="ghost" onClick={() => void contacts.refetch()} disabled={contacts.isFetching}><RefreshCw className="size-4" />Refresh</Button>
      </CardHeader>
      <CardContent>
        {businesses.isLoading || contacts.isLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading contacts...</p> : null}
        {businesses.isError || contacts.isError ? <p className="py-12 text-center text-sm text-red-600">Contacts are unavailable.</p> : null}
        {!businesses.isLoading && !contacts.isLoading && !businesses.isError && !contacts.isError ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Name</th><th className="px-3 py-3 font-semibold">Phone</th><th className="px-3 py-3 font-semibold">Email</th><th className="px-3 py-3 font-semibold">SMS consent</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Updated</th></tr></thead><tbody>{rows.length > 0 ? rows.map((contact) => <tr className="border-b border-slate-50 last:border-0" key={contact.id}><td className="px-3 py-4 font-medium text-slate-800"><Link className="hover:text-teal-700 hover:underline" href={`/contacts/${contact.id}`}>{contact.name ?? "Unknown contact"}</Link></td><td className="px-3 py-4 text-slate-600">{contact.phone}</td><td className="px-3 py-4 text-slate-600">{contact.email ?? "-"}</td><td className="px-3 py-4 capitalize text-slate-600">{contact.smsConsentStatus ?? "unknown"}</td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${contact.operatorBlockedAt ? "bg-red-50 text-red-700" : "bg-teal-50 text-teal-700"}`}>{contact.operatorBlockedAt ? "Blocked" : "Active"}</span></td><td className="px-3 py-4 text-slate-600">{formatDate(contact.updatedAt ?? contact.createdAt)}</td></tr>) : <tr><td className="px-3 py-12 text-center text-slate-500" colSpan={6}>No contacts yet.</td></tr>}</tbody></table></div> : null}
      </CardContent>
    </Card>
  </PageSurface>;
}
