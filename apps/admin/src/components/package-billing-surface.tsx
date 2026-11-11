"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { PackageSubscriptionStatus } from "@lobbystack/shared";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { formatDateTime, intlLocale } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";

import { PageSurface } from "./page-surface";
import { SectionBlock } from "./section-block";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Surface } from "./ui/surface";
import { Status } from "@/components/ui/status";
import { PACKAGE_SUBSCRIPTION_STATUS_VARIANTS } from "@/lib/status-variants";

/** GET /api/package-billing. It names no price: only Stripe shows the business what it pays. */
type PackageBillingPage =
  | { billing: "outside" }
  | {
    billing: "package";
    offer: { packageName: string; allowance: { voiceMinutes: number; chats: number }; status: PackageSubscriptionStatus };
    currentPeriodEnd: string | null;
    canOpenPortal: boolean;
    canSubscribe: boolean;
  };

/**
 * A partner's business's billing page, for its owners and admins. The
 * business pays its partner for a package through the partner's Stripe, so
 * this shows the package, its allowance and whether it pays, but never the
 * price, which only Stripe shows. It opens the partner's customer
 * portal to update the card and download invoices, and opens a checkout when
 * the subscription isn't live. A business its partner bills outside
 * LobbyStack learns to ask the partner.
 */
export function PackageBillingSurface() {
  const { t, i18n } = useTranslation("settings");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { business } = useActiveBusiness();
  const businessId = business?.businessId;
  const billing = useQuery({ queryKey: ["package-billing", businessId], queryFn: () => requestJson<PackageBillingPage>(`/api/package-billing?businessId=${encodeURIComponent(businessId!)}`), enabled: Boolean(businessId) });
  const [pending, setPending] = useState<"portal" | "checkout" | null>(null);
  const locale = intlLocale(i18n.language);

  // Stripe sends the owner back here once they pay. The webhook may land a moment later, so look again then.
  const announced = useRef(false);
  const refetch = billing.refetch;
  useEffect(() => {
    if (searchParams?.get("checkout") !== "complete" || announced.current) return;
    announced.current = true;
    toast.success(t("subscription.paid"));
    router.replace("/workspace/subscription");
    const again = window.setTimeout(() => void refetch(), 3_000);
    return () => window.clearTimeout(again);
  }, [refetch, router, searchParams, t]);

  async function open(kind: "portal" | "checkout") {
    if (!businessId) return;
    setPending(kind);
    try {
      const { url } = await requestJson<{ url: string }>(`/api/package-billing/${kind}?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({}) });
      window.location.assign(url);
    } catch (error) {
      const code = (error as { code?: string }).code;
      toast.error(t(code === "payments_unavailable" ? "subscription.errors.unavailable" : kind === "portal" ? "subscription.errors.portal" : "subscription.errors.checkout"));
      setPending(null);
    }
  }

  const title = t("sections.subscription");
  if (billing.isLoading || !businessId) return <PageSurface title={title}><Surface className="flex flex-col gap-4 p-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-10 w-full" /></Surface></PageSurface>;
  if (billing.isError || !billing.data) return <PageSurface title={title}><Surface className="flex flex-col items-start gap-4 p-6"><p role="alert">{t("subscription.loadFailed")}</p><Button onClick={() => void billing.refetch()} variant="outline">{t("billing.actions.retry")}</Button></Surface></PageSurface>;
  const data = billing.data;
  if (data.billing === "outside") return <PageSurface title={title}><Surface className="px-6 py-5"><p className="type-body-muted">{t("subscription.outside")}</p></Surface></PageSurface>;

  const { offer } = data;
  const count = (value: number) => new Intl.NumberFormat(locale).format(value);
  const status = offer.status === "active" && data.currentPeriodEnd
    ? t("subscription.status.renews", { date: formatDateTime(data.currentPeriodEnd, i18n.language, { month: "long", day: "numeric", year: "numeric" }) })
    : t(`subscription.status.${offer.status}`);
  return <PageSurface title={title}>
    <SectionBlock title={t("subscription.packageTitle")}>
      <Surface className="px-6 py-5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-section-title">{offer.packageName}</span>
              <Status variant={PACKAGE_SUBSCRIPTION_STATUS_VARIANTS[offer.status]}>{t(`subscription.badge.${offer.status}`)}</Status>
            </div>
            <p className="type-body-muted">{t("subscription.allowance", { minutes: t("subscription.minutes", { count: offer.allowance.voiceMinutes, amount: count(offer.allowance.voiceMinutes) }), chats: t("subscription.chats", { count: offer.allowance.chats, amount: count(offer.allowance.chats) }) })}</p>
          </div>
          <p className="type-body">{status}</p>
          {data.canOpenPortal || data.canSubscribe ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {data.canSubscribe ? <Button className="w-full sm:w-auto" disabled={pending !== null} loading={pending === "checkout"} loadingLabel={t("subscription.opening")} onClick={() => void open("checkout")} size="sm">{t("subscription.subscribe")}</Button> : null}
              {data.canOpenPortal ? <Button className="w-full sm:w-auto" disabled={pending !== null} loading={pending === "portal"} loadingLabel={t("subscription.opening")} onClick={() => void open("portal")} size="sm" variant="outline">{t("subscription.manage")}</Button> : null}
            </div>
          ) : null}
          {data.canOpenPortal ? <p className="type-body-muted">{t("subscription.manageHint")}</p> : null}
        </div>
      </Surface>
    </SectionBlock>
  </PageSurface>;
}
