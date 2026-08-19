"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Item, ItemContent, ItemDescription, ItemTitle } from "./ui/item";
import { PageSurface } from "./page-surface";
import { Surface } from "./ui/surface";

type Business = { businessId: string; name: string; active: boolean };
type Billing = {
  account: { plan: string | null; billingInterval: string | null; overageSpendingCapCents: number | null } | null;
  usage: Array<{ periodKey: string; usageKind: string; quantity: number; isFinal: boolean; syncStatus: string }>;
  usageStatus: { voiceSecondsUsed: number; alertSmsSegmentsUsed: number; outboundCallAttemptsUsed: number; voiceBlocked: boolean; alertSmsBlocked: boolean; outboundCallAttemptsBlocked: boolean; overageSpendCents: number; overageSpendingCapCents: number | null; overageSpendingCapReached: boolean; usageComplete: boolean } | null;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Billing request failed.");
  return await response.json() as T;
}

export function LiveUsageSurface() {
  const queryClient = useQueryClient();
  const [cap, setCap] = useState("");
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: () => requestJson<Billing>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business) });
  const saveCap = useMutation({ mutationFn: () => requestJson(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ capCents: cap.trim() ? Number(cap) : null }) }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["billing", business?.businessId] }) });
  const status = billing.data?.usageStatus;
  return <PageSurface title="Usage" description="">
    <div className="space-y-6"><Card><CardHeader><CardTitle>Current-period usage</CardTitle><CardDescription>{business ? `${business.name} · ${billing.data?.account?.plan ?? "No plan"}` : "Choose a workspace to view usage."}</CardDescription></CardHeader><CardContent>{billing.isLoading || businesses.isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading usage...</p> : null}{billing.isError || businesses.isError ? <p className="py-10 text-center text-sm text-destructive">Usage data is unavailable.</p> : null}{status ? <div className="grid gap-4 sm:grid-cols-3"><UsageCard label="Voice seconds" value={status.voiceSecondsUsed} blocked={status.voiceBlocked} /><UsageCard label="Alert SMS segments" value={status.alertSmsSegmentsUsed} blocked={status.alertSmsBlocked} /><UsageCard label="Outbound call attempts" value={status.outboundCallAttemptsUsed} blocked={status.outboundCallAttemptsBlocked} /></div> : null}</CardContent></Card><Card><CardHeader><CardTitle>Overage cap</CardTitle><CardDescription>Set a whole-dollar cap for eligible overage usage. Leave blank to remove the cap.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap items-end gap-3"><label className="space-y-2 text-sm font-medium">Cap in cents<input aria-label="Overage spending cap in cents" className="min-h-11 w-48 rounded-xl border px-3 font-normal" inputMode="numeric" value={cap || String(billing.data?.usageStatus?.overageSpendingCapCents ?? "")} onChange={(event) => setCap(event.target.value.replace(/\D/g, ""))} placeholder="5000" /></label><Button disabled={!business || saveCap.isPending} onClick={() => saveCap.mutate()}>{saveCap.isPending ? "Saving..." : "Save cap"}</Button></div>{status?.overageSpendingCapReached ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">The overage cap has been reached. New billable usage is blocked.</p> : null}{saveCap.isError ? <p className="text-sm text-destructive">{saveCap.error.message}</p> : null}</CardContent></Card><Card><CardHeader><CardTitle>Usage events</CardTitle><CardDescription>Finalization and provider synchronization state.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-[0.12em] text-muted-foreground"><th className="px-3 py-3">Kind</th><th className="px-3 py-3">Quantity</th><th className="px-3 py-3">State</th><th className="px-3 py-3">Sync</th></tr></thead><tbody>{billing.data?.usage.map((event) => <tr className="border-b last:border-0" key={`${event.periodKey}-${event.usageKind}-${event.quantity}`}><td className="px-3 py-3 capitalize">{event.usageKind.replaceAll("_", " ")}</td><td className="px-3 py-3">{event.quantity}</td><td className="px-3 py-3">{event.isFinal ? "Final" : "Incomplete"}</td><td className="px-3 py-3 capitalize">{event.syncStatus}</td></tr>)}</tbody></table>{!billing.data?.usage.length ? <p className="py-8 text-center text-sm text-muted-foreground">No usage events recorded this period.</p> : null}</div></CardContent></Card></div>
  </PageSurface>;
}

function UsageCard({ label, value, blocked }: { label: string; value: number; blocked: boolean }) {
  const percent = Math.min(100, Math.max(4, Math.round((value / 10000) * 100)));
  return <Surface className="p-0"><Item className="rounded-none border-0" variant="default"><ItemContent><ItemTitle>{label}</ItemTitle><ItemDescription className="mt-2 text-3xl tabular-nums text-foreground">{value.toLocaleString()}</ItemDescription><div className="mt-4 h-2.5 rounded-full bg-muted"><div className="h-2.5 rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} /></div><ItemDescription className="mt-2 text-xs">{percent}% of included usage</ItemDescription></ItemContent>{blocked ? <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">Blocked</span> : null}</Item></Surface>;
}
