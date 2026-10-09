"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { billingPlanCatalog } from "@lobbystack/shared";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneNumberChooser, phoneNumberChooserApi, type ClaimResult } from "./phone-number-chooser";
import { useOpenUpgradePlanDialog } from "./upgrade-plan-dialog-context";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";
import type { BillingUsageViewModel, PhoneNumberViewModel } from "@/lib/page-view-models";
import { formatDateTime } from "@/lib/locale";

type NumbersResponse = { phoneNumbers: PhoneNumberViewModel[]; activeClaim?: { id: string; status: string } | null; replacement: { usedAt: string | null; activeClaim?: { id: string; status: string } | null } };
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
  const { business } = useActiveBusiness();
  const businessId = business?.businessId ?? "";
  const canManageTenant = Boolean(business && ["business_owner", "business_admin"].includes(business.role));
  const numbers = useQuery({ queryKey: ["phone-numbers", businessId], refetchInterval: query => query.state.data?.activeClaim || query.state.data?.replacement.activeClaim ? 1000 : false, enabled: Boolean(businessId), queryFn: () => requestJson<NumbersResponse>(`/api/phone-numbers?businessId=${encodeURIComponent(businessId)}`) });
  const billing = useQuery({ queryKey: ["billing", businessId], enabled: Boolean(businessId), queryFn: () => requestJson<BillingUsageViewModel>(`/api/billing?businessId=${encodeURIComponent(businessId)}`) });
  const primaryPhoneNumber = numbers.data ? numbers.data.phoneNumbers.find(number => number.status === "active" && !number.reclaimScheduledAt) ?? numbers.data.phoneNumbers[0] ?? null : undefined;
  const phoneNumberReplacementUsedAt = numbers.data?.replacement.usedAt;
  const billingStatus = billing.data ? { includedBusinessNumbers: billingPlanCatalog[billing.data.effectivePlan].includedBusinessNumbers, phoneNumberReclaimScheduledAt: null } : null;
  const isReplacement = Boolean(primaryPhoneNumber);
  const numberApi = useMemo(() => phoneNumberChooserApi(isReplacement), [isReplacement]);
  const displayPhoneNumber = primaryPhoneNumber
    ? formatPhoneNumberDisplay(primaryPhoneNumber.e164, i18n.language)
    : null;
  const hasPhoneNumber = Boolean(primaryPhoneNumber);
  const hasUsedPhoneNumberChange = Boolean(phoneNumberReplacementUsedAt);
  const canClaimDedicatedNumber =
    billingStatus != null &&
    (billingStatus.includedBusinessNumbers === null || billingStatus.includedBusinessNumbers > 0);
  const reclaimScheduledAt =
    (primaryPhoneNumber?.reclaimScheduledAt ? new Date(primaryPhoneNumber.reclaimScheduledAt).getTime() : null) ??
    billingStatus?.phoneNumberReclaimScheduledAt ??
    null;
  const showReclaimBanner = Boolean(hasPhoneNumber && reclaimScheduledAt);
  const showPaidPlanRequired = !hasPhoneNumber && billingStatus != null && !canClaimDedicatedNumber;

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
                  {showPaidPlanRequired
                    ? t("phoneNumber.requiresPaidPlan.description")
                    : t("phoneNumber.current.empty")}
                </p>
              )}
            </ItemContent>
            {canManageTenant ? (
              <ItemActions>
                {showPaidPlanRequired ? (
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
                            hasPhoneNumber
                              ? "phoneNumber.dialog.title"
                              : "phoneNumber.dialog.getNumberTitle",
                          )}
                        </DialogTitle>
                        <DialogDescription>
                          {t(
                            hasPhoneNumber
                              ? "phoneNumber.dialog.description"
                              : "phoneNumber.dialog.getNumberDescription",
                          )}
                        </DialogDescription>
                      </DialogHeader>
                      {isDialogOpen ? (
                        <PhoneNumberChooser
                          businessId={businessId}
                          claimNumber={numberApi.claimNumber}
                          getErrorMessage={getSettingsPhoneNumberErrorMessage}
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
