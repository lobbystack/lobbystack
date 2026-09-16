"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatCapInput, parseCapInputToCents } from "@/lib/billing-cap";
import { requestJson } from "@/lib/request-json";
import { SectionBlock } from "./section-block";
import { Surface } from "./ui/surface";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type SpendingCapStatus = { plan: string; overageSpendingCapCents: number | null; overageSpendCents: number; overageSpendCentsComplete: boolean; overageSpendingCapReached: boolean; hasBillingManagementAccess: boolean };
function formatCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 !== 0 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
}

export function SpendingCapSection({
  status,
  businessId,
  locale,
  t,
}: {
  status: SpendingCapStatus;
  businessId: string;
  locale: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const queryClient = useQueryClient();
  async function setOverageSpendingCap(input: { businessId: string; capCents: number | null }) {
    await requestJson(`/api/billing?businessId=${encodeURIComponent(input.businessId)}`, { method: "POST", body: JSON.stringify({ capCents: input.capCents }) });
    await queryClient.invalidateQueries({ queryKey: ["billing", input.businessId] });
  }
  const [capInput, setCapInput] = useState(() =>
    formatCapInput(status.overageSpendingCapCents, locale),
  );
  const [saving, setSaving] = useState<"save" | "remove" | null>(null);

  useEffect(() => {
    setCapInput(formatCapInput(status.overageSpendingCapCents, locale));
  }, [locale, status.overageSpendingCapCents]);

  if (status.plan !== "starter" && status.plan !== "pro") return null;

  const capCents = status.overageSpendingCapCents;
  const spendCents = status.overageSpendCents;
  const progressPercent =
    capCents === null
      ? 0
      : capCents === 0
        ? 100
        : Math.min(100, (spendCents / capCents) * 100);

  async function saveCap() {
    const capCents = parseCapInputToCents(capInput, locale);
    if (capCents === null) {
      toast.error(t("billing.spendingCap.invalidAmount"));
      return;
    }

    setSaving("save");
    try {
      await setOverageSpendingCap({ businessId, capCents });
      toast.success(t("billing.spendingCap.saved"));
    } catch {
      toast.error(t("billing.spendingCap.saveFailed"));
    } finally {
      setSaving(null);
    }
  }

  async function removeCap() {
    setSaving("remove");
    try {
      await setOverageSpendingCap({ businessId, capCents: null });
      setCapInput("");
      toast.success(t("billing.spendingCap.removed"));
    } catch {
      toast.error(t("billing.spendingCap.removeFailed"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <SectionBlock title={t("billing.spendingCap.title")}>
      <Surface className="px-6 py-5 ">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
              <span className="font-medium text-foreground">
                {capCents === null
                  ? t("billing.spendingCap.noCap")
                  : t("billing.spendingCap.currentSpend")}
              </span>
              {capCents !== null && (
                <span className="tabular-nums text-muted-foreground">
                  {t(
                    status.overageSpendCentsComplete
                      ? "billing.spendingCap.spendOfCap"
                      : "billing.spendingCap.spendAtLeastOfCap",
                    {
                      spend: formatCents(spendCents, locale),
                      cap: formatCents(capCents, locale),
                    },
                  )}
                </span>
              )}
            </div>
            {capCents !== null && (
              <>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      status.overageSpendingCapReached
                        ? "bg-destructive"
                        : "bg-foreground"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {status.overageSpendingCapReached && (
                  <span className="text-sm leading-6 text-destructive">
                    {t("billing.spendingCap.reached")}
                  </span>
                )}
              </>
            )}
          </div>

          {status.hasBillingManagementAccess ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex w-full max-w-xs flex-col gap-2">
                <Label htmlFor="overage-spending-cap">
                  {t("billing.spendingCap.amountLabel")}
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="overage-spending-cap"
                    value={capInput}
                    onChange={(event) => setCapInput(event.target.value)}
                    inputMode="decimal"
                    placeholder={t("billing.spendingCap.placeholder")}
                    className="pl-7"
                    disabled={saving !== null}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void saveCap()}
                  disabled={saving !== null || capInput.trim().length === 0}
                >
                  {saving === "save"
                    ? capCents !== null
                      ? t("billing.spendingCap.updating")
                      : t("billing.spendingCap.saving")
                    : capCents !== null
                      ? t("billing.spendingCap.update")
                      : t("billing.spendingCap.save")}
                </Button>
                {capCents !== null && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void removeCap()}
                    disabled={saving !== null}
                  >
                    {saving === "remove"
                      ? t("billing.spendingCap.removing")
                      : t("billing.spendingCap.remove")}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              {t("billing.spendingCap.adminOnly")}
            </p>
          )}
        </div>
      </Surface>
    </SectionBlock>
  );
}

