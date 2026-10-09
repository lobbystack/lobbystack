"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { PhoneNumberChooser, phoneNumberChooserApi } from "./phone-number-chooser";
import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { requestJson } from "@/lib/request-json";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { useTelemetry } from "@/components/product-analytics";
import { LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { FieldError } from "./ui/field";

const onboardingNumbers = phoneNumberChooserApi(false);

export function OnboardingNumberSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const telemetry = useTelemetry();
  const [claiming, setClaiming] = useState(false);
  const { business } = useActiveBusiness();
  const phones = useQuery({ queryKey: ["onboarding-primary-number", business?.businessId], refetchInterval: query => query.state.data?.activeClaim ? 1000 : false, enabled: Boolean(business), queryFn: () => requestJson<{ activeClaim?: { id: string; status: string } | null; phoneNumbers: Array<{ id: string; e164: string; reclaimScheduledAt: string | null }> }>(`/api/phone-numbers?businessId=${encodeURIComponent(business!.businessId)}`) });
  const primary = phones.data?.phoneNumbers.find(number => !number.reclaimScheduledAt);
  const reachedAttribution = ["attribution", "complete"].includes(business?.onboardingStage ?? "");
  useEffect(() => { if (primary && !reachedAttribution) router.replace("/onboarding/attribution"); }, [primary, reachedAttribution, router]);
  const claimNumber = useCallback<typeof onboardingNumbers.claimNumber>(async (args) => {
    setClaiming(true);
    try { return await onboardingNumbers.claimNumber(args); } finally { setClaiming(false); }
  }, []);
  const getErrorMessage = useCallback((error: unknown, fallback: string) => getSafeOnboardingErrorMessage(error, t, fallback), [t]);
  const skip = useMutation({ mutationFn: () => requestJson(`/api/onboarding/phone-numbers/skip?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST" }), onSuccess: () => router.push(business?.onboardingStage === "complete" ? "/" : "/onboarding/attribution"), meta: { inlineError: true } });
  if (!phones.data || (!claiming && phones.data.activeClaim) || (primary && !reachedAttribution)) return <Surface className="flex justify-center p-6"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></Surface>;
  if (primary) return <Surface className="flex flex-col gap-5 p-6 text-center"><div className="flex flex-col gap-2"><p className="text-sm font-medium text-muted-foreground">{t("number.selectedNumberLabel")}</p><p className="text-2xl font-semibold text-foreground">{formatPhoneNumberDisplay(primary.e164)}</p></div><Button onClick={() => router.push("/onboarding/attribution")} type="button">{t("number.continue")}</Button></Surface>;
  return <div className="flex flex-col gap-6">
    {business ? <PhoneNumberChooser businessId={business.businessId} getInitialNumberSuggestion={onboardingNumbers.getInitialNumberSuggestion} searchAvailableNumbers={onboardingNumbers.searchAvailableNumbers} claimNumber={claimNumber} getErrorMessage={getErrorMessage} onClaimStarted={(number) => { telemetry.track("web.onboarding.number_claim_started", { businessId: business.businessId, countryCode: number.selectionContext.countryCode, selectionMode: number.selectionContext.mode, numberKind: number.kind }); }} onClaimCompleted={(number) => { telemetry.track("web.onboarding.number_claim_completed", { businessId: business.businessId, countryCode: number.selectionContext.countryCode, selectionMode: number.selectionContext.mode, numberKind: number.kind }); }} onClaimed={() => { setClaiming(false); router.push(business.onboardingStage === "complete" ? "/settings/phone-number" : "/onboarding/attribution"); }} labels={{ countryLabel: t("number.countryLabel"), areaCodeLabel: t("number.areaCodeLabel"), areaCodePlaceholder: t("number.areaCodePlaceholder"), search: t("number.search"), phoneNumberHeader: t("number.tableHeaders.phoneNumber"), select: t("number.select"), loadMore: t("number.loadMore"), empty: t("number.empty"), loadFailed: "number.loadFailed", searchFailed: "number.searchFailed", claimFailed: "number.claimFailed", unavailable: t("number.unavailable") }} /> : null}
    {business ? <button className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50" disabled={!business || skip.isPending || claiming} onClick={() => skip.mutate()} type="button">{skip.isPending ? t("number.skipping") : t("number.skipLater")}</button> : null}
    {skip.isError ? <FieldError>{t("number.skipFailed")}</FieldError> : null}
  </div>;
}
