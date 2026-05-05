import { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Check, ContactRound, LoaderCircle } from "lucide-react";

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
import { captureAnalyticsEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";

type OnboardingNumberPageProps = {
  businessId: Id<"businesses">;
  onSignOut: () => void;
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

const COUNTRY_OPTIONS: Array<{ code: string; label: string; flag: string }> = [
  { code: "US", label: "US", flag: "🇺🇸" },
  { code: "CA", label: "CA", flag: "🇨🇦" },
];

export function OnboardingNumberPage({ businessId, onSignOut }: OnboardingNumberPageProps) {
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

  const [country, setCountry] = useState<string>("US");
  const [areaCode, setAreaCode] = useState<string>("");
  const [numbers, setNumbers] = useState<Array<AvailableNumberSummary>>([]);
  const [selectedE164, setSelectedE164] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Initial load: get the suggested market + a starter list of numbers.
  useEffect(() => {
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
        setHasMore(initialList.length >= 5);
      } catch (loadError) {
        if (cancelled) return;
        const message =
          loadError instanceof Error ? loadError.message : t("number.loadFailed");
        if (message === "Verify your mobile number before choosing a business number.") {
          void navigate("/onboarding/verify-phone");
          return;
        }
        setError(message);
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
  }, [businessId, getInitialNumberSuggestion, navigate, t]);

  async function handleSearch(): Promise<void> {
    setIsSearching(true);
    setError(null);
    try {
      const trimmedAreaCode = areaCode.trim();
      const result = (await searchAvailableNumbers({
        businessId,
        mode: trimmedAreaCode ? "area_code" : "suggested",
        ...(trimmedAreaCode ? { areaCode: trimmedAreaCode } : {}),
      })) as SearchResult;
      setNumbers(result.numbers);
      setHasMore(result.numbers.length >= 5);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : t("number.searchFailed"));
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSelect(number: AvailableNumberSummary): Promise<void> {
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
        return;
      }

      if (result.status === "unavailable") {
        setError(t("number.unavailable"));
        setNumbers(result.alternatives);
        setHasMore(result.alternatives.length >= 5);
        setSelectedE164(null);
        return;
      }

      setError(result.message || t("number.claimFailed"));
      setSelectedE164(null);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : t("number.claimFailed"));
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
      setError(skipError instanceof Error ? skipError.message : t("number.skipFailed"));
    } finally {
      setIsSkipping(false);
    }
  }

  return (
    <OnboardingShell
      description={t("number.description")}
      onSignOut={onSignOut}
      progress={{ current: 8, total: 10 }}
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
        <div className="grid grid-cols-[140px_1fr_auto] items-end gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="number-country">
              {t("number.countryLabel")}
            </label>
            <Select onValueChange={(value) => setCountry(value ?? "US")} value={country}>
              <SelectTrigger className="h-11" id="number-country">
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
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="number-area-code">
              {t("number.areaCodeLabel")}
            </label>
            <Input
              className="h-11"
              id="number-area-code"
              inputMode="numeric"
              maxLength={5}
              onChange={(event) => setAreaCode(event.target.value.replace(/[^\d]/g, ""))}
              placeholder={t("number.areaCodePlaceholder")}
              value={areaCode}
            />
          </div>
          <Button
            className="h-11"
            disabled={isSearching || isLoading}
            onClick={() => void handleSearch()}
            type="button"
            variant="outline"
          >
            {isSearching ? <LoaderCircle className="size-4 animate-spin" /> : t("number.search")}
          </Button>
        </div>

        <Surface className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{t("number.tableHeaders.phoneNumber")}</span>
            <span className="px-3">{t("number.tableHeaders.features")}</span>
            <span className="pl-4">{t("number.tableHeaders.option")}</span>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-3 px-4 pb-4">
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
                return (
                  <li
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-border px-4 py-3"
                    key={number.e164}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
                      >
                        <ContactRound className="size-4" />
                      </span>
                      <span className="text-sm font-medium text-foreground">{number.e164}</span>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        number.capabilities.sms
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      <Check className="size-3" />
                      SMS
                    </span>
                    <Button
                      className="h-9 rounded-full"
                      disabled={isClaiming}
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

          {hasMore && !isLoading ? (
            <div className="border-t border-border px-4 py-3">
              <button
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
                disabled={isSearching}
                onClick={() => void handleSearch()}
                type="button"
              >
                {t("number.loadMore")}
              </button>
            </div>
          ) : null}
        </Surface>

        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </OnboardingShell>
  );
}
