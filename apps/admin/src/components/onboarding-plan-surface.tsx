"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { requestJson } from "@/lib/request-json";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useStepNavigation } from "@/lib/use-step-navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { brandLinks, contactEmailFor } from "@lobbystack/shared";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { planCards, billingErrorCodes } from "@lobbystack/shared";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { OnboardingPlanComparison } from "@/components/onboarding-plan-comparison";
import { useTelemetry } from "@/components/product-analytics";
import { checkoutRefusalKey, errorCode } from "@/lib/checkout-errors";
import { cn } from "@/lib/utils";

type BillingInterval = "monthly" | "annual";
type Plan = "free_cloud" | "starter" | "pro" | "enterprise";
type Checkout = { id: string; status: string; checkoutUrl: string | null; error: string | null };
type BillingStatus = { checkoutAvailable: boolean; availableCheckoutPlans?: Array<"starter" | "pro">; availableCheckoutIntervals?: { starter: BillingInterval[]; pro: BillingInterval[] } };


export function OnboardingPlanSurface() {
  const { i18n, t } = useTranslation("onboarding");
  const { navigate, navigating, router } = useStepNavigation();
  const telemetry = useTelemetry();
  const searchParams = useSearchParams();
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const { business } = useActiveBusiness();
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: () => requestJson<BillingStatus>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business) });
  const checkout = useQuery({
    queryKey: ["onboarding-checkout", business?.businessId, checkoutRequestId],
    queryFn: () => requestJson<Checkout>(`/api/billing/checkout?businessId=${encodeURIComponent(business!.businessId)}&requestId=${encodeURIComponent(checkoutRequestId!)}`),
    enabled: Boolean(checkoutRequestId),
    refetchInterval: (query) => query.state.data?.status === "ready" || query.state.data?.status === "error" ? false : 1_500,
  });
  const selectFree = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "attribution" }) }),
    onSuccess: () => navigate("/onboarding/attribution"),
    meta: { inlineError: true },
  });
  const startCheckout = useMutation({
    mutationFn: (target: "starter" | "pro") => requestJson<{ requestId: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, target, billingInterval: interval }) }),
    onSuccess: ({ requestId }) => setCheckoutRequestId(requestId),
    // Already paying, from a checkout whose return page closed early: the number is next.
    onError: (error) => {
      if (errorCode(error) !== billingErrorCodes.subscriptionActive) return;
      void requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "phone_number" }) })
        .then(() => navigate("/onboarding/number"), () => setCheckoutError(t("plan.continueFailed")));
    },
    meta: { inlineError: true },
  });

  // Checkouts opened before the success page existed still return here.
  const returnRequestId = searchParams.get("checkout") === "success" ? searchParams.get("requestId") : null;
  useEffect(() => { if (returnRequestId) router.replace(`/billing/success?requestId=${encodeURIComponent(returnRequestId)}`); }, [returnRequestId, router]);
  useEffect(() => {
    if (checkout.data?.status === "error" || checkout.isError) {
      setCheckoutError(checkout.data?.error ?? t("plan.continueFailed"));
      setCheckoutRequestId(null);
    }
  }, [checkout.data, checkout.isError, t]);
  useEffect(() => {
    if (checkout.data?.status === "ready" && checkout.data.checkoutUrl) window.location.assign(checkout.data.checkoutUrl);
  }, [checkout.data]);
  useEffect(() => {
    // The back button from checkout can restore this page from the browser's cache, still
    // waiting on a checkout that already opened. Let them pick a plan again.
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) setCheckoutRequestId(null); };
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
    if (plan === "free_cloud") selectFree.mutate();
    else if (plan === "starter" || plan === "pro") {
      telemetry.track("web.onboarding.plan_checkout_started", { businessId: business.businessId, plan });
      startCheckout.mutate(plan);
    }
    else window.location.assign(`mailto:${contactEmailFor(brandLinks(), "sales")}?subject=${encodeURIComponent(t("plan.enterpriseSubject"))}`);
  }

  return (
    <div className="flex flex-col gap-12">

      <div className="flex justify-center">
        <div aria-label={t("plan.billingInterval.label")} className="inline-flex rounded-full border border-border bg-input/30 p-1" role="tablist">
          {(["monthly", "annual"] as const).map((value) => <Button aria-selected={interval === value} className={cn("h-9 rounded-full px-4", interval === value ? "bg-background text-foreground shadow-sm hover:bg-background" : "border-transparent bg-transparent text-muted-foreground hover:bg-muted")} disabled={Boolean(pendingPlan) || (availableIntervals.length > 0 && !availableIntervals.includes(value))} key={value} onClick={() => setInterval(value)} role="tab" size="sm" type="button" variant="outline">{t(`plan.billingInterval.${value}`)}{value === "annual" ? <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{t("plan.billingInterval.save")}</span> : null}</Button>)}
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {planCards(i18n.language).map((tier) => {
          const paid = tier.slug === "starter" || tier.slug === "pro";
          const busy = tier.slug === "free_cloud" ? pendingPlan === "free_cloud" : paid && pendingPlan === "paid";
          const price = tier.price[interval];
          const description = tier.description[interval];
          const cta = tier.cta;
          return <section className={cn("relative flex flex-col rounded-2xl border bg-background p-8", tier.featured ? "border-foreground/30 shadow-sm" : "border-border/60")} key={tier.slug}>
            {tier.featured ? <div className="absolute -top-3 left-8 rounded-full bg-foreground px-3 py-0.5 text-xs font-medium text-background">{t("plan.popular")}</div> : null}
            <div className="mb-6"><h3 className="font-heading text-lg font-semibold tracking-tight">{tier.name}</h3><div className="mt-3 flex items-baseline gap-1"><span className="font-heading text-4xl font-semibold tracking-tighter">{price}</span><span className="text-sm text-muted-foreground">{tier.period}</span></div><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p></div>
            <Button className="mb-6 w-full rounded-full" disabled={!business || Boolean(pendingPlan) || (paid && (!billing.data?.checkoutAvailable || (configuredIntervals && !configuredIntervals[tier.slug as "starter" | "pro"].includes(interval))))} onClick={() => act(tier.slug)} type="button" variant={tier.featured ? "default" : "outline"}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <>{cta}<ArrowRight className="ml-1 size-4" /></>}</Button>
            <div className="flex-1 border-t border-border/50 pt-5"><ul className="space-y-2.5">{tier.lines.map((line) => <li className="flex items-start gap-2.5 text-sm" key={line.label}><Check className="mt-0.5 size-3.5 shrink-0 text-foreground/60" /><span className="whitespace-pre-line">{line.sublabel ? `${line.label}\n${line.sublabel}` : line.label}</span></li>)}</ul></div>
          </section>;
        })}
      </div>
      {selectFree.isError || checkoutFailure || checkoutError ? <FieldError>{selectFree.error?.message ?? checkoutFailure ?? checkoutError ?? t("plan.continueFailed")}</FieldError> : null}
      <OnboardingPlanComparison locale={i18n.language} t={t} />
    </div>
  );
}
