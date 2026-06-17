import { useEffect, useState } from "react";

import { LoaderCircle } from "lucide-react";

import type { Id } from "../../../../../../convex/_generated/dataModel";
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
import {
  normalizeOnboardingPhoneCountry,
  supportsOnboardingAreaCodeSearch,
  type SupportedOnboardingPhoneCountry,
} from "@/lib/phone";

export type NumberSelectionContext = {
  mode: "suggested" | "city" | "area_code" | "toll_free";
  countryCode: string;
  regionCode?: string;
  city?: string;
  areaCode?: string;
  metroKey?: string;
};

export type AvailableNumberSummary = {
  e164: string;
  display: string;
  locality?: string;
  region?: string;
  countryCode: string;
  kind: "local" | "toll_free";
  capabilities: { sms: boolean; voice: boolean };
  selectionContext: NumberSelectionContext;
  claimToken?: string;
};

export type VerifiedPhoneMarket = {
  countryCode: string;
  regionCode?: string;
  city?: string;
  areaCode?: string;
};

export type InitialSuggestionResult = {
  market: VerifiedPhoneMarket;
  suggestion: AvailableNumberSummary | null;
  alternatives: Array<AvailableNumberSummary>;
};

export type SearchResult = {
  market: VerifiedPhoneMarket;
  selectionContext: NumberSelectionContext;
  numbers: Array<AvailableNumberSummary>;
};

export type ClaimResult =
  | { status: "claimed"; phoneNumberId: Id<"phone_numbers">; e164: string }
  | { status: "unavailable"; message: string; alternatives: Array<AvailableNumberSummary> }
  | { status: "failed"; message: string };

type PhoneNumberChooserLabels = {
  countryLabel: string;
  areaCodeLabel: string;
  areaCodePlaceholder: string;
  search: string;
  phoneNumberHeader: string;
  select: string;
  loadMore: string;
  empty: string;
  loadFailed: string;
  searchFailed: string;
  claimFailed: string;
  unavailable: string;
};

type PhoneNumberChooserProps = {
  businessId: Id<"businesses">;
  getInitialNumberSuggestion: (args: {
    businessId: Id<"businesses">;
  }) => Promise<InitialSuggestionResult>;
  searchAvailableNumbers: (args: {
    businessId: Id<"businesses">;
    mode: "suggested" | "area_code";
    countryCode: SupportedOnboardingPhoneCountry;
    areaCode?: string;
    limit: number;
  }) => Promise<SearchResult>;
  claimNumber: (args: {
    businessId: Id<"businesses">;
    e164: string;
    selectionContext: NumberSelectionContext;
    claimToken: string;
  }) => Promise<ClaimResult>;
  labels: PhoneNumberChooserLabels;
  getErrorMessage: (error: unknown, fallback: string) => string;
  onClaimed: (result: Extract<ClaimResult, { status: "claimed" }>, number: AvailableNumberSummary) => void;
  onClaimStarted?: (number: AvailableNumberSummary) => void;
  onClaimCompleted?: (number: AvailableNumberSummary) => void;
  onVerifyPhoneRequired?: () => void;
};

const COUNTRY_OPTIONS: Array<{
  code: SupportedOnboardingPhoneCountry;
  label: string;
  flag: string;
}> = [
  { code: "US", label: "US", flag: "🇺🇸" },
  { code: "CA", label: "CA", flag: "🇨🇦" },
  { code: "GB", label: "UK", flag: "🇬🇧" },
  { code: "AU", label: "AU", flag: "🇦🇺" },
];

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

export function PhoneNumberChooser({
  businessId,
  getInitialNumberSuggestion,
  searchAvailableNumbers,
  claimNumber,
  labels,
  getErrorMessage,
  onClaimed,
  onClaimStarted,
  onClaimCompleted,
  onVerifyPhoneRequired,
}: PhoneNumberChooserProps) {
  const [country, setCountry] = useState<SupportedOnboardingPhoneCountry>("US");
  const [areaCode, setAreaCode] = useState<string>("");
  const [numbers, setNumbers] = useState<Array<AvailableNumberSummary>>([]);
  const [selectedE164, setSelectedE164] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchSource, setSearchSource] = useState<"search" | "loadMore" | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const isSearching = searchSource !== null;
  const supportsAreaCodeSearch = supportsOnboardingAreaCodeSearch(country);

  function handleCountryChange(value: string | null): void {
    const nextCountry = normalizeOnboardingPhoneCountry(value);
    setCountry(nextCountry);
    if (!supportsOnboardingAreaCodeSearch(nextCountry)) {
      setAreaCode("");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getInitialNumberSuggestion({ businessId });
        if (cancelled) return;

        const initialCountry = normalizeOnboardingPhoneCountry(result.market.countryCode);
        setCountry(initialCountry);
        setAreaCode(
          supportsOnboardingAreaCodeSearch(initialCountry)
            ? (result.market.areaCode ?? "")
            : "",
        );
        const initialList = [
          ...(result.suggestion ? [result.suggestion] : []),
          ...result.alternatives,
        ];
        setNumbers(initialList);
        setHasMore(initialList.length >= 10);
      } catch (loadError) {
        if (cancelled) return;
        const rawMessage = loadError instanceof Error ? loadError.message : "";
        if (
          rawMessage === "Verify your mobile number before choosing a business number." &&
          onVerifyPhoneRequired
        ) {
          onVerifyPhoneRequired();
          return;
        }
        setError(getErrorMessage(loadError, labels.loadFailed));
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
  }, [businessId, getErrorMessage, getInitialNumberSuggestion, labels.loadFailed, onVerifyPhoneRequired]);

  async function handleSearch(source: "search" | "loadMore" = "search"): Promise<void> {
    setSearchSource(source);
    setError(null);
    try {
      const trimmedAreaCode = supportsAreaCodeSearch ? areaCode.trim() : "";
      const limit = source === "loadMore" ? Math.min(numbers.length + 10, 20) : 10;
      const result = await searchAvailableNumbers({
        businessId,
        mode: trimmedAreaCode ? "area_code" : "suggested",
        countryCode: country,
        ...(trimmedAreaCode ? { areaCode: trimmedAreaCode } : {}),
        limit,
      });
      const nextNumbers =
        source === "loadMore" ? dedupeNumbers([...numbers, ...result.numbers]) : result.numbers;
      setNumbers(nextNumbers);
      setHasMore(
        source === "loadMore"
          ? nextNumbers.length > numbers.length && nextNumbers.length < 20
          : nextNumbers.length >= 10,
      );
    } catch (searchError) {
      setError(getErrorMessage(searchError, labels.searchFailed));
    } finally {
      setSearchSource(null);
    }
  }

  async function handleSelect(number: AvailableNumberSummary): Promise<void> {
    if (isClaiming) return;
    if (!number.claimToken) {
      setError(labels.claimFailed);
      return;
    }
    setSelectedE164(number.e164);
    setIsClaiming(true);
    setError(null);
    try {
      onClaimStarted?.(number);
      const result = await claimNumber({
        businessId,
        e164: number.e164,
        selectionContext: number.selectionContext,
        claimToken: number.claimToken,
      });

      if (result.status === "claimed") {
        onClaimCompleted?.(number);
        onClaimed(result, number);
        return;
      }

      if (result.status === "unavailable") {
        setError(labels.unavailable);
        setNumbers(result.alternatives);
        setHasMore(result.alternatives.length >= 5);
        setSelectedE164(null);
        return;
      }

      setError(getErrorMessage(result.message, labels.claimFailed));
      setSelectedE164(null);
    } catch (claimError) {
      setError(getErrorMessage(claimError, labels.claimFailed));
      setSelectedE164(null);
    } finally {
      setIsClaiming(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        className={
          supportsAreaCodeSearch
            ? "grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_160px_auto] sm:items-end"
            : "grid grid-cols-1 gap-3 sm:grid-cols-[140px_auto] sm:items-end"
        }
      >
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="number-country">
            {labels.countryLabel}
          </label>
          <Select onValueChange={handleCountryChange} value={country}>
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
        {supportsAreaCodeSearch ? (
          <>
            <div aria-hidden="true" className="hidden sm:block" />
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="number-area-code">
                {labels.areaCodeLabel}
              </label>
              <Input
                id="number-area-code"
                inputMode="numeric"
                maxLength={3}
                onChange={(event) => setAreaCode(event.target.value.replace(/[^\d]/g, ""))}
                placeholder={labels.areaCodePlaceholder}
                value={areaCode}
              />
            </div>
          </>
        ) : null}
        <Button
          className="h-11 w-full sm:w-auto"
          disabled={isSearching || isLoading}
          onClick={() => void handleSearch()}
          type="button"
          variant="outline"
        >
          {searchSource === "search" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            labels.search
          )}
        </Button>
      </div>

      <Surface className="flex h-96 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4 text-sm font-medium text-muted-foreground">
          <span>{labels.phoneNumberHeader}</span>
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
              {labels.empty}
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
                        labels.select
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
              aria-label={labels.loadMore}
              className="inline-flex h-5 min-w-16 items-center justify-start text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
              disabled={isSearching}
              onClick={() => void handleSearch("loadMore")}
              type="button"
            >
              {searchSource === "loadMore" ? (
                <LoaderCircle className="size-4 translate-y-0.5 animate-spin" />
              ) : (
                labels.loadMore
              )}
            </button>
          </div>
        ) : null}
      </Surface>

      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
