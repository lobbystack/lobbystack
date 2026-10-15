"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { LoaderCircle, Phone } from "lucide-react";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { PhoneNumberChooser, phoneNumberChooserApi } from "./phone-number-chooser";
import { OnboardingPlanSurface } from "./onboarding-plan-surface";
import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { requestJson } from "@/lib/request-json";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { useTelemetry } from "@/components/product-analytics";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { FieldError } from "./ui/field";

const onboardingNumbers = phoneNumberChooserApi(false);

// Search refusals that mean a number here needs a paid plan: Australia has no
// trial, and a phone, account or network that already had one gets no second.
const PLAN_REQUIRED = new Set(["dedicated_number_requires_paid_plan", "trial_already_used", "trial_ip_limited", "trial_not_available"]);

function errorCode(error: unknown): string | undefined {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
}

export function OnboardingNumberSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const telemetry = useTelemetry();
  const [claiming, setClaiming] = useState(false);
  const [needsPlan, setNeedsPlan] = useState(false);
  const { business } = useActiveBusiness();
  const phones = useQuery({ queryKey: ["onboarding-primary-number", business?.businessId], refetchInterval: query => query.state.data?.activeClaim ? 1000 : false, enabled: Boolean(business), queryFn: () => requestJson<{ activeClaim?: { id: string; status: string } | null; phoneNumbers: Array<{ id: string; e164: string; reclaimScheduledAt: string | null }> }>(`/api/phone-numbers?businessId=${encodeURIComponent(business!.businessId)}`) });
  // A trial number keeps its release date hidden, so any active number is the one to call.
  const primary = phones.data?.phoneNumbers[0];
  const finished = business?.onboardingStage === "complete";
  const chooser = useMemo(() => ({
    ...onboardingNumbers,
    getInitialNumberSuggestion: async (args: Parameters<typeof onboardingNumbers.getInitialNumberSuggestion>[0]) => {
      try { return await onboardingNumbers.getInitialNumberSuggestion(args); } catch (error) {
        if (PLAN_REQUIRED.has(errorCode(error) ?? "")) setNeedsPlan(true);
        if (errorCode(error) === "phone_verification_required") router.replace("/onboarding/verify-phone");
        throw error;
      }
    },
  }), [router]);
  const claimNumber = useCallback<typeof onboardingNumbers.claimNumber>(async (args) => {
    setClaiming(true);
    try { return await onboardingNumbers.claimNumber(args); } catch (error) {
      if (PLAN_REQUIRED.has(errorCode(error) ?? "")) setNeedsPlan(true);
      throw error;
    } finally { setClaiming(false); }
  }, []);
  const getErrorMessage = useCallback((error: unknown, fallback: string) => getSafeOnboardingErrorMessage(error, t, fallback), [t]);
  const skip = useMutation({ mutationFn: () => requestJson(`/api/onboarding/phone-numbers/skip?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST" }), onSuccess: () => router.push(finished ? "/" : "/onboarding/attribution"), meta: { inlineError: true } });

  if (!phones.data || (!claiming && phones.data.activeClaim)) return <Surface className="flex justify-center p-6"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></Surface>;
  if (primary) {
    // The moment it clicks: they call their own number and their receptionist answers.
    return (
      <Surface className="flex flex-col gap-5 p-6 text-center">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">{t("number.ready.label")}</p>
          <p className="text-2xl font-semibold text-foreground">{formatPhoneNumberDisplay(primary.e164)}</p>
          <p className="text-sm text-muted-foreground">{t("number.ready.body")}</p>
        </div>
        <Button nativeButton={false} render={<Link href={`tel:${primary.e164}`} />}><Phone />{t("number.ready.call", { number: formatPhoneNumberDisplay(primary.e164) })}</Button>
        <Button onClick={() => router.push(finished ? "/" : "/onboarding/attribution")} type="button" variant="outline">{t("number.continue")}</Button>
      </Surface>
    );
  }
  if (needsPlan) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-center text-sm text-muted-foreground">{t("number.planRequired")}</p>
        <OnboardingPlanSurface />
      </div>
    );
  }
  return <div className="flex flex-col gap-6">
    {business ? <PhoneNumberChooser businessId={business.businessId} getInitialNumberSuggestion={chooser.getInitialNumberSuggestion} searchAvailableNumbers={chooser.searchAvailableNumbers} claimNumber={claimNumber} getErrorMessage={getErrorMessage} onClaimStarted={(number) => { telemetry.track("web.onboarding.number_claim_started", { businessId: business.businessId, countryCode: number.selectionContext.countryCode, selectionMode: number.selectionContext.mode, numberKind: number.kind }); }} onClaimCompleted={(number) => { telemetry.track("web.onboarding.number_claim_completed", { businessId: business.businessId, countryCode: number.selectionContext.countryCode, selectionMode: number.selectionContext.mode, numberKind: number.kind }); }} onClaimed={() => { setClaiming(false); void phones.refetch(); }} labels={{ countryLabel: t("number.countryLabel"), areaCodeLabel: t("number.areaCodeLabel"), areaCodePlaceholder: t("number.areaCodePlaceholder"), search: t("number.search"), phoneNumberHeader: t("number.tableHeaders.phoneNumber"), select: t("number.select"), loadMore: t("number.loadMore"), empty: t("number.empty"), loadFailed: "number.loadFailed", searchFailed: "number.searchFailed", claimFailed: "number.claimFailed", unavailable: t("number.unavailable") }} /> : null}
    {business ? <button className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50" disabled={!business || skip.isPending || claiming} onClick={() => skip.mutate()} type="button">{skip.isPending ? t("number.skipping") : t("number.skipLater")}</button> : null}
    {skip.isError ? <FieldError>{t("number.skipFailed")}</FieldError> : null}
  </div>;
}
