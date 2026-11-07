"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { brandLinks, contactEmailFor, hasLiveEntitlement, type BillingInterval, type BillingPlanSlug, type HostedCheckoutPlanIntervals } from "@lobbystack/shared";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { requestJson } from "@/lib/request-json";
import { selectActiveBusiness } from "@/lib/active-business";
import { CHECKOUT_UNAVAILABLE_AFTER_MS, checkoutRefusalKey, isProviderUnavailable } from "@/lib/checkout-errors";
import { rememberedPlan } from "@/lib/remembered-plan";
import { setUpgradeInProgress } from "@/lib/upgrade-in-progress";
import type { WorkspaceViewModel } from "@/lib/page-view-models";
import { UpgradePlanDialog, type HostedUpgradePlan } from "./upgrade-plan-dialog";
import { UpgradePlanDialogProvider, type PlanOfferCallbacks } from "./upgrade-plan-dialog-context";

type WorkspaceResponse = { businesses: WorkspaceViewModel[] };
type Billing = {
  account: { plan: string | null; billingInterval: string | null; subscriptionState: string | null } | null;
  availableCheckoutPlans: HostedUpgradePlan[];
  availableCheckoutIntervals: HostedCheckoutPlanIntervals;
};
type Checkout = { businessId: string; requestId: string; target: HostedUpgradePlan };

export function LiveUpgradePlanProvider({ children }: { children: ReactNode }) {
  const { i18n, t } = useTranslation("settings");
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<HostedUpgradePlan>("starter");
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [slowCheckout, setSlowCheckout] = useState(false);
  const [checkoutUnavailable, setCheckoutUnavailable] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Set while the dialog opened by itself after a test rather than from a button.
  const [offer, setOffer] = useState<PlanOfferCallbacks | null>(null);
  // Redirect once per checkout. A page restored from the browser's cache can rerun the
  // effect with the old ready checkout and send them straight back to it.
  const redirectedRequestId = useRef<string | null>(null);
  const businessId = useActiveBusiness().business?.businessId;
  const billing = useQuery({ queryKey: ["billing", businessId], enabled: Boolean(businessId && open), queryFn: () => requestJson<Billing>(`/api/billing?businessId=${encodeURIComponent(businessId!)}`) });
  const activeBusinessId = () => selectActiveBusiness(client.getQueryData<WorkspaceResponse>(["businesses"])?.businesses)?.businessId;
  const mutation = useMutation({
    mutationFn: (input: { businessId: string; target: HostedUpgradePlan; billingInterval: BillingInterval }) => requestJson<{ requestId: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (result, input) => { if (activeBusinessId() === input.businessId) setCheckout({ businessId: input.businessId, requestId: result.requestId, target: input.target }); },
    onError: (error, input) => { if (activeBusinessId() === input.businessId) toast.error(t(checkoutRefusalKey(error) ?? "billing.toast.checkoutFailed")); },
  });
  const result = useQuery({
    queryKey: ["billing-checkout", checkout?.businessId, checkout?.requestId],
    enabled: Boolean(checkout && checkout.businessId === businessId && !checkoutUnavailable),
    queryFn: () => requestJson<{ status: string; checkoutUrl: string | null; error: string | null }>(`/api/billing/checkout?businessId=${encodeURIComponent(checkout!.businessId)}&requestId=${encodeURIComponent(checkout!.requestId)}`),
    refetchInterval: query => ["ready", "error"].includes(query.state.data?.status ?? "") ? false : 1500,
  });
  useEffect(() => {
    setOpen(false);
    setCheckout(null);
    setCheckoutUnavailable(false);
  }, [businessId]);
  useEffect(() => {
    setSlowCheckout(false);
    setCheckoutUnavailable(false);
    if (!checkout) return;
    const slow = window.setTimeout(() => setSlowCheckout(true), 10_000);
    const unavailable = window.setTimeout(() => setCheckoutUnavailable(true), CHECKOUT_UNAVAILABLE_AFTER_MS);
    return () => {
      window.clearTimeout(slow);
      window.clearTimeout(unavailable);
    };
  }, [checkout]);
  const resetCheckoutRequest = mutation.reset;
  useEffect(() => {
    // The back button from checkout can restore this page from the browser's cache, still
    // waiting on a checkout that already opened. Let them pick a plan again.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setLeaving(false);
      setCheckout(null);
      setCheckoutUnavailable(false);
      resetCheckoutRequest();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [resetCheckoutRequest]);
  useEffect(() => {
    if (checkout?.businessId !== businessId || checkoutUnavailable) return;
    if (result.data?.status === "ready" && result.data.checkoutUrl && checkout && redirectedRequestId.current !== checkout.requestId) {
      redirectedRequestId.current = checkout.requestId;
      // Heading to checkout is leaving on purpose. Say so before the page
      // starts to unload, not after the next render.
      setUpgradeInProgress(true);
      setLeaving(true);
      window.location.assign(result.data.checkoutUrl);
    }
    if (result.data?.status === "error" || result.isError) {
      toast.error(t(isProviderUnavailable(result.data?.error) ? "billing.toast.paymentsUnavailable" : "billing.toast.checkoutFailed"));
      setCheckout(null);
    }
  }, [businessId, checkout, checkoutUnavailable, result.data, result.isError, t]);
  const rawPlan = billing.data?.account?.plan;
  // A cancelled or lapsed tier is not the plan someone is on, and marking its
  // card as current leaves them unable to start the tier they just lost.
  const plan: BillingPlanSlug = rawPlan === "self_hosted_standard" || rawPlan === "self_host" ? "self_host" : hasLiveEntitlement({ plan: rawPlan ?? null, subscriptionState: billing.data?.account?.subscriptionState ?? null }) ? rawPlan as BillingPlanSlug : "free_cloud";
  const pending = mutation.isPending && mutation.variables.businessId === businessId || checkout?.businessId === businessId && !checkoutUnavailable;
  // The picker only renders once billing loads. If that request fails, an open flag alone
  // would hold the survey off for the rest of the visit.
  const pickerShown = open && Boolean(businessId && billing.data);
  const upgrading = pickerShown || pending || leaving;
  useEffect(() => {
    setUpgradeInProgress(upgrading);
    return () => setUpgradeInProgress(false);
  }, [upgrading]);
  const openDialog = () => { setSelectedPlan(rememberedPlan() ?? "starter"); setOpen(true); };
  const dismissCheckout = () => {
    setCheckout(null);
    setCheckoutUnavailable(false);
  };
  const changeOpen = (next: boolean) => {
    if (!next && offer) { offer.onDismiss(); setOffer(null); }
    if (!next && checkoutUnavailable) dismissCheckout();
    setOpen(next);
  };
  return <UpgradePlanDialogProvider onOffer={(callbacks) => { setOffer(callbacks); openDialog(); }} onOpen={openDialog}>
    {children}
    {businessId && billing.data ? <UpgradePlanDialog
      availableCheckoutPlans={billing.data.availableCheckoutPlans ?? []}
      availableCheckoutIntervals={billing.data.availableCheckoutIntervals ?? { starter: [], pro: [] }}
      billingInterval={interval}
      checkoutUnavailable={checkoutUnavailable}
      currentPlan={plan}
      loading={pending ? "checkout" : null}
      locale={i18n.language}
      loadingPlan={checkout?.target ?? (mutation.isPending ? mutation.variables.target : null)}
      onBillingIntervalChange={setInterval}
      onContactEnterprise={() => window.location.assign(`mailto:${contactEmailFor(brandLinks(), "sales")}?subject=${encodeURIComponent(t("billing.upgradeDialog.enterpriseSubject"))}`)}
      onDismissCheckout={() => changeOpen(false)}
      onOpenChange={changeOpen}
      onStartCheckout={(target, billingInterval) => {
        offer?.onPlanClicked(target);
        setOffer(null);
        mutation.mutate({ businessId, target, billingInterval });
      }}
      open={open}
      selectedPlan={selectedPlan}
      slowCheckout={slowCheckout}
      t={t}
    /> : null}
  </UpgradePlanDialogProvider>;
}
