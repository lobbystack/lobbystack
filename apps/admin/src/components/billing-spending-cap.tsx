"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { caretBefore, formatPriceTyping, parsePriceInput, priceInputValue } from "@/lib/price-input";
import { requestJson } from "@/lib/request-json";
import { SectionBlock } from "./section-block";
import { Surface } from "./ui/surface";
import { Button } from "./ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group";
import { Label } from "./ui/label";
import { intlLocale } from "@/lib/locale";

/** What LobbyStack bills overage in. */
const CAP_CURRENCY = "USD";

type SpendingCapStatus = { plan: string; overageSpendingCapCents: number | null; overageSpendCents: number; overageSpendCentsComplete: boolean; overageSpendingCapReached: boolean; hasBillingManagementAccess: boolean };
/** Formats cents as currency, dropping the decimals for whole amounts. */
export function formatMoney(cents: number, currency = "usd", locale = "en"): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
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
    priceInputValue(status.overageSpendingCapCents, CAP_CURRENCY, locale),
  );
  const [saving, setSaving] = useState<"save" | "remove" | null>(null);

  useEffect(() => {
    setCapInput(priceInputValue(status.overageSpendingCapCents, CAP_CURRENCY, locale));
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
    const amount = parsePriceInput(capInput, CAP_CURRENCY, locale);
    if (amount.kind !== "amount") {
      toast.error(t("billing.spendingCap.invalidAmount"));
      return;
    }

    setSaving("save");
    try {
      await setOverageSpendingCap({ businessId, capCents: amount.minor });
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
            <div className="flex flex-wrap items-center justify-between gap-2 type-body">
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
                      spend: formatMoney(spendCents, "usd", locale),
                      cap: formatMoney(capCents, "usd", locale),
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
                  <span className="type-body text-destructive">
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
                <InputGroup>
                  <InputGroupInput
                    id="overage-spending-cap"
                    value={capInput}
                    onChange={(event) => {
                      const input = event.target;
                      // Keep the caret before the same digits once grouping marks are added or removed.
                      const digitsAfter = input.value.slice(input.selectionStart ?? input.value.length).replace(/\D/gu, "").length;
                      const next = formatPriceTyping(input.value, CAP_CURRENCY, locale);
                      setCapInput(next);
                      requestAnimationFrame(() => { const caret = caretBefore(next, digitsAfter); input.setSelectionRange(caret, caret); });
                    }}
                    inputMode="decimal"
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || saving !== null || capInput.trim().length === 0) return;
                      event.preventDefault();
                      void saveCap();
                    }}
                    placeholder={t("billing.spendingCap.placeholder")}
                    className="tabular-nums"
                    disabled={saving !== null}
                    type="text"
                  />
                  <InputGroupAddon align="inline-end"><InputGroupText>{CAP_CURRENCY}</InputGroupText></InputGroupAddon>
                </InputGroup>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void saveCap()}
                  disabled={saving !== null || capInput.trim().length === 0}
                  loading={saving === "save"}
                  loadingLabel={capCents !== null ? t("billing.spendingCap.updating") : t("billing.spendingCap.saving")}
                >
                  {capCents !== null ? t("billing.spendingCap.update") : t("billing.spendingCap.save")}
                </Button>
                {capCents !== null && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void removeCap()}
                    disabled={saving !== null}
                    loading={saving === "remove"}
                    loadingLabel={t("billing.spendingCap.removing")}
                  >
                    {t("billing.spendingCap.remove")}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="type-body-muted">
              {t("billing.spendingCap.adminOnly")}
            </p>
          )}
        </div>
      </Surface>
    </SectionBlock>
  );
}

