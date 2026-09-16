"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PhoneNumberChooser, type AvailableNumberSummary, type ClaimResult, type NumberSelectionContext } from "./phone-number-chooser";
import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { requestJson } from "@/lib/request-json";
import { normalizeOnboardingPhoneCountry, type SupportedOnboardingPhoneCountry } from "@/lib/phone";
import { LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { FieldError } from "./ui/field";

type Business = { businessId: string; active: boolean; onboardingStage?: string };
type NumberOffer = { phoneE164: string; locality?: string; region?: string; countryCode: string; claimToken: string; capabilities: { sms: boolean; voice: boolean } };

function toNumber(offer: NumberOffer, selectionContext: NumberSelectionContext): AvailableNumberSummary {
  const digits = offer.phoneE164.replace(/\D/g, "");
  const display = digits.length === 11 && digits.startsWith("1") ? `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}` : offer.phoneE164;
  return { ...offer, e164: offer.phoneE164, display, kind: "local", selectionContext };
}

export function OnboardingNumberSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const phones = useQuery({ queryKey: ["onboarding-primary-number", business?.businessId], refetchInterval: query => query.state.data?.activeClaim ? 1000 : false, enabled: Boolean(business), queryFn: () => requestJson<{ activeClaim?: { id: string; status: string } | null; phoneNumbers: Array<{ id: string; e164: string; reclaimScheduledAt: string | null }> }>(`/api/phone-numbers?businessId=${encodeURIComponent(business!.businessId)}`) });
  const primary = phones.data?.phoneNumbers.find(number => !number.reclaimScheduledAt);
  const reachedAttribution = ["attribution", "complete"].includes(business?.onboardingStage ?? "");
  useEffect(() => { if (primary && !reachedAttribution) router.replace("/onboarding/attribution"); }, [primary, reachedAttribution, router]);
  const getInitialNumberSuggestion = useCallback(async ({ businessId }: { businessId: string }) => {
    const result = await requestJson<{ numbers: NumberOffer[]; market?: { countryCode: string; areaCode?: string } }>(`/api/onboarding/phone-numbers/suggestion?businessId=${encodeURIComponent(businessId)}`);
    const countryCode = normalizeOnboardingPhoneCountry(result.market?.countryCode ?? result.numbers[0]?.countryCode);
    const numbers = result.numbers.map(offer => toNumber(offer, { mode: "suggested", countryCode }));
    return { market: { ...result.market, countryCode }, suggestion: numbers[0] ?? null, alternatives: numbers.slice(1) };
  }, []);
  const searchAvailableNumbers = useCallback(async ({ businessId, mode, countryCode, areaCode, limit }: { businessId: string; mode: "suggested" | "area_code"; countryCode: SupportedOnboardingPhoneCountry; areaCode?: string; limit: number }) => {
    const selectionContext = { mode, countryCode, ...(areaCode ? { areaCode } : {}) };
    const result = await requestJson<{ numbers: NumberOffer[]; market?: { countryCode: string; areaCode?: string } }>(`/api/onboarding/phone-numbers/search?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ selection: { countryCode, kind: "local", ...(areaCode ? { areaCode } : {}) }, limit }) });
    return { market: { countryCode }, selectionContext, numbers: result.numbers.map(offer => toNumber(offer, selectionContext)) };
  }, []);
  const claimNumber = useCallback(async ({ businessId, claimToken, selectionContext }: { businessId: string; claimToken: string; selectionContext?: NumberSelectionContext }): Promise<ClaimResult> => {
    setClaiming(true);
    try {
    const { claimId } = await requestJson<{ claimId: string }>(`/api/onboarding/phone-numbers/claim?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ claimToken, idempotencyKey: crypto.randomUUID() }) });
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const { claim } = await requestJson<{ claim: { status: string; requestedE164: string; phoneNumberId: string | null } | null }>(`/api/onboarding/phone-numbers/claim/${encodeURIComponent(claimId)}?businessId=${encodeURIComponent(businessId)}`);
      if (claim?.status === "claimed" && claim.phoneNumberId) return { status: "claimed", phoneNumberId: claim.phoneNumberId, e164: claim.requestedE164 };
      if (claim?.status === "unavailable") {
        const refreshed = selectionContext
          ? await searchAvailableNumbers({ businessId, mode: selectionContext.mode === "area_code" ? "area_code" : "suggested", countryCode: normalizeOnboardingPhoneCountry(selectionContext.countryCode), ...(selectionContext.areaCode ? { areaCode: selectionContext.areaCode } : {}), limit: 10 })
          : await getInitialNumberSuggestion({ businessId });
        const alternatives = "numbers" in refreshed ? refreshed.numbers : [...(refreshed.suggestion ? [refreshed.suggestion] : []), ...refreshed.alternatives];
        return { status: "unavailable", message: t("number.unavailable"), alternatives };
      }
      if (!claim || claim.status === "failed") return { status: "failed", message: t("number.claimFailed") };
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return { status: "failed", message: t("number.claimFailed") };
    } finally { setClaiming(false); }
  }, [t, searchAvailableNumbers, getInitialNumberSuggestion]);
  const getErrorMessage = useCallback((error: unknown, fallback: string) => getSafeOnboardingErrorMessage(error, t, fallback), [t]);
  const skip = useMutation({ mutationFn: () => requestJson(`/api/onboarding/phone-numbers/skip?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST" }), onSuccess: () => router.push("/onboarding/attribution") });
  if (!phones.data || (!claiming && phones.data.activeClaim) || (primary && !reachedAttribution)) return <Surface className="flex justify-center p-6"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></Surface>;
  if (primary) return <Surface className="flex flex-col gap-5 p-6 text-center"><div className="flex flex-col gap-2"><p className="text-sm font-medium text-muted-foreground">{t("number.selectedNumberLabel")}</p><p className="text-2xl font-semibold text-foreground">{toNumber({ phoneE164: primary.e164, countryCode: "US", claimToken: "", capabilities: { sms: true, voice: true } }, { mode: "suggested", countryCode: "US" }).display}</p></div><Button onClick={() => router.push("/onboarding/attribution")} type="button">{t("number.continue")}</Button></Surface>;
  return <div className="flex flex-col gap-6">
    {business ? <PhoneNumberChooser businessId={business.businessId} getInitialNumberSuggestion={getInitialNumberSuggestion} searchAvailableNumbers={searchAvailableNumbers} claimNumber={claimNumber} getErrorMessage={getErrorMessage} onClaimed={() => { setClaiming(false); router.push(business.onboardingStage === "complete" ? "/settings/phone-number" : "/onboarding/attribution"); }} labels={{ countryLabel: t("number.countryLabel"), areaCodeLabel: t("number.areaCodeLabel"), areaCodePlaceholder: t("number.areaCodePlaceholder"), search: t("number.search"), phoneNumberHeader: t("number.tableHeaders.phoneNumber"), select: t("number.select"), loadMore: t("number.loadMore"), empty: t("number.empty"), loadFailed: "number.loadFailed", searchFailed: "number.searchFailed", claimFailed: "number.claimFailed", unavailable: t("number.unavailable") }} /> : null}
    {business?.onboardingStage !== "complete" ? <button className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50" disabled={!business || skip.isPending || claiming} onClick={() => skip.mutate()} type="button">{skip.isPending ? t("number.skipping") : t("number.skipLater")}</button> : null}
    {skip.isError ? <FieldError>{t("number.skipFailed")}</FieldError> : null}
  </div>;
}
