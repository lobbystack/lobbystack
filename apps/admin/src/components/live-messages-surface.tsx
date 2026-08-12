"use client";

import { useEffect } from "react";
import { MessageSquare, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Message = {
  id: string;
  conversationId: string;
  contactName: string | null;
  contactPhone: string | null;
  body: string;
  channel: string;
  direction: string;
  status: string;
  createdAt: string;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load messages.");
  return await response.json() as T;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function LiveMessagesSurface() {
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const messages = useQuery({
    queryKey: ["messages", business?.businessId],
    queryFn: () => getJson<{ messages: Message[] }>(`/api/messages?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["messages", business.businessId] });
    source.addEventListener("open", refresh);
    for (const event of ["message.upserted", "message.deliveryUpdated", "conversation.updated"]) source.addEventListener(event, refresh);
    return () => {
      source.removeEventListener("open", refresh);
      for (const event of ["message.upserted", "message.deliveryUpdated", "conversation.updated"]) source.removeEventListener(event, refresh);
      source.close();
    };
  }, [business?.businessId, queryClient]);

  const rows = messages.data?.messages ?? [];
  return <PageSurface title="Messages" description="Manage SMS conversations and follow up with customers.">
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="size-5 text-teal-600" />Message activity</CardTitle>
          <CardDescription>{business ? `${business.name} · ${rows.length} recent messages` : "Choose a workspace to view messages."}</CardDescription>
        </div>
        <Button variant="ghost" onClick={() => void messages.refetch()} disabled={messages.isFetching}><RefreshCw className="size-4" />Refresh</Button>
      </CardHeader>
      <CardContent>
        {businesses.isLoading || messages.isLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading messages...</p> : null}
        {businesses.isError || messages.isError ? <p className="py-12 text-center text-sm text-red-600">Messages are unavailable.</p> : null}
        {!businesses.isLoading && !messages.isLoading && !businesses.isError && !messages.isError ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Contact</th><th className="px-3 py-3 font-semibold">Message</th><th className="px-3 py-3 font-semibold">Channel</th><th className="px-3 py-3 font-semibold">Direction</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Updated</th></tr></thead><tbody>{rows.length > 0 ? rows.map((message) => <tr className="border-b border-slate-50 last:border-0" key={message.id}><td className="px-3 py-4"><p className="font-medium text-slate-800">{message.contactName ?? "Unknown contact"}</p><p className="text-xs text-slate-500">{message.contactPhone ?? message.conversationId}</p></td><td className="max-w-[360px] px-3 py-4 text-slate-600"><span className="line-clamp-2">{message.body}</span></td><td className="px-3 py-4 capitalize text-slate-600">{message.channel}</td><td className="px-3 py-4 capitalize text-slate-600">{message.direction}</td><td className="px-3 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">{message.status}</span></td><td className="px-3 py-4 text-slate-600">{formatTime(message.createdAt)}</td></tr>) : <tr><td className="px-3 py-12 text-center text-slate-500" colSpan={6}>No messages yet.</td></tr>}</tbody></table></div> : null}
      </CardContent>
    </Card>
  </PageSurface>;
}
