import { useEffect, useState } from "react";

import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LoaderCircle } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { getSafeOnboardingErrorMessage } from "@/features/onboarding/onboardingErrors";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";

type OnboardingNumberPageProps = {
  businessId: Id<"businesses">;
  onSignOut: () => void;
  isComplete?: boolean;
  progressNavigableUntil?: number;
};

type NumberSelectionContext = {
  mode: "suggested" | "city" | "area_code" | "toll_free";
  countryCode: string;
  regionCode?: string;
  city?: string;
  areaCode?: string;
  metroKey?: string;
};

type AvailableNumberSummary = {
  e164: string;
  display: string;
  locality?: string;
  region?: string;
  countryCode: string;
  kind: "local" | "toll_free";
  capabilities: { sms: boolean; voice: boolean };
  selectionContext: NumberSelectionContext;
};

type VerifiedPhoneMarket = {
  countryCode: string;
  regionCode?: string;
  city?: string;
  areaCode?: string;
};

type InitialSuggestionResult = {
  market: VerifiedPhoneMarket;
  suggestion: AvailableNumberSummary | null;
  alternatives: Array<AvailableNumberSummary>;
};

type SearchResult = {
  market: VerifiedPhoneMarket;
  selectionContext: NumberSelectionContext;
  numbers: Array<AvailableNumberSummary>;
};

type ClaimResult =
  | { status: "claimed"; phoneNumberId: Id<"phone_numbers">; e164: string }
  | { status: "unavailable"; message: string; alternatives: Array<AvailableNumberSummary> }
  | { status: "failed"; message: string };

type PrimaryPhoneNumber = {
  _id: Id<"phone_numbers">;
  e164: string;
  voiceEnabled: boolean;
  smsEnabled: boolean;
  status: string;
};

const COUNTRY_OPTIONS: Array<{ code: string; label: string; flag: string }> = [
  { code: "US", label: "US", flag: "🇺🇸" },
  { code: "CA", label: "CA", flag: "🇨🇦" },
];

function formatPhoneNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const nationalNumber = digits.slice(1);
    return `(${nationalNumber.slice(0, 3)}) ${nationalNumber.slice(3, 6)}-${nationalNumber.slice(6)}`;
  }

  return e164;
}

function getNumberLocationLabel(number: AvailableNumberSummary): string | null {
  const parts = [number.locality, number.region].filter(
    (part): part is string => Boolean(part && part.trim().length > 0),
  );

  return parts.length > 0 ? parts.join(", ") : null;
}

function dedupeNumbers(numbers: Array<AvailableNumberSummary>): Array<AvailableNumberSummary> {
  const seen = new Set<string>();
  const unique: Array<AvailableNumberSummary> = [];

  for (const number of numbers) {
    if (seen.has(number.e164)) {
      continue;
    }
    seen.add(number.e164);
    unique.push(number);
  }

  return unique;
}

export function OnboardingNumberPage({
  businessId,
  onSignOut,
  isComplete = false,
  progressNavigableUntil,
}: OnboardingNumberPageProps) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const getInitialNumberSuggestion = useObservedAction(
    api.onboarding.phoneNumbers.getInitialNumberSuggestion,
  );
  const searchAvailableNumbers = useObservedAction(
    api.onboarding.phoneNumbers.searchAvailableNumbers,
  );
  const claimOnboardingNumber = useObservedAction(
    api.onboarding.phoneNumbers.claimOnboardingNumber,
  );
  const skipOnboardingNumber = useObservedMutation(
    api.onboarding.phoneNumbersSkip.skipOnboardingNumber,
  );
  const primaryPhoneNumber = useQuery(api.businesses.catalog.getPrimaryPhoneNumber, {
    businessId,
  }) as PrimaryPhoneNumber | null | undefined;

  const [country, setCountry] = useState<string>("US");
  const [areaCode, setAreaCode] = useState<string>("");
  const [numbers, setNumbers] = useState<Array<AvailableNumberSummary>>([]);
  const [selectedE164, setSelectedE164] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchSource, setSearchSource] = useState<"search" | "loadMore" | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const isSearching = searchSource !== null;
  const shouldLoadInventory = primaryPhoneNumber === null && !isComplete;

  // Initial load: get the suggested market + a starter list of numbers.
  useEffect(() => {
    if (primaryPhoneNumber === undefined && !isComplete) {
      return;
    }

    if (!shouldLoadInventory) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load(): Promise<void> {
      setIsLoading(true);
      setError(null);
      try {
        const result = (await getInitialNumberSuggestion({
          businessId,
        })) as InitialSuggestionResult;
        if (cancelled) return;

        setCountry(result.market.countryCode || "US");
        setAreaCode(result.market.areaCode ?? "");
        const initialList = [
          ...(result.suggestion ? [result.suggestion] : []),
          ...result.alternatives,
        ];
        setNumbers(initialList);
        setHasMore(initialList.length >= 10);
      } catch (loadError) {
        if (cancelled) return;
        const rawMessage = loadError instanceof Error ? loadError.message : "";
        if (rawMessage === "Verify your mobile number before choosing a business number.") {
          void navigate("/onboarding/verify-phone");
          return;
        }
        setError(getSafeOnboardingErrorMessage(loadError, t, "number.loadFailed"));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    businessId,
    getInitialNumberSuggestion,
    isComplete,
    navigate,
    primaryPhoneNumber,
    shouldLoadInventory,
    t,
  ]);

  async function handleSearch(source: "search" | "loadMore" = "search"): Promise<void> {
    setSearchSource(source);
    setError(null);
    try {
      const trimmedAreaCode = areaCode.trim();
      const limit = source === "loadMore" ? Math.min(numbers.length + 10, 20) : 10;
      const result = (await searchAvailableNumbers({
        businessId,
        mode: trimmedAreaCode ? "area_code" : "suggested",
        countryCode: country === "CA" ? "CA" : "US",
        ...(trimmedAreaCode ? { areaCode: trimmedAreaCode } : {}),
        limit,
      })) as SearchResult;
      const nextNumbers =
        source === "loadMore" ? dedupeNumbers([...numbers, ...result.numbers]) : result.numbers;
      setNumbers(nextNumbers);
      setHasMore(
        source === "loadMore"
          ? nextNumbers.length > numbers.length && nextNumbers.length < 20
          : nextNumbers.length >= 10,
      );
    } catch (searchError) {
      setError(getSafeOnboardingErrorMessage(searchError, t, "number.searchFailed"));
    } finally {
      setSearchSource(null);
    }
  }

  async function handleSelect(number: AvailableNumberSummary): Promise<void> {
    if (isComplete) {
      navigate("/onboarding/plan");
      return;
    }
    if (isClaiming) return;
    setSelectedE164(number.e164);
    setIsClaiming(true);
    setError(null);
    try {
      captureAnalyticsEvent("web.onboarding.number_claim_started", {
        businessId: String(businessId),
        countryCode: number.countryCode,
        selectionMode: number.selectionContext.mode,
        numberKind: number.kind,
      });
      const result = (await claimOnboardingNumber({
        businessId,
        e164: number.e164,
        selectionContext: number.selectionContext,
      })) as ClaimResult;

      if (result.status === "claimed") {
        captureAnalyticsEvent("web.onboarding.number_claim_completed", {
          businessId: String(businessId),
          countryCode: number.countryCode,
          selectionMode: number.selectionContext.mode,
          numberKind: number.kind,
        });
        navigate("/onboarding/plan");
        return;
      }

      if (result.status === "unavailable") {
        setError(t("number.unavailable"));
        setNumbers(result.alternatives);
        setHasMore(result.alternatives.length >= 5);
        setSelectedE164(null);
        return;
      }

      setError(getSafeOnboardingErrorMessage(result.message, t, "number.claimFailed"));
      setSelectedE164(null);
    } catch (claimError) {
      setError(getSafeOnboardingErrorMessage(claimError, t, "number.claimFailed"));
      setSelectedE164(null);
    } finally {
      setIsClaiming(false);
    }
  }

  async function handleSkip(): Promise<void> {
    if (isSkipping) return;
    setIsSkipping(true);
    setError(null);
    try {
      await skipOnboardingNumber({ businessId });
    } catch (skipError) {
      setError(getSafeOnboardingErrorMessage(skipError, t, "number.skipFailed"));
    } finally {
      setIsSkipping(false);
    }
  }

  if (primaryPhoneNumber || isComplete) {
    const selectedNumber = primaryPhoneNumber ? formatPhoneNumber(primaryPhoneNumber.e164) : null;

    return (
      <OnboardingShell
        onSignOut={onSignOut}
        progress={{ current: 8, navigableUntil: progressNavigableUntil, total: 10 }}
        title={selectedNumber ? t("number.selectedTitle") : t("number.title")}
        width="md"
      >
        <Surface className="flex flex-col gap-5 p-6 text-center">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {selectedNumber ? t("number.selectedNumberLabel") : t("number.skippedTitle")}
            </p>
            <p className="text-2xl font-semibold text-foreground">
              {selectedNumber ?? t("number.skippedDescription")}
            </p>
          </div>
          <Button onClick={() => navigate("/onboarding/plan")} type="button">
            {t("number.continue")}
          </Button>
        </Surface>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      onSignOut={onSignOut}
      progress={{ current: 8, navigableUntil: progressNavigableUntil, total: 10 }}
      title={t("number.title")}
      width="lg"
      footer={
        <div className="flex flex-col items-center gap-3">
          <button
            className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
            disabled={isSkipping || isClaiming}
            onClick={() => void handleSkip()}
            type="button"
          >
            {isSkipping ? t("number.skipping") : t("number.skipLater")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-[140px_1fr_160px_auto] items-end gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="number-country">
              {t("number.countryLabel")}
            </label>
            <Select onValueChange={(value) => setCountry(value ?? "US")} value={country}>
              <SelectTrigger id="number-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_OPTIONS.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    <span className="mr-2" aria-hidden="true">
                      {option.flag}
                    </span>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="number-area-code">
              {t("number.areaCodeLabel")}
            </label>
            <Input
              id="number-area-code"
              inputMode="numeric"
              maxLength={3}
              onChange={(event) => setAreaCode(event.target.value.replace(/[^\d]/g, ""))}
              placeholder={t("number.areaCodePlaceholder")}
              value={areaCode}
            />
          </div>
          <Button
            disabled={isSearching || isLoading}
            onClick={() => void handleSearch()}
            type="button"
            variant="outline"
          >
            {searchSource === "search" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              t("number.search")
            )}
          </Button>
        </div>

        <Surface className="flex h-96 flex-col">
          <div className="flex h-14 shrink-0 items-center border-b border-border px-4 text-sm font-medium text-muted-foreground">
            <span>{t("number.tableHeaders.phoneNumber")}</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col gap-3 px-4 py-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton className="h-12 w-full rounded-lg" key={index} />
                ))}
              </div>
            ) : numbers.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("number.empty")}
              </div>
            ) : (
              <ul className="flex flex-col">
                {numbers.map((number) => {
                  const isThisLoading = isClaiming && selectedE164 === number.e164;
                  const locationLabel = getNumberLocationLabel(number);
                  return (
                    <li
                      className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
                      key={number.e164}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-foreground">
                          {number.display}
                        </span>
                        {locationLabel ? (
                          <span className="text-xs text-muted-foreground">
                            {locationLabel}
                          </span>
                        ) : null}
                      </div>
                      <Button
                        className="h-9 rounded-full"
                        disabled={isThisLoading}
                        onClick={() => void handleSelect(number)}
                        size="sm"
                        type="button"
                      >
                        {isThisLoading ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          t("number.select")
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {hasMore && !isLoading ? (
            <div className="shrink-0 border-t border-border px-4 py-3">
              <button
                aria-label={t("number.loadMore")}
                className="inline-flex h-5 min-w-16 items-center justify-start text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
                disabled={isSearching}
                onClick={() => void handleSearch("loadMore")}
                type="button"
              >
                {searchSource === "loadMore" ? (
                  <LoaderCircle className="size-4 translate-y-0.5 animate-spin" />
                ) : (
                  t("number.loadMore")
                )}
              </button>
            </div>
          ) : null}
        </Surface>

        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </OnboardingShell>
  );
}
