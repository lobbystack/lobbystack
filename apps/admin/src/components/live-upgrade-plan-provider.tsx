"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { BillingInterval, BillingPlanSlug, HostedCheckoutPlanIntervals } from "@lobbystack/shared";
import { requestJson } from "@/lib/request-json";
import { selectActiveBusiness } from "@/lib/active-business";
import type { WorkspaceViewModel } from "@/lib/page-view-models";
import { UpgradePlanDialog, type HostedUpgradePlan } from "./upgrade-plan-dialog";
import { UpgradePlanDialogProvider } from "./upgrade-plan-dialog-context";

type WorkspaceResponse = { businesses: WorkspaceViewModel[] };
type Billing = {
  account: { plan: string | null; billingInterval: string | null } | null;
  availableCheckoutPlans: HostedUpgradePlan[];
  availableCheckoutIntervals: HostedCheckoutPlanIntervals;
};
type Checkout = { businessId: string; requestId: string; target: HostedUpgradePlan };

export function LiveUpgradePlanProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("settings");
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const workspaces = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<WorkspaceResponse>("/api/businesses") });
  const businessId = selectActiveBusiness(workspaces.data?.businesses)?.businessId;
  const billing = useQuery({ queryKey: ["billing", businessId], enabled: Boolean(businessId && open), queryFn: () => requestJson<Billing>(`/api/billing?businessId=${encodeURIComponent(businessId!)}`) });
  const activeBusinessId = () => selectActiveBusiness(client.getQueryData<WorkspaceResponse>(["businesses"])?.businesses)?.businessId;
  const mutation = useMutation({
    mutationFn: (input: { businessId: string; target: HostedUpgradePlan; billingInterval: BillingInterval }) => requestJson<{ requestId: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (result, input) => { if (activeBusinessId() === input.businessId) setCheckout({ businessId: input.businessId, requestId: result.requestId, target: input.target }); },
    onError: (_error, input) => { if (activeBusinessId() === input.businessId) toast.error(t("billing.toast.checkoutFailed")); },
  });
  const result = useQuery({
    queryKey: ["billing-checkout", checkout?.businessId, checkout?.requestId],
    enabled: Boolean(checkout && checkout.businessId === businessId),
    queryFn: () => requestJson<{ status: string; checkoutUrl: string | null; error: string | null }>(`/api/billing/checkout?businessId=${encodeURIComponent(checkout!.businessId)}&requestId=${encodeURIComponent(checkout!.requestId)}`),
    refetchInterval: query => ["ready", "error"].includes(query.state.data?.status ?? "") ? false : 1500,
  });
  useEffect(() => { setOpen(false); setCheckout(null); }, [businessId]);
  useEffect(() => {
    if (checkout?.businessId !== businessId) return;
    if (result.data?.status === "ready" && result.data.checkoutUrl) window.location.assign(result.data.checkoutUrl);
    if (result.data?.status === "error" || result.isError) { toast.error(t("billing.toast.checkoutFailed")); setCheckout(null); }
  }, [businessId, checkout?.businessId, result.data, result.isError, t]);
  const rawPlan = billing.data?.account?.plan;
  const plan: BillingPlanSlug = rawPlan === "self_hosted_standard" || rawPlan === "self_host" ? "self_host" : rawPlan === "starter" || rawPlan === "pro" || rawPlan === "enterprise" ? rawPlan : "free_cloud";
  const pending = mutation.isPending && mutation.variables.businessId === businessId || checkout?.businessId === businessId;
  return <UpgradePlanDialogProvider onOpen={() => setOpen(true)}>
    {children}
    {businessId && billing.data ? <UpgradePlanDialog
      availableCheckoutPlans={billing.data.availableCheckoutPlans ?? []}
      availableCheckoutIntervals={billing.data.availableCheckoutIntervals ?? { starter: [], pro: [] }}
      billingInterval={interval}
      currentPlan={plan}
      loading={pending ? "checkout" : null}
      loadingPlan={checkout?.target ?? (mutation.isPending ? mutation.variables.target : null)}
      onBillingIntervalChange={setInterval}
      onContactEnterprise={() => window.location.assign(`mailto:hello@lobbystack.ai?subject=${encodeURIComponent(t("billing.upgradeDialog.enterpriseSubject"))}`)}
      onOpenChange={setOpen}
      onStartCheckout={(target, billingInterval) => mutation.mutate({ businessId, target, billingInterval })}
      open={open}
      t={t}
    /> : null}
  </UpgradePlanDialogProvider>;
}
