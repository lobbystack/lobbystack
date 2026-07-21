import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { CircleAlert, GiftIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getStoredAffiliateReferralCode } from "@/lib/affiliate-referral";
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
  const { t } = useTranslation(["settings", "nav"]);
  const location = useLocation();
  const contentScrollRef = useRef<HTMLElement>(null);
  const defaultOpen = getSidebarDefaultOpen();
  const startCheckout = useObservedAction(api.billing.startCheckout);
  const openPortal = useObservedAction(api.billing.openPortal);
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
      const referralCode = getStoredAffiliateReferralCode();
      const result = await startCheckout({
        businessId,
        target,
        billingInterval,
        ...(referralCode ? { referralCode } : {}),
      });
      window.location.assign(result.url);
    } catch {
      toast.error(t("billing.toast.checkoutFailed"));
    } finally {
      setLoading(null);
      setLoadingCheckoutPlan(null);
    }
  }

  async function handleManageSubscription() {
    if (!businessId) {
      return;
    }

    setLoading("portal");
    try {
      const result = await openPortal({ businessId });
      window.location.assign(result.url);
    } catch {
      toast.error(t("billing.toast.portalFailed"));
    } finally {
      setLoading(null);
    }
  }

  const showPastDueBanner =
    businessId !== undefined &&
    billingStatus?.subscriptionState === "past_due" &&
    (billingStatus.plan === "starter" || billingStatus.plan === "pro") &&
    billingStatus.hasBillingManagementAccess;

  useLayoutEffect(() => {
    const contentScroll = contentScrollRef.current;
    if (!contentScroll) return;

    contentScroll.scrollTop = 0;
    contentScroll.scrollLeft = 0;
  }, [location.pathname, location.search]);

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden bg-background">
      {showPastDueBanner ? (
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
            <Button
              className="w-full shrink-0 border-amber-500/40 bg-background/80 text-foreground hover:bg-background sm:w-auto"
              loading={loading === "portal"}
              loadingLabel={t("billing.pastDueBanner.openingPortal")}
              onClick={() => void handleManageSubscription()}
              size="sm"
              variant="outline"
            >
              {t("billing.pastDueBanner.action")}
            </Button>
          </div>
        </div>
      ) : null}
      <SidebarProvider
        className="relative min-h-0 flex-1 overflow-hidden"
        defaultOpen={defaultOpen}
        style={
          {
            "--sidebar-width": "16rem",
          } as CSSProperties
        }
      >
      <AppSidebar
        className="absolute inset-y-0 h-full"
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
        ref={contentScrollRef}
        className={cn(
          "@container/content min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain",
          "has-data-[layout=fixed]:h-full",
          "peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100%-(var(--spacing)*4))]",
        )}
      >
        <SiteHeader fixed scrollContainerRef={contentScrollRef} />
        <div className="hidden h-16 shrink-0 border-b md:block" />
        {!isLoading ? (
          <div className="pointer-events-none absolute top-4 inset-x-0 z-40 hidden md:block">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-0.5 px-6">
              <TestCallWidget
                className="pointer-events-auto"
                {...(businessId ? { businessId } : {})}
                {...(businessSlug ? { businessSlug } : {})}
              />
              <span
                aria-hidden="true"
                className="ml-3 mr-1.5 h-4 w-px bg-border"
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={t("nav:items.affiliate")}
                      className="pointer-events-auto text-sidebar-foreground hover:bg-transparent hover:text-sidebar-accent-foreground"
                      render={<Link to="/affiliate" />}
                      size="icon-xs"
                      variant="ghost"
                    />
                  }
                >
                  <GiftIcon className="size-[18px] -translate-x-px" strokeWidth={1.75} />
                </TooltipTrigger>
                <TooltipContent>{t("nav:items.affiliate")}</TooltipContent>
              </Tooltip>
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
    </div>
  );
}
