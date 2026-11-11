"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { resolveOnboardingRoute } from "@lobbystack/shared";
import { useTranslation } from "react-i18next";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { PhoneNumberChooser, phoneNumberChooserApi } from "./phone-number-chooser";
import { OnboardingPlanSurface } from "./onboarding-plan-surface";
import { OnboardingNumberCountryFallback } from "./onboarding-number-country-fallback";
import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { requestJson } from "@/lib/request-json";
import { useTelemetry } from "@/components/product-analytics";
import { PhoneNumberChooserSkeleton } from "./loading-skeletons";
import { FieldError } from "./ui/field";

const onboardingNumbers = phoneNumberChooserApi(false);

// One line per refusal, from the number step's pre-check or the search itself.
const REFUSAL_KEYS: Record<string, string> = {
  dedicated_number_requires_paid_plan: "number.refusals.paidPlan",
  trial_already_used: "number.refusals.trialUsed",
  trial_ip_limited: "number.refusals.network",
  trial_not_available: "number.refusals.unavailable",
  phone_verification_required: "number.refusals.verification",
  email_verification_required: "number.refusals.emailVerification",
};

type NumberOutlook = { trialRefusal: string | null; countries: string[]; suggestedCountry: string | null };

function errorCode(error: unknown): string | undefined {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
}

export function OnboardingNumberSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const telemetry = useTelemetry();
  const [claiming, setClaiming] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // Null until the owner opens or leaves the country fallback themselves.
  const [countryFallback, setCountryFallback] = useState<boolean | null>(null);
  const trackedRefusal = useRef<string | null>(null);
  const { business } = useActiveBusiness();
  const phones = useQuery({ queryKey: ["onboarding-primary-number", business?.businessId], refetchInterval: query => query.state.data?.activeClaim ? 1000 : false, enabled: Boolean(business), queryFn: () => requestJson<{ activeClaim?: { id: string; status: string } | null; phoneNumbers: Array<{ id: string; e164: string; reclaimScheduledAt: string | null }> }>(`/api/phone-numbers?businessId=${encodeURIComponent(business!.businessId)}`) });
  // Where we sell numbers, and whether a trial is still possible or which plan is needed.
  const outlook = useQuery({ queryKey: ["onboarding-number-countries", business?.businessId], enabled: Boolean(business), queryFn: () => requestJson<NumberOutlook>(`/api/onboarding/numbers?businessId=${encodeURIComponent(business!.businessId)}`) });
  // A trial number keeps its release date hidden, so any active number is the one to call.
  const primary = phones.data?.phoneNumbers[0];
  // Past the number already, as someone who bought a plan from a later step is, the owner returns to where they were.
  const stage = business?.onboardingStage;
  const afterNumber = stage === "complete" ? "/" : stage === "goal" || stage === "attribution" || stage === "meet" ? resolveOnboardingRoute(stage) : "/onboarding/goal";
  const refusalCode = refusal ?? outlook.data?.trialRefusal ?? null;
  // The refusal stays here with the plans.
  const refuse = useCallback((error: unknown) => {
    const code = errorCode(error);
    if (code && Object.hasOwn(REFUSAL_KEYS, code)) setRefusal(code);
  }, []);
  useEffect(() => {
    if (!business || !refusalCode || trackedRefusal.current === refusalCode) return;
    trackedRefusal.current = refusalCode;
    telemetry.track("web.onboarding.number_unavailable", { businessId: business.businessId, code: refusalCode });
  }, [business, refusalCode, telemetry]);
  const chooser = useMemo(() => ({
    ...onboardingNumbers,
    getInitialNumberSuggestion: async (args: Parameters<typeof onboardingNumbers.getInitialNumberSuggestion>[0]) => {
      try { return await onboardingNumbers.getInitialNumberSuggestion(args); } catch (error) {
        refuse(error);
        throw error;
      }
    },
  }), [refuse]);
  const claimNumber = useCallback<typeof onboardingNumbers.claimNumber>(async (args) => {
    setClaiming(true);
    try { return await onboardingNumbers.claimNumber(args); } catch (error) {
      refuse(error);
      throw error;
    } finally { setClaiming(false); }
  }, [refuse]);
  const getErrorMessage = useCallback((error: unknown, fallback: string) => getSafeOnboardingErrorMessage(error, t, fallback), [t]);
  const skip = useMutation({ mutationFn: () => requestJson(`/api/onboarding/phone-numbers/skip?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST" }), onSuccess: () => router.push(afterNumber), meta: { inlineError: true } });

  // Meet your agent shows the number to call, so a number moves straight on.
  useEffect(() => {
    if (primary) router.replace(afterNumber);
  }, [afterNumber, primary, router]);

  // The fallback opens on its own where we sell no numbers: the business's
  // time zone points to such a country, or no country has numbers here.
  const countries = outlook.data?.countries ?? [];
  const suggested = outlook.data?.suggestedCountry ?? null;
  const showsCountryFallback = Boolean(outlook.data) && (countries.length === 0 || (countryFallback ?? Boolean(suggested && !countries.includes(suggested))));
  if (!phones.data || (!claiming && phones.data.activeClaim) || outlook.isLoading || primary) return <div className="mx-auto w-full max-w-lg"><PhoneNumberChooserSkeleton labels={{ country: t("number.countryLabel"), areaCode: t("number.areaCodeLabel"), search: t("number.search"), phoneNumber: t("number.tableHeaders.phoneNumber") }} /></div>;
  if (business && showsCountryFallback) return <OnboardingNumberCountryFallback businessId={business.businessId} initialCountry={suggested} numberCountries={countries} onBack={countries.length ? () => setCountryFallback(false) : null} onSkipped={() => router.push(afterNumber)} />;
  if (refusalCode) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-center text-sm text-muted-foreground">{t(REFUSAL_KEYS[refusalCode] ?? "number.planRequired")}</p>
        <OnboardingPlanSurface />
        {business ? <div className="flex flex-col items-center gap-3">
          <button className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => setCountryFallback(true)} type="button">{t("number.country.notListed")}</button>
          <button className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50" disabled={skip.isPending || claiming} onClick={() => skip.mutate()} type="button">{skip.isPending ? t("number.skipping") : t("number.skipLater")}</button>
          {skip.isError ? <FieldError>{t("number.skipFailed")}</FieldError> : null}
        </div> : null}
      </div>
    );
  }
  return <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
    {business ? <PhoneNumberChooser businessId={business.businessId} getInitialNumberSuggestion={chooser.getInitialNumberSuggestion} searchAvailableNumbers={chooser.searchAvailableNumbers} claimNumber={claimNumber} getErrorMessage={getErrorMessage} onClaimStarted={(number) => { telemetry.track("web.onboarding.number_claim_started", { businessId: business.businessId, countryCode: number.selectionContext.countryCode, selectionMode: number.selectionContext.mode, numberKind: number.kind }); }} onClaimCompleted={(number) => { telemetry.track("web.onboarding.number_claim_completed", { businessId: business.businessId, countryCode: number.selectionContext.countryCode, selectionMode: number.selectionContext.mode, numberKind: number.kind }); }} onClaimed={() => { setClaiming(false); void phones.refetch(); }} labels={{ countryLabel: t("number.countryLabel"), areaCodeLabel: t("number.areaCodeLabel"), areaCodePlaceholder: t("number.areaCodePlaceholder"), search: t("number.search"), searching: t("number.searching"), phoneNumberHeader: t("number.tableHeaders.phoneNumber"), select: t("number.select"), loadMore: t("number.loadMore"), empty: t("number.empty"), loadFailed: "number.loadFailed", searchFailed: "number.searchFailed", claimFailed: "number.claimFailed", unavailable: t("number.unavailable") }} /> : null}
    {business ? <div className="flex flex-col items-center gap-3">
      <button className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50" disabled={claiming} onClick={() => setCountryFallback(true)} type="button">{t("number.country.notListed")}</button>
      <button className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50" disabled={!business || skip.isPending || claiming} onClick={() => skip.mutate()} type="button">{skip.isPending ? t("number.skipping") : t("number.skipLater")}</button>
    </div> : null}
    {skip.isError ? <FieldError>{t("number.skipFailed")}</FieldError> : null}
  </div>;
}
