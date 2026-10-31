"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { useBusinessCan } from "./business-capabilities-provider";
import { SmallButtonSkeleton } from "./loading-skeletons";
import { PhoneNumberChooser, phoneNumberChooserApi, type ClaimResult } from "./phone-number-chooser";
import { TrialPhoneVerification } from "./trial-phone-verification";
import { useOpenUpgradePlanDialog } from "./upgrade-plan-dialog-context";
import { useOpenNumberStep } from "@/lib/number-step";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";
import type { BillingUsageViewModel, PhoneNumberViewModel } from "@/lib/page-view-models";
import { formatDateTime } from "@/lib/locale";

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
};
function getSettingsPhoneNumberErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return fallback;
}

function formatReclaimDate(value: number, locale: string): string {
  return formatDateTime(value, locale, { year: "numeric", month: "long", day: "numeric" });
}

export function LivePhoneNumberSettingsSurface() {
  const { i18n, t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const openUpgradePlanDialog = useOpenUpgradePlanDialog();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { businesses, business } = useActiveBusiness();
  const businessId = business?.businessId ?? "";
  const openNumberStep = useOpenNumberStep();
  const canManageTenant = Boolean(business && ["business_owner", "business_admin"].includes(business.role));
  const numbers = useQuery({ queryKey: ["phone-numbers", businessId], refetchInterval: query => query.state.data?.activeClaim || query.state.data?.replacement.activeClaim ? 1000 : false, enabled: Boolean(businessId), queryFn: () => requestJson<NumbersResponse>(`/api/phone-numbers?businessId=${encodeURIComponent(businessId)}`) });
  const can = useBusinessCan();
  const billing = useQuery({ queryKey: ["billing", businessId], enabled: Boolean(businessId) && can("billing"), queryFn: () => requestJson<BillingUsageViewModel>(`/api/billing?businessId=${encodeURIComponent(businessId)}`) });
  const primaryPhoneNumber = numbers.data ? numbers.data.phoneNumbers.find(number => number.status === "active" && !number.reclaimScheduledAt) ?? numbers.data.phoneNumbers[0] ?? null : undefined;
  const phoneNumberReplacementUsedAt = numbers.data?.replacement.usedAt;
  const billingStatus = billing.data ? { includedBusinessNumbers: billing.data.entitlement.includedNumbers, phoneNumberReclaimScheduledAt: null } : null;
  // A partner's business has no plan of its own: its partner's tier decides whether it gets a new number, and a replacement adds none.
  const partnerNumbers = numbers.data?.partnerNumbers ?? null;
  const isReplacement = Boolean(primaryPhoneNumber);
  const numberApi = useMemo(() => phoneNumberChooserApi(isReplacement), [isReplacement]);
  const displayPhoneNumber = primaryPhoneNumber
    ? formatPhoneNumberDisplay(primaryPhoneNumber.e164, i18n.language)
    : null;
  const hasPhoneNumber = Boolean(primaryPhoneNumber);
  const hasUsedPhoneNumberChange = Boolean(phoneNumberReplacementUsedAt);
  const canClaimDedicatedNumber = partnerNumbers
    ? partnerNumbers.available || hasPhoneNumber
    : billingStatus != null &&
      (billingStatus.includedBusinessNumbers === null || billingStatus.includedBusinessNumbers > 0);
  // A paid tier gets the business a number only when its partner's tier refused one. Otherwise no number is available yet,
  // as on the cloud without tier billing, or before the owner finishes onboarding.
  const partnerNumberMessage = Boolean(partnerNumbers) && !canClaimDedicatedNumber
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
  const showPaidPlanRequired = !partnerNumbers && (!hasPhoneNumber || isTrialNumber) && billingStatus != null && !canClaimDedicatedNumber;
  // Only a free workspace without a number can start a trial. The number step runs the claim, and offers the plans if the claim refuses.
  const trial = useQuery({ queryKey: ["number-trial", businessId], enabled: Boolean(businessId) && showPaidPlanRequired && !hasPhoneNumber, queryFn: () => requestJson<{ trial: { status: string } }>(`/api/number-trial?businessId=${encodeURIComponent(businessId)}`) });
  const offersFreeTrial = showPaidPlanRequired && !hasPhoneNumber && trial.data?.trial?.status === "available";

  // The button's label and state come from the number, the plan and the trial, which load one after another, so everything waits for all of them.
  if (businesses.isLoading || numbers.isLoading || billing.isLoading || trial.isLoading) return (
    <div className="flex flex-1 flex-col">
      <div className="w-full space-y-4">
        <ItemGroup spacing="section">
          <Item variant="outline">
            <ItemContent>
              <ItemTitle aria-hidden="true"><Skeleton className="w-fit"><span className="invisible">{t("phoneNumber.current.label")}</span></Skeleton></ItemTitle>
              <div aria-hidden="true" className="text-sm"><Skeleton className="w-fit max-w-full"><span className="invisible">{t("phoneNumber.current.description")}</span></Skeleton></div>
              <Skeleton className="h-6 w-48 max-w-full" />
            </ItemContent>
            {businesses.isLoading || canManageTenant ? (
              <ItemActions>
                <SmallButtonSkeleton label={[t("phoneNumber.actions.getNumber"), t("phoneNumber.actions.requestChange"), t("phoneNumber.freeTrial.cta"), t("phoneNumber.requiresPaidPlan.upgradeCta")].reduce((widest, label) => label.length > widest.length ? label : widest)} />
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
            <p className="text-sm font-medium text-foreground">
              {t("phoneNumber.reclaim.title", {
                date: formatReclaimDate(reclaimScheduledAt, i18n.language),
              })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
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
                <p className="text-[15px] leading-6 text-foreground">{displayPhoneNumber}</p>
              ) : (
                <p className="text-[15px] leading-6 text-muted-foreground">
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
                            Boolean(numbers.data?.activeClaim || numbers.data?.replacement.activeClaim) ||
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
                          : "phoneNumber.actions.getNumber",
                      )}
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>
                          {t(
                            needsTrialPhone
                              ? "phoneNumber.trialPhone.title"
                              : hasPhoneNumber
                              ? "phoneNumber.dialog.title"
                              : "phoneNumber.dialog.getNumberTitle",
                          )}
                        </DialogTitle>
                        <DialogDescription>
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
                          getErrorMessage={(error, fallback) => {
                            const code = (error as { code?: string } | null)?.code;
                            if (code === "partner_number_limit_reached") return t("phoneNumber.partnerTierRequired.description");
                            if (code === "partner_numbers_unavailable") return t("phoneNumber.partnerNumbersUnavailable.description");
                            if (code === "phone_numbers_unavailable") return t("phoneNumber.numbersUnavailable");
                            return getSettingsPhoneNumberErrorMessage(error, fallback);
                          }}
                          getInitialNumberSuggestion={numberApi.getInitialNumberSuggestion}
                          labels={{
                            countryLabel: t("phoneNumber.picker.countryLabel"),
                            areaCodeLabel: t("phoneNumber.picker.areaCodeLabel"),
                            areaCodePlaceholder: t("phoneNumber.picker.areaCodePlaceholder"),
                            search: t("phoneNumber.picker.search"),
                            phoneNumberHeader: t("phoneNumber.picker.phoneNumberHeader"),
                            select: t("phoneNumber.picker.select"),
                            loadMore: t("phoneNumber.picker.loadMore"),
                            empty: t("phoneNumber.picker.empty"),
                            loadFailed: t("phoneNumber.picker.loadFailed"),
                            searchFailed: t("phoneNumber.picker.searchFailed"),
                            claimFailed: t("phoneNumber.picker.claimFailed"),
                            unavailable: t("phoneNumber.picker.unavailable"),
                          }}
                          onClaimed={handleClaimed}
                          searchAvailableNumbers={numberApi.searchAvailableNumbers}
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
    </div>
  );
}
