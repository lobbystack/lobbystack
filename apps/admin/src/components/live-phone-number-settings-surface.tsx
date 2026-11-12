"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { useBusinessCan } from "./business-capabilities-provider";
import { SmallButtonSkeleton } from "./loading-skeletons";
import { PhoneNumberChooser, phoneNumberChooserApi, type AvailableNumberSummary, type ClaimResult } from "./phone-number-chooser";
import { TrialPhoneVerification } from "./trial-phone-verification";
import { useOpenUpgradePlanDialog } from "./upgrade-plan-dialog-context";
import { useOpenNumberStep } from "@/lib/number-step";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";
import type { BillingUsageViewModel, PhoneNumberViewModel } from "@/lib/page-view-models";
import { formatDateTime, intlLocale } from "@/lib/locale";
import { extraNumberPrices, isExtraNumberCountry } from "@lobbystack/shared";

type NumbersResponse = {
  phoneNumbers: PhoneNumberViewModel[];
  activeClaim?: { id: string; status: string } | null;
  replacement: { usedAt: string | null; activeClaim?: { id: string; status: string } | null };
  /**
   * For a partner's business, whether its partner's tier lets it get a new number now, whether that number is its partner's
   * 14-day trial, and why it can't get one; null for a direct business. With the trial, whether this person verified a mobile
   * in the business, which the trial needs.
   */
  partnerNumbers?: { available: boolean; trial?: boolean; refusal?: string | null; phoneVerified?: boolean } | null;
  /** Whether the business can buy another number for an agent, and whether it pays for one. */
  extraNumbers?: { available: boolean; priced: boolean; refusal: string | null };
  extraClaim?: { id: string; status: string } | null;
};

/** An extra number's monthly price, in the interface's language. */
export function formatMonthlyPrice(cents: number, language: string): string {
  return new Intl.NumberFormat(intlLocale(language), { style: "currency", currency: "USD" }).format(cents / 100);
}
function getSettingsPhoneNumberErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return fallback;
}

/** The labels and error messages the number chooser takes, from the settings copy. */
export function phoneNumberChooserText(t: TFunction<"settings">) {
  return {
    labels: {
      countryLabel: t("phoneNumber.picker.countryLabel"),
      areaCodeLabel: t("phoneNumber.picker.areaCodeLabel"),
      areaCodePlaceholder: t("phoneNumber.picker.areaCodePlaceholder"),
      searching: t("phoneNumber.picker.searching"),
      search: t("phoneNumber.picker.search"),
      phoneNumberHeader: t("phoneNumber.picker.phoneNumberHeader"),
      select: t("phoneNumber.picker.select"),
      loadMore: t("phoneNumber.picker.loadMore"),
      empty: t("phoneNumber.picker.empty"),
      loadFailed: t("phoneNumber.picker.loadFailed"),
      searchFailed: t("phoneNumber.picker.searchFailed"),
      claimFailed: t("phoneNumber.picker.claimFailed"),
      unavailable: t("phoneNumber.picker.unavailable"),
    },
    getErrorMessage(error: unknown, fallback: string): string {
      const code = (error as { code?: string } | null)?.code;
      if (code === "partner_number_limit_reached") return t("phoneNumber.partnerTierRequired.description");
      if (code === "partner_numbers_unavailable") return t("phoneNumber.partnerNumbersUnavailable.description");
      if (code === "phone_numbers_unavailable") return t("phoneNumber.numbersUnavailable");
      if (code === "extra_number_price_changed") return t("phoneNumber.extra.priceChanged");
      return getSettingsPhoneNumberErrorMessage(error, fallback);
    },
  };
}

function formatReclaimDate(value: number, locale: string): string {
  return formatDateTime(value, locale, { year: "numeric", month: "long", day: "numeric" });
}

/** The number calls to an agent come in on. Without `agentId`, the business's first number. */
export function LivePhoneNumberSettingsSurface({ agentId }: { agentId?: string } = {}) {
  const { i18n, t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const openUpgradePlanDialog = useOpenUpgradePlanDialog();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { businesses, business } = useActiveBusiness();
  const businessId = business?.businessId ?? "";
  const openNumberStep = useOpenNumberStep();
  const canManageTenant = Boolean(business && ["business_owner", "business_admin"].includes(business.role));
  const numbers = useQuery({ queryKey: ["phone-numbers", businessId], refetchInterval: query => query.state.data?.activeClaim || query.state.data?.replacement.activeClaim || query.state.data?.extraClaim ? 1000 : false, enabled: Boolean(businessId), queryFn: () => requestJson<NumbersResponse>(`/api/phone-numbers?businessId=${encodeURIComponent(businessId)}`) });
  const can = useBusinessCan();
  const billing = useQuery({ queryKey: ["billing", businessId], enabled: Boolean(businessId) && can("billing"), queryFn: () => requestJson<BillingUsageViewModel>(`/api/billing?businessId=${encodeURIComponent(businessId)}`) });
  const agentNumbers = numbers.data ? numbers.data.phoneNumbers.filter(number => !agentId || number.agentId === agentId) : undefined;
  const primaryPhoneNumber = agentNumbers ? agentNumbers.find(number => number.status === "active" && !number.reclaimScheduledAt) ?? agentNumbers[0] ?? null : undefined;
  const phoneNumberReplacementUsedAt = numbers.data?.replacement.usedAt;
  const billingStatus = billing.data ? { includedBusinessNumbers: billing.data.entitlement.includedNumbers, phoneNumberReclaimScheduledAt: null } : null;
  // A partner's business has no plan of its own: its partner's tier decides whether it gets a new number, and a replacement adds none.
  const partnerNumbers = numbers.data?.partnerNumbers ?? null;
  const isReplacement = Boolean(primaryPhoneNumber);
  // An agent without a number, in a workspace that has one, gets another number of its own: an extra number.
  const businessHasNumber = Boolean(numbers.data?.phoneNumbers.some(number => number.status === "active" && !number.reclaimScheduledAt));
  const buysExtra = Boolean(agentId) && !isReplacement && businessHasNumber;
  const extraNumbers = numbers.data?.extraNumbers;
  const extraPriced = Boolean(buysExtra && extraNumbers?.priced);
  const replacedNumberId = primaryPhoneNumber?.id;
  const numberApi = useMemo(() => phoneNumberChooserApi(isReplacement, { phoneNumberId: replacedNumberId, extraForAgentId: buysExtra ? agentId : undefined }), [agentId, buysExtra, isReplacement, replacedNumberId]);
  const [confirming, setConfirming] = useState<AvailableNumberSummary | null>(null);
  const confirmAnswer = useRef<((buy: boolean) => void) | null>(null);
  function answerConfirm(buy: boolean): void {
    confirmAnswer.current?.(buy);
    confirmAnswer.current = null;
  }
  function confirmPurchase(number: AvailableNumberSummary): Promise<boolean> {
    return new Promise((resolve) => {
      confirmAnswer.current = resolve;
      setConfirming(number);
    });
  }
  const priceOf = (country: string) => isExtraNumberCountry(country) ? formatMonthlyPrice(extraNumberPrices[country].monthlyCents, i18n.language) : null;
  const chooserText = phoneNumberChooserText(t);
  const displayPhoneNumber = primaryPhoneNumber
    ? formatPhoneNumberDisplay(primaryPhoneNumber.e164, i18n.language)
    : null;
  const hasPhoneNumber = Boolean(primaryPhoneNumber);
  const hasUsedPhoneNumberChange = Boolean(phoneNumberReplacementUsedAt);
  const canClaimDedicatedNumber = buysExtra
    ? Boolean(extraNumbers?.available)
    : partnerNumbers
    ? partnerNumbers.available || hasPhoneNumber
    : billingStatus != null &&
      (billingStatus.includedBusinessNumbers === null || billingStatus.includedBusinessNumbers > 0);
  // A paid tier gets the business a number only when its partner's tier refused one. Otherwise no number is available yet,
  // as on the cloud without tier billing, or before the owner finishes onboarding.
  const partnerNumberMessage = Boolean(partnerNumbers) && !buysExtra && !canClaimDedicatedNumber
    ? partnerNumbers?.refusal === "partner_number_limit_reached" ? "phoneNumber.partnerTierRequired.description" : "phoneNumber.partnerNumbersUnavailable.description"
    : null;
  // The partner's trial number transfers calls only to the claimer's verified mobile, so the dialog asks for it first.
  const needsTrialPhone = Boolean(partnerNumbers?.trial && partnerNumbers.phoneVerified === false && !hasPhoneNumber);
  // A trial number's release date isn't the owner's deadline: the trial banner says when it ends,
  // and keeping or changing the number takes a paid plan.
  const isTrialNumber = primaryPhoneNumber?.reclaimReason === "trial";
  const reclaimScheduledAt = isTrialNumber ? null :
    (primaryPhoneNumber?.reclaimScheduledAt ? new Date(primaryPhoneNumber.reclaimScheduledAt).getTime() : null) ??
    billingStatus?.phoneNumberReclaimScheduledAt ??
    null;
  const showReclaimBanner = Boolean(hasPhoneNumber && reclaimScheduledAt);
  const showPaidPlanRequired = buysExtra
    ? extraNumbers?.refusal === "dedicated_number_requires_paid_plan"
    : !partnerNumbers && (!hasPhoneNumber || isTrialNumber) && billingStatus != null && !canClaimDedicatedNumber;
  // Only a free workspace without a number can start a trial. The number step runs the claim, and offers the plans if the claim refuses.
  const trial = useQuery({ queryKey: ["number-trial", businessId], enabled: Boolean(businessId) && showPaidPlanRequired && !hasPhoneNumber, queryFn: () => requestJson<{ trial: { status: string } }>(`/api/number-trial?businessId=${encodeURIComponent(businessId)}`) });
  const offersFreeTrial = showPaidPlanRequired && !hasPhoneNumber && !buysExtra && trial.data?.trial?.status === "available";

  // The button's label and state come from the number, the plan and the trial, which load one after another, so everything waits for all of them.
  if (businesses.isLoading || numbers.isLoading || billing.isLoading || trial.isLoading) return (
    <div className="flex flex-1 flex-col">
      <div className="w-full space-y-4">
        <ItemGroup spacing="section">
          <Item variant="outline">
            <ItemContent>
              <ItemTitle aria-hidden="true"><Skeleton className="w-fit"><span className="invisible">{t("phoneNumber.current.label")}</span></Skeleton></ItemTitle>
              <div aria-hidden="true" className="type-body"><Skeleton className="w-fit max-w-full"><span className="invisible">{t("phoneNumber.current.description")}</span></Skeleton></div>
              <Skeleton className="h-6 w-48 max-w-full" />
            </ItemContent>
            {businesses.isLoading || canManageTenant ? (
              <ItemActions>
                <SmallButtonSkeleton label={[t("phoneNumber.actions.getNumber"), t("phoneNumber.extra.buy"), t("phoneNumber.actions.requestChange"), t("phoneNumber.freeTrial.cta"), t("phoneNumber.requiresPaidPlan.upgradeCta")].reduce((widest, label) => label.length > widest.length ? label : widest)} />
              </ItemActions>
            ) : null}
          </Item>
        </ItemGroup>
      </div>
    </div>
  );

  function handleClaimed(result: Extract<ClaimResult, { status: "claimed" }>): void {
    toast.success(t(hasPhoneNumber ? "phoneNumber.toast.changed" : "phoneNumber.toast.added"));
    setIsDialogOpen(false);
    void queryClient.invalidateQueries({ queryKey: ["phone-numbers", businessId] });
    void queryClient.invalidateQueries({ queryKey: ["onboarding-primary-number", businessId] });
    void result;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="w-full space-y-4">
        {showReclaimBanner && reclaimScheduledAt ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="type-title text-foreground">
              {t("phoneNumber.reclaim.title", {
                date: formatReclaimDate(reclaimScheduledAt, i18n.language),
              })}
            </p>
            <p className="mt-1 type-body-muted">
              {t("phoneNumber.reclaim.description", {
                number: displayPhoneNumber ?? primaryPhoneNumber?.e164,
              })}
            </p>
            {canManageTenant ? (
              <Button
                className="mt-3"
                onClick={openUpgradePlanDialog}
                size="sm"
                variant="outline"
              >
                {t("phoneNumber.reclaim.upgradeCta")}
              </Button>
            ) : null}
          </div>
        ) : null}

        <ItemGroup spacing="section">
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>{t("phoneNumber.current.label")}</ItemTitle>
              <ItemDescription>{t("phoneNumber.current.description")}</ItemDescription>
              {primaryPhoneNumber === undefined ? (
                <Skeleton className="h-6 w-48 max-w-full" />
              ) : displayPhoneNumber ? (
                <>
                  <p className="type-body text-foreground">{displayPhoneNumber}</p>
                  {primaryPhoneNumber?.monthlyPriceCents != null ? <p className="type-caption text-muted-foreground">{t("phoneNumber.extra.monthly", { price: formatMonthlyPrice(primaryPhoneNumber.monthlyPriceCents, i18n.language) })}</p> : null}
                </>
              ) : buysExtra && extraNumbers?.refusal === "extra_numbers_unavailable" ? (
                <p className="type-body-muted">{t("phoneNumber.extra.unavailable")}</p>
              ) : (
                <p className="type-body-muted">
                  {offersFreeTrial || partnerNumbers?.trial
                    ? t("phoneNumber.freeTrial.description")
                    : partnerNumberMessage
                    ? t(partnerNumberMessage)
                    : showPaidPlanRequired
                    ? t("phoneNumber.requiresPaidPlan.description")
                    : t("phoneNumber.current.empty")}
                </p>
              )}
            </ItemContent>
            {canManageTenant ? (
              <ItemActions>
                {offersFreeTrial ? (
                  <Button onClick={() => void openNumberStep(businessId)} size="sm" type="button">
                    {t("phoneNumber.freeTrial.cta")}
                  </Button>
                ) : showPaidPlanRequired ? (
                  <Button onClick={openUpgradePlanDialog} size="sm" variant="outline">
                    {t("phoneNumber.requiresPaidPlan.upgradeCta")}
                  </Button>
                ) : (
                  <Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
                    <DialogTrigger
                      render={
                        <Button
                          disabled={
                            primaryPhoneNumber === undefined ||
                            Boolean(numbers.data?.activeClaim || numbers.data?.replacement.activeClaim || numbers.data?.extraClaim) ||
                            (hasPhoneNumber && hasUsedPhoneNumberChange) ||
                            !canClaimDedicatedNumber
                          }
                          size="sm"
                          variant="outline"
                        />
                      }
                    >
                      {t(
                        hasPhoneNumber
                          ? "phoneNumber.actions.requestChange"
                          : buysExtra
                          ? "phoneNumber.extra.buy"
                          : "phoneNumber.actions.getNumber",
                      )}
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {t(
                            needsTrialPhone
                              ? "phoneNumber.trialPhone.title"
                              : hasPhoneNumber
                              ? "phoneNumber.dialog.title"
                              : buysExtra
                              ? "phoneNumber.extra.buy"
                              : "phoneNumber.dialog.getNumberTitle",
                          )}
                        </DialogTitle>
                        <DialogDescription className={buysExtra ? "sr-only" : undefined}>
                          {t(
                            needsTrialPhone
                              ? "phoneNumber.trialPhone.description"
                              : hasPhoneNumber
                              ? "phoneNumber.dialog.description"
                              : "phoneNumber.dialog.getNumberDescription",
                          )}
                        </DialogDescription>
                      </DialogHeader>
                      {isDialogOpen && needsTrialPhone ? (
                        <TrialPhoneVerification businessId={businessId} onVerified={() => queryClient.invalidateQueries({ queryKey: ["phone-numbers", businessId] })} />
                      ) : isDialogOpen ? (
                        <PhoneNumberChooser
                          businessId={businessId}
                          claimNumber={numberApi.claimNumber}
                          getErrorMessage={chooserText.getErrorMessage}
                          getInitialNumberSuggestion={numberApi.getInitialNumberSuggestion}
                          labels={buysExtra ? { ...chooserText.labels, select: t("phoneNumber.extra.select") } : chooserText.labels}
                          onClaimed={handleClaimed}
                          searchAvailableNumbers={numberApi.searchAvailableNumbers}
                          {...(extraPriced ? { countryNote: (country: string) => t("phoneNumber.extra.monthly", { price: priceOf(country) }), confirmClaim: confirmPurchase } : {})}
                        />
                      ) : null}
                    </DialogContent>
                  </Dialog>
                )}
              </ItemActions>
            ) : null}
          </Item>
        </ItemGroup>
      </div>
      <ConfirmActionDialog
        cancelLabel={t("phoneNumber.extra.cancel")}
        confirmLabel={t("phoneNumber.extra.confirm")}
        description={confirming ? t("phoneNumber.extra.confirmDescription", { price: priceOf(confirming.countryCode) }) : ""}
        onConfirm={() => answerConfirm(true)}
        onOpenChange={(open) => { if (!open) { answerConfirm(false); setConfirming(null); } }}
        open={Boolean(confirming)}
        title={t("phoneNumber.extra.confirmTitle", { number: confirming?.display ?? "" })}
      />
    </div>
  );
}
