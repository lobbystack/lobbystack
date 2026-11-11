"use client";

import { useEffect, useState } from "react";
import { requestJson } from "@/lib/request-json";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useStepNavigation } from "@/lib/use-step-navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { brandLinks, contactEmailFor } from "@lobbystack/shared";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { planCards, billingErrorCodes } from "@lobbystack/shared";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FieldError } from "@/components/ui/field";
import { OnboardingPlanComparison } from "@/components/onboarding-plan-comparison";
import { useTelemetry } from "@/components/product-analytics";
import { CHECKOUT_UNAVAILABLE_AFTER_MS, checkoutRefusalKey, errorCode, isProviderUnavailable } from "@/lib/checkout-errors";
import { cn } from "@/lib/utils";

type BillingInterval = "monthly" | "annual";
type Plan = "free_cloud" | "starter" | "pro" | "enterprise";
type Checkout = { id: string; status: string; checkoutUrl: string | null; error: string | null };
type BillingStatus = { checkoutAvailable: boolean; availableCheckoutPlans?: Array<"starter" | "pro">; availableCheckoutIntervals?: { starter: BillingInterval[]; pro: BillingInterval[] } };


/** The cards each variant shows: the plans after a trial number, or the paid plans when no trial was possible. */
const VARIANT_PLANS: Record<"trial" | "paid", readonly Plan[]> = {
  trial: ["free_cloud", "starter", "pro"],
  paid: ["starter", "pro", "enterprise"],
};

/**
 * The plans in onboarding. `trial` follows a trial number: its first card
 * goes on with the 14-day trial that started when the number was bought.
 * `paid` is the number step's when no trial is possible, with no Free card.
 * Neither has a way to close it.
 */
export function OnboardingPlanSurface({ variant }: { variant: "trial" | "paid" }) {
  const { i18n, t } = useTranslation("onboarding");
  const { navigate, navigating } = useStepNavigation();
  const telemetry = useTelemetry();
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [slowCheckout, setSlowCheckout] = useState(false);
  const [checkoutUnavailable, setCheckoutUnavailable] = useState(false);
  const { business } = useActiveBusiness();
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: () => requestJson<BillingStatus>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business) });
  const checkout = useQuery({
    queryKey: ["onboarding-checkout", business?.businessId, checkoutRequestId],
    queryFn: () => requestJson<Checkout>(`/api/billing/checkout?businessId=${encodeURIComponent(business!.businessId)}&requestId=${encodeURIComponent(checkoutRequestId!)}`),
    enabled: Boolean(checkoutRequestId),
    refetchInterval: (query) => query.state.data?.status === "ready" || query.state.data?.status === "error" ? false : 1_500,
  });
  // The trial clock started when the number was bought, so its card only moves onboarding on.
  const selectFree = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "attribution" }) }),
    onSuccess: () => navigate("/onboarding/attribution"),
    meta: { inlineError: true },
  });
  // After the trial number the plans lead to attribution; without a number they lead back to the number step.
  const afterPaying = variant === "trial" ? { stage: "attribution", route: "/onboarding/attribution" } : { stage: "phone_number", route: "/onboarding/number" };
  const startCheckout = useMutation({
    mutationFn: (target: "starter" | "pro") => requestJson<{ requestId: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, target, billingInterval: interval }) }),
    onSuccess: ({ requestId }) => { setCheckoutUnavailable(false); setCheckoutRequestId(requestId); },
    // Already paying, from a checkout whose return page closed early: onboarding goes on.
    onError: (error) => {
      if (errorCode(error) !== billingErrorCodes.subscriptionActive) return;
      void requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: afterPaying.stage }) })
        .then(() => navigate(afterPaying.route), () => setCheckoutError(t("plan.continueFailed")));
    },
    meta: { inlineError: true },
  });

  useEffect(() => {
    if (!checkoutRequestId) { setSlowCheckout(false); return; }
    setSlowCheckout(false);
    const slow = window.setTimeout(() => setSlowCheckout(true), 10_000);
    const unavailable = window.setTimeout(() => {
      setCheckoutUnavailable(true);
      setCheckoutRequestId(null);
    }, CHECKOUT_UNAVAILABLE_AFTER_MS);
    return () => {
      window.clearTimeout(slow);
      window.clearTimeout(unavailable);
    };
  }, [checkoutRequestId]);
  useEffect(() => {
    if (checkout.data?.status === "error" || checkout.isError) {
      const error = checkout.data?.error;
      setCheckoutError(isProviderUnavailable(error) ? t("settings:billing.toast.paymentsUnavailable") : error?.startsWith("provider_") ? t("plan.continueFailed") : error ?? t("plan.continueFailed"));
      setCheckoutRequestId(null);
    }
  }, [checkout.data, checkout.isError, t]);
  useEffect(() => {
    if (checkout.data?.status === "ready" && checkout.data.checkoutUrl) window.location.assign(checkout.data.checkoutUrl);
  }, [checkout.data]);
  useEffect(() => {
    // The back button from checkout can restore this page from the browser's cache, still
    // waiting on a checkout that already opened. Let them pick a plan again.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setCheckoutRequestId(null);
      setCheckoutUnavailable(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const configuredIntervals = billing.data?.availableCheckoutIntervals;
  const availableIntervals = (["monthly", "annual"] as const).filter(value => !configuredIntervals || configuredIntervals.starter.includes(value) || configuredIntervals.pro.includes(value));
  useEffect(() => {
    if (availableIntervals.length && !availableIntervals.includes(interval)) setInterval(availableIntervals[0]!);
  }, [availableIntervals, interval]);

  const pendingPlan = selectFree.isPending || navigating ? "free_cloud" : startCheckout.isPending || checkoutRequestId ? "paid" : null;
  const refusal = checkoutRefusalKey(startCheckout.error);
  const checkoutFailure = startCheckout.isError && errorCode(startCheckout.error) !== billingErrorCodes.subscriptionActive ? (refusal ? t(`settings:${refusal}`) : startCheckout.error.message) : null;

  function act(plan: Plan) {
    if (!business || pendingPlan) return;
    setCheckoutError(null);
    telemetry.track("web.onboarding.plan_selected", { businessId: business.businessId, plan });
    if (plan === "free_cloud") {
      telemetry.track("web.onboarding.trial_started", { businessId: business.businessId });
      selectFree.mutate();
    }
    else if (plan === "starter" || plan === "pro") {
      telemetry.track("web.onboarding.plan_checkout_started", { businessId: business.businessId, plan });
      startCheckout.mutate(plan);
    }
    else window.location.assign(`mailto:${contactEmailFor(brandLinks(), "sales")}?subject=${encodeURIComponent(t("plan.enterpriseSubject"))}`);
  }

  return (
    <div className="flex flex-col gap-12">

      {!checkoutUnavailable ? <div className="flex justify-center">
        <Tabs onValueChange={(value) => setInterval(value as typeof interval)} value={interval}>
          <TabsList aria-label={t("plan.billingInterval.label")}>
            {(["monthly", "annual"] as const).map((value) => <TabsTrigger disabled={Boolean(pendingPlan) || (availableIntervals.length > 0 && !availableIntervals.includes(value))} key={value} value={value}>{t(`plan.billingInterval.${value}`)}{value === "annual" ? <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{t("plan.billingInterval.save")}</span> : null}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div> : null}
      {checkoutUnavailable ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border/70 bg-muted/20 p-6" role="alert">
          <p className="text-sm text-muted-foreground">{t("settings:billing.toast.paymentsUnavailable")}</p>
          <Button onClick={() => setCheckoutUnavailable(false)} type="button" variant="outline">{t("plan.backToPlans")}</Button>
        </div>
      ) : null}
      {!checkoutUnavailable && slowCheckout ? <p className="text-center text-sm text-muted-foreground" role="status">{t("settings:billing.upgradeDialog.providerSlow")}</p> : null}
      {!checkoutUnavailable ? <div className="grid gap-6 md:grid-cols-3">
        {planCards(i18n.language).filter((tier) => VARIANT_PLANS[variant].includes(tier.slug)).map((tier) => {
          const paid = tier.slug === "starter" || tier.slug === "pro";
          const busy = tier.slug === "free_cloud" ? pendingPlan === "free_cloud" : paid && pendingPlan === "paid";
          const price = tier.price[interval];
          const trial = tier.slug === "free_cloud";
          const description = trial ? t("plan.trial.description") : tier.description[interval];
          const cta = trial ? t("plan.trial.start") : paid ? t("plan.subscribe") : tier.cta;
          return <section className={cn("relative flex flex-col rounded-xl border bg-background p-8", tier.featured ? "border-foreground/30" : "border-border/60")} key={tier.slug}>
            {tier.featured ? <div className="absolute -top-3 left-8 rounded-full bg-foreground px-3 py-0.5 text-xs font-medium text-background">{t("plan.popular")}</div> : null}
            <div className="mb-6"><h3 className="font-heading text-lg font-semibold tracking-tight">{tier.name}</h3><div className="mt-3 flex items-baseline gap-1"><span className="font-heading text-4xl font-semibold tracking-tighter">{price}</span><span className="text-sm text-muted-foreground">{tier.period}</span></div><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p></div>
            <Button className="mb-6 w-full rounded-full" disabled={!business || Boolean(pendingPlan) || (paid && (!billing.data?.checkoutAvailable || (configuredIntervals && !configuredIntervals[tier.slug as "starter" | "pro"].includes(interval))))} onClick={() => act(tier.slug)} type="button" variant={tier.featured ? "default" : "outline"}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <>{cta}<ArrowRight className="ml-1 size-4" /></>}</Button>
            <div className="flex-1 border-t border-border/50 pt-5"><ul className="space-y-2.5">{tier.lines.map((line) => <li className="flex items-start gap-2.5 text-sm" key={line.label}><Check className="mt-0.5 size-3.5 shrink-0 text-foreground/60" /><span className="whitespace-pre-line">{line.sublabel ? `${line.label}\n${line.sublabel}` : line.label}</span></li>)}</ul></div>
          </section>;
        })}
      </div> : null}
      {selectFree.isError || checkoutFailure || checkoutError ? <FieldError>{selectFree.error?.message ?? checkoutFailure ?? checkoutError ?? t("plan.continueFailed")}</FieldError> : null}
      <OnboardingPlanComparison locale={i18n.language} t={t} />
    </div>
  );
}
