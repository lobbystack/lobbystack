"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, ExternalLinkIcon, GiftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PageSurface } from "./page-surface";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "./ui/item";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

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

async function updatePayoutEmail(payoutEmail: string): Promise<void> {
  const response = await fetch("/api/affiliate", { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ payoutEmail }) });
  if (!response.ok) throw new Error("Unable to update payout email.");
}

function formatCurrency(amountCents: number, currency = "usd"): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amountCents / 100);
}

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function StatCard({ description, label, value }: { description: string; label: string; value: string }) {
  return <Card size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{description}</p></CardContent></Card>;
}

function LoadingAffiliatePage() {
  return <div className="flex flex-1 flex-col gap-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-40" /><div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div></div>;
}

export function LiveAffiliateSurface() {
  const { t } = useTranslation("affiliate");
  const queryClient = useQueryClient();
  const affiliate = useQuery({ queryKey: ["affiliate"], queryFn: getAffiliate });
  const [payoutEmail, setPayoutEmail] = useState("");
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const saveEmail = useMutation({ mutationFn: updatePayoutEmail, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["affiliate"] }); toast.success(t("toast.paypalSaved")); setIsDialogOpen(false); }, onError: () => setPayoutError(t("toast.paypalFailed")) });

  const summary = useMemo(() => {
    if (!affiliate.data?.stats) return null;
    const now = Date.now();
    const eligibleCents = affiliate.data.commissions.filter((commission) => commission.status === "pending" && commission.payoutState === "unassigned" && new Date(commission.clearsAt).getTime() <= now).reduce((total, commission) => total + commission.commissionCents, 0);
    return { ...affiliate.data.stats, eligibleCents, pendingCents: Math.max(0, affiliate.data.stats.pendingCommissionCents - eligibleCents) };
  }, [affiliate.data]);

  if (affiliate.isLoading) return <LoadingAffiliatePage />;
  if (affiliate.isError) return <PageSurface description="" title={t("title")}><Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{t("toast.profileFailed")}</CardContent></Card></PageSurface>;

  const data = affiliate.data;
  const profile = data?.profile ?? null;
  const currency = data?.commissions[0]?.currency ?? data?.payouts[0]?.currency ?? "usd";

  async function handleCopy() {
    if (!profile?.referralLink) return;
    await navigator.clipboard.writeText(profile.referralLink);
    toast.success(t("toast.copied"));
  }

  return (
    <PageSurface description="" title={t("title")}>
      <Card><CardContent className="flex flex-col gap-8">
        <div className="flex flex-col gap-4"><CardTitle>{t("referral.title")}</CardTitle>{profile ? <div className="flex flex-col gap-2 sm:flex-row"><Input readOnly value={profile.referralLink} /><Button onClick={() => void handleCopy()} type="button"><CopyIcon data-icon="inline-start" />{t("referral.copy")}</Button></div> : <p className="text-sm text-muted-foreground">{t("toast.profileFailed")}</p>}</div>
        <div className="flex flex-col gap-4"><div className="flex items-center justify-between gap-4"><CardTitle>{t("terms.title")}</CardTitle><a className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href="/terms/#affiliate-program" rel="noreferrer" target="_blank">{t("terms.link")}<ExternalLinkIcon aria-hidden="true" className="size-4" /></a></div><div className="flex flex-col gap-4"><div className="flex items-center gap-3"><GiftIcon aria-hidden="true" className="size-4 shrink-0" /><p className="text-base font-medium text-foreground">{t("terms.reward", { rate: "20%", duration: t("terms.oneYear") })}</p></div><Separator /><div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span><span className="font-medium text-foreground">{formatCurrency(10_000, currency)}</span>{" "}<span className="lowercase">{t("terms.minimum")}</span></span><span aria-hidden="true">/</span><span><span className="font-medium text-foreground">{t("terms.days", { count: 30 })}</span>{" "}<span className="lowercase">{t("terms.hold")}</span></span></div></div></div>
      </CardContent></Card>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard description={t("stats.clicksDescription")} label={t("stats.clicks")} value={String(summary?.clickCount ?? 0)} /><StatCard description={t("stats.referralsDescription")} label={t("stats.referrals")} value={String(summary?.referralCount ?? 0)} /><StatCard description={t("stats.conversionsDescription")} label={t("stats.conversions")} value={String(summary?.conversionCount ?? 0)} /><StatCard description={t("stats.pendingDescription")} label={t("stats.pending")} value={formatCurrency(summary?.pendingCents ?? 0, currency)} /><StatCard description={(summary?.eligibleCents ?? 0) >= 10_000 ? t("stats.eligibleReady") : t("stats.eligibleWaiting")} label={t("stats.eligible")} value={formatCurrency(summary?.eligibleCents ?? 0, currency)} /><StatCard description={t("stats.paidDescription")} label={t("stats.paid")} value={formatCurrency(summary?.paidCommissionCents ?? 0, currency)} />
      </div>

      <Tabs defaultValue="quickstart">
        <TabsList variant="line"><TabsTrigger value="quickstart">{t("tabs.quickstart")}</TabsTrigger><TabsTrigger value="earnings">{t("tabs.earnings")}</TabsTrigger><TabsTrigger value="payouts">{t("tabs.payouts")}</TabsTrigger><TabsTrigger value="faq">{t("tabs.faq")}</TabsTrigger><TabsTrigger value="settings">{t("settings.open")}</TabsTrigger></TabsList>
        <TabsContent className="pt-4" value="quickstart"><div className="grid gap-4 md:grid-cols-3">{["share", "resources", "receive"].map((key) => <Card key={key}><CardHeader><CardTitle>{t(`quickstart.${key}.title`)}</CardTitle><CardDescription>{t(`quickstart.${key}.description`)}</CardDescription></CardHeader></Card>)}</div></TabsContent>
        <TabsContent className="pt-4" value="earnings"><CommissionsTable commissions={data?.commissions ?? []} t={t} /></TabsContent>
        <TabsContent className="pt-4" value="payouts"><PayoutsTable payoutEmail={profile?.payoutEmail ?? null} payouts={data?.payouts ?? []} t={t} /></TabsContent>
        <TabsContent className="pt-4" value="faq"><div className="grid gap-4 md:grid-cols-2">{["when", "minimum", "method", "refunds"].map((key) => <Card key={key}><CardHeader><CardTitle>{t(`faq.${key}.question`)}</CardTitle><CardDescription>{t(`faq.${key}.answer`)}</CardDescription></CardHeader></Card>)}</div></TabsContent>
        <TabsContent className="pt-4" value="settings"><ItemGroup spacing="section"><Item variant="outline"><ItemContent><ItemTitle>{t("settings.title")}</ItemTitle><ItemDescription>{t("settings.description")}</ItemDescription><p className="text-[15px] leading-6 text-foreground">{profile?.payoutEmail ? t("settings.currentEmail", { email: profile.payoutEmail }) : t("settings.noEmail")}</p></ItemContent><ItemActions>{profile ? <Dialog onOpenChange={(open) => { setIsDialogOpen(open); if (open) { setPayoutEmail(profile.payoutEmail ?? ""); setPayoutError(null); } }} open={isDialogOpen}><DialogTrigger render={<Button size="sm" variant="outline" />}>{t("settings.change")}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{t("settings.dialogTitle")}</DialogTitle></DialogHeader><form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); setPayoutError(null); saveEmail.mutate(payoutEmail); }}><FieldGroup><Field><FieldLabel htmlFor="payout-email">{t("settings.paypalEmail")}</FieldLabel><Input autoComplete="email" id="payout-email" onChange={(event) => setPayoutEmail(event.target.value)} placeholder={t("settings.paypalPlaceholder")} type="email" value={payoutEmail} /></Field></FieldGroup>{payoutError ? <FieldError>{payoutError}</FieldError> : null}<DialogFooter><Button disabled={saveEmail.isPending} type="submit">{saveEmail.isPending ? t("settings.saving") : t("settings.save")}</Button></DialogFooter></form></DialogContent></Dialog> : null}</ItemActions></Item></ItemGroup></TabsContent>
      </Tabs>
    </PageSurface>
  );
}

type Translate = ReturnType<typeof useTranslation>["t"];

function CommissionsTable({ commissions, t }: { commissions: AffiliateData["commissions"]; t: Translate }) {
  return <TableCard><Table><TableHeader><TableRow><TableHead>{t("earnings.date")}</TableHead><TableHead>{t("earnings.sale")}</TableHead><TableHead>{t("earnings.commission")}</TableHead><TableHead>{t("earnings.clears")}</TableHead><TableHead>{t("earnings.status")}</TableHead></TableRow></TableHeader><TableBody>{commissions.length === 0 ? <TableRow><TableCell className="text-muted-foreground" colSpan={5}>{t("earnings.empty")}</TableCell></TableRow> : commissions.map((commission) => <TableRow key={commission.sourceKey}><TableCell>{formatDate(commission.occurredAt)}</TableCell><TableCell>{formatCurrency(commission.amountCents, commission.currency)}</TableCell><TableCell>{formatCurrency(commission.commissionCents, commission.currency)}</TableCell><TableCell>{formatDate(commission.clearsAt)}</TableCell><TableCell><Badge variant="secondary">{t(`statuses.${commission.status}`, { defaultValue: commission.status })}</Badge></TableCell></TableRow>)}</TableBody></Table></TableCard>;
}

function PayoutsTable({ payoutEmail, payouts, t }: { payoutEmail: string | null; payouts: AffiliateData["payouts"]; t: Translate }) {
  return <TableCard><Table><TableHeader><TableRow><TableHead>{t("payouts.date")}</TableHead><TableHead>{t("payouts.amount")}</TableHead><TableHead>{t("payouts.paypal")}</TableHead><TableHead>{t("payouts.status")}</TableHead><TableHead>{t("payouts.reference")}</TableHead></TableRow></TableHeader><TableBody>{payouts.length === 0 ? <TableRow><TableCell className="text-muted-foreground" colSpan={5}>{t("payouts.empty")}</TableCell></TableRow> : payouts.map((payout) => <TableRow key={`${payout.periodKey}-${payout.amountCents}`}><TableCell>{payout.paidAt ? formatDate(payout.paidAt) : payout.periodKey}</TableCell><TableCell>{formatCurrency(payout.amountCents, payout.currency)}</TableCell><TableCell>{payoutEmail ?? "—"}</TableCell><TableCell><Badge variant="secondary">{t(`statuses.${payout.status}`, { defaultValue: payout.status })}</Badge></TableCell><TableCell>{payout.externalReference ?? t("payouts.noReference")}</TableCell></TableRow>)}</TableBody></Table></TableCard>;
}
