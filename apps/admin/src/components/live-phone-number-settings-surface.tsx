"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { billingPlanCatalog, type BillingPlanSlug } from "@lobbystack/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneNumberChooser, type AvailableNumberSummary, type ClaimResult, type InitialSuggestionResult, type SearchResult, type NumberSelectionContext } from "./phone-number-chooser";
import { useOpenUpgradePlanDialog } from "./upgrade-plan-dialog-context";
import { formatPhoneNumberDisplay, normalizeOnboardingPhoneCountry } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";
import { selectActiveBusiness } from "@/lib/active-business";
import type { BillingUsageViewModel, PhoneNumberViewModel, WorkspaceViewModel } from "@/lib/page-view-models";

type Offer = { phoneE164: string; locality?: string; region?: string; countryCode: string; claimToken: string; capabilities: { voice: boolean; sms: boolean } };
type NumbersResponse = { phoneNumbers: PhoneNumberViewModel[]; activeClaim?: { id: string; status: string } | null; replacement: { usedAt: string | null; activeClaim?: { id: string; status: string } | null } };
function toSummary(offer: Offer, selectionContext: NumberSelectionContext): AvailableNumberSummary {
  return { ...offer, e164: offer.phoneE164, display: formatPhoneNumberDisplay(offer.phoneE164), kind: "local", selectionContext };
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

function formatReclaimDate(value: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export function LivePhoneNumberSettingsSurface() {
  const { i18n, t } = useTranslation("settings");
  const router = useRouter();
  const navigate = (path: string) => router.push(path);
  const queryClient = useQueryClient();
  const openUpgradePlanDialog = useOpenUpgradePlanDialog();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: WorkspaceViewModel[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const businessId = business?.businessId ?? "";
  const canManageTenant = Boolean(business && ["business_owner", "business_admin"].includes(business.role));
  const numbers = useQuery({ queryKey: ["phone-numbers", businessId], refetchInterval: query => query.state.data?.activeClaim || query.state.data?.replacement.activeClaim ? 1000 : false, enabled: Boolean(businessId), queryFn: () => requestJson<NumbersResponse>(`/api/phone-numbers?businessId=${encodeURIComponent(businessId)}`) });
  const billing = useQuery({ queryKey: ["billing", businessId], enabled: Boolean(businessId), queryFn: () => requestJson<BillingUsageViewModel>(`/api/billing?businessId=${encodeURIComponent(businessId)}`) });
  const primaryPhoneNumber = numbers.data ? numbers.data.phoneNumbers.find(number => number.status === "active" && !number.reclaimScheduledAt) ?? numbers.data.phoneNumbers[0] ?? null : undefined;
  const phoneNumberReplacementUsedAt = numbers.data?.replacement.usedAt;
  const rawPlan = billing.data?.account?.plan;
  const plan: BillingPlanSlug = rawPlan === "self_hosted_standard" || rawPlan === "self_host" ? "self_host" : rawPlan === "starter" || rawPlan === "pro" || rawPlan === "enterprise" ? rawPlan : "free_cloud";
  const billingStatus = billing.data ? { includedBusinessNumbers: billingPlanCatalog[plan].includedBusinessNumbers, phoneNumberReclaimScheduledAt: null } : null;
  const isReplacement = Boolean(primaryPhoneNumber);
  const getInitialReplacementNumberSuggestion = useCallback(async ({ businessId }: { businessId: string }): Promise<InitialSuggestionResult> => {
    const result = await requestJson<{ numbers: Offer[]; market?: { countryCode: string; areaCode?: string } }>(isReplacement ? `/api/phone-numbers/replacement/search?businessId=${encodeURIComponent(businessId)}` : `/api/onboarding/phone-numbers/suggestion?businessId=${encodeURIComponent(businessId)}`, isReplacement ? { method: "POST", body: JSON.stringify({ limit: 10 }) } : undefined);
    const countryCode = normalizeOnboardingPhoneCountry(result.market?.countryCode ?? result.numbers[0]?.countryCode);
    const numbers = result.numbers.map(offer => toSummary(offer, { mode: "suggested", countryCode }));
    return { market: { ...result.market, countryCode }, suggestion: numbers[0] ?? null, alternatives: numbers.slice(1) };
  }, [isReplacement]);
  const searchReplacementNumbers = useCallback(async ({ businessId, mode, countryCode, areaCode, limit }: { businessId: string; mode: "suggested" | "area_code"; countryCode: string; areaCode?: string; limit: number }): Promise<SearchResult> => {
    const selectionContext = { mode, countryCode, ...(areaCode ? { areaCode } : {}) };
    const result = await requestJson<{ numbers: Offer[]; market?: { countryCode: string; areaCode?: string } }>(`/api/${isReplacement ? "phone-numbers/replacement" : "onboarding/phone-numbers"}/search?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ selection: { countryCode, kind: "local", ...(areaCode ? { areaCode } : {}) }, limit }) });
    return { market: { countryCode }, selectionContext, numbers: result.numbers.map(offer => toSummary(offer, selectionContext)) };
  }, [isReplacement]);
  const claimReplacementNumber = useCallback(async ({ businessId, claimToken, selectionContext }: { businessId: string; claimToken: string; selectionContext?: NumberSelectionContext }): Promise<ClaimResult> => {
    const prefix = `/api/${isReplacement ? "phone-numbers/replacement" : "onboarding/phone-numbers"}`;
    const { claimId } = await requestJson<{ claimId: string }>(`${prefix}/claim?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ claimToken, idempotencyKey: crypto.randomUUID() }) });
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const { claim } = await requestJson<{ claim: { status: string; phoneNumberId: string | null; requestedE164: string } | null }>(`${prefix}/claim/${encodeURIComponent(claimId)}?businessId=${encodeURIComponent(businessId)}`);
      if (claim?.status === "claimed" && claim.phoneNumberId) return { status: "claimed", phoneNumberId: claim.phoneNumberId, e164: claim.requestedE164 };
      if (claim?.status === "unavailable") {
        const refreshed = selectionContext
          ? await searchReplacementNumbers({ businessId, mode: selectionContext.mode === "area_code" ? "area_code" : "suggested", countryCode: normalizeOnboardingPhoneCountry(selectionContext.countryCode), ...(selectionContext.areaCode ? { areaCode: selectionContext.areaCode } : {}), limit: 10 })
          : await getInitialReplacementNumberSuggestion({ businessId });
        const alternatives = "numbers" in refreshed ? refreshed.numbers : [...(refreshed.suggestion ? [refreshed.suggestion] : []), ...refreshed.alternatives];
        return { status: "unavailable", message: t("phoneNumber.picker.unavailable"), alternatives };
      }
      if (!claim || claim.status === "failed") return { status: "failed", message: t("phoneNumber.picker.claimFailed") };
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return { status: "failed", message: t("phoneNumber.picker.claimFailed") };
  }, [isReplacement, t, searchReplacementNumbers, getInitialReplacementNumberSuggestion]);
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
                          claimNumber={claimReplacementNumber as (args: {
                            businessId: string;
                            e164: string;
                            selectionContext: AvailableNumberSummary["selectionContext"];
                            claimToken: string;
                          }) => Promise<ClaimResult>}
                          getErrorMessage={getSettingsPhoneNumberErrorMessage}
                          getInitialNumberSuggestion={
                            getInitialReplacementNumberSuggestion as (args: {
                              businessId: string;
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
                              businessId: string;
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
