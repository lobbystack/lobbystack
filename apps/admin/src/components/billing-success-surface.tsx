"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { billingPlanCatalog } from "@lobbystack/shared";

import { CallForwardingDialog } from "@/components/call-forwarding-dialog";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { forwardingHelpUrl } from "@/lib/forwarding-help";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";
import { useTelemetry } from "./product-analytics";
import { ReplacementOnboardingShell } from "./replacement-onboarding-shell";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";

type Checkout = { synced: boolean; target: "starter" | "pro" };
type Numbers = { phoneNumbers: Array<{ e164: string; reclaimScheduledAt: string | null }> };

const REPORTED_CHECKOUT_KEY = "lobbystack.onboarding.checkoutReported";

/**
 * The funnel should count checkouts, not visits to the return URL. A ref only
 * lasts one mount, so a reload of that URL would report the same checkout again.
 */
function hasReportedCheckout(key: string): boolean {
  try {
    const raw = window.localStorage.getItem(REPORTED_CHECKOUT_KEY);
    return raw ? (JSON.parse(raw) as string[]).includes(key) : false;
  } catch {
    return false;
  }
}

function markCheckoutReported(key: string): void {
  try {
    const raw = window.localStorage.getItem(REPORTED_CHECKOUT_KEY);
    const current = raw ? JSON.parse(raw) as string[] : [];
    if (current.includes(key)) return;
    window.localStorage.setItem(REPORTED_CHECKOUT_KEY, JSON.stringify([...current.slice(-19), key]));
  } catch {
    // Storage is unavailable, so the per-mount ref is the only guard left.
  }
}

function SuccessCheck() {
  return (
    <div aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 duration-300 ease-out animate-in fade-in zoom-in-90 motion-reduce:animate-none dark:text-emerald-400">
      <Check className="billing-success-check size-7" strokeWidth={2.5} />
    </div>
  );
}

/** Where Polar sends someone after they pay: confirmation while the plan syncs, then what to do next. */
export function BillingSuccessSurface() {
  const { t, i18n } = useTranslation("settings");
  const [forwardingOpen, setForwardingOpen] = useState(false);
  const router = useRouter();
  const telemetry = useTelemetry();
  const requestId = useSearchParams().get("requestId");
  const { businesses, business } = useActiveBusiness();
  const businessId = business?.businessId;
  const onboarding = business?.onboardingStage !== "complete";
  const checkout = useQuery({
    queryKey: ["billing-checkout-return", businessId, requestId],
    enabled: Boolean(businessId && requestId),
    queryFn: () => requestJson<Checkout>(`/api/billing/checkout?businessId=${encodeURIComponent(businessId!)}&requestId=${encodeURIComponent(requestId!)}`),
    refetchInterval: (query) => query.state.data?.synced ? false : 1_500,
  });
  const plan = checkout.data?.synced ? checkout.data.target : null;
  // Read again once the plan syncs: that's when a trial number becomes theirs to keep.
  const numbers = useQuery({
    queryKey: ["phone-numbers", businessId, plan],
    enabled: Boolean(businessId),
    queryFn: () => requestJson<Numbers>(`/api/phone-numbers?businessId=${encodeURIComponent(businessId!)}`),
  });
  const number = numbers.data?.phoneNumbers.find((candidate) => !candidate.reclaimScheduledAt) ?? null;

  // The number step only opens once onboarding moves past the plan. Moving
  // again is a no-op, so the effect and the button can both ask.
  const advance = useRef<Promise<unknown> | null>(null);
  const advanceOnboarding = useCallback(() => {
    advance.current ??= requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(businessId ?? "")}`, { method: "POST", body: JSON.stringify({ to: "phone_number" }) })
      .catch((error: unknown) => { advance.current = null; throw error; });
    return advance.current;
  }, [businessId]);

  useEffect(() => {
    if (!businessId || !requestId || !plan || !onboarding) return;
    const key = `${businessId}:${requestId}`;
    if (!hasReportedCheckout(key)) {
      markCheckoutReported(key);
      telemetry.track("web.onboarding.plan_checkout_completed", { businessId, plan });
    }
    void advanceOnboarding().catch(() => undefined);
  }, [advanceOnboarding, businessId, onboarding, plan, requestId, telemetry]);

  function goToNumberStep() {
    if (!onboarding) {
      router.push("/settings/phone-number");
      return;
    }
    void advanceOnboarding().then(() => router.push("/onboarding/number"), () => toast.error(t("common:errors.unexpected")));
  }

  if (!requestId || businesses.isError || (checkout.isError && !checkout.data)) {
    return (
      <ReplacementOnboardingShell description={t("billing.success.missing.description")} title={t("billing.success.missing.title")} width="md">
        <Button className="h-11 w-full" nativeButton={false} render={<Link href="/settings/plan" />}>{t("billing.success.missing.action")}</Button>
      </ReplacementOnboardingShell>
    );
  }

  if (!plan) {
    return (
      <ReplacementOnboardingShell description={t("billing.success.received.description")} icon={<SuccessCheck />} title={t("billing.success.received.title")} width="md">
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          {t("billing.success.received.status")}
        </p>
      </ReplacementOnboardingShell>
    );
  }

  const catalog = billingPlanCatalog[plan];
  const unlocks = [
    t("billing.success.unlocks.voiceMinutes", { count: Math.round((catalog.voiceSecondsIncluded ?? 0) / 60) }),
    t("billing.success.unlocks.numbers", { count: catalog.includedBusinessNumbers ?? 0 }),
    t("billing.success.unlocks.alertSms", { count: catalog.alertSmsSegmentsIncluded ?? 0 }),
    t("billing.success.unlocks.transfers", { count: catalog.outboundCallAttemptsIncluded ?? 0 }),
  ];
  const displayNumber = number ? formatPhoneNumberDisplay(number.e164, i18n.language) : null;
  const steps = [
    { key: "call", action: number ? <a className="font-medium text-foreground underline underline-offset-4" href={`tel:${number.e164}`}>{displayNumber}</a> : null },
    { key: "forward", action: number
      ? <><button className="self-start font-medium text-foreground underline underline-offset-4" onClick={() => setForwardingOpen(true)} type="button">{t("billing.success.steps.forward.action")}</button><CallForwardingDialog e164={number.e164} onOpenChange={setForwardingOpen} open={forwardingOpen} /></>
      : <a className="font-medium text-foreground underline underline-offset-4" href={forwardingHelpUrl(i18n.language)} rel="noreferrer" target="_blank">{t("billing.success.steps.forward.action")}</a> },
    // The dashboard sends anyone still in onboarding back to it, so the link waits until setup is done.
    { key: "transfer", action: onboarding ? null : <Link className="font-medium text-foreground underline underline-offset-4" href="/agent#agent-transfer-number">{t("billing.success.steps.transfer.action")}</Link> },
  ] as const;

  return (
    <ReplacementOnboardingShell icon={<SuccessCheck />} title={t("billing.success.title", { plan: t(`billing.planLabels.${plan}`) })} width="lg">
      <div className="flex flex-col gap-6 text-left">
        <Surface className="flex flex-col gap-4 p-6">
          <p className="text-sm font-medium text-foreground">{t("billing.currentPlan.includedTitle")}</p>
          <ul className="flex flex-col gap-2.5">
            {unlocks.map((unlock) => <li className="flex items-start gap-2.5 text-sm" key={unlock}><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-500" />{unlock}</li>)}
          </ul>
        </Surface>
        {number ? (
          <Surface className="flex flex-col items-center gap-1 p-6 text-center">
            <p className="text-sm text-muted-foreground">{t("billing.success.number.label")}</p>
            <p className="text-2xl font-semibold text-foreground">{displayNumber}</p>
            <p className="text-sm text-muted-foreground">{t("billing.success.number.keep")}</p>
          </Surface>
        ) : (
          <Button className="h-11 w-full" onClick={goToNumberStep} type="button">{t("billing.success.number.choose")}</Button>
        )}
        <section className="flex flex-col gap-4">
          <h2 className="text-base font-medium text-foreground">{t("billing.success.steps.title")}</h2>
          <ol className="flex flex-col gap-4">
            {steps.map((step, index) => (
              <li className="flex gap-3" key={step.key}>
                <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{index + 1}</span>
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <p className="font-medium text-foreground">{t(`billing.success.steps.${step.key}.title`)}</p>
                  <p className="text-muted-foreground">{t(`billing.success.steps.${step.key}.description`)}</p>
                  {step.action}
                </div>
              </li>
            ))}
          </ol>
        </section>
        {onboarding ? (
          number ? <Button className="h-11 w-full" onClick={goToNumberStep} type="button" variant="outline">{t("billing.success.continue")}</Button> : null
        ) : (
          <Button className="h-11 w-full" nativeButton={false} render={<Link href="/" />} variant="outline">{t("billing.success.dashboard")}</Button>
        )}
      </div>
    </ReplacementOnboardingShell>
  );
}
