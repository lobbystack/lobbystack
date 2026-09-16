"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { OnboardingPlanComparison } from "@/components/onboarding-plan-comparison";
import { cn } from "@/lib/utils";

type Business = { businessId: string; active: boolean };
type BillingInterval = "monthly" | "annual";
type Plan = "free_cloud" | "starter" | "pro" | "enterprise";
type Checkout = { id: string; status: string; checkoutUrl: string | null; error: string | null };
type BillingStatus = { checkoutAvailable: boolean; availableCheckoutPlans?: Array<"starter" | "pro">; availableCheckoutIntervals?: { starter: BillingInterval[]; pro: BillingInterval[] } };

const tiers: Array<{ slug: Plan; highlight?: boolean; features: string[] }> = [
  { slug: "free_cloud", features: ["voiceMinutes", "bookingContacts", "support"] },
  { slug: "starter", features: ["voiceMinutes", "dedicatedNumber", "alertSms", "support"] },
  { slug: "pro", highlight: true, features: ["voiceMinutes", "dedicatedNumber", "alertSms", "support"] },
  { slug: "enterprise", features: ["phoneNumbers", "routing", "selfHosted", "support"] },
];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function OnboardingPlanSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const returnAttempt = useRef<{ key: string; promise: Promise<unknown> } | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: () => requestJson<BillingStatus>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business) });
  const checkout = useQuery({
    queryKey: ["onboarding-checkout", business?.businessId, checkoutRequestId],
    queryFn: () => requestJson<Checkout>(`/api/billing/checkout?businessId=${encodeURIComponent(business!.businessId)}&requestId=${encodeURIComponent(checkoutRequestId!)}`),
    enabled: Boolean(checkoutRequestId),
    refetchInterval: (query) => query.state.data?.status === "ready" || query.state.data?.status === "error" ? false : 1_500,
  });
  const selectFree = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "attribution" }) }),
    onSuccess: () => router.push("/onboarding/attribution"),
  });
  const startCheckout = useMutation({
    mutationFn: (target: "starter" | "pro") => requestJson<{ requestId: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, target, billingInterval: interval }) }),
    onSuccess: ({ requestId }) => setCheckoutRequestId(requestId),
  });

  const returnRequestId = searchParams.get("checkout") === "success" ? searchParams.get("requestId") : null;
  const returnedCheckout = useQuery({
    queryKey: ["onboarding-checkout-return", business?.businessId, returnRequestId],
    enabled: Boolean(business && returnRequestId),
    queryFn: () => requestJson<{ synced: boolean }>(`/api/billing/checkout?businessId=${encodeURIComponent(business!.businessId)}&requestId=${encodeURIComponent(returnRequestId!)}`),
    refetchInterval: query => query.state.data?.synced ? false : 1500,
  });
  useEffect(() => {
    const key = `${business?.businessId}:${returnRequestId}`;
    if (!business || !returnRequestId || !returnedCheckout.data?.synced) return;
    if (returnAttempt.current?.key !== key) returnAttempt.current = { key, promise: requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business.businessId)}`, { method: "POST", body: JSON.stringify({ to: "phone_number" }) }) };
    let cancelled = false;
    void returnAttempt.current.promise.then(() => {
      if (!cancelled) router.replace("/onboarding/number");
    }).catch(() => { if (!cancelled) returnAttempt.current = null; });
    return () => { cancelled = true; };
  }, [business, returnRequestId, returnedCheckout.data?.synced, router]);
  useEffect(() => {
    if (checkout.data?.status === "error" || checkout.isError) {
      setCheckoutError(checkout.data?.error ?? t("plan.continueFailed"));
      setCheckoutRequestId(null);
    }
  }, [checkout.data, checkout.isError, t]);
  useEffect(() => {
    if (checkout.data?.status === "ready" && checkout.data.checkoutUrl) window.location.assign(checkout.data.checkoutUrl);
  }, [checkout.data]);

  const configuredIntervals = billing.data?.availableCheckoutIntervals;
  const availableIntervals = (["monthly", "annual"] as const).filter(value => !configuredIntervals || configuredIntervals.starter.includes(value) || configuredIntervals.pro.includes(value));
  useEffect(() => {
    if (availableIntervals.length && !availableIntervals.includes(interval)) setInterval(availableIntervals[0]!);
  }, [availableIntervals, interval]);

  const pendingPlan = selectFree.isPending ? "free_cloud" : startCheckout.isPending || checkoutRequestId ? "paid" : null;

  function act(plan: Plan) {
    if (!business || pendingPlan) return;
    setCheckoutError(null);
    if (plan === "free_cloud") selectFree.mutate();
    else if (plan === "starter" || plan === "pro") startCheckout.mutate(plan);
    else window.location.assign(`mailto:hello@lobbystack.ai?subject=${encodeURIComponent(t("plan.enterpriseSubject"))}`);
  }

  return (
    <div className="flex flex-col gap-12">

      <div className="flex justify-center">
        <div aria-label={t("plan.billingInterval.label")} className="inline-flex rounded-full border border-border bg-input/30 p-1" role="tablist">
          {(["monthly", "annual"] as const).map((value) => <Button aria-selected={interval === value} className={cn("h-9 rounded-full px-4", interval === value ? "bg-background text-foreground shadow-sm hover:bg-background" : "border-transparent bg-transparent text-muted-foreground hover:bg-muted")} disabled={Boolean(pendingPlan) || (availableIntervals.length > 0 && !availableIntervals.includes(value))} key={value} onClick={() => setInterval(value)} role="tab" size="sm" type="button" variant="outline">{t(`plan.billingInterval.${value}`)}{value === "annual" ? <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{t("plan.billingInterval.save")}</span> : null}</Button>)}
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {tiers.map((tier) => {
          const paid = tier.slug === "starter" || tier.slug === "pro";
          const busy = tier.slug === "free_cloud" ? pendingPlan === "free_cloud" : paid && pendingPlan === "paid";
          const price = paid ? t(`plan.tiers.${tier.slug}.price.${interval}`) : t(`plan.tiers.${tier.slug}.price`);
          const description = paid ? t(`plan.tiers.${tier.slug}.description.${interval}`) : t(`plan.tiers.${tier.slug}.description`);
          const cta = paid ? t(`plan.tiers.${tier.slug}.cta.${interval}`) : t(`plan.tiers.${tier.slug}.cta`);
          return <section className={cn("relative flex flex-col rounded-2xl border bg-background p-8", tier.highlight ? "border-foreground/30 shadow-sm" : "border-border/60")} key={tier.slug}>
            {tier.highlight ? <div className="absolute -top-3 left-8 rounded-full bg-foreground px-3 py-0.5 text-xs font-medium text-background">{t("plan.popular")}</div> : null}
            <div className="mb-6"><h3 className="font-heading text-lg font-semibold tracking-tight">{t(`plan.tiers.${tier.slug}.name`)}</h3><div className="mt-3 flex items-baseline gap-1"><span className="font-heading text-4xl font-semibold tracking-tighter">{price}</span><span className="text-sm text-muted-foreground">{t(`plan.tiers.${tier.slug}.period`)}</span></div><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p></div>
            <Button className="mb-6 w-full rounded-full" disabled={!business || Boolean(pendingPlan) || (paid && (!billing.data?.checkoutAvailable || (configuredIntervals && !configuredIntervals[tier.slug as "starter" | "pro"].includes(interval))))} onClick={() => act(tier.slug)} type="button" variant={tier.highlight ? "default" : "outline"}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <>{cta}<ArrowRight className="ml-1 size-4" /></>}</Button>
            <div className="flex-1 border-t border-border/50 pt-5"><ul className="space-y-2.5">{tier.features.map((feature) => <li className="flex items-start gap-2.5 text-sm" key={feature}><Check className="mt-0.5 size-3.5 shrink-0 text-foreground/60" /><span className="whitespace-pre-line">{t(`plan.tiers.${tier.slug}.highlights.${feature}`)}</span></li>)}</ul></div>
          </section>;
        })}
      </div>
      {selectFree.isError || startCheckout.isError || checkoutError ? <FieldError>{selectFree.error?.message ?? startCheckout.error?.message ?? checkoutError ?? t("plan.continueFailed")}</FieldError> : null}
      <OnboardingPlanComparison t={t} />
    </div>
  );
}
