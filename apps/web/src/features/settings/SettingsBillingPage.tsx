import { useState } from "react";
import { useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Lock } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  billingPlanCatalog,
  billingAddonCatalog,
} from "../../../../../packages/shared/src/billing";
import type {
  BillingPlanSlug,
  BillingStatus,
} from "../../../../../packages/shared/src/billing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useRememberedConvexQuery } from "@/lib/remembered-convex-query";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SettingsBillingPageProps = {
  businessId: Id<"businesses">;
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  const dollars = cents / 100;
  if (dollars === Math.floor(dollars)) return `$${dollars}`;
  return `$${dollars.toFixed(2)}`;
}

function formatResetDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function formatStorage(bytes: number, referenceBytes?: number | null): string {
  const normalizedReference = referenceBytes ?? bytes;

  if (normalizedReference >= 1024 * 1024 * 1024) {
    const gigabytes = bytes / (1024 * 1024 * 1024);
    return `${gigabytes % 1 === 0 ? gigabytes.toFixed(0) : gigabytes.toFixed(1)} GB`;
  }

  if (normalizedReference >= 1024 * 1024) {
    const megabytes = bytes / (1024 * 1024);
    return `${megabytes % 1 === 0 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
  }

  if (normalizedReference >= 1024) {
    const kilobytes = bytes / 1024;
    return `${kilobytes % 1 === 0 ? kilobytes.toFixed(0) : kilobytes.toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function formatTransactionDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function voiceSecondsToMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10;
}

function getPlanLabel(
  plan: BillingPlanSlug,
  t: ReturnType<typeof useTranslation<"settings">>["t"],
): string {
  switch (plan) {
    case "self_host":
      return t("billing.planLabels.selfHost");
    case "free_cloud":
      return t("billing.planLabels.freeCloud");
    case "pro":
      return t("billing.planLabels.pro");
    case "enterprise":
      return t("billing.planLabels.enterprise");
    default:
      return plan;
  }
}

// ---------------------------------------------------------------------------
// Section wrapper — matches GitBook's title + description + content pattern
// ---------------------------------------------------------------------------

function BillingSection({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="type-section-title">{title}</h2>
          {description && (
            <p className="type-section-description">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bordered item — the horizontal info + action row used throughout GitBook
// ---------------------------------------------------------------------------

function BorderedItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-card px-6 py-5 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan section
// ---------------------------------------------------------------------------

function PlanSection({
  status,
  businessId,
  t,
}: {
  status: BillingStatus;
  businessId: Id<"businesses">;
  t: ReturnType<typeof useTranslation<"settings">>["t"];
}) {
  const startCheckout = useAction(api.billing.startCheckout);
  const openPortal = useAction(api.billing.openPortal);
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  const planLabel = getPlanLabel(status.plan, t);
  const price =
    status.monthlyChargeCents !== null
      ? formatCents(status.monthlyChargeCents)
      : null;

  const canUpgrade =
    status.hasCheckoutAccess &&
    status.availableCheckoutPlans.includes("pro") &&
    status.plan === "free_cloud";
  const showManageSubscription =
    status.hasCustomerPortalAccess &&
    status.plan !== "free_cloud";

  async function handleUpgrade() {
    setLoading("checkout");
    try {
      const result = await startCheckout({ businessId, target: "pro" });
      window.location.assign(result.url);
    } catch {
      toast.error(t("billing.toast.checkoutFailed"));
    } finally {
      setLoading(null);
    }
  }

  async function handleManage() {
    setLoading("portal");
    try {
      const result = await openPortal({ businessId });
      window.open(result.url, "_blank");
    } catch {
      toast.error(t("billing.toast.portalFailed"));
    } finally {
      setLoading(null);
    }
  }

  return (
    <BillingSection title={t("billing.currentPlan.title")}>
      <BorderedItem>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <span className="text-[15px] font-medium leading-6 text-foreground">
                {planLabel}
              </span>
            </div>
            {status.plan === "free_cloud" ? (
              <span className="text-[15px] leading-6 text-muted-foreground">
                Upgrade to Pro to enable pay-as-you-go and higher limits.
              </span>
            ) : status.billingContactEmail ? (
              <span className="text-[15px] leading-6 text-muted-foreground">
                {status.billingContactEmail}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {price !== null && (
              <span className="text-[15px] font-medium tabular-nums text-foreground">
                {t("billing.currentPlan.monthlyChargeValue", {
                  amount: price,
                })}
              </span>
            )}
          </div>
        </div>
        {(canUpgrade || showManageSubscription) && (
          <div className="mt-3 flex gap-2">
            {canUpgrade && (
              <Button
                size="sm"
                variant="outline"
                disabled={loading === "checkout"}
                onClick={() => void handleUpgrade()}
              >
                {loading === "checkout"
                  ? t("billing.actions.openingCheckout")
                  : t("billing.actions.upgradeToPro")}
              </Button>
            )}
            {showManageSubscription && (
              <Button
                size="sm"
                variant="outline"
                disabled={loading === "portal"}
                onClick={() => void handleManage()}
              >
                {loading === "portal"
                  ? t("billing.actions.openingPortal")
                  : t("billing.actions.manageSubscription")}
                <ArrowUpRight className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </BorderedItem>
    </BillingSection>
  );
}

// ---------------------------------------------------------------------------
// Usage section — clean rows with thin inline progress bars
// ---------------------------------------------------------------------------

function UsageSection({
  status,
  t,
}: {
  status: BillingStatus;
  t: ReturnType<typeof useTranslation<"settings">>["t"];
}) {
  const usage = status.usage;
  const plan = status.plan;
  const catalog = billingPlanCatalog[plan];

  if (plan === "self_host") return null;

  return (
    <BillingSection
      title={t("billing.usage.title")}
      description={
        usage.resetAt
          ? t("billing.usage.description", {
              resetAt: formatResetDate(usage.resetAt),
            })
          : undefined
      }
    >
      <BorderedItem className="flex flex-col gap-5">
        <UsageMeterRow
          label={t("billing.usage.voiceTitle")}
          used={voiceSecondsToMinutes(usage.voiceSecondsUsed)}
          included={
            usage.voiceSecondsIncluded !== null
              ? voiceSecondsToMinutes(usage.voiceSecondsIncluded)
              : null
          }
          unit="min"
          blocked={usage.voiceBlocked}
          overageRateCents={catalog.voiceOverageRatePerMinuteCents}
          overageBillable={catalog.overagesBillable}
        />

        <UsageMeterRow
          label={t("billing.usage.outboundAttemptsTitle")}
          used={usage.outboundCallAttemptsUsed}
          included={usage.outboundCallAttemptsIncluded}
          unit="attempts"
          blocked={usage.outboundCallAttemptsBlocked}
          overageRateCents={catalog.outboundCallAttemptOverageRateCents}
          overageBillable={catalog.overagesBillable}
        />

        <UsageMeterRow
          label={t("billing.usage.alertSmsTitle")}
          used={usage.alertSmsSegmentsUsed}
          included={usage.alertSmsSegmentsIncluded}
          unit="segments"
          blocked={usage.alertSmsBlocked}
          overageRateCents={catalog.alertSmsOverageRatePerSegmentCents}
          overageBillable={catalog.overagesBillable}
        />

        <UsageMeterRow
          label={t("billing.usage.knowledgeTitle")}
          used={usage.knowledgeStorageBytesUsed}
          included={usage.knowledgeStorageBytesIncluded}
          unit="storage"
          blocked={usage.knowledgeStorageBlocked}
          overageRateCents={null}
          overageBillable={false}
          formatValue={formatStorage}
        />

        {status.aiSmsEnabled && (
          <UsageMeterRow
            label={t("billing.usage.aiSmsTitle")}
            used={usage.aiSmsSegmentsUsed}
            included={null}
            unit="segments"
            blocked={false}
            overageRateCents={billingAddonCatalog.ai_sms.usageRatePerSegmentCents}
            overageBillable
            metered
          />
        )}
      </BorderedItem>
    </BillingSection>
  );
}

function UsageMeterRow({
  label,
  used,
  included,
  unit,
  blocked,
  overageRateCents,
  overageBillable,
  metered,
  formatValue,
}: {
  label: string;
  used: number;
  included: number | null;
  unit: string;
  blocked: boolean;
  overageRateCents: number | null;
  overageBillable: boolean;
  metered?: boolean;
  formatValue?: (value: number, referenceValue?: number | null) => string;
}) {
  const pct = included !== null && included > 0 ? (used / included) * 100 : 0;
  const isOver = included !== null && used > included;
  const overageCount = isOver ? used - included : 0;
  const overageCost =
    overageBillable && overageRateCents && overageCount > 0
      ? overageCount * overageRateCents
      : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium leading-6 text-foreground">
          {label}
        </span>
        <span className="text-[15px] tabular-nums leading-6 text-muted-foreground">
          {formatValue ? formatValue(used, included) : used}
          {included !== null ? ` / ${formatValue ? formatValue(included, included) : included}` : ""}
          {!formatValue && ` ${unit}`}
          {metered && " (metered)"}
        </span>
      </div>

      {/* Thin progress bar */}
      {included !== null && included > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              blocked
                ? "bg-destructive"
                : isOver
                  ? "bg-foreground"
                  : "bg-foreground"
            }`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}

      {/* Overage note */}
      {overageCost > 0 && (
        <span className="text-sm tabular-nums leading-6 text-muted-foreground">
          {overageCount} {unit} over included ·{" "}
          <span className="font-medium text-foreground">
            ≈ {formatCents(overageCost)}
          </span>{" "}
          in overages
        </span>
      )}
      {blocked && (
        <span className="text-sm leading-6 text-destructive">
          Limit reached — usage paused until next period.
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-ons section — GitBook style with toggle/action
// ---------------------------------------------------------------------------

function AddonsSection({
  status,
  businessId,
  t,
}: {
  status: BillingStatus;
  businessId: Id<"businesses">;
  t: ReturnType<typeof useTranslation<"settings">>["t"];
}) {
  const startCheckout = useAction(api.billing.startCheckout);
  const [loading, setLoading] = useState(false);
  const isActive = status.aiSmsEnabled;
  const canPurchase = status.canPurchaseAiSmsAddon;
  const isFreePlanLocked = status.plan === "free_cloud" && !isActive;

  async function handleAddAiSms() {
    setLoading(true);
    try {
      const result = await startCheckout({ businessId, target: "ai_sms" });
      window.open(result.url, "_blank");
    } catch {
      toast.error(t("billing.toast.checkoutFailed"));
    } finally {
      setLoading(false);
    }
  }

  const switchControl = (
    <Switch
      aria-label={t("billing.addon.aiSmsName")}
      checked={isActive}
      disabled={isActive || loading || !canPurchase}
      onCheckedChange={(checked) => {
        if (!checked || !canPurchase || loading || isActive) {
          return;
        }
        void handleAddAiSms();
      }}
    />
  );

  return (
    <BillingSection
      title={t("billing.addon.title")}
      description={t("billing.addon.aiSmsDescription")}
    >
      <BorderedItem>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium leading-6 text-foreground">
                {t("billing.addon.aiSmsName")}
              </span>
              {isActive && (
                <Badge
                  variant="default"
                  className="bg-emerald-600 text-[10px] tracking-wide text-white dark:bg-emerald-500"
                >
                  {t("billing.addon.aiSmsActiveBadge")}
                </Badge>
              )}
            </div>
            <span className="text-[15px] leading-6 text-muted-foreground">
              {t("billing.addon.aiSmsDescription")}
            </span>
            <span className="mt-1 text-sm tabular-nums leading-6 text-muted-foreground">
              {t("billing.addon.aiSmsPricing", {
                monthly: formatCents(
                  billingAddonCatalog.ai_sms.recurringMonthlyChargeCents,
                ),
                perSegment: formatCents(
                  billingAddonCatalog.ai_sms.usageRatePerSegmentCents,
                ),
              })}
              {" · "}
              {t("billing.addon.aiSmsSetup", {
                amount: formatCents(
                  billingAddonCatalog.ai_sms.oneTimeSetupChargeCents,
                ),
              })}
            </span>
          </div>
          <div className="shrink-0">
            {isFreePlanLocked ? (
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  {switchControl}
                </TooltipTrigger>
                <TooltipContent>
                  {t("billing.addon.aiSmsRequiresPro")}
                </TooltipContent>
              </Tooltip>
            ) : (
              switchControl
            )}
          </div>
        </div>
      </BorderedItem>
    </BillingSection>
  );
}

// ---------------------------------------------------------------------------
// Spending cap placeholder
// ---------------------------------------------------------------------------

function SpendingCapSection({
  status,
  t,
}: {
  status: BillingStatus;
  t: ReturnType<typeof useTranslation<"settings">>["t"];
}) {
  if (status.plan !== "pro" && status.plan !== "enterprise") return null;

  return (
    <BillingSection
      title={t("billing.spendingCap.title")}
      description={t("billing.spendingCap.description")}
    >
      <BorderedItem className="opacity-60">
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-xs flex-1">
            <Input
              disabled
              placeholder={t("billing.spendingCap.placeholder")}
              className="pr-10"
            />
            <Lock className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px] tracking-wide">
            {t("billing.spendingCap.comingSoon")}
          </Badge>
        </div>
      </BorderedItem>
    </BillingSection>
  );
}

// ---------------------------------------------------------------------------
// Transaction history
// ---------------------------------------------------------------------------

function TransactionsSection({
  status,
  t,
}: {
  status: BillingStatus;
  t: ReturnType<typeof useTranslation<"settings">>["t"];
}) {
  const transactions = status.recentTransactions;
  if (!transactions || transactions.length === 0) return null;

  return (
    <BillingSection
      title={t("billing.transactions.title")}
      description={t("billing.transactions.description")}
    >
      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.date")}
              </TableHead>
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.description")}
              </TableHead>
              <TableHead className="text-right text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.amount")}
              </TableHead>
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.status")}
              </TableHead>
              <TableHead className="text-right text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.invoice")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => {
              const isRefund = tx.kind === "refund";
              return (
                <TableRow key={tx.sourceId}>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {formatTransactionDate(tx.occurredAt)}
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    {tx.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-medium text-foreground">
                    {isRefund ? "−" : ""}
                    {formatCents(tx.amountCents)}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground capitalize">
                      {tx.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {tx.invoiceUrl ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto gap-1 px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => window.open(tx.invoiceUrl!, "_blank")}
                      >
                        {t("billing.transactions.invoice")}
                        <ArrowUpRight className="size-3" />
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </BillingSection>
  );
}

// ---------------------------------------------------------------------------
// Loading skeletons
// ---------------------------------------------------------------------------

function PlanSectionSkeleton({
  t,
}: {
  t: ReturnType<typeof useTranslation<"settings">>["t"];
}) {
  return (
    <BillingSection title={t("billing.currentPlan.title")}>
      <BorderedItem>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
      </BorderedItem>
    </BillingSection>
  );
}

function UsageSectionSkeleton({
  t,
}: {
  t: ReturnType<typeof useTranslation<"settings">>["t"];
}) {
  return (
    <BillingSection
      title={t("billing.usage.title")}
      description={<Skeleton className="h-4 w-44" />}
    >
      <BorderedItem className="flex flex-col gap-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </BorderedItem>
    </BillingSection>
  );
}

function AddonsSectionSkeleton({
  t,
}: {
  t: ReturnType<typeof useTranslation<"settings">>["t"];
}) {
  return (
    <BillingSection
      title={t("billing.addon.title")}
      description={t("billing.addon.aiSmsDescription")}
    >
      <BorderedItem>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-6 w-10 rounded-full" />
        </div>
      </BorderedItem>
    </BillingSection>
  );
}

function SpendingCapSectionSkeleton({
  t,
}: {
  t: ReturnType<typeof useTranslation<"settings">>["t"];
}) {
  return (
    <BillingSection
      title={t("billing.spendingCap.title")}
      description={t("billing.spendingCap.description")}
    >
      <BorderedItem className="opacity-60">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-10 max-w-xs flex-1 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </BorderedItem>
    </BillingSection>
  );
}

function TransactionsSectionSkeleton({
  t,
}: {
  t: ReturnType<typeof useTranslation<"settings">>["t"];
}) {
  return (
    <BillingSection
      title={t("billing.transactions.title")}
      description={t("billing.transactions.description")}
    >
      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.date")}
              </TableHead>
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.description")}
              </TableHead>
              <TableHead className="text-right text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.amount")}
              </TableHead>
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.status")}
              </TableHead>
              <TableHead className="text-right text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.invoice")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-40" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-12" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </BillingSection>
  );
}

function BillingPageSkeleton({
  t,
}: {
  t: ReturnType<typeof useTranslation<"settings">>["t"];
}) {
  return (
    <div className="flex w-full flex-col gap-10">
      <PlanSectionSkeleton t={t} />
      <UsageSectionSkeleton t={t} />
      <AddonsSectionSkeleton t={t} />
      <SpendingCapSectionSkeleton t={t} />
      <TransactionsSectionSkeleton t={t} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SettingsBillingPage(props: SettingsBillingPageProps) {
  const { t } = useTranslation("settings");
  const { data: status, isInitialLoading: isLoadingStatus } = useRememberedConvexQuery(
    api.billing.getStatus,
    {
      businessId: props.businessId,
    },
  );

  if (isLoadingStatus || !status) {
    return <BillingPageSkeleton t={t} />;
  }

  if (status.plan === "self_host") {
    return (
      <div className="w-full">
        <PlanSection status={status} businessId={props.businessId} t={t} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-10">
      <PlanSection status={status} businessId={props.businessId} t={t} />
      <UsageSection status={status} t={t} />
      <AddonsSection status={status} businessId={props.businessId} t={t} />
      <SpendingCapSection status={status} t={t} />
      <TransactionsSection status={status} t={t} />
    </div>
  );
}
