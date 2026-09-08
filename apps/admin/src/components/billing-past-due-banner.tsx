"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type BillingPermissions = {
  hasBillingManagementAccess: boolean;
  hasCustomerPortalAccess: boolean;
  hasCheckoutAccess: boolean;
};

export function BillingPastDueBanner({ businessId, plan, subscriptionState, permissions }: {
  businessId: string;
  plan: string | null;
  subscriptionState: string | null;
  permissions: BillingPermissions;
}) {
  const { t } = useTranslation("settings");
  const [pending, setPending] = useState(false);
  if (subscriptionState !== "past_due" || !["starter", "pro"].includes(plan ?? "") || !permissions.hasBillingManagementAccess) return null;

  async function openPortal() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(`/api/billing/portal?businessId=${encodeURIComponent(businessId)}`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("Portal unavailable");
      const result = await response.json() as { url: string };
      window.location.assign(result.url);
    } catch {
      toast.error(t("billing.toast.portalFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
        <div
          aria-live="polite"
          className="relative z-60 w-full shrink-0 border-b border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100"
          role="alert"
        >
          <div className="flex w-full flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t("billing.pastDueBanner.title")}
                </p>
                <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
                  {t("billing.pastDueBanner.description")}
                </p>
              </div>
            </div>
            {permissions.hasCustomerPortalAccess ? (
              <Button
                className="w-full shrink-0 border-amber-500/40 bg-background/80 text-foreground hover:bg-background sm:w-auto"
                loading={pending}
                loadingLabel={t("billing.pastDueBanner.openingPortal")}
                onClick={() => void openPortal()}
                size="sm"
                variant="outline"
              >
                {t("billing.pastDueBanner.action")}
              </Button>
            ) : null}
          </div>
        </div>
  );
}
