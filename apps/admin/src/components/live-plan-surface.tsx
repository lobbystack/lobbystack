"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingPlanCatalog, type BillingPlanSlug } from "@lobbystack/shared";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { PageSurface } from "./page-surface";
import { SectionBlock } from "./section-block";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { Surface } from "./ui/surface";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Business = { businessId: string; name: string; slug: string; role: string; active: boolean };
type Billing = {
  account: { plan: string | null; billingKey: string; billingInterval: string | null; subscriptionState: string | null; currentPeriodStart: string | null; currentPeriodEnd: string | null; overageSpendingCapCents: number | null } | null;
  usage: Array<{ periodKey: string; usageKind: string; quantity: number; syncStatus: string }>;
  transactions: Array<{ kind: string; sourceId: string; status: string; amountCents: number; currency: string; description: string | null; invoiceUrl: string | null; occurredAt: string }>;
  usageStatus: { usageComplete: boolean; voiceBlocked: boolean; alertSmsBlocked: boolean; outboundCallAttemptsBlocked: boolean; overageSpendingCapReached: boolean; overageSpendCents: number; overageSpendingCapCents: number | null } | null;
};
type CheckoutRequest = { id: string; status: string; checkoutId: string | null; checkoutUrl: string | null; error: string | null };

async function getJson<T>(url: string): Promise<T> { const response = await fetch(url, { credentials: "include" }); if (!response.ok) throw new Error("Unable to load billing data."); return await response.json() as T; }
async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> { const response = await fetch(url, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Unable to update billing."); return await response.json() as T; }
function money(cents: number, currency = "usd"): string { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100); }
function date(value: string | null): string { return value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "—"; }
function planSlug(value: string | null | undefined): BillingPlanSlug { return value === "self_host" || value === "starter" || value === "pro" || value === "enterprise" ? value : "free_cloud"; }
function storage(bytes: number | null): string { if (bytes === null) return "Unlimited storage"; return bytes >= 1024 ** 3 ? `${bytes / 1024 ** 3} GB storage` : `${Math.round(bytes / 1024 ** 2)} MB storage`; }

export function LivePlanSurface() {
  const { t } = useTranslation("settings");
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [portalPending, setPortalPending] = useState(false);
  const [cap, setCap] = useState("");
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: () => getJson<Billing>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const checkout = useQuery({ queryKey: ["billing-checkout", checkoutRequestId], queryFn: () => getJson<CheckoutRequest>(`/api/billing/checkout?businessId=${encodeURIComponent(business!.businessId)}&requestId=${encodeURIComponent(checkoutRequestId!)}`), enabled: Boolean(business?.businessId && checkoutRequestId), refetchInterval: checkoutRequestId ? 1_500 : false });
  const startCheckout = useMutation({ mutationFn: (target: "starter" | "pro") => postJson<{ requestId: string }>("/api/billing/checkout", { businessId: business!.businessId, target, billingInterval: interval }), onSuccess: ({ requestId }) => setCheckoutRequestId(requestId) });
  const saveCap = useMutation({ mutationFn: () => postJson(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`, { capCents: cap.trim() ? Math.round(Number(cap) * 100) : null }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["billing", business?.businessId] }); setCap(""); } });

  useEffect(() => { if (checkout.data?.status === "ready" && checkout.data.checkoutUrl) window.location.assign(checkout.data.checkoutUrl); }, [checkout.data]);
  useEffect(() => { if (searchParams.get("checkout") && business?.businessId) void queryClient.invalidateQueries({ queryKey: ["billing", business.businessId] }); }, [business?.businessId, queryClient, searchParams]);

  async function openPortal() { if (!business) return; setPortalPending(true); try { const result = await postJson<{ url: string }>(`/api/billing/portal?businessId=${encodeURIComponent(business.businessId)}`, {}); window.location.assign(result.url); } finally { setPortalPending(false); } }

  if (businesses.isLoading || billing.isLoading) return <PageSurface description="" title={t("sections.billing")}><BillingSkeleton /></PageSurface>;
  if (businesses.isError || billing.isError || !business) return <PageSurface description="" title={t("sections.billing")}><p className="text-sm text-destructive">Billing data is unavailable.</p></PageSurface>;

  const account = billing.data?.account;
  const plan = planSlug(account?.plan);
  const catalog = billingPlanCatalog[plan];
  const monthlyPrice = account?.billingInterval === "annual" ? catalog.annualEffectiveMonthlyChargeCents : catalog.monthlyChargeCents;
  const included = [catalog.voiceSecondsIncluded === null ? t("billing.currentPlan.includedVoiceUnlimited") : `${Math.round(catalog.voiceSecondsIncluded / 60)} ${t("billing.currentPlan.includedVoiceLabel")}`, catalog.outboundCallAttemptsIncluded === null ? t("billing.currentPlan.includedOutboundUnlimited") : `${catalog.outboundCallAttemptsIncluded} ${t("billing.currentPlan.includedOutboundLabel")}`, catalog.alertSmsSegmentsIncluded === null ? t("billing.currentPlan.includedSmsUnlimited") : `${catalog.alertSmsSegmentsIncluded} ${t("billing.currentPlan.includedSmsLabel")}`, storage(catalog.knowledgeStorageBytes)];
  const canUpgrade = plan === "free_cloud" || plan === "starter";
  const canManage = ["active", "trialing", "past_due"].includes(account?.subscriptionState ?? "");
  const checkoutStatus = searchParams.get("checkout");

  return <PageSurface description="" title={t("sections.billing")}>
    {checkoutStatus === "success" ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-foreground">{t("billing.toast.checkoutSuccess")}</div> : null}
    {account?.subscriptionState === "past_due" ? <Surface className="flex flex-col gap-3 border-amber-500/30 bg-amber-500/10 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{t("billing.pastDueBanner.title")}</p><p className="mt-1 text-sm text-muted-foreground">{t("billing.pastDueBanner.description")}</p></div><Button disabled={portalPending} onClick={() => void openPortal()} variant="outline">{portalPending ? t("billing.pastDueBanner.openingPortal") : t("billing.pastDueBanner.action")}</Button></Surface> : null}

    <SectionBlock title={t("billing.currentPlan.title")}><Surface className="px-6 py-5"><div className="flex flex-col gap-6"><div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"><div className="flex flex-col gap-3"><div className="flex items-center gap-2"><span className="text-xl font-medium leading-7">{t(`billing.planLabels.${plan === "free_cloud" ? "freeCloudCard" : plan === "self_host" ? "selfHost" : plan === "starter" ? "starterCard" : plan === "pro" ? "proCard" : "enterpriseCard"}`)}</span>{account?.subscriptionState ? <Badge variant="secondary">{t(`billing.subscriptionStates.${account.subscriptionState}`, { defaultValue: account.subscriptionState })}</Badge> : null}</div><div className="flex flex-wrap items-end gap-2">{monthlyPrice === null ? <span className="text-base text-muted-foreground">{t("billing.currentPlan.customPricing")}</span> : <><span className="text-4xl font-semibold tracking-tight">{money(monthlyPrice)}</span><span className="pb-1 text-base text-muted-foreground">{account?.billingInterval === "annual" ? t("billing.currentPlan.annualEffectiveSuffix") : t("billing.currentPlan.monthlySuffix")}</span></>}</div>{account?.currentPeriodEnd ? <p className="text-sm text-muted-foreground">{t("billing.currentPlan.billingPeriod", { resetAt: date(account.currentPeriodEnd) })}</p> : null}</div><div className="flex flex-col gap-4"><span className="text-base font-medium">{t("billing.currentPlan.includedTitle")}</span><div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{included.map((item) => <div className="flex items-start gap-2.5" key={item}><Check className="mt-0.5 size-4 text-emerald-500" /><span className="text-[15px] leading-6">{item}</span></div>)}</div></div></div>{canUpgrade || canManage ? <div className="flex flex-col gap-2 sm:flex-row">{canUpgrade ? <Button onClick={() => setUpgradeOpen(true)} size="sm" variant="outline">{t("billing.actions.upgradeToPro")}</Button> : null}{canManage ? <Button disabled={portalPending} onClick={() => void openPortal()} size="sm" variant="outline">{portalPending ? t("billing.actions.openingPortal") : t("billing.actions.manageSubscription")}<ArrowUpRight className="size-3.5" /></Button> : null}</div> : null}</div></Surface></SectionBlock>

    <SectionBlock title={t("billing.spendingCap.title")}><Surface className="px-6 py-5"><div className="flex flex-col gap-5"><div><p className="text-sm text-muted-foreground">{billing.data?.usageStatus?.overageSpendingCapCents == null ? t("billing.spendingCap.noCap") : t("billing.spendingCap.spendOfCap", { spend: money(billing.data.usageStatus.overageSpendCents), cap: money(billing.data.usageStatus.overageSpendingCapCents) })}</p>{billing.data?.usageStatus?.overageSpendingCapReached ? <p className="mt-2 text-sm text-destructive">{t("billing.spendingCap.reached")}</p> : null}</div><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex max-w-xs flex-1 flex-col gap-2 text-sm font-medium">{t("billing.spendingCap.amountLabel")}<Input inputMode="decimal" onChange={(event) => setCap(event.target.value.replace(/[^0-9.]/g, ""))} placeholder={billing.data?.usageStatus?.overageSpendingCapCents == null ? t("billing.spendingCap.placeholder") : String(billing.data.usageStatus.overageSpendingCapCents / 100)} value={cap} /></label><Button disabled={saveCap.isPending} onClick={() => saveCap.mutate()} size="sm">{saveCap.isPending ? t("billing.spendingCap.saving") : t("billing.spendingCap.save")}</Button></div>{saveCap.isError ? <p className="text-sm text-destructive">{t("billing.spendingCap.saveFailed")}</p> : null}</div></Surface></SectionBlock>

    <SectionBlock description={t("billing.transactions.description")} title={t("billing.transactions.title")}><Transactions transactions={billing.data?.transactions ?? []} t={t} /></SectionBlock>

    <Dialog onOpenChange={setUpgradeOpen} open={upgradeOpen}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>{t("billing.upgradeDialog.title")}</DialogTitle><DialogDescription>{t("billing.upgradeDialog.description")}</DialogDescription></DialogHeader><div className="flex justify-center"><Select onValueChange={(value) => setInterval(value as "monthly" | "annual")} value={interval}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">{t("billing.upgradeDialog.billingIntervals.monthly")}</SelectItem><SelectItem value="annual">{t("billing.upgradeDialog.billingIntervals.annual")} · {t("billing.upgradeDialog.annualDiscount")}</SelectItem></SelectContent></Select></div><div className="grid gap-4 sm:grid-cols-2">{(["starter", "pro"] as const).map((target) => { const item = billingPlanCatalog[target]; const price = interval === "annual" ? item.annualEffectiveMonthlyChargeCents : item.monthlyChargeCents; const disabled = plan === target || (plan === "starter" && target === "starter") || Boolean(checkoutRequestId); return <Surface className="flex flex-col gap-4 p-5" key={target}><div><p className="text-lg font-medium">{t(`billing.upgradeDialog.plans.${target}.name`)}</p><p className="mt-2 text-3xl font-semibold">{money(price ?? 0)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p></div><Button disabled={disabled} onClick={() => startCheckout.mutate(target)}>{startCheckout.isPending ? <Loader2 className="size-4 animate-spin" /> : null}{plan === target ? t("billing.upgradeDialog.actions.currentPlan") : t(`billing.upgradeDialog.actions.${target}`)}</Button></Surface>; })}</div>{startCheckout.isError || checkout.data?.status === "error" ? <p className="text-sm text-destructive">{checkout.data?.error ?? t("billing.toast.checkoutFailed")}</p> : null}<DialogFooter /></DialogContent></Dialog>
  </PageSurface>;
}

type Translate = ReturnType<typeof useTranslation>["t"];
function Transactions({ transactions, t }: { transactions: Billing["transactions"]; t: Translate }) { return <TableCard><Table className="min-w-[42rem]"><TableHeader><TableRow className="hover:bg-transparent"><TableHead>{t("billing.transactions.columns.date")}</TableHead><TableHead>{t("billing.transactions.columns.description")}</TableHead><TableHead className="text-right">{t("billing.transactions.columns.amount")}</TableHead><TableHead>{t("billing.transactions.columns.status")}</TableHead><TableHead className="text-right">{t("billing.transactions.columns.invoice")}</TableHead></TableRow></TableHeader><TableBody>{transactions.length === 0 ? <TableRow><TableCell className="text-muted-foreground" colSpan={5}>{t("billing.transactions.empty")}</TableCell></TableRow> : transactions.map((transaction) => <TableRow key={`${transaction.kind}-${transaction.sourceId}`}><TableCell className="text-muted-foreground">{date(transaction.occurredAt)}</TableCell><TableCell>{transaction.description ?? "—"}</TableCell><TableCell className="text-right font-medium">{transaction.kind === "refund" ? "−" : ""}{money(transaction.amountCents, transaction.currency)}</TableCell><TableCell className="capitalize text-muted-foreground">{transaction.status}</TableCell><TableCell className="text-right">{transaction.invoiceUrl ? <a className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" href={transaction.invoiceUrl} rel="noreferrer" target="_blank">{t("billing.transactions.invoice")}<ArrowUpRight className="size-3" /></a> : "—"}</TableCell></TableRow>)}</TableBody></Table></TableCard>; }
function BillingSkeleton() { return <div className="flex flex-col gap-10"><SectionBlock title=""><Surface className="p-6"><Skeleton className="h-32 w-full" /></Surface></SectionBlock><SectionBlock title=""><Skeleton className="h-40 w-full" /></SectionBlock></div>; }
