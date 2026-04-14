import { useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import type { CountryCode } from "libphonenumber-js/min";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LoaderCircle, LogOut, MapPin, Phone, Search, Sparkles } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { formatPhoneNumberDisplay } from "@/lib/phone";

type OnboardingNumberPageProps = {
  businessId: Id<"businesses">;
  currentUserEmail?: string;
  onSignOut: () => void;
};

type VerifiedPhoneMarket = {
  phoneE164: string;
  countryCode: string;
  nationalDestinationCode?: string;
  areaCode?: string;
  regionCode?: string;
  city?: string;
  metroKey?: string;
  confidence: number;
  source: "verified_phone" | "verified_phone_country";
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
  capabilities: {
    sms: boolean;
    voice: boolean;
  };
  selectionContext: NumberSelectionContext;
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
  | {
      status: "claimed";
      phoneNumberId: Id<"phone_numbers">;
      e164: string;
    }
  | {
      status: "unavailable";
      message: string;
      alternatives: Array<AvailableNumberSummary>;
    }
  | {
      status: "failed";
      message: string;
    };

function describeSuggestion(
  market: VerifiedPhoneMarket,
  t: ReturnType<typeof useTranslation<"onboarding">>["t"],
): string {
  if (market.city && market.regionCode) {
    return t("number.detectedVerifiedLocation", {
      city: market.city,
      region: market.regionCode,
    });
  }

  if (market.areaCode) {
    return t("number.detectedVerifiedAreaCode", {
      areaCode: market.areaCode,
    });
  }

  return t("number.detectedVerifiedCountry", {
    country: market.countryCode,
  });
}

export function OnboardingNumberPage({
  businessId,
  currentUserEmail,
  onSignOut,
}: OnboardingNumberPageProps) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const getInitialNumberSuggestion = useAction(api.onboarding.phoneNumbers.getInitialNumberSuggestion);
  const searchAvailableNumbers = useAction(api.onboarding.phoneNumbers.searchAvailableNumbers);
  const claimOnboardingNumber = useAction(api.onboarding.phoneNumbers.claimOnboardingNumber);
  const [market, setMarket] = useState<VerifiedPhoneMarket | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<AvailableNumberSummary | null>(null);
  const [pickerNumbers, setPickerNumbers] = useState<Array<AvailableNumberSummary>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"city" | "area_code" | "toll_free">("city");
  const [cityQuery, setCityQuery] = useState("");
  const [areaCodeQuery, setAreaCodeQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSuggestion() {
      setIsLoadingSuggestion(true);
      setLoadError(null);

      try {
        const result = (await getInitialNumberSuggestion({
          businessId,
        })) as InitialSuggestionResult;
        if (cancelled) {
          return;
        }

        setMarket(result.market);
        setCityQuery(result.market.city ?? "");
        setAreaCodeQuery(result.market.areaCode ?? "");
        const suggestion = result.suggestion ?? result.alternatives[0] ?? null;
        setSelectedNumber(suggestion);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : t("number.loadFailed");
        if (message === "Verify your mobile number before choosing a business number.") {
          void navigate("/onboarding/verify-phone");
          return;
        }

        setLoadError(message);
      } finally {
        if (!cancelled) {
          setIsLoadingSuggestion(false);
        }
      }
    }

    void loadSuggestion();

    return () => {
      cancelled = true;
    };
  }, [businessId, getInitialNumberSuggestion, t]);

  async function runSearch(tab: "city" | "area_code" | "toll_free"): Promise<void> {
    if (tab === "area_code" && areaCodeQuery.trim().length === 0) {
      setClaimError(t("number.areaCodeRequired"));
      setPickerNumbers([]);
      return;
    }

    setIsSearching(true);
    setClaimError(null);

    try {
      const result = (await searchAvailableNumbers({
        businessId,
        mode: tab,
        ...(tab === "city" && cityQuery.trim() ? { city: cityQuery.trim() } : {}),
        ...(tab === "area_code" && areaCodeQuery.trim()
          ? { areaCode: areaCodeQuery.trim() }
          : {}),
      })) as SearchResult;

      setMarket(result.market);
      setPickerNumbers(result.numbers);
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : t("number.claimFailed"));
    } finally {
      setIsSearching(false);
    }
  }

  async function handleClaim(): Promise<void> {
    if (!selectedNumber) {
      return;
    }

    setIsClaiming(true);
    setClaimError(null);
    try {
      captureAnalyticsEvent("web.onboarding.number_claim_started", {
        businessId: String(businessId),
        countryCode: selectedNumber.countryCode,
        selectionMode: selectedNumber.selectionContext.mode,
        numberKind: selectedNumber.kind,
      });
      const result = (await claimOnboardingNumber({
        businessId,
        e164: selectedNumber.e164,
        selectionContext: selectedNumber.selectionContext,
      })) as ClaimResult;

      if (result.status === "claimed") {
        captureAnalyticsEvent("web.onboarding.number_claim_completed", {
          businessId: String(businessId),
          countryCode: selectedNumber.countryCode,
          selectionMode: selectedNumber.selectionContext.mode,
          numberKind: selectedNumber.kind,
        });
        void navigate("/");
        return;
      }

      if (result.status === "unavailable") {
        setClaimError(t("number.unavailable"));
        setPickerNumbers(result.alternatives);
        setActiveTab(
          selectedNumber.selectionContext.mode === "area_code"
            ? "area_code"
            : selectedNumber.selectionContext.mode === "toll_free"
              ? "toll_free"
              : "city",
        );
        setPickerOpen(true);
        return;
      }

      setClaimError(result.message || t("number.claimFailed"));
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : t("number.claimFailed"));
    } finally {
      setIsClaiming(false);
    }
  }

  const suggestionLabel = useMemo(() => {
    if (!market) {
      return null;
    }

    return describeSuggestion(market, t);
  }, [market, t]);

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top,_rgba(82,43,173,0.16),_transparent_36%),linear-gradient(180deg,_#120f1d_0%,_#09080d_100%)] text-white">
      <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <div className="text-2xl font-semibold tracking-tight">
            {import.meta.env.VITE_APP_NAME ?? "AI Receptionist"}
          </div>
          <div className="flex items-center gap-3">
            {currentUserEmail ? (
              <span className="hidden text-sm text-zinc-400 sm:inline">
                {t("number.signedInAs", { email: currentUserEmail })}
              </span>
            ) : null}
            <Button
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={onSignOut}
              size="sm"
              type="button"
              variant="outline"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          <Card className="w-full max-w-xl border-white/10 bg-white/5 text-white shadow-2xl shadow-black/30 backdrop-blur">
            <CardHeader className="items-center text-center">
              <div className="flex size-20 items-center justify-center rounded-full bg-violet-500/15 text-violet-300 shadow-inner shadow-violet-950/40">
                <Sparkles className="size-9" />
              </div>
              <CardTitle className="text-4xl font-semibold tracking-tight">{t("number.title")}</CardTitle>
              <CardDescription className="type-section-description max-w-md text-zinc-300">
                {t("number.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoadingSuggestion ? (
                <div className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-8 text-zinc-300">
                  <LoaderCircle className="size-5 animate-spin" />
                  <span>{t("number.loading")}</span>
                </div>
              ) : null}

              {!isLoadingSuggestion && selectedNumber ? (
                <div className="space-y-4">
                  {suggestionLabel ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-zinc-300">
                      <MapPin className="size-4" />
                      <span>{suggestionLabel}</span>
                    </div>
                  ) : null}
                  <div className="rounded-3xl border border-violet-400/25 bg-violet-500/12 px-6 py-6 text-center">
                    <div className="mb-2 flex items-center justify-center gap-2 text-zinc-400">
                      <Phone className="size-4" />
                      <span className="text-sm uppercase tracking-[0.24em]">
                        {selectedNumber.kind === "toll_free" ? "Toll-free" : "Local"}
                      </span>
                    </div>
                    <div className="text-4xl font-semibold tracking-tight text-violet-300">
                      {formatPhoneNumberDisplay(selectedNumber.e164, undefined, {
                        defaultCountry: selectedNumber.countryCode as CountryCode,
                      })}
                    </div>
                    {selectedNumber.locality || selectedNumber.region ? (
                      <div className="mt-2 text-sm text-zinc-400">
                        {[selectedNumber.locality, selectedNumber.region]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-3">
                    <Button
                      className="h-12 bg-violet-500 text-base font-medium text-white hover:bg-violet-400"
                      disabled={isClaiming}
                      onClick={() => void handleClaim()}
                      type="button"
                    >
                      {isClaiming ? (
                        <>
                          <LoaderCircle className="size-4 animate-spin" />
                          {t("number.continuing")}
                        </>
                      ) : (
                        t("number.continue")
                      )}
                    </Button>
                    <Button
                      className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => {
                        setPickerOpen(true);
                        void runSearch(activeTab);
                      }}
                      type="button"
                      variant="outline"
                    >
                      {t("number.pickDifferent")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {!isLoadingSuggestion && !selectedNumber && !loadError ? (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 px-6 py-6 text-center">
                    <div className="type-empty-title text-white">
                      {t("number.noSuggestionTitle")}
                    </div>
                    <div className="type-empty-description mt-2 text-zinc-400">
                      {t("number.noSuggestionDescription")}
                    </div>
                  </div>
                  <Button
                    className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                    onClick={() => {
                      setPickerOpen(true);
                      void runSearch(activeTab);
                    }}
                    type="button"
                    variant="outline"
                  >
                    {t("number.pickDifferent")}
                  </Button>
                </div>
              ) : null}

              {loadError ? <FieldError>{loadError || t("number.loadFailed")}</FieldError> : null}
              {claimError ? <FieldError>{claimError}</FieldError> : null}
              <FieldDescription className="text-center text-sm text-zinc-400">
                {t("number.skipHint")}
              </FieldDescription>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog onOpenChange={setPickerOpen} open={pickerOpen}>
        <DialogContent className="max-h-[90vh] border-white/10 bg-[#161320] p-0 text-white sm:max-w-2xl">
          <DialogHeader className="border-b border-white/10 px-6 py-5">
            <DialogTitle>{t("number.pickerTitle")}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {t("number.pickerDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 p-6">
            <Tabs
              onValueChange={(value) => setActiveTab(value as "city" | "area_code" | "toll_free")}
              value={activeTab}
            >
              <TabsList className="w-full bg-white/5" variant="line">
                <TabsTrigger value="city">{t("number.tabs.city")}</TabsTrigger>
                <TabsTrigger value="area_code">{t("number.tabs.areaCode")}</TabsTrigger>
                <TabsTrigger value="toll_free">{t("number.tabs.tollFree")}</TabsTrigger>
              </TabsList>
              <TabsContent value="city">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="onboarding-city">{t("number.fields.city")}</FieldLabel>
                    <Input
                      id="onboarding-city"
                      onChange={(event) => setCityQuery(event.target.value)}
                      placeholder={t("number.placeholders.city")}
                      value={cityQuery}
                    />
                  </Field>
                </FieldGroup>
              </TabsContent>
              <TabsContent value="area_code">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="onboarding-area-code">
                      {t("number.fields.areaCode")}
                    </FieldLabel>
                    <Input
                      id="onboarding-area-code"
                      inputMode="numeric"
                      maxLength={3}
                      onChange={(event) => setAreaCodeQuery(event.target.value.replace(/\D/g, ""))}
                      placeholder={t("number.placeholders.areaCode")}
                      value={areaCodeQuery}
                    />
                  </Field>
                </FieldGroup>
              </TabsContent>
              <TabsContent value="toll_free">
                <FieldDescription className="text-zinc-400">
                  {t("number.pickerDescription")}
                </FieldDescription>
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between gap-3">
              <Button
                className="bg-violet-500 text-white hover:bg-violet-400"
                disabled={isSearching}
                onClick={() => void runSearch(activeTab)}
                type="button"
              >
                {isSearching ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    {t("number.searching")}
                  </>
                ) : (
                  <>
                    <Search className="size-4" />
                    {t("number.search")}
                  </>
                )}
              </Button>
              <Button
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                onClick={() => setPickerOpen(false)}
                type="button"
                variant="outline"
              >
                {t("number.backToSuggested")}
              </Button>
            </div>

            <div className="max-h-[26rem] overflow-y-auto rounded-2xl border border-white/10 bg-black/15">
              {pickerNumbers.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-zinc-400">
                  {t("number.empty")}
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {pickerNumbers.map((number) => {
                    const isSelected = number.e164 === selectedNumber?.e164;
                    return (
                      <button
                        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-white/5"
                        key={number.e164}
                        onClick={() => {
                          setSelectedNumber(number);
                          setPickerOpen(false);
                        }}
                        type="button"
                      >
                        <div className="space-y-1">
                          <div className="text-lg font-medium text-white">
                            {formatPhoneNumberDisplay(number.e164, undefined, {
                              defaultCountry: number.countryCode as CountryCode,
                            })}
                          </div>
                          <div className="text-sm text-zinc-400">
                            {[number.locality, number.region].filter(Boolean).join(", ") ||
                              number.countryCode}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                            {isSelected ? t("number.selected") : t("number.select")}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
