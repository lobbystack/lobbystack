"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, RefreshCw, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type AffiliateData = {
  profile: { id: string; referralCode: string; status: string; payoutEmail: string | null; referralLink: string } | null;
  stats: { clickCount: number; referralCount: number; conversionCount: number; pendingCommissionCents: number; paidCommissionCents: number } | null;
  clicks: Array<{ clickedAt: string; sourceUrl: string | null }>;
  attributions: Array<{ businessId: string; referralCode: string; source: string; attributedAt: string }>;
  commissions: Array<{ sourceKey: string; amountCents: number; commissionCents: number; currency: string; status: string; payoutState: string; occurredAt: string; clearsAt: string }>;
  payouts: Array<{ periodKey: string; status: string; amountCents: number; currency: string; paidAt: string | null; externalReference: string | null }>;
};

async function getAffiliate(): Promise<AffiliateData> {
  const response = await fetch("/api/affiliate", { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load affiliate data.");
  return await response.json() as AffiliateData;
}

function money(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

function date(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function LiveAffiliateSurface() {
  const affiliate = useQuery({ queryKey: ["affiliate"], queryFn: getAffiliate });
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const profile = affiliate.data?.profile;
  const stats = affiliate.data?.stats;

  async function copyReferralLink() {
    if (!profile) return;
    await navigator.clipboard.writeText(profile.referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <PageSurface title="Affiliate" description="Track referral clicks, attributed workspaces, commissions, and payouts.">
    <div className="flex w-full items-center gap-1 overflow-x-auto rounded-full border bg-muted/30 p-1"><div className="flex min-w-max gap-1">{([ ["overview", "Overview"], ["quickstart", "Quickstart"], ["earnings", "Earnings"], ["payouts", "Payouts"], ["faq", "FAQ"], ["settings", "Settings"] ] as const).map(([value, label]) => <button className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeTab === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} key={value} onClick={() => setActiveTab(value)} type="button">{label}</button>)}</div></div>
    {activeTab === "quickstart" ? <Card><CardHeader><CardTitle>Quickstart</CardTitle><CardDescription>Share your referral link with businesses that need a receptionist.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Copy your referral link, publish it in your community, and eligible workspace conversions will appear in Earnings.</p><p>Commissions become payable after the clearing period shown in the commission table.</p></CardContent></Card> : null}
    {activeTab === "faq" ? <Card><CardHeader><CardTitle>Affiliate FAQ</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div><p className="font-medium">When is a commission credited?</p><p className="mt-1 text-muted-foreground">After the referred workspace completes an eligible payment and the clearing period passes.</p></div><div><p className="font-medium">How do payouts work?</p><p className="mt-1 text-muted-foreground">Cleared commissions are grouped into the next payout period.</p></div></CardContent></Card> : null}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[["Referral clicks", stats ? String(stats.clickCount) : "-"], ["Attributed workspaces", stats ? String(stats.referralCount) : "-"], ["Pending commission", stats ? money(stats.pendingCommissionCents) : "-"], ["Paid commission", stats ? money(stats.paidCommissionCents) : "-"]].map(([label, value]) => <Card key={label}><CardContent className="p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p></CardContent></Card>)}
    </div>
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><Users className="size-5 text-teal-600" />Referral profile</CardTitle><CardDescription>{profile ? "Share this link to attribute eligible workspaces." : "An affiliate profile has not been created for this account."}</CardDescription></div><Button variant="ghost" onClick={() => void affiliate.refetch()} disabled={affiliate.isFetching}><RefreshCw className="size-4" />Refresh</Button></CardHeader>
      <CardContent>
        {affiliate.isLoading ? <p className="py-10 text-center text-sm text-slate-500">Loading affiliate data...</p> : null}
        {affiliate.isError ? <p className="py-10 text-center text-sm text-red-600">Affiliate data is unavailable.</p> : null}
        {!affiliate.isLoading && !affiliate.isError && profile ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><code className="min-w-0 flex-1 truncate rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{profile.referralLink}</code><Button onClick={() => void copyReferralLink()}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy link"}</Button><a className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-teal-700 hover:bg-teal-50" href={profile.referralLink} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Open</a></div> : null}
      </CardContent>
    </Card>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Recent commissions</CardTitle><CardDescription>Eligible revenue and payout state.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Source</th><th className="px-3 py-3 font-semibold">Commission</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Date</th></tr></thead><tbody>{affiliate.data?.commissions.map((commission) => <tr className="border-b border-slate-50 last:border-0" key={commission.sourceKey}><td className="max-w-[180px] truncate px-3 py-4 text-slate-700">{commission.sourceKey}</td><td className="px-3 py-4 font-medium text-slate-800">{money(commission.commissionCents, commission.currency)}</td><td className="px-3 py-4 capitalize text-slate-600">{commission.status} · {commission.payoutState}</td><td className="px-3 py-4 text-slate-600">{date(commission.occurredAt)}</td></tr>)}</tbody></table>{!affiliate.data?.commissions.length ? <p className="py-8 text-center text-sm text-slate-500">No commissions yet.</p> : null}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Payouts</CardTitle><CardDescription>Monthly payout items and external references.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400"><th className="px-3 py-3 font-semibold">Period</th><th className="px-3 py-3 font-semibold">Amount</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Paid</th></tr></thead><tbody>{affiliate.data?.payouts.map((payout) => <tr className="border-b border-slate-50 last:border-0" key={`${payout.periodKey}-${payout.amountCents}`}><td className="px-3 py-4 text-slate-700">{payout.periodKey}</td><td className="px-3 py-4 font-medium text-slate-800">{money(payout.amountCents, payout.currency)}</td><td className="px-3 py-4 capitalize text-slate-600">{payout.status}</td><td className="px-3 py-4 text-slate-600">{payout.paidAt ? date(payout.paidAt) : "-"}</td></tr>)}</tbody></table>{!affiliate.data?.payouts.length ? <p className="py-8 text-center text-sm text-slate-500">No payouts yet.</p> : null}</div></CardContent></Card>
    </div>
  </PageSurface>;
}
