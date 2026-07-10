import { useState } from "react";

import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { BillingStatus } from "../../../../../packages/shared/src/billing";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PhoneNumberChooser,
  type AvailableNumberSummary,
  type ClaimResult,
  type InitialSuggestionResult,
  type SearchResult,
} from "@/features/onboarding/components/PhoneNumberChooser";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { useObservedAction } from "@/lib/observed-convex";

type SettingsPhoneNumberPageProps = {
  businessId: Id<"businesses">;
  canManageTenant: boolean;
  phoneNumberReplacementUsedAt?: string;
  billingStatus?: BillingStatus | null;
};

type PrimaryPhoneNumber = {
  _id: Id<"phone_numbers">;
  e164: string;
  voiceEnabled: boolean;
  smsEnabled: boolean;
  status: string;
  reclaimScheduledAt?: number | null;
  reclaimReason?: "free_plan" | "downgrade" | null;
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
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export function SettingsPhoneNumberPage({
  businessId,
  canManageTenant,
  phoneNumberReplacementUsedAt,
  billingStatus,
}: SettingsPhoneNumberPageProps) {
  const { i18n, t } = useTranslation("settings");
  const navigate = useNavigate();
  const primaryPhoneNumber = useQuery(api.businesses.catalog.getPrimaryPhoneNumber, {
    businessId,
  }) as PrimaryPhoneNumber | null | undefined;
  const getInitialReplacementNumberSuggestion = useObservedAction(
    api.settings.phoneNumbers.getInitialReplacementNumberSuggestion,
  );
  const searchReplacementNumbers = useObservedAction(
    api.settings.phoneNumbers.searchReplacementNumbers,
  );
  const claimReplacementNumber = useObservedAction(
    api.settings.phoneNumbers.claimReplacementNumber,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const displayPhoneNumber = primaryPhoneNumber
    ? formatPhoneNumberDisplay(primaryPhoneNumber.e164, i18n.language)
    : null;
  const hasPhoneNumber = Boolean(primaryPhoneNumber);
  const hasUsedPhoneNumberChange = Boolean(phoneNumberReplacementUsedAt);
  const canClaimDedicatedNumber =
    billingStatus != null &&
    (billingStatus.includedBusinessNumbers === null || billingStatus.includedBusinessNumbers > 0);
  const reclaimScheduledAt =
    primaryPhoneNumber?.reclaimScheduledAt ??
    billingStatus?.phoneNumberReclaimScheduledAt ??
    null;
  const showReclaimBanner = Boolean(hasPhoneNumber && reclaimScheduledAt);
  const showPaidPlanRequired = !hasPhoneNumber && billingStatus != null && !canClaimDedicatedNumber;

  function handleClaimed(result: Extract<ClaimResult, { status: "claimed" }>): void {
    toast.success(t(hasPhoneNumber ? "phoneNumber.toast.changed" : "phoneNumber.toast.added"));
    setIsDialogOpen(false);
    void result;
  }

  function handleVerifyPhoneRequired(): void {
    setIsDialogOpen(false);
    navigate("/onboarding/verify-phone");
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
                onClick={() => navigate("/settings/plan")}
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
                  <Button onClick={() => navigate("/settings/plan")} size="sm" variant="outline">
                    {t("phoneNumber.requiresPaidPlan.upgradeCta")}
                  </Button>
                ) : (
                  <Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
                    <DialogTrigger
                      render={
                        <Button
                          disabled={
                            primaryPhoneNumber === undefined ||
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
                          claimNumber={claimReplacementNumber as (args: {
                            businessId: Id<"businesses">;
                            e164: string;
                            selectionContext: AvailableNumberSummary["selectionContext"];
                            claimToken: string;
                          }) => Promise<ClaimResult>}
                          getErrorMessage={getSettingsPhoneNumberErrorMessage}
                          getInitialNumberSuggestion={
                            getInitialReplacementNumberSuggestion as (args: {
                              businessId: Id<"businesses">;
                            }) => Promise<InitialSuggestionResult>
                          }
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
                          onVerifyPhoneRequired={handleVerifyPhoneRequired}
                          searchAvailableNumbers={
                            searchReplacementNumbers as (args: {
                              businessId: Id<"businesses">;
                              mode: "suggested" | "area_code";
                              countryCode: AvailableNumberSummary["countryCode"];
                              areaCode?: string;
                              limit: number;
                            }) => Promise<SearchResult>
                          }
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
