"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { paidPartnerTierSlugs, partnerTierCatalog, type BillingInterval, type PaidPartnerTierSlug, type PartnerTierSlug } from "@lobbystack/shared";
import { formatMoney } from "@/components/billing-spending-cap";
import { PageHeader } from "@/components/page-header";
import { PoolOverageSection, PoolUsageSection, type PoolOverage, type PoolUsage } from "@/components/partner-pool-surface";
import { useConsolePartner } from "@/components/partner-shell";
import { useTelemetry } from "@/components/product-analytics";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { formatDateTime, intlLocale } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";

type Billing = {
  billed: boolean;
  tier: PartnerTierSlug;
  billingInterval: BillingInterval | null;
  subscriptionState: string | null;
  /** The tier's pool, or without tier billing the one the host set, where a null kind has no limit. */
  pool: { voiceSeconds: number | null; chats: number | null } | null;
  includedNumbers: number;
  trialNumbers: number;
  currentPeriodEnd: string | null;
  endsAt: string | null;
  hasCustomerPortal: boolean;
  numbersHeld: number;
  numbersCounted: boolean;
  poolUsage: PoolUsage | null;
  poolOverage: PoolOverage;
  trialNumber: "available" | "used" | null;
};
type Checkout = { requestId: string; tier: PaidPartnerTierSlug; billingInterval: BillingInterval; status: string; checkoutUrl: string | null; synced: boolean };

/** A rate of a fraction of a cent, such as $0.015, keeps its third decimal. */
function formatRate(cents: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(cents / 100);
}

/**
 * What a tier gives the partner's businesses between them, from the catalog.
 * `numbers` says whether the deployment counts phone numbers against the tier;
 * without it, the page says nothing about them. `trial` says whether it
 * offers Free's one 14-day trial number.
 */
function TierTerms({ tier, numbers, trial = false }: { tier: PartnerTierSlug; numbers: boolean; trial?: boolean }) {
  const { t, i18n } = useTranslation("partner");
  const terms = partnerTierCatalog[tier];
  const count = (value: number) => new Intl.NumberFormat(intlLocale(i18n.language)).format(value);
  const lines = [
    t("billing.terms.minutes", { count: terms.poolVoiceSeconds / 60, formatted: count(terms.poolVoiceSeconds / 60) }),
    t("billing.terms.chats", { count: terms.poolChats, formatted: count(terms.poolChats) }),
    ...(numbers ? [
      terms.includedNumbers > 0 ? t("billing.terms.numbers", { count: terms.includedNumbers }) : trial && terms.trialNumbers > 0 ? t("billing.terms.trialNumber") : t("billing.terms.noNumbers"),
      // A paid tier can hold numbers past the ones it includes, at what the host pays for them.
      ...(terms.paid ? [t("billing.terms.extraNumbers")] : []),
    ] : []),
    terms.voiceOverageRatePerMinuteCents !== null && terms.chatOverageRatePerChatCents !== null
      ? t("billing.terms.overage", { minute: formatRate(terms.voiceOverageRatePerMinuteCents, i18n.language), chat: formatRate(terms.chatOverageRatePerChatCents, i18n.language) })
      : t("billing.terms.noOverage"),
  ];
  return (
    <ul className="flex flex-col gap-3">
      {lines.map((line) => (
        <li className="flex items-start gap-2.5 text-sm" key={line}>
          <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

/** The price a tier shows for an interval: per month, with what a year costs when billed yearly. */
function TierPrice({ tier, interval }: { tier: PaidPartnerTierSlug; interval: BillingInterval }) {
  const { t, i18n } = useTranslation("partner");
  const terms = partnerTierCatalog[tier];
  const monthly = interval === "annual" ? terms.annualEffectiveMonthlyChargeCents : terms.monthlyChargeCents;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-1">
        <span className="font-heading text-4xl font-medium tracking-[-0.05em] tabular-nums">{formatMoney(monthly, "usd", i18n.language)}</span>
        <span className="text-sm text-muted-foreground">{t("billing.price.perMonth")}</span>
      </div>
      <p className="text-sm text-muted-foreground">{interval === "annual" ? t("billing.price.billedYearly", { price: formatMoney(terms.annualChargeCents, "usd", i18n.language) }) : t("billing.price.billedMonthly")}</p>
    </div>
  );
}

/** The numbers the partner's businesses hold between them, and how many of them it pays extra for each month. */
function NumbersInUse({ held, included }: { held: number; included: number }) {
  const { t, i18n } = useTranslation("partner");
  const count = (value: number) => new Intl.NumberFormat(intlLocale(i18n.language)).format(value);
  const extra = Math.max(0, held - included);
  return (
    <p className="text-sm text-muted-foreground">
      {extra > 0 ? t("billing.numbers.extra", { count: extra, held: count(held) }) : t("billing.numbers.used", { held: count(held), included: count(included) })}
    </p>
  );
}

const CHECKOUT_ERRORS: Record<string, string> = {
  subscription_active: "billing.errors.subscriptionActive",
  checkout_in_progress: "billing.errors.checkoutInProgress",
  tier_billing_unavailable: "billing.errors.unavailable",
  owner_only: "billing.ownersOnly",
};

/**
 * The console's Billing page, for owners only: the tier the partner pays the
 * host for, and the minutes, chats and numbers it gives the partner's
 * businesses between them. A partner on Free picks a paid tier and pays at a
 * Polar checkout; a paying partner manages its tier in Polar's customer
 * portal. Owners see the pool's use this month and set its overage and cap.
 * On a deployment that bills no tiers, owners see only this month's use of
 * the pool the host set, with no prices, tiers or overage. The server
 * enforces the same rules.
 */
export function PartnerBillingSurface() {
  const { t, i18n } = useTranslation("partner");
  const partner = useConsolePartner();
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const returnedRequestId = useSearchParams().get("checkout");
  const isOwner = partner.role === "owner";
  const queryKey = ["partner-billing", partner.partnerId];
  const query = (path: string) => `${path}?partnerId=${encodeURIComponent(partner.partnerId)}`;
  const billing = useQuery({ queryKey, enabled: isOwner, queryFn: () => requestJson<Billing>(query("/api/partner/billing")) });
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [pending, setPending] = useState<{ requestId: string; tier: PaidPartnerTierSlug } | null>(null);
  const [portalPending, setPortalPending] = useState(false);
  // Leave for each checkout once: a page restored from the browser's cache can rerun the effect with the old one.
  const redirected = useRef<string | null>(null);
  // Record each tier's start once, however often the page rerenders before the address loses the checkout.
  const started = useRef<string | null>(null);

  const start = useMutation({
    mutationFn: (tier: PaidPartnerTierSlug) => requestJson<{ requestId: string }>(query("/api/partner/billing/checkout"), { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, tier, billingInterval: interval }) }),
    onSuccess: (result, tier) => setPending({ requestId: result.requestId, tier }),
    onError: (error: Error & { code?: string }) => toast.error(t(CHECKOUT_ERRORS[error.code ?? ""] ?? "billing.errors.checkoutFailed")),
  });
  const opening = useQuery({
    queryKey: ["partner-billing-checkout", partner.partnerId, pending?.requestId],
    enabled: Boolean(pending),
    queryFn: () => requestJson<Checkout>(`${query("/api/partner/billing/checkout")}&requestId=${encodeURIComponent(pending!.requestId)}`),
    refetchInterval: (state) => ["ready", "error", "superseded"].includes(state.state.data?.status ?? "") ? false : 1_500,
  });
  useEffect(() => {
    if (!pending) return;
    if (opening.data?.status === "ready" && opening.data.checkoutUrl && redirected.current !== pending.requestId) {
      redirected.current = pending.requestId;
      window.location.assign(opening.data.checkoutUrl);
    }
    if (opening.isError || opening.data?.status === "error" || opening.data?.status === "superseded") {
      toast.error(t("billing.errors.checkoutFailed"));
      setPending(null);
    }
  }, [opening.data, opening.isError, pending, t]);
  useEffect(() => {
    // The back button from checkout can restore this page from the cache, still waiting on a checkout that opened.
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) setPending(null); };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Polar sends the owner back here after paying, while its events may still be on their way.
  const returned = useQuery({
    queryKey: ["partner-billing-checkout", partner.partnerId, returnedRequestId],
    enabled: isOwner && Boolean(returnedRequestId),
    queryFn: () => requestJson<Checkout>(`${query("/api/partner/billing/checkout")}&requestId=${encodeURIComponent(returnedRequestId!)}`),
    refetchInterval: (state) => state.state.data?.synced ? false : 2_000,
  });
  useEffect(() => {
    if (!returnedRequestId) return;
    if (returned.data?.synced) {
      if (started.current !== returnedRequestId) {
        started.current = returnedRequestId;
        telemetry.track("web.partner.tier_started", { partnerId: partner.partnerId, tier: returned.data.tier, billingInterval: returned.data.billingInterval, pathname });
      }
      toast.success(t("billing.checkout.done", { tier: t(`billing.tiers.${returned.data.tier}`) }));
      void queryClient.invalidateQueries({ queryKey: ["partner-billing", partner.partnerId] });
      router.replace(pathname);
    } else if (returned.isError) {
      router.replace(pathname);
    }
  }, [partner.partnerId, pathname, queryClient, returned.data, returned.isError, returnedRequestId, router, t, telemetry]);

  async function openPortal() {
    setPortalPending(true);
    try {
      const result = await requestJson<{ url: string }>(query("/api/partner/billing/portal"), { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId }) });
      window.location.assign(result.url);
    } catch {
      toast.error(t("billing.errors.portalFailed"));
      setPortalPending(false);
    }
  }

  const header = (
    <PageHeader title={t("billing.title")} />
  );
  if (!isOwner) return <div className="flex flex-col gap-6">{header}<Surface className="px-6 py-8"><p className="text-sm text-muted-foreground">{t("billing.ownersOnly")}</p></Surface></div>;
  if (billing.isLoading) return <div className="flex flex-col gap-6">{header}<Surface className="flex flex-col gap-4 p-6"><Skeleton className="h-6 w-32" /><Skeleton className="h-10 w-48" /><Skeleton className="h-24 w-full" /></Surface></div>;
  if (billing.isError || !billing.data) return <div className="flex flex-col gap-6">{header}<Surface className="px-6 py-8"><p className="text-sm text-muted-foreground" role="alert">{t("billing.loadFailed")}</p></Surface></div>;

  const current = billing.data;
  if (!current.billed) {
    // Without tier billing, the host may set the pool. Nothing prices usage past it, so the page shows no tier, price or overage.
    if (!current.pool || !current.poolUsage) return <div className="flex flex-col gap-6">{header}<Surface className="px-6 py-8"><p className="text-sm text-muted-foreground">{t("billing.unavailable")}</p></Surface></div>;
    return (
      <div className="flex flex-col gap-6">
        {header}
        <PoolUsageSection pool={current.pool} usage={current.poolUsage} />
        <Surface className="px-6 py-5"><p className="text-sm text-muted-foreground">{t("billing.hostPool.limit")}</p></Surface>
      </div>
    );
  }
  const date = (value: string) => formatDateTime(value, i18n.language, { month: "short", day: "numeric", year: "numeric" });
  const busy = start.isPending || pending !== null;

  return (
    <div className="flex flex-col gap-6">
      {header}
      {returnedRequestId && !returned.data?.synced && !returned.isError ? (
        <Alert><AlertDescription>{t("billing.checkout.confirming")}</AlertDescription></Alert>
      ) : null}
      {current.subscriptionState === "past_due" ? (
        <Alert variant="destructive"><AlertDescription>{t("billing.pastDue")}</AlertDescription></Alert>
      ) : null}

      <section aria-labelledby="partner-billing-current" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground" id="partner-billing-current">{t("billing.current.title")}</h2>
        <Surface className="flex flex-col gap-6 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-medium leading-7">{t(`billing.tiers.${current.tier}`)}</span>
              {current.billingInterval ? <Badge variant="secondary">{t(`billing.intervals.${current.billingInterval}`)}</Badge> : null}
            </div>
            {current.tier === "free" ? <p className="text-sm text-muted-foreground">{t("billing.current.free")}</p> : <TierPrice interval={current.billingInterval ?? "monthly"} tier={current.tier} />}
            <TierTerms numbers={current.numbersCounted} tier={current.tier} trial={Boolean(current.trialNumber)} />
            {current.tier === "free" || !current.numbersCounted ? null : <NumbersInUse held={current.numbersHeld} included={current.includedNumbers} />}
            {current.trialNumber ? <p className="text-sm text-muted-foreground">{t(current.trialNumber === "available" ? "billing.trial.available" : "billing.trial.used")}</p> : null}
            {current.endsAt ? <p className="text-sm text-muted-foreground">{t("billing.current.endsOn", { date: date(current.endsAt) })}</p> : current.currentPeriodEnd ? <p className="text-sm text-muted-foreground">{t("billing.current.renewsOn", { date: date(current.currentPeriodEnd) })}</p> : null}
          </div>
          {current.hasCustomerPortal ? (
            <Button disabled={portalPending} loading={portalPending} loadingLabel={t("billing.portal.opening")} onClick={() => void openPortal()} variant="outline">{t("billing.portal.action")}</Button>
          ) : null}
        </Surface>
      </section>

      {current.poolUsage && current.pool ? <PoolUsageSection pool={current.pool} usage={current.poolUsage} /> : null}
      <PoolOverageSection overage={current.poolOverage} partnerId={partner.partnerId} spendCents={current.poolUsage?.overageSpendCents ?? 0} />

      {current.tier === "free" ? (
        <section aria-labelledby="partner-billing-tiers" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-medium text-muted-foreground" id="partner-billing-tiers">{t("billing.choose.title")}</h2>
            <div aria-label={t("billing.choose.intervalLabel")} className="inline-flex self-start rounded-full border border-border bg-muted/40 p-1" role="tablist">
              {(["monthly", "annual"] as const).map((option) => (
                <Button
                  aria-selected={interval === option}
                  className={cn("h-9 rounded-full px-4", interval === option ? "bg-background text-foreground shadow-sm hover:bg-background" : "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground")}
                  key={option}
                  onClick={() => setInterval(option)}
                  role="tab"
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t(`billing.intervals.${option}`)}
                  {option === "annual" ? <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{t("billing.choose.annualDiscount")}</span> : null}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {paidPartnerTierSlugs.map((tier) => (
              <Surface className="flex flex-col gap-5 p-5" key={tier}>
                <h3 className="font-heading text-lg font-medium tracking-[-0.03em]">{t(`billing.tiers.${tier}`)}</h3>
                <TierPrice interval={interval} tier={tier} />
                <div className="flex-1 border-t border-border/60 pt-4"><TierTerms numbers={current.numbersCounted} tier={tier} /></div>
                <Button
                  className="w-full rounded-full"
                  disabled={busy}
                  loading={(start.isPending && start.variables === tier) || pending?.tier === tier}
                  loadingLabel={t("billing.choose.opening")}
                  onClick={() => start.mutate(tier)}
                  type="button"
                >
                  {t("billing.choose.action", { tier: t(`billing.tiers.${tier}`) })}
                </Button>
              </Surface>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
