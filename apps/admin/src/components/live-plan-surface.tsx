"use client";

import { useEffect } from "react";
import { useState } from "react";
import { CreditCard, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Billing = {
  account: { plan: string | null; billingKey: string; subscriptionState: string | null; currentPeriodStart: string | null; currentPeriodEnd: string | null } | null;
  usage: Array<{ periodKey: string; usageKind: string; quantity: number; syncStatus: string }>;
  transactions: Array<{ kind: string; sourceId: string; status: string; amountCents: number; currency: string; description: string | null; invoiceUrl: string | null; occurredAt: string }>;
};
type CheckoutRequest = { id: string; status: string; checkoutId: string | null; checkoutUrl: string | null; error: string | null };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load billing data.");
  return await response.json() as T;
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Unable to start checkout.");
  return await response.json() as T;
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

function date(value: string | null): string {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "-";
}

export function LivePlanSurface() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: () => getJson<Billing>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const checkout = useQuery({ queryKey: ["billing-checkout", checkoutRequestId], queryFn: () => getJson<CheckoutRequest>(`/api/billing/checkout?businessId=${encodeURIComponent(business!.businessId)}&requestId=${encodeURIComponent(checkoutRequestId!)}`), enabled: Boolean(business?.businessId && checkoutRequestId), refetchInterval: checkoutRequestId ? 1_500 : false });
  const startCheckout = useMutation({ mutationFn: (target: "starter" | "pro") => postJson<{ requestId: string }>("/api/billing/checkout", { businessId: business!.businessId, target, billingInterval: "monthly" }), onSuccess: ({ requestId }) => setCheckoutRequestId(requestId) });

  useEffect(() => {
    if (!business?.businessId) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["billing", business.businessId] });
    source.addEventListener("open", refresh);
    for (const event of ["appointment.updated", "call.completed", "message.deliveryUpdated"]) source.addEventListener(event, refresh);
    return () => {
      source.removeEventListener("open", refresh);
      for (const event of ["appointment.updated", "call.completed", "message.deliveryUpdated"]) source.removeEventListener(event, refresh);
      source.close();
    };
  }, [business?.businessId, queryClient]);

  useEffect(() => {
    if (checkout.data?.status === "ready" && checkout.data.checkoutUrl) {
      window.location.assign(checkout.data.checkoutUrl);
    }
  }, [checkout.data]);

  const account = billing.data?.account;
  return <PageSurface title="Plan and billing" description="Review your subscription, current-period usage, invoices, and workspace entitlements.">
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><CreditCard className="size-5 text-teal-600" />Current subscription</CardTitle><CardDescription>{business ? `${business.name} · tenant-scoped billing data` : "Choose a workspace to view billing."}</CardDescription></div><Button variant="ghost" onClick={() => void billing.refetch()} disabled={billing.isFetching}><RefreshCw className="size-4" />Refresh</Button></CardHeader>
       <CardContent>{billing.isLoading || businesses.isLoading ? <p className="py-10 text-center text-sm text-slate-500">Loading billing data...</p> : null}{billing.isError || businesses.isError ? <p className="py-10 text-center text-sm text-red-600">Billing data is unavailable.</p> : null}{!billing.isLoading && !businesses.isLoading && !billing.isError && !businesses.isError ? <><div className="grid gap-6 sm:grid-cols-3"><div><p className="text-sm text-slate-500">Plan</p><p className="mt-2 text-3xl font-semibold capitalize text-slate-950">{account?.plan ?? "No plan"}</p></div><div><p className="text-sm text-slate-500">Subscription</p><p className="mt-2 text-lg font-semibold capitalize text-slate-950">{account?.subscriptionState ?? "Not connected"}</p></div><div><p className="text-sm text-slate-500">Current period</p><p className="mt-2 text-sm font-medium text-slate-950">{date(account?.currentPeriodStart ?? null)} - {date(account?.currentPeriodEnd ?? null)}</p></div></div><div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5"><span className="text-sm font-medium text-slate-700">Change plan</span><Button variant="outline" onClick={() => startCheckout.mutate("starter")} disabled={startCheckout.isPending || Boolean(checkoutRequestId)}>Starter</Button><Button onClick={() => startCheckout.mutate("pro")} disabled={startCheckout.isPending || Boolean(checkoutRequestId)}>Pro</Button>{checkoutRequestId && checkout.data?.status !== "ready" ? <span className="text-sm text-slate-500">Preparing secure checkout...</span> : null}{startCheckout.isError ? <span className="text-sm text-red-600">{startCheckout.error.message}</span> : null}{checkout.data?.status === "error" ? <span className="text-sm text-red-600">{checkout.data.error ?? "Checkout failed."}</span> : null}</div></> : null}</CardContent>
    </Card>
    {pathname.startsWith("/onboarding/") ? <div className="flex justify-end"><Button onClick={() => router.push("/onboarding/number")}>Continue to number selection</Button></div> : null}
    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>This month</CardTitle><CardDescription>Usage recorded for the current UTC billing period.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Usage</th><th className="px-3 py-3 font-semibold">Quantity</th><th className="px-3 py-3 font-semibold">Sync</th></tr></thead><tbody>{billing.data?.usage.map((item) => <tr className="border-b border-slate-50 last:border-0" key={`${item.usageKind}-${item.periodKey}`}><td className="px-3 py-4 capitalize text-slate-700">{item.usageKind.replaceAll("_", " ")}</td><td className="px-3 py-4 font-medium text-slate-800">{item.quantity}</td><td className="px-3 py-4 capitalize text-slate-600">{item.syncStatus}</td></tr>)}</tbody></table>{!billing.data?.usage.length ? <p className="py-8 text-center text-sm text-slate-500">No usage recorded this month.</p> : null}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Recent transactions</CardTitle><CardDescription>Polar orders and refunds synchronized by the worker.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Description</th><th className="px-3 py-3 font-semibold">Amount</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Date</th></tr></thead><tbody>{billing.data?.transactions.map((transaction) => <tr className="border-b border-slate-50 last:border-0" key={`${transaction.kind}-${transaction.sourceId}`}><td className="max-w-[180px] truncate px-3 py-4 text-slate-700">{transaction.description ?? transaction.kind}</td><td className="px-3 py-4 font-medium text-slate-800">{money(transaction.amountCents, transaction.currency)}</td><td className="px-3 py-4 capitalize text-slate-600">{transaction.status}</td><td className="px-3 py-4 text-slate-600">{date(transaction.occurredAt)}</td></tr>)}</tbody></table>{!billing.data?.transactions.length ? <p className="py-8 text-center text-sm text-slate-500">No transactions yet.</p> : null}</div></CardContent></Card>
    </div>
  </PageSurface>;
}
