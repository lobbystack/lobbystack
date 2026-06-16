import { useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import type {
  BillingInterval,
  BillingStatus,
} from "../../../../../packages/shared/src/billing";

import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/app-sidebar";
import { FeedbackWidget } from "@/components/feedback-widget";
import { TestCallWidget } from "@/components/test-call-widget";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useObservedAction } from "@/lib/observed-convex";
import {
  UpgradePlanDialog,
  type HostedUpgradePlan,
} from "@/features/settings/UpgradePlanDialog";

type AuthenticatedLayoutProps = {
  billingStatus?: BillingStatus;
  businessId?: Id<"businesses">;
  businessName?: string;
  businessSlug?: string;
  children: ReactNode;
  onSignOut: () => void;
  operatorAvatar?: string;
  operatorEmail?: string;
  operatorName?: string;
  showUpgradeToPro?: boolean;
  showSetupGuide?: boolean;
  isLoading?: boolean;
};

function getSidebarDefaultOpen(): boolean {
  if (typeof document === "undefined") {
    return true;
  }

  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("sidebar_state="));

  return match?.split("=")[1] !== "false";
}

export function AuthenticatedLayout({
  billingStatus,
  businessId,
  businessName,
  businessSlug,
  children,
  onSignOut,
  operatorAvatar,
  operatorEmail,
  operatorName,
  showUpgradeToPro = false,
  showSetupGuide = false,
  isLoading = false,
}: AuthenticatedLayoutProps) {
  const { t } = useTranslation("settings");
  const defaultOpen = getSidebarDefaultOpen();
  const startCheckout = useObservedAction(api.billing.startCheckout);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [upgradeBillingInterval, setUpgradeBillingInterval] =
    useState<BillingInterval>("annual");
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);
  const [loadingCheckoutPlan, setLoadingCheckoutPlan] =
    useState<HostedUpgradePlan | null>(null);
  const upgradePlans: Array<"starter" | "pro"> =
    billingStatus?.hasCheckoutAccess === true && billingStatus.plan === "free_cloud"
      ? billingStatus.availableCheckoutPlans.filter(
          (plan): plan is "starter" | "pro" =>
            (plan === "starter" || plan === "pro") &&
            billingStatus.availableCheckoutIntervals[plan].length > 0,
        )
      : billingStatus?.hasCheckoutAccess === true &&
          billingStatus.plan === "starter" &&
          billingStatus.availableCheckoutPlans.includes("pro") &&
          billingStatus.availableCheckoutIntervals.pro.length > 0
        ? ["pro"]
        : [];

  async function handleUpgrade(
    target: HostedUpgradePlan,
    billingInterval: BillingInterval,
  ) {
    if (!businessId) {
      return;
    }

    setLoading("checkout");
    setLoadingCheckoutPlan(target);
    try {
      const result = await startCheckout({ businessId, target, billingInterval });
      window.location.assign(result.url);
    } catch {
      toast.error(t("billing.toast.checkoutFailed"));
    } finally {
      setLoading(null);
      setLoadingCheckoutPlan(null);
    }
  }

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "16rem",
        } as CSSProperties
      }
    >
      <AppSidebar
        isLoading={isLoading}
        onSignOut={onSignOut}
        {...(businessId && billingStatus
          ? {
              onUpgradeToPro: () => setUpgradeDialogOpen(true),
            }
          : {})}
        {...(businessName ? { businessName } : {})}
        {...(businessId ? { businessId } : {})}
        {...(operatorAvatar ? { operatorAvatar } : {})}
        {...(operatorEmail ? { operatorEmail } : {})}
        {...(operatorName ? { operatorName } : {})}
        showUpgradeToPro={showUpgradeToPro}
        showSetupGuide={showSetupGuide}
      />
      {businessId && billingStatus ? (
        <UpgradePlanDialog
          availableCheckoutPlans={upgradePlans}
          availableCheckoutIntervals={billingStatus.availableCheckoutIntervals}
          billingInterval={upgradeBillingInterval}
          currentPlan={billingStatus.plan}
          loading={loading}
          loadingPlan={loadingCheckoutPlan}
          onBillingIntervalChange={setUpgradeBillingInterval}
          onContactEnterprise={() => {
            window.location.assign(
              `mailto:hello@lobbystack.ai?subject=${encodeURIComponent(
                t("billing.upgradeDialog.enterpriseSubject"),
              )}`,
            );
          }}
          onOpenChange={setUpgradeDialogOpen}
          onStartCheckout={(target, billingInterval) =>
            void handleUpgrade(target, billingInterval)}
          open={upgradeDialogOpen}
          t={t}
        />
      ) : null}
      <SidebarInset
        className={cn(
          "@container/content",
          "has-data-[layout=fixed]:h-svh",
          "peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]",
        )}
      >
        <SiteHeader fixed />
        {!isLoading ? (
          <div className="pointer-events-none absolute top-4 inset-x-0 z-40 hidden md:block">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-3 px-6">
              <TestCallWidget
                className="pointer-events-auto"
                {...(businessId ? { businessId } : {})}
                {...(businessSlug ? { businessSlug } : {})}
              />
              <FeedbackWidget
                className="pointer-events-auto"
                {...(businessId ? { businessId } : {})}
              />
            </div>
          </div>
        ) : null}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
