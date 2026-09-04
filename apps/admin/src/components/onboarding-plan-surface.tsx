"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, LoaderCircle, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Business = { businessId: string; active: boolean };
type BillingInterval = "monthly" | "annual";
type Plan = "free_cloud" | "starter" | "pro" | "enterprise";
type Checkout = { id: string; status: string; checkoutUrl: string | null; error: string | null };

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
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const checkout = useQuery({
    queryKey: ["onboarding-checkout", checkoutRequestId],
    queryFn: () => requestJson<Checkout>(`/api/billing/checkout?requestId=${encodeURIComponent(checkoutRequestId!)}`),
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

  useEffect(() => {
    if (checkout.data?.status === "ready" && checkout.data.checkoutUrl) window.location.assign(checkout.data.checkoutUrl);
  }, [checkout.data]);

  const pendingPlan = selectFree.isPending ? "free_cloud" : startCheckout.isPending || checkoutRequestId ? "paid" : null;

  function act(plan: Plan) {
    if (!business || pendingPlan) return;
    if (plan === "free_cloud") selectFree.mutate();
    else if (plan === "starter" || plan === "pro") startCheckout.mutate(plan);
    else window.location.assign(`mailto:hello@lobbystack.ai?subject=${encodeURIComponent(t("plan.enterpriseSubject"))}`);
  }

  return (
    <div className="flex flex-col gap-12">
      <div className="flex justify-center">
        <div aria-label={t("plan.billingInterval.label")} className="inline-flex rounded-full border border-border bg-input/30 p-1" role="tablist">
          {(["monthly", "annual"] as const).map((value) => <Button aria-selected={interval === value} className={cn("h-9 rounded-full px-4", interval === value ? "bg-background text-foreground shadow-sm hover:bg-background" : "border-transparent bg-transparent text-muted-foreground hover:bg-muted")} disabled={Boolean(pendingPlan)} key={value} onClick={() => setInterval(value)} role="tab" size="sm" type="button" variant="outline">{t(`plan.billingInterval.${value}`)}{value === "annual" ? <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{t("plan.billingInterval.save")}</span> : null}</Button>)}
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
            <Button className="mb-6 w-full rounded-full" disabled={!business || Boolean(pendingPlan)} onClick={() => act(tier.slug)} type="button" variant={tier.highlight ? "default" : "outline"}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <>{cta}<ArrowRight className="ml-1 size-4" /></>}</Button>
            <div className="flex-1 border-t border-border/50 pt-5"><ul className="space-y-2.5">{tier.features.map((feature) => <li className="flex items-start gap-2.5 text-sm" key={feature}><Check className="mt-0.5 size-3.5 shrink-0 text-foreground/60" /><span className="whitespace-pre-line">{t(`plan.tiers.${tier.slug}.highlights.${feature}`)}</span></li>)}</ul></div>
          </section>;
        })}
      </div>
      {selectFree.isError || startCheckout.isError || checkout.data?.status === "error" ? <FieldError>{selectFree.error?.message ?? startCheckout.error?.message ?? checkout.data?.error ?? t("plan.continueFailed")}</FieldError> : null}
      <section id="compare">
        <h2 className="mb-4 text-center font-heading text-2xl font-semibold tracking-tighter md:text-3xl">{t("plan.compareTitle")}</h2>
        <p className="mx-auto mb-12 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">{t("plan.compareDescription")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b"><th className="pb-4 pr-8 text-left text-xs font-medium text-muted-foreground">{t("plan.featureHeader")}</th>{tiers.map((tier) => <th className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground" key={tier.slug}>{t(`plan.tiers.${tier.slug}.name`)}</th>)}</tr></thead>
            <tbody>{["callAnswering", "knowledgeAnswers", "appointmentBooking", "googleCalendar", "summaries", "contacts", "websiteImport"].map((feature) => <tr className="border-b border-border/40" key={feature}><td className="py-3 pr-8">{t(`plan.comparison.features.${feature}`)}</td>{tiers.map((tier, index) => <td className="px-4 py-3 text-center" key={tier.slug}>{index === 0 && (feature === "googleCalendar" || feature === "appointmentBooking") ? <Minus className="mx-auto size-4 text-muted-foreground/30" /> : <Check className="mx-auto size-4 text-foreground/60" />}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
